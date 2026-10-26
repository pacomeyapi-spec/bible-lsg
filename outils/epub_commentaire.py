"""Construit l'ePub du « Commentaire concis de Matthew Henry » (EPUB 3 + NCX pour les anciennes liseuses).
Usage : python3 epub_commentaire.py commentaire.json bible-lsg.json sortie.epub
(bible-lsg.json fournit les noms français des livres et l'ordre canonique.)"""
import datetime
import html
import io
import json
import re
import sys
import uuid
import zipfile

from PIL import Image, ImageDraw, ImageFont

src, bible_src, out = sys.argv[1], sys.argv[2], sys.argv[3]
CM = json.load(open(src, encoding="utf-8"))
livres = [l for l in json.load(open(bible_src, encoding="utf-8"))["livres"] if CM["livres"].get(l["code"])]
TITRE = CM.get("titre") or "Commentaire concis de Matthew Henry"
UID = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/pacomeyapi-spec/bible-lsg/commentaire-matthew-henry"))
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
BAD = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")
e = lambda s: html.escape(BAD.sub("", s), quote=True)

CSS = """
@charset "utf-8";
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.55; margin: 0 4%; }
h1 { font-size: 1.9em; text-align: center; margin: 1.2em 0 .4em; font-weight: normal; letter-spacing: .02em; }
h2 { font-size: 1.3em; margin: 1.8em 0 .5em; font-weight: bold; page-break-before: always; page-break-after: avoid; }
h2 a { text-decoration: none; color: inherit; }
h3 { font-size: 1em; margin: 1.3em 0 .4em; font-family: sans-serif; color: #7a5c14; page-break-after: avoid; }
h4 { font-size: .8em; margin: 1em 0 .3em; font-family: sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #8a6d1f; }
p { margin: 0 0 .6em; text-indent: 0; text-align: justify; }
.plan { margin: .4em 0 1em; padding: .5em .8em .5em 2em; border: 1px solid #d8c89a; border-radius: .4em; font-size: .92em; }
.plan li { margin: .15em 0; }
.plan .v { font-family: sans-serif; font-size: .85em; color: #7a5c14; }
.grille { text-align: center; margin: .6em 0 1.2em; line-height: 2.1; }
.grille a { display: inline-block; min-width: 2.2em; padding: 0 .2em; margin: .1em; border: 1px solid #b9a46a;
  border-radius: .3em; text-decoration: none; color: inherit; font-family: sans-serif; font-size: .9em; }
.retour { text-align: right; font-size: .8em; margin: .8em 0 0; font-family: sans-serif; }
.retour a { text-decoration: none; color: #8a6d1f; }
.titre { text-align: center; margin-top: 16%; }
.titre .petit { font-size: 1.1em; margin: .4em 0; text-align: center; }
.titre .mention { font-size: .85em; margin-top: 3em; color: #555; text-align: center; }
ul.livres { list-style: none; padding: 0; columns: 2; }
ul.livres li { margin: .25em 0; }
ul.livres a { text-decoration: none; color: inherit; }
.couv { text-align: center; margin: 0; padding: 0; }
.couv img { max-width: 100%; max-height: 100%; }
"""


