// Service worker de Bible LSG : tout est gardé en cache pour lire sans connexion.
// VERSION est réécrite par build.py à chaque changement de contenu : le nouveau cache remplace l'ancien.
// Le commentaire (commentaire/*.json, chargé livre par livre) a son propre cache, gardé tant que
// COMM_VERSION ne change pas : une mise à jour de l'appli ne fait pas retélécharger les livres déjà lus.
const VERSION = "9eaa469ef7";
const COMM_VERSION = "075ea79098";
const CACHE = "bible-lsg-" + VERSION;
const COMM_CACHE = "bible-lsg-comm-" + COMM_VERSION;
const FILES = ["./", "index.html", "app.js", "style.css", "bible.json", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bible-lsg-") && k !== CACHE && k !== COMM_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Téléchargements (APK, ePub) : toujours depuis le réseau, jamais en cache.
  if (/^\/(apk|epub|epub-commentaire|health|dispo)\/?$/.test(url.pathname) || /\.(apk|epub)$/.test(url.pathname)) return;
  // Commentaire : mis en cache à la première lecture de chaque livre.
  if (/\/commentaire\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(caches.open(COMM_CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(caches.open(CACHE).then((c) => c.match("index.html").then((r) => r || fetch(req))));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") c.put(req, res.clone());
      return res;
    })))
  );
});
