// Serveur statique de Bible LSG (site web / iPhone), sans dépendance.
// Sert web/ avec compression gzip (mise en mémoire), ETag, et des liens courts : /apk, /epub, /epub-commentaire.
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "web");
const PORT = process.env.PORT || 3000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive",
  ".epub": "application/epub+zip"
};
const COMPRESS = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg"]);
const DOWNLOADS = {
  "/apk": ["BibleLSG.apk", "BibleLSG.apk"],
  "/epub": ["bible-lsg.epub", "Bible-Louis-Segond-1910.epub"],
  "/epub-commentaire": ["commentaire-matthew-henry.epub", "Commentaire-concis-Matthew-Henry.epub"]
};

// Cache mémoire : fichier -> { mtime, size, data, gz, etag }
const cache = new Map();
function load(file, cb) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return cb(err || new Error("pas un fichier"));
    const hit = cache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return cb(null, hit);
    fs.readFile(file, (err2, data) => {
      if (err2) return cb(err2);
      const ext = path.extname(file);
      const entry = {
        mtime: st.mtimeMs, size: st.size, data,
        gz: COMPRESS.has(ext) ? zlib.gzipSync(data, { level: 9 }) : null,
        etag: '"' + st.size.toString(36) + "-" + Math.floor(st.mtimeMs).toString(36) + '"'
      };
      // Les gros binaires (APK) ne restent pas en mémoire.
      if (data.length < 20e6) cache.set(file, entry);
      cb(null, entry);
    });
  });
}

function send(req, res, file, extra) {
  load(file, (err, f) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(extra && extra.download ? "Fichier pas encore disponible" : "Page introuvable");
    }
    const ext = path.extname(file);
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "ETag": f.etag,
      "X-Content-Type-Options": "nosniff",
      // Le service worker gère le hors-ligne : le navigateur revalide toujours (304 si inchangé).
      "Cache-Control": ext === ".png" ? "public, max-age=604800" : "no-cache"
    };
    if (extra && extra.download) headers["Content-Disposition"] = 'attachment; filename="' + extra.download + '"';
    if (file.endsWith("sw.js")) headers["Service-Worker-Allowed"] = "/";
    if (req.headers["if-none-match"] === f.etag) { res.writeHead(304, headers); return res.end(); }
    let body = f.data;
    if (f.gz && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      body = f.gz;
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
    }
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  });
}

http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let url;
  try { url = decodeURIComponent((req.url || "/").split("?")[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  // Quels téléchargements sont disponibles (l'accueil n'affiche que ceux-là).
  if (url === "/dispo") {
    const out = {};
    for (const k in DOWNLOADS) out[k.slice(1)] = fs.existsSync(path.join(ROOT, DOWNLOADS[k][0]));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(out));
  }
  const dl = DOWNLOADS[url.replace(/\/$/, "")];
  if (dl) return send(req, res, path.join(ROOT, dl[0]), { download: dl[1] });
  if (url.endsWith("/")) url += "index.html";
  const file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  send(req, res, file);
}).listen(PORT, () => console.log("Bible LSG en ligne sur le port " + PORT));
