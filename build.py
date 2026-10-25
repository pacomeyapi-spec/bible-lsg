#!/usr/bin/env python3
"""Construit le site de « Bible LSG » à partir du fichier JSON du texte biblique.

Usage :
    python3 build.py chemin/vers/bible-lsg.json [--icones] [--sans-epub]

Ce que fait le script :
  1. vérifie le fichier (66 livres, format attendu) et l'écrit, compacté, dans web/bible.json ;
  2. vérifie que les références des versets du jour et des plans existent ;
  3. dessine les icônes (web/ et android/ mipmap) si elles manquent ou avec --icones (Pillow requis) ;
  4. calcule un numéro de version d'après le contenu et le met dans web/sw.js et web/index.html
     (le service worker remplace alors proprement l'ancien cache chez les utilisateurs) ;
  5. fabrique l'ePub web/bible-lsg.epub (sauf --sans-epub) ;
  6. copie le site dans android/app/src/main/assets/ (avec bible.js au lieu de bible.json :
     la WebView Android ne sait pas faire fetch() sur file://).

Relancer `python3 build.py web/bible.json --sans-epub` régénère tout à l'identique (c'est ce que fait la CI).
"""
import datetime
import hashlib
import html
import json
import pathlib
import re
import shutil
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT / "web"
ASSETS = ROOT / "android/app/src/main/assets"
RES = ROOT / "android/app/src/main/res"

# Fichiers de l'appli (servis et mis en cache par le service worker).
APP_FILES = ["index.html", "app.js", "style.css", "manifest.webmanifest",
             "icon-192.png", "icon-512.png", "apple-touch-icon.png"]

CANON = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG "
         "ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT "
         "ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()


def die(msg):
    print("ERREUR :", msg)
    sys.exit(1)


def load_bible(path):
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    livres = data.get("livres")
    if not isinstance(livres, list) or len(livres) != 66:
        die("il faut 66 livres dans « livres »")
    vides = 0
    for i, b in enumerate(livres):
        for k in ("code", "nom", "abrev", "testament", "chapitres"):
            if k not in b:
                die(f"livre n°{i + 1} : champ « {k} » manquant")
        if b["code"] != CANON[i]:
            die(f"livre n°{i + 1} : code {b['code']} au lieu de {CANON[i]} (ordre canonique attendu)")
        if b["testament"] not in ("AT", "NT"):
            die(f"{b['code']} : testament doit valoir AT ou NT")
        for c, chap in enumerate(b["chapitres"]):
            if not isinstance(chap, list):
                die(f"{b['code']} {c + 1} : liste de versets attendue")
            for j, v in enumerate(chap):
                if v is None:
                    chap[j] = ""
                elif not isinstance(v, str):
                    die(f"{b['code']} {c + 1}:{j + 1} : texte attendu")
                if not chap[j].strip():
                    vides += 1
    nv = sum(len(c) for b in livres for c in b["chapitres"])
    nc = sum(len(b["chapitres"]) for b in livres)
    print(f"Texte : {data.get('traduction', '?')} — {nc} chapitres, {nv} versets, {vides} vide(s)")
    return data


def check_refs(data):
    """Vérifie les références des versets du jour (web/app.js)."""
    src = (WEB / "app.js").read_text(encoding="utf-8")
    m = re.search(r"const VERSETS_DU_JOUR = `([^`]*)`", src)
    if not m:
        print("(liste des versets du jour introuvable dans app.js)")
        return
    books = {b["code"]: b for b in data["livres"]}
    refs = m.group(1).split()
    bad = []
    for r in refs:
        mm = re.fullmatch(r"([1-3]?[A-Z]{2,3})\.(\d+)\.(\d+)", r)
        b = mm and books.get(mm.group(1))
        if not b:
            bad.append(r)
            continue
        c, v = int(mm.group(2)), int(mm.group(3))
        if c > len(b["chapitres"]) or v > len(b["chapitres"][c - 1]) or not b["chapitres"][c - 1][v - 1].strip():
            bad.append(r)
    dup = len(refs) - len(set(refs))
    print(f"Versets du jour : {len(refs)} références, {len(bad)} absente(s) {bad[:10]}, {dup} doublon(s)")


