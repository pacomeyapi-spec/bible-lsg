#!/usr/bin/env python3
"""Construit le site de « Bible LSG » à partir du fichier JSON du texte biblique.

Usage :
    python3 build.py chemin/vers/bible-lsg.json [--commentaire commentaire.json] [--icones] [--sans-epub]

Ce que fait le script :
  1. vérifie le fichier (66 livres, format attendu) et l'écrit, compacté, dans web/bible.json ;
  2. vérifie que les références des versets du jour et des plans existent ;
  3. dessine les icônes (web/ et android/ mipmap) si elles manquent ou avec --icones (Pillow requis) ;
  4. calcule un numéro de version d'après le contenu et le met dans web/sw.js et web/index.html
     (le service worker remplace alors proprement l'ancien cache chez les utilisateurs) ;
  5. fabrique l'ePub web/bible-lsg.epub (sauf --sans-epub) ;
  6. copie le site dans android/app/src/main/assets/ (avec bible.js au lieu de bible.json :
     la WebView Android ne sait pas faire fetch() sur file://).

Commentaire de Matthew Henry (--commentaire chemin.json) :
  le fichier est vérifié puis découpé par livre dans web/commentaire/GEN.json … (+ index.json : titre,
  licence, chapitres commentés) : l'appli ne charge que le livre lu. L'APK reçoit les mêmes données en
  commentaire/GEN.js … (balises script). L'ePub web/commentaire-matthew-henry.epub est fabriqué à côté
  (outils/epub_commentaire.py, sauf --sans-epub).
  Sans --commentaire, le commentaire déjà présent dans web/commentaire/ est conservé et recopié dans l'APK.

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
COMM_DIR = WEB / "commentaire"
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


# ---------------------------------------------------------------- commentaire
def load_commentaire(path, data):
    """Vérifie le commentaire (format décrit dans le README) ; renvoie le dict complet."""
    try:
        cm = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        die(f"commentaire illisible : {e}")
    if not isinstance(cm, dict) or not isinstance(cm.get("livres"), dict):
        die("commentaire : objet « livres » attendu")
    books = {b["code"]: b for b in data["livres"]}
    nsec = npar = nch = 0
    bad_refs = []

    def ref_ok(code, r):
        if r is None:
            return True
        if not (isinstance(r, list) and len(r) == 4 and all(isinstance(x, int) for x in r)):
            return False
        c1, v1, c2, v2 = r
        chs = books[code]["chapitres"]
        if not (1 <= c1 <= len(chs) and 1 <= c2 <= len(chs)) or (c1, v1) > (c2, v2):
            return False
        return 1 <= v1 <= len(chs[c1 - 1]) and 1 <= v2 <= len(chs[c2 - 1])

    for code, chaps in cm["livres"].items():
        if code not in books:
            die(f"commentaire : livre inconnu « {code} »")
        if not isinstance(chaps, dict):
            die(f"commentaire {code} : objet des chapitres attendu")
        for ck, ch in chaps.items():
            if not ck.isdigit() or not 1 <= int(ck) <= len(books[code]["chapitres"]):
                die(f"commentaire {code} : chapitre « {ck} » inexistant")
            if not isinstance(ch, dict) or not isinstance(ch.get("sections"), list):
                die(f"commentaire {code} {ck} : « sections » attendu")
            ch.setdefault("plan", [])
            if not isinstance(ch["plan"], list):
                die(f"commentaire {code} {ck} : « plan » doit être une liste")
            for it in ch["plan"]:
                if not isinstance(it, dict) or not isinstance(it.get("sujet"), str):
                    die(f"commentaire {code} {ck} : élément de plan invalide")
                if not ref_ok(code, it.get("ref")):
                    bad_refs.append(f"{code} {ck} plan {it.get('ref')}")
                    it["ref"] = None
            for s in ch["sections"]:
                if not isinstance(s, dict) or not isinstance(s.get("paras"), list) or not all(isinstance(p, str) for p in s["paras"]):
                    die(f"commentaire {code} {ck} : section invalide (« paras » : liste de textes)")
                s["titre"] = s.get("titre") or ""
                if not ref_ok(code, s.get("ref")):
                    bad_refs.append(f"{code} {ck} « {s['titre']} » {s.get('ref')}")
                    s["ref"] = None
                s.setdefault("ref", None)
                nsec += 1
                npar += len(s["paras"])
            nch += 1
    total = sum(len(b["chapitres"]) for b in data["livres"])
    missing = [f"{b['code']} {i + 1}" for b in data["livres"] for i in range(len(b["chapitres"]))
               if str(i + 1) not in cm["livres"].get(b["code"], {})]
    print(f"Commentaire : {cm.get('titre', '?')} — {len(cm['livres'])} livres, {nch}/{total} chapitres, "
          f"{nsec} sections, {npar} paragraphes")
    if missing:
        print(f"  chapitres sans commentaire ({len(missing)}) : {', '.join(missing[:12])}{' …' if len(missing) > 12 else ''}")
    if bad_refs:
        print(f"  références invalides mises à null ({len(bad_refs)}) : {bad_refs[:6]}")
    return cm


def write_commentaire(cm):
    """web/commentaire/index.json + un fichier par livre (ordre canonique)."""
    if COMM_DIR.exists():
        shutil.rmtree(COMM_DIR)
    COMM_DIR.mkdir(parents=True)
    index = {k: v for k, v in cm.items() if k != "livres"}
    index["livres"] = {}
    for code in CANON:
        chaps = cm["livres"].get(code)
        if not chaps:
            continue
        chaps = dict(sorted(chaps.items(), key=lambda kv: int(kv[0])))
        index["livres"][code] = [int(k) for k in chaps]
        (COMM_DIR / f"{code}.json").write_text(json.dumps(chaps, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (COMM_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in COMM_DIR.iterdir())
    print(f"web/commentaire/ : {len(index['livres'])} livres + index.json ({size / 1e6:.2f} Mo)")


def read_commentaire_files():
    """Fichiers du commentaire déjà présents dans web/commentaire/ : [(nom, texte)], index en premier."""
    idx = COMM_DIR / "index.json"
    if not idx.exists():
        return []
    index = json.loads(idx.read_text(encoding="utf-8"))
    out = [("index", idx.read_text(encoding="utf-8"))]
    for code in index.get("livres", {}):
        f = COMM_DIR / f"{code}.json"
        if not f.exists():
            die(f"web/commentaire/{code}.json manquant (relancer avec --commentaire)")
        out.append((code, f.read_text(encoding="utf-8")))
    return out


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
    argv = sys.argv[1:]
    comm_src = None
    if "--commentaire" in argv:
        i = argv.index("--commentaire")
        if i + 1 >= len(argv):
            die("--commentaire : chemin du fichier JSON manquant")
        comm_src = argv[i + 1]
        del argv[i:i + 2]
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
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

    # Commentaire : nouveau fichier fourni, sinon celui déjà présent dans web/commentaire/
    if comm_src:
        write_commentaire(load_commentaire(comm_src, data))
    comm_files = read_commentaire_files()
    if comm_files and not comm_src:
        print(f"Commentaire conservé : web/commentaire/ ({len(comm_files) - 1} livres)")
    hc = hashlib.sha256()
    for name, text in comm_files:
        hc.update(name.encode() + b"\0" + text.encode())
    comm_version = hc.hexdigest()[:10] if comm_files else "aucun"

    # 2. Version d'après le contenu (indépendante des numéros de version déjà écrits)
    h = hashlib.sha256(raw.encode())
    h.update(comm_version.encode())
    for f in APP_FILES + ["sw.js"]:
        b = (WEB / f).read_bytes()
        if f in ("index.html", "sw.js"):
            b = re.sub(rb'(VERSION = "|name="version" content=")[^"]*', rb"\1", b)
        h.update(b)
    version = h.hexdigest()[:10]
    for f, pat, val in (("sw.js", r'(const VERSION = ")[^"]*', version), ("index.html", r'(name="version" content=")[^"]*', version),
                        ("sw.js", r'(const COMM_VERSION = ")[^"]*', comm_version)):
        p = WEB / f
        t = p.read_text(encoding="utf-8")
        nt = re.sub(pat, lambda m: m.group(1) + val, t, count=1)
        if nt != t:
            p.write_text(nt, encoding="utf-8")
    print("Version :", version)

    # 3. ePub
    if "--sans-epub" not in flags:
        # ePub validé par EPUBCheck (outils/epub_bible.py).
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "outils" / "epub_bible.py"), str(args[0]), str(WEB / "bible-lsg.epub")], check=True)
        if comm_src:
            subprocess.run([sys.executable, str(ROOT / "outils" / "epub_commentaire.py"), str(comm_src), str(args[0]),
                            str(WEB / "commentaire-matthew-henry.epub")], check=True)

    # 4. Copie Android (100 % hors ligne)
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    ASSETS.mkdir(parents=True)
    for f in APP_FILES:
        shutil.copy2(WEB / f, ASSETS / f)
    (ASSETS / "bible.js").write_text("window.BIBLE_DATA=" + raw + ";\n", encoding="utf-8")
    if comm_files:
        (ASSETS / "commentaire").mkdir()
        for name, text in comm_files:
            js = ("window.COMMENTAIRE_INDEX=" if name == "index" else
                  "(window.COMMENTAIRE=window.COMMENTAIRE||{})[" + json.dumps(name) + "]=") + text + ";\n"
            (ASSETS / "commentaire" / f"{name}.js").write_text(js, encoding="utf-8")
    print("Assets Android copiés dans", ASSETS.relative_to(ROOT))


if __name__ == "__main__":
    main()
