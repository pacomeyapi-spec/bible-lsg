# Bible LSG — La Sainte Bible, Louis Segond 1910

Bible complète (66 livres, 31 167 versets), texte **Louis Segond 1910, domaine public**.

- **Web / iPhone** : site installable (« Sur l'écran d'accueil »), utilisable hors ligne.
- **Android** : APK 100 % hors ligne (`android/`), compilée par GitHub Actions et publiée dans *Releases* (`BibleLSG.apk`).
- **ePub** (iPad, liseuses) : `web/bible-lsg.epub`, validé par EPUBCheck, servi sur `/epub`.

Fonctions : lecture, recherche (« Fouiller ») insensible aux accents, favoris, surlignages, notes,
verset du jour, plans de lecture, lecture à voix haute, thèmes clair / sépia / sombre, sauvegarde,
**Commentaire concis de Matthew Henry** (traduction française).

## Commentaire de Matthew Henry
Commentaire : Matthew Henry (1706), domaine public ; traduction française Yapson AppStore.

- **Lecture** : bouton « Commentaire » dans la barre du chapitre → panneau (feuille glissante sur téléphone,
  poignée pour l'agrandir / la réduire ou la fermer ; colonne à droite à partir de 900 px de large). On y trouve
  le plan du chapitre (toucher un sujet → défile vers les versets) puis les sections (toucher « Versets 1-2 » →
  ces versets sont mis en évidence dans le texte). Même police, taille et thème que la lecture (bouton Aa).
  Le panneau suit le chapitre lu ; un chapitre sans commentaire affiche un message.
- **Menu d'un verset** : « Commentaire » ouvre le panneau sur la section qui contient ce verset
  (à défaut, la section la plus proche).
- **Fouiller** : case « Chercher aussi dans le commentaire » (décochée par défaut). Les résultats du commentaire
  sont dans un onglet à part (« Commentaire · 37 »), avec la référence et un extrait surligné ; toucher ouvre
  le chapitre et le panneau sur la section. L'index n'est construit qu'au premier usage.
- **Accueil** : carte « Commentaire de Matthew Henry » avec un lien vers le commentaire du chapitre en cours ;
  sur le site, lien de téléchargement de l'ePub (`/epub-commentaire`).
- **ePub séparé** : `web/commentaire-matthew-henry.epub` (EPUB 3 + NCX, validé par EPUBCheck), fabriqué par
  `outils/epub_commentaire.py commentaire.json bible-lsg.json sortie.epub`.

Données : un fichier JSON
`{"titre","auteur","licence","livres":{"GEN":{"1":{"plan":[{"sujet","ref"}],"sections":[{"titre","ref","paras":[…]}]}}}}`
(codes de livres de bible.json, chapitres en chaînes, `ref` = `[c1, v1, c2, v2]` en numérotation LSG ou `null`).
Une section dont `ref` déborde sur le chapitre voisin (ex. Job 38 → 39:1-3) est aussi montrée avec ce chapitre.
`build.py` le vérifie et le découpe par livre : `web/commentaire/index.json` (quelques Ko : titre, licence,
chapitres commentés) et `web/commentaire/GEN.json` … ; l'appli ne charge que le livre lu, et le service worker
garde chaque livre ouvert pour le hors-ligne (cache à part, conservé tant que le commentaire ne change pas).
L'APK reçoit les mêmes données en `commentaire/GEN.js` … (balises script, la WebView ne fait pas fetch() sur file://).

## Texte
Construit en croisant deux sources Louis Segond 1910 du domaine public (corpus eBible « fraLSG » pour la
numérotation et l'orthographe, jeu de données midvash/bible-data pour compléter les versets manquants),
avec contrôle automatique : tout le texte des deux sources est présent, une seule fois.

## Construire
```
python3 build.py chemin/vers/bible-lsg.json                                  # web/ (dont l'ePub) et assets Android
python3 build.py chemin/vers/bible-lsg.json --commentaire commentaire.json   # + commentaire et son ePub
node server.js                                                               # http://localhost:3000
```
Sans `--commentaire`, le commentaire déjà présent dans `web/commentaire/` est conservé et recopié dans l'APK :
c'est ce que fait la CI (`python3 build.py web/bible.json --sans-epub`).

Liens du serveur : `/apk`, `/epub` (Bible), `/epub-commentaire` (commentaire), `/dispo` (ce qui est disponible).
