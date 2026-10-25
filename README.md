# Bible LSG — La Sainte Bible, Louis Segond 1910

Bible complète (66 livres, 31 167 versets), texte **Louis Segond 1910, domaine public**.

- **Web / iPhone** : site installable (« Sur l'écran d'accueil »), utilisable hors ligne.
- **Android** : APK 100 % hors ligne (`android/`), compilée par GitHub Actions et publiée dans *Releases* (`BibleLSG.apk`).
- **ePub** (iPad, liseuses) : `web/bible-lsg.epub`, validé par EPUBCheck, servi sur `/epub`.

Fonctions : lecture, recherche (« Fouiller ») insensible aux accents, favoris, surlignages, notes,
verset du jour, plans de lecture, lecture à voix haute, thèmes clair / sépia / sombre, sauvegarde.

## Texte
Construit en croisant deux sources Louis Segond 1910 du domaine public (corpus eBible « fraLSG » pour la
numérotation et l'orthographe, jeu de données midvash/bible-data pour compléter les versets manquants),
avec contrôle automatique : tout le texte des deux sources est présent, une seule fois.

## Construire
```
python3 build.py chemin/vers/bible-lsg.json   # génère web/ (dont l'ePub) et les assets Android
node server.js                               # http://localhost:3000
```
