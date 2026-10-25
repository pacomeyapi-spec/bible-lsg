"""Construit l'ePub de la Bible Louis Segond 1910 (EPUB 3 + NCX pour les anciennes liseuses).
Usage : python3 epub_bible.py bible-lsg.json sortie.epub"""
import json, sys, zipfile, html, uuid, datetime
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
B = json.load(open(src, encoding="utf-8"))
livres = B["livres"]
UID = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/pacomeyapi-spec/bible-lsg"))
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
e = lambda s: html.escape(s, quote=True)

CSS = """
@charset "utf-8";
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.55; margin: 0 4%; }
h1 { font-size: 1.9em; text-align: center; margin: 1.2em 0 .4em; font-weight: normal; letter-spacing: .02em; }
h2 { font-size: 1.25em; margin: 1.6em 0 .5em; font-weight: bold; page-break-after: avoid; }
h2 a { text-decoration: none; color: inherit; }
p.v { margin: 0 0 .35em; text-indent: 0; text-align: left; }
span.n { font-size: .68em; vertical-align: super; line-height: 0; font-weight: bold; color: #8a6d1f; margin-right: .2em; }
.grille { text-align: center; margin: .6em 0 1.2em; line-height: 2.1; }
.grille a { display: inline-block; min-width: 2.2em; padding: 0 .2em; margin: .1em; border: 1px solid #b9a46a;
  border-radius: .3em; text-decoration: none; color: inherit; font-family: sans-serif; font-size: .9em; }
.retour { text-align: right; font-size: .8em; margin: .8em 0 0; font-family: sans-serif; }
.retour a { text-decoration: none; color: #8a6d1f; }
.titre { text-align: center; margin-top: 18%; }
.titre .petit { font-size: 1.1em; margin: .4em 0; }
.titre .mention { font-size: .85em; margin-top: 3em; color: #555; }
ul.livres { list-style: none; padding: 0; columns: 2; }
ul.livres li { margin: .25em 0; }
ul.livres a { text-decoration: none; color: inherit; }
h3 { font-size: 1.05em; margin: 1.2em 0 .4em; font-family: sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #8a6d1f; }
.couv { text-align: center; margin: 0; padding: 0; }
.couv img { max-width: 100%; max-height: 100%; }
"""