# ---------------------------------------------------------------- icônes
def draw_icon(size, pad_ratio=0.0):
    from PIL import Image, ImageDraw, ImageFilter
    S = 4 * size  # sur-échantillonnage pour des bords nets
    img = Image.new("RGB", (S, S), "#14213f")
    d = ImageDraw.Draw(img)
    # Fond : dégradé radial bleu nuit
    for r in range(S, 0, -8):
        t = r / S
        col = (int(20 + 22 * (1 - t)), int(33 + 30 * (1 - t)), int(63 + 42 * (1 - t)))
        d.ellipse([S / 2 - r, S * 0.42 - r, S / 2 + r, S * 0.42 + r], fill=col)
    gold = (214, 178, 94)
    gold_dark = (168, 128, 50)
    cream = (251, 246, 234)
    k = 1 - pad_ratio
    cx, cy = S / 2, S / 2

    def P(x, y):  # coordonnées relatives (-0.5..0.5) -> pixels
        return (cx + x * S * k, cy + y * S * k)

    # Croix dorée (rayonnement doux derrière)
    glow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([*P(-0.16, -0.40), *P(0.16, -0.08)], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.05))
    img.paste(Image.new("RGB", (S, S), (90, 90, 70)), (0, 0), glow.point(lambda p: p // 2))
    w = 0.034
    d.rounded_rectangle([*P(-w, -0.37), *P(w, -0.06)], radius=S * 0.01 * k, fill=gold)
    d.rounded_rectangle([*P(-0.105, -0.30), *P(0.105, -0.30 + 2 * w)], radius=S * 0.01 * k, fill=gold)

    # Livre ouvert : deux pages courbes
    def page(sign):
        pts = []
        n = 40
        # bord supérieur (courbe), de la reliure vers l'extérieur
        for i in range(n + 1):
            t = i / n
            x = sign * (0.012 + 0.33 * t)
            y = -0.02 - 0.05 * (1 - (1 - t) ** 2) + 0.0 * t
            pts.append(P(x, y))
        # bord extérieur
        pts.append(P(sign * 0.345, 0.25))
        # bord inférieur (courbe), vers la reliure
        for i in range(n, -1, -1):
            t = i / n
            x = sign * (0.012 + 0.33 * t)
            y = 0.25 - 0.045 * (1 - (1 - t) ** 2) + 0.035 * (1 - t) ** 3
            pts.append(P(x, y))
        return pts

    # couverture dorée sous les pages
    cover = [P(-0.38, 0.0), P(-0.012, 0.06), P(0.012, 0.06), P(0.38, 0.0), P(0.38, 0.285),
             P(0.012, 0.325), P(-0.012, 0.325), P(-0.38, 0.285)]
    d.polygon(cover, fill=gold_dark)
    for s in (-1, 1):
        d.polygon(page(s), fill=cream)
        # lignes de texte discrètes
        for j in range(5):
            y0 = 0.045 + j * 0.04
            for i in range(30):
                t0, t1 = 0.12 + i * 0.026, 0.12 + i * 0.026 + 0.0275
                if t1 > 0.9:
                    break
                x0, x1 = s * (0.012 + 0.33 * t0), s * (0.012 + 0.33 * t1)
                yy0 = y0 - 0.05 * (1 - (1 - t0) ** 2) + 0.035 * (1 - t0) ** 3 * 0.4
                yy1 = y0 - 0.05 * (1 - (1 - t1) ** 2) + 0.035 * (1 - t1) ** 3 * 0.4
                d.line([P(x0, yy0), P(x1, yy1)], fill=(205, 196, 176), width=max(1, int(S * 0.006 * k)))
    # reliure
    d.line([P(0, 0.0), P(0, 0.31)], fill=gold_dark, width=max(2, int(S * 0.008 * k)))
    return img.resize((size, size), Image.LANCZOS)


def make_icons(force):
    targets = [WEB / "icon-192.png", WEB / "icon-512.png", WEB / "apple-touch-icon.png"]
    mip = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    mip_paths = [RES / f"mipmap-{k}/ic_launcher.png" for k in mip]
    if not force and all(p.exists() for p in targets + mip_paths):
        return
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("(Pillow absent : icônes non régénérées)")
        return
    # Icônes web « maskable » : le dessin reste dans la zone sûre centrale.
    draw_icon(192, 0.12).save(targets[0], optimize=True)
    draw_icon(512, 0.12).save(targets[1], optimize=True)
    draw_icon(180, 0.06).save(targets[2], optimize=True)
    for (k, px), p in zip(mip.items(), mip_paths):
        p.parent.mkdir(parents=True, exist_ok=True)
        draw_icon(px, 0.04).save(p, optimize=True)
    print("Icônes dessinées")


# ---------------------------------------------------------------- ePub
def make_epub(data, out):
    livres = data["livres"]
    esc = html.escape
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    css = ("body{font-family:Georgia,serif;line-height:1.55;margin:0 4%}"
           "h1{text-align:center;margin:2em 0 1em}h2{margin:1.6em 0 .4em;font-size:1.15em;color:#1f2f55}"
           "p{margin:0 0 .35em;text-indent:0}sup{font-size:.62em;color:#8a6d2c;font-family:sans-serif;margin-right:.2em}"
           ".chaps{line-height:2.1}.chaps a{display:inline-block;min-width:2.2em;text-align:center;text-decoration:none}")

    def xhtml(title, body):
        return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
                '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="fr" xml:lang="fr">'
                f'<head><meta charset="utf-8"/><title>{esc(title)}</title><link rel="stylesheet" href="style.css"/></head>'
                f'<body>{body}</body></html>')

    files = []
    for i, b in enumerate(livres):
        parts = [f'<h1>{esc(b["nom"])}</h1>']
        if len(b["chapitres"]) > 1:
            parts.append('<p class="chaps">' + " ".join(
                f'<a href="#c{c + 1}">{c + 1}</a>' for c in range(len(b["chapitres"]))) + "</p>")
        for c, chap in enumerate(b["chapitres"]):
            parts.append(f'<h2 id="c{c + 1}">{esc(b["nom"])} {c + 1}</h2>')
            for v, t in enumerate(chap):
                if t.strip():
                    parts.append(f"<p><sup>{v + 1}</sup>{esc(t)}</p>")
        files.append((f"b{i + 1:02d}.xhtml", b["nom"], xhtml(b["nom"], "".join(parts))))

    title_page = xhtml("La Bible", '<h1>La Sainte Bible</h1><p style="text-align:center">Traduction Louis Segond 1910</p>'
                       '<p style="text-align:center">Texte du domaine public</p>')
    def navlist(t):
        return "".join(f'<li><a href="{f}">{esc(n)}</a></li>' for (f, n, _), b in zip(files, livres) if b["testament"] == t)
    nav = xhtml("Sommaire", '<nav epub:type="toc" id="toc"><h1>Sommaire</h1><ol>'
                f'<li><a href="titre.xhtml">La Sainte Bible</a></li>'
                f'<li><span>Ancien Testament</span><ol>{navlist("AT")}</ol></li>'
                f'<li><span>Nouveau Testament</span><ol>{navlist("NT")}</ol></li></ol></nav>')
    manifest = "".join(f'<item id="b{i + 1}" href="{f}" media-type="application/xhtml+xml"/>' for i, (f, _, _) in enumerate(files))
    spine = "".join(f'<itemref idref="b{i + 1}"/>' for i in range(len(files)))
    opf = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
           '<dc:identifier id="uid">urn:uuid:5b1e7a52-3c1f-4a52-9a0e-1910a5e9b1b1</dc:identifier>'
           '<dc:title>La Sainte Bible — Louis Segond 1910</dc:title><dc:language>fr</dc:language>'
           '<dc:creator>Louis Segond</dc:creator><dc:rights>Domaine public</dc:rights>'
           f'<meta property="dcterms:modified">{now}</meta></metadata>'
           '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
           '<item id="css" href="style.css" media-type="text/css"/>'
           '<item id="titre" href="titre.xhtml" media-type="application/xhtml+xml"/>'
           f'{manifest}</manifest><spine><itemref idref="titre"/><itemref idref="nav"/>{spine}</spine></package>')
    container = ('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                 '</rootfiles></container>')
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", css, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/titre.xhtml", title_page, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        for f, _, body in files:
            z.writestr("OEBPS/" + f, body, compress_type=zipfile.ZIP_DEFLATED)
    print(f"ePub : {out.relative_to(ROOT)} ({out.stat().st_size // 1024} Ko)")


# ---------------------------------------------------------------- principal
def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)
    data = load_bible(args[0])

    # 1. Données compactes
    out = {k: v for k, v in data.items() if k != "livres"}
    out["livres"] = data["livres"]
    raw = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    (WEB / "bible.json").write_text(raw, encoding="utf-8")
    print(f"web/bible.json : {len(raw.encode()) / 1e6:.2f} Mo")

    check_refs(data)
    make_icons("--icones" in flags)

    # 2. Version d'après le contenu (indépendante des numéros de version déjà écrits)
    h = hashlib.sha256(raw.encode())
    for f in APP_FILES + ["sw.js"]:
        b = (WEB / f).read_bytes()
        if f in ("index.html", "sw.js"):
            b = re.sub(rb'(VERSION = "|name="version" content=")[^"]*', rb"\1", b)
        h.update(b)
    version = h.hexdigest()[:10]
    for f, pat in (("sw.js", r'(const VERSION = ")[^"]*'), ("index.html", r'(name="version" content=")[^"]*')):
        p = WEB / f
        t = p.read_text(encoding="utf-8")
        nt = re.sub(pat, lambda m: m.group(1) + version, t, count=1)
        if nt != t:
            p.write_text(nt, encoding="utf-8")
    print("Version :", version)

    # 3. ePub
    if "--sans-epub" not in flags:
        # ePub validé par EPUBCheck (outils/epub_bible.py).
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "outils" / "epub_bible.py"), str(args[0]), str(WEB / "bible-lsg.epub")], check=True)

    # 4. Copie Android (100 % hors ligne)
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    ASSETS.mkdir(parents=True)
    for f in APP_FILES:
        shutil.copy2(WEB / f, ASSETS / f)
    (ASSETS / "bible.js").write_text("window.BIBLE_DATA=" + raw + ";\n", encoding="utf-8")
    print("Assets Android copiés dans", ASSETS.relative_to(ROOT))


if __name__ == "__main__":
    main()