def page(title, body):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">
<head><meta charset="utf-8"/><title>{e(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
{body}
</body>
</html>
"""


# ---------- Couverture ----------
def couverture():
    W, H = 1600, 2400
    im = Image.new("RGB", (W, H), "#13203f")
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(19 + 14 * t), int(32 + 8 * t), int(63 + 10 * t)))
    gold = "#d9b45a"
    d.rectangle([70, 70, W - 70, H - 70], outline=gold, width=6)
    d.rectangle([95, 95, W - 95, H - 95], outline=gold, width=2)
    cx = W // 2
    # livre ouvert stylisé
    d.polygon([(cx - 330, 640), (cx - 20, 690), (cx - 20, 960), (cx - 330, 910)], outline=gold, width=8)
    d.polygon([(cx + 330, 640), (cx + 20, 690), (cx + 20, 960), (cx + 330, 910)], outline=gold, width=8)
    for k in range(4):
        y = 730 + k * 50
        d.line([(cx - 280, y - 20 + k * 2), (cx - 70, y + 14 + k * 2)], fill="#b89a52", width=5)
        d.line([(cx + 280, y - 20 + k * 2), (cx + 70, y + 14 + k * 2)], fill="#b89a52", width=5)
    d.rectangle([cx - 10, 430, cx + 10, 600], fill=gold)
    d.rectangle([cx - 70, 480, cx + 70, 500], fill=gold)
    serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    serifb = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

    def ct(y, t, f, col):
        w = d.textlength(t, font=f)
        d.text(((W - w) / 2, y), t, font=f, fill=col)
    ct(1110, "COMMENTAIRE CONCIS", ImageFont.truetype(serif, 96), "#f3e6c0")
    ct(1260, "de", ImageFont.truetype(serif, 70), gold)
    ct(1360, "Matthew", ImageFont.truetype(serifb, 170), "#f8edd0")
    ct(1550, "Henry", ImageFont.truetype(serifb, 170), "#f8edd0")
    d.line([(cx - 260, 1800), (cx + 260, 1800)], fill=gold, width=3)
    ct(1850, "sur toute la Bible", ImageFont.truetype(serif, 80), gold)
    ct(2110, "Traduction française · Yapson AppStore", ImageFont.truetype(serif, 46), "#e9dcb6")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def chap_label(l, c):
    return ("Psaume " if l["code"] == "PSA" else l["nom"] + " ") + str(c)


def ref_label(r, c):
    if r[0] == c and r[2] == c:
        return f"verset {r[1]}" if r[1] == r[3] else f"versets {r[1]}-{r[3]}"
    return f"versets {r[0]}:{r[1]} à {r[2]}:{r[3]}"


def chapters(l):
    return sorted(((int(k), v) for k, v in CM["livres"][l["code"]].items()), key=lambda kv: kv[0])


files = {}
files["couverture.xhtml"] = page("Couverture", '<div class="couv"><img src="couverture.jpg" alt="Commentaire concis de Matthew Henry, sur toute la Bible"/></div>')
files["titre.xhtml"] = page(TITRE, f"""<div class="titre">
<h1>{e(TITRE.upper())}</h1>
<p class="petit">sur toute la Bible</p>
<p class="petit"><b>Matthew Henry</b> (1662-1714)</p>
<p class="petit">Texte cité : Louis Segond 1910</p>
<p class="mention">Commentaire : Matthew Henry (1706), domaine public ;<br/>traduction française Yapson AppStore.</p>
</div>""")


def ul(test):
    return '<ul class="livres">' + "".join(
        f'<li><a href="{l["code"].lower()}.xhtml">{e(l["nom"])}</a></li>' for l in livres if l["testament"] == test) + "</ul>"


files["livres.xhtml"] = page("Les livres", '<h1>Les livres</h1><p class="retour"><a href="nav.xhtml">Table des matières détaillée</a></p>'
                             f'<h4 id="tAT">Ancien Testament</h4>{ul("AT")}<h4 id="tNT">Nouveau Testament</h4>{ul("NT")}')

nsec = 0
for l in livres:
    chs = chapters(l)
    grille = "" if len(chs) == 1 else '<p class="grille">' + "".join(f'<a href="#c{c}">{c}</a>' for c, _ in chs) + "</p>"
    parts = [f'<section epub:type="chapter" id="haut"><h1>{e(l["nom"])}</h1>{grille}']
    for c, ch in chs:
        parts.append(f'<h2 id="c{c}"><a href="#haut">{e(chap_label(l, c))}</a></h2>')
        plan = [it for it in ch.get("plan") or [] if it.get("sujet")]
        if plan:
            parts.append('<ol class="plan">' + "".join(
                f'<li>{e(it["sujet"])}' + (f' <span class="v">· {ref_label(it["ref"], c)}</span>' if it.get("ref") else "") + "</li>"
                for it in plan) + "</ol>")
        secs = ch["sections"]
        for i, s in enumerate(secs):
            titre = s.get("titre") or (ref_label(s["ref"], c).capitalize() if s.get("ref") else ("Introduction" if len(secs) > 1 else ""))
            if titre:
                parts.append(f'<h3 id="c{c}s{i}">{e(titre)}</h3>')
            parts.append("".join(f"<p>{e(p)}</p>" for p in s["paras"] if p.strip()))
            nsec += 1
        if len(chs) > 1:
            parts.append('<p class="retour"><a href="#haut">↑ Chapitres</a> · <a href="livres.xhtml">Livres</a></p>')
    parts.append("</section>")
    files[l["code"].lower() + ".xhtml"] = page(l["nom"], "\n".join(parts))


# ---------- Table des matières (EPUB 3) : livres puis chapitres ----------
def nav_livres(test):
    res = []
    for l in livres:
        if l["testament"] != test:
            continue
        f = l["code"].lower() + ".xhtml"
        chs = chapters(l)
        sub = "" if len(chs) == 1 else "<ol>" + "".join(f'<li><a href="{f}#c{c}">{c}</a></li>' for c, _ in chs) + "</ol>"
        res.append(f'<li><a href="{f}">{e(l["nom"])}</a>{sub}</li>')
    return "".join(res)


first_nt = next((l for l in livres if l["testament"] == "NT"), None)
toc_nt = f'<li><a href="{first_nt["code"].lower()}.xhtml">Nouveau Testament</a><ol>{nav_livres("NT")}</ol></li>' if first_nt else ""
files["nav.xhtml"] = page("Table des matières", f"""<nav epub:type="toc" id="toc"><h1>Table des matières</h1>
<ol>
<li><a href="titre.xhtml">Page de titre</a></li>
<li><a href="livres.xhtml#tAT">Ancien Testament</a><ol>{nav_livres('AT')}</ol></li>
{toc_nt}
</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>
<li><a epub:type="cover" href="couverture.xhtml">Couverture</a></li>
<li><a epub:type="toc" href="livres.xhtml">Les livres</a></li>
<li><a epub:type="bodymatter" href="{livres[0]['code'].lower()}.xhtml">{e(livres[0]['nom'])}</a></li>
</ol></nav>""")

# ---------- NCX (anciennes liseuses) : livres et chapitres ----------
po = [0]


def np(label, src, children=""):
    po[0] += 1
    return f'<navPoint id="np{po[0]}" playOrder="{po[0]}"><navLabel><text>{e(label)}</text></navLabel><content src="{src}"/>{children}</navPoint>'


pts = [np("Page de titre", "titre.xhtml"), np("Les livres", "livres.xhtml")]
for l in livres:
    f = l["code"].lower() + ".xhtml"
    chs = chapters(l)
    if len(chs) == 1:
        pts.append(np(l["nom"], f))
        continue
    # le point du livre doit précéder ses chapitres dans l'ordre de lecture
    po[0] += 1
    me = po[0]
    kids = "".join(np(chap_label(l, c), f"{f}#c{c}") for c, _ in chs)
    pts.append(f'<navPoint id="np{me}" playOrder="{me}"><navLabel><text>{e(l["nom"])}</text></navLabel><content src="{f}"/>{kids}</navPoint>')
files["toc.ncx"] = f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="fr">
<head><meta name="dtb:uid" content="{UID}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>{e(TITRE)} — sur toute la Bible</text></docTitle>
<navMap>{''.join(pts)}</navMap>
</ncx>"""

# ---------- OPF ----------
order = ["couverture.xhtml", "titre.xhtml", "livres.xhtml"] + [l["code"].lower() + ".xhtml" for l in livres]
items = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
         '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
         '<item id="css" href="style.css" media-type="text/css"/>',
         '<item id="couvimg" href="couverture.jpg" media-type="image/jpeg" properties="cover-image"/>']
items += [f'<item id="p{i}" href="{f}" media-type="application/xhtml+xml"/>' for i, f in enumerate(order)]
spine = "".join(f'<itemref idref="p{i}"/>' for i in range(len(order))) + '<itemref idref="nav" linear="no"/>'
opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">{UID}</dc:identifier>
<dc:title>{e(TITRE)} — sur toute la Bible</dc:title>
<dc:language>fr</dc:language>
<dc:creator>Matthew Henry</dc:creator>
<dc:contributor>Yapson AppStore (traduction française)</dc:contributor>
<dc:publisher>Yapson AppStore</dc:publisher>
<dc:rights>Commentaire : Matthew Henry (1706), domaine public ; traduction française Yapson AppStore.</dc:rights>
<dc:subject>Bible — Commentaires</dc:subject>
<meta property="dcterms:modified">{NOW}</meta>
<meta name="cover" content="couvimg"/>
</metadata>
<manifest>{''.join(items)}</manifest>
<spine toc="ncx">{spine}</spine>
</package>"""

with zipfile.ZipFile(out, "w") as z:
    z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""", compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/couverture.jpg", couverture(), compress_type=zipfile.ZIP_DEFLATED)
    for name, content in files.items():
        z.writestr("OEBPS/" + name, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
print(f"ePub : {out} — {len(livres)} livres, {nsec} sections")