def page(title, body, extra_head=""):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">
<head><meta charset="utf-8"/><title>{e(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/>{extra_head}</head>
<body>
{body}
</body>
</html>
"""

# ---------- Couverture ----------
def couverture(path):
    W, H = 1600, 2400
    im = Image.new("RGB", (W, H), "#13203f")
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(19 + 12 * t), int(32 + 10 * t), int(63 + 18 * t)))
    gold = "#d9b45a"
    d.rectangle([70, 70, W - 70, H - 70], outline=gold, width=6)
    d.rectangle([95, 95, W - 95, H - 95], outline=gold, width=2)
    cx = W // 2
    d.rectangle([cx - 22, 520, cx + 22, 980], fill=gold)
    d.rectangle([cx - 170, 640, cx + 170, 684], fill=gold)
    serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    serifb = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
    def ct(y, t, f, col):
        w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=col)
    ct(1150, "LA SAINTE", ImageFont.truetype(serif, 110), "#f3e6c0")
    ct(1290, "BIBLE", ImageFont.truetype(serifb, 230), "#f8edd0")
    ct(1640, "Version Louis Segond 1910", ImageFont.truetype(serif, 72), gold)
    ct(1760, "Ancien et Nouveau Testament", ImageFont.truetype(serif, 56), "#e9dcb6")
    im.save(path, "JPEG", quality=88)

files = {}   # chemin dans OEBPS -> contenu
manifest, spine = [], []

import tempfile, os
_tmp = os.path.join(tempfile.gettempdir(), "couverture-bible.jpg")
couverture(_tmp)
cover_bytes = open(_tmp, "rb").read()

files["couverture.xhtml"] = page("Couverture", '<div class="couv"><img src="couverture.jpg" alt="La Sainte Bible, Louis Segond 1910"/></div>')
files["titre.xhtml"] = page("La Sainte Bible", """<div class="titre">
<h1>LA SAINTE BIBLE</h1>
<p class="petit">qui comprend l'Ancien et le Nouveau Testament</p>
<p class="petit">traduits sur les textes originaux hébreu et grec</p>
<p class="petit"><b>par Louis Segond</b></p>
<p class="petit">Version de 1910</p>
<p class="mention">Texte du domaine public.<br/>Édition numérique Yapson AppStore.</p>
</div>""")

def ul(test):
    return "<ul class=\"livres\">" + "".join(
        f'<li><a href="{l["code"].lower()}.xhtml">{e(l["nom"])}</a></li>' for l in livres if l["testament"] == test) + "</ul>"
files["livres.xhtml"] = page("Les livres", f"<h1>Les livres</h1><p class=\"retour\"><a href=\"nav.xhtml\">Table des matières détaillée</a></p><h3>Ancien Testament</h3>{ul('AT')}<h3>Nouveau Testament</h3>{ul('NT')}")

for l in livres:
    f = l["code"].lower() + ".xhtml"
    n = len(l["chapitres"])
    grille = "" if n == 1 else '<p class="grille">' + "".join(f'<a href="#c{i}">{i}</a>' for i in range(1, n + 1)) + "</p>"
    parts = [f'<section epub:type="chapter" id="haut"><h1>{e(l["nom"])}</h1>{grille}']
    for ci, versets in enumerate(l["chapitres"], 1):
        label = "Psaume" if l["code"] == "PSA" else "Chapitre"
        parts.append(f'<h2 id="c{ci}"><a href="#haut">{label} {ci}</a></h2>')
        parts.append("".join(f'<p class="v" id="c{ci}v{vi}"><span class="n">{vi}</span>{e(t)}</p>'
                             for vi, t in enumerate(versets, 1)))
        if n > 1:
            parts.append('<p class="retour"><a href="#haut">↑ Chapitres</a> · <a href="livres.xhtml">Livres</a></p>')
    parts.append("</section>")
    files[f] = page(l["nom"], "\n".join(parts))

# ---------- Table des matières (EPUB 3) ----------
def nav_livres(test):
    out = []
    for l in livres:
        if l["testament"] != test: continue
        f = l["code"].lower() + ".xhtml"
        n = len(l["chapitres"])
        sub = "" if n == 1 else "<ol>" + "".join(f'<li><a href="{f}#c{i}">{i}</a></li>' for i in range(1, n + 1)) + "</ol>"
        out.append(f'<li><a href="{f}">{e(l["nom"])}</a>{sub}</li>')
    return "".join(out)
files["nav.xhtml"] = page("Table des matières", f"""<nav epub:type="toc" id="toc"><h1>Table des matières</h1>
<ol>
<li><a href="titre.xhtml">Page de titre</a></li>
<li><a href="livres.xhtml#tAT">Ancien Testament</a><ol>{nav_livres('AT')}</ol></li>
<li><a href="mat.xhtml">Nouveau Testament</a><ol>{nav_livres('NT')}</ol></li>
</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>
<li><a epub:type="cover" href="couverture.xhtml">Couverture</a></li>
<li><a epub:type="toc" href="livres.xhtml">Les livres</a></li>
<li><a epub:type="bodymatter" href="gen.xhtml">Genèse</a></li>
</ol></nav>""")

# ---------- NCX (anciennes liseuses) ----------
po = [0]
def np(label, src, children=""):
    po[0] += 1
    return f'<navPoint id="np{po[0]}" playOrder="{po[0]}"><navLabel><text>{e(label)}</text></navLabel><content src="{src}"/>{children}</navPoint>'
pts = [np("Page de titre", "titre.xhtml"), np("Les livres", "livres.xhtml")]
pts += [np(l["nom"], l["code"].lower() + ".xhtml") for l in livres]
files["toc.ncx"] = f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="fr">
<head><meta name="dtb:uid" content="{UID}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>La Sainte Bible — Louis Segond 1910</text></docTitle>
<navMap>{''.join(pts)}</navMap>
</ncx>"""
# ancres de testament dans livres.xhtml
files["livres.xhtml"] = files["livres.xhtml"].replace("<h3>Ancien Testament</h3>", '<h3 id="tAT">Ancien Testament</h3>').replace("<h3>Nouveau Testament</h3>", '<h3 id="tNT">Nouveau Testament</h3>')

# ---------- OPF ----------
order = ["couverture.xhtml", "titre.xhtml", "livres.xhtml"] + [l["code"].lower() + ".xhtml" for l in livres]
items = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
         '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
         '<item id="css" href="style.css" media-type="text/css"/>',
         '<item id="couvimg" href="couverture.jpg" media-type="image/jpeg" properties="cover-image"/>']
for i, f in enumerate(order):
    items.append(f'<item id="p{i}" href="{f}" media-type="application/xhtml+xml"/>')
spine = "".join(f'<itemref idref="p{i}"/>' for i in range(len(order))) + '<itemref idref="nav" linear="no"/>'
opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">{UID}</dc:identifier>
<dc:title>La Sainte Bible — Louis Segond 1910</dc:title>
<dc:language>fr</dc:language>
<dc:creator>Louis Segond (traducteur)</dc:creator>
<dc:publisher>Yapson AppStore</dc:publisher>
<dc:rights>Domaine public</dc:rights>
<dc:subject>Bible</dc:subject>
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
    z.writestr("OEBPS/couverture.jpg", cover_bytes, compress_type=zipfile.ZIP_DEFLATED)
    for name, content in files.items():
        z.writestr("OEBPS/" + name, content, compress_type=zipfile.ZIP_DEFLATED)
print("ePub :", out, sum(len(c) for b in livres for c in b["chapitres"]), "versets")
