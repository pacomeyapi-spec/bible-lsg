// Service worker de Bible LSG : tout est gardé en cache pour lire sans connexion.
// VERSION est réécrite par build.py à chaque changement de contenu : le nouveau cache remplace l'ancien.
const VERSION = "1075f52486";
const CACHE = "bible-lsg-" + VERSION;
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bible-lsg-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Téléchargements (APK, ePub) : toujours depuis le réseau, jamais en cache.
  if (/^\/(apk|epub|health|dispo)\/?$/.test(url.pathname) || /\.(apk|epub)$/.test(url.pathname)) return;
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
