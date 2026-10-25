/* Bible LSG — Louis Segond 1910
 * Une seule page, sans dépendance. Le texte biblique est lu dans bible.json (site) ou bible.js (APK).
 * Données personnelles : localStorage, clés préfixées « lsg- ».
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ outils
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const IS_APP = !!window.AndroidApp;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => n.toLocaleString("fr-FR");
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem("lsg-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem("lsg-" + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    }
  };
  const plural = (n, s, p) => fmt(n) + " " + (n > 1 ? (p || s + "s") : s);
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysBetween(a, b) { // a, b : "AAAA-MM-JJ"
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  // Normalisation pour la recherche : minuscules, sans accents, œ → oe.
  const ACC = { "œ": "oe", "æ": "ae", "ß": "ss" };
  function norm(s) {
    s = s.toLowerCase();
    return s.replace(/[^\x00-\x7f]/g, (ch) => ACC[ch] || ch.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  }
  const tokens = (s) => norm(s).match(/[a-z0-9]+/g) || [];

  // ------------------------------------------------------------------ données
  let BOOKS = [], N = 0, TXT = [], VB, VC, VV;
  const CODE = {};

  function buildModel(data) {
    let g = 0;
    BOOKS = data.livres.map((b, i) => {
      const o = { i, code: b.code, nom: b.nom, abrev: b.abrev, t: b.testament, ch: b.chapitres, start: g, chStart: [] };
      for (const c of b.chapitres) { o.chStart.push(g); g += c.length; }
      o.end = g;
      CODE[b.code] = o;
      return o;
    });
    N = g;
    TXT = new Array(N); VB = new Uint8Array(N); VC = new Uint16Array(N); VV = new Uint16Array(N);
    for (const b of BOOKS) {
      b.ch.forEach((vs, ci) => vs.forEach((t, vi) => {
        const id = b.chStart[ci] + vi;
        TXT[id] = t || ""; VB[id] = b.i; VC[id] = ci + 1; VV[id] = vi + 1;
      }));
    }
  }
  const gid = (bi, c, v) => BOOKS[bi].chStart[c - 1] + (v || 1) - 1;
  const keyOf = (g) => BOOKS[VB[g]].code + "." + VC[g] + "." + VV[g];
  function gidOf(k) {
    const m = /^([1-3]?[A-Z]{2,3})\.(\d+)\.(\d+)$/.exec(k || "");
    const b = m && CODE[m[1]];
    if (!b) return -1;
    const c = +m[2], v = +m[3];
    if (c < 1 || c > b.ch.length || v < 1 || v > b.ch[c - 1].length) return -1;
    return b.chStart[c - 1] + v - 1;
  }
  const bookLabel = (b, c) => (b.code === "PSA" && c ? "Psaume" : b.nom);
  const chapLabel = (bi, c) => bookLabel(BOOKS[bi], c) + (BOOKS[bi].ch.length > 1 || c > 1 ? " " + c : "");
  const refOf = (g) => bookLabel(BOOKS[VB[g]], VC[g]) + " " + VC[g] + ":" + VV[g];
  // « Jean 3:16-18, 20 » pour une liste de versets d'un même chapitre (sinon refs séparées).
  function refList(ids) {
    ids = Array.from(ids).sort((a, b) => a - b);
    if (!ids.length) return "";
    const out = [];
    let i = 0;
    while (i < ids.length) {
      const g0 = ids[i];
      const same = [];
      while (i < ids.length && VB[ids[i]] === VB[g0] && VC[ids[i]] === VC[g0]) same.push(ids[i++]);
      const parts = [];
      for (let j = 0; j < same.length;) {
        let k = j;
        while (k + 1 < same.length && same[k + 1] === same[k] + 1) k++;
        parts.push(k > j ? VV[same[j]] + "-" + VV[same[k]] : String(VV[same[j]]));
        j = k + 1;
      }
      out.push(bookLabel(BOOKS[VB[g0]], VC[g0]) + " " + VC[g0] + ":" + parts.join(", "));
    }
    return out.join(" ; ");
  }

  // ------------------------------------------------------------------ références tapées
  const EXTRA = {
    ps: "PSA", psaume: "PSA", psaumes: "PSA", is: "ISA", isaie: "ISA", esaie: "ISA", mt: "MAT", mat: "MAT", mc: "MRK", mr: "MRK",
    lc: "LUK", lu: "LUK", jn: "JHN", jean: "JHN", ac: "ACT", act: "ACT", actes: "ACT", rm: "ROM", ro: "ROM", ap: "REV", apo: "REV",
    apoc: "REV", ct: "SNG", cant: "SNG", cantique: "SNG", cantiques: "SNG", qo: "ECC", eccl: "ECC", ecc: "ECC", jc: "JAS", ja: "JAS", jac: "JAS",
    he: "HEB", hb: "HEB", heb: "HEB", ph: "PHP", phil: "PHP", phi: "PHP", phm: "PHM", ep: "EPH", eph: "EPH", ga: "GAL", gal: "GAL",
    col: "COL", tt: "TIT", tit: "TIT", jg: "JDG", jug: "JDG", dt: "DEU", deut: "DEU", nb: "NUM", nom: "NUM", lv: "LEV", lev: "LEV",
    ex: "EXO", exo: "EXO", gn: "GEN", ge: "GEN", gen: "GEN", pr: "PRO", prov: "PRO", jb: "JOB", jr: "JER", jer: "JER", ez: "EZK",
    eze: "EZK", dn: "DAN", dan: "DAN", os: "HOS", jl: "JOL", am: "AMO", ab: "OBA", abd: "OBA", jon: "JON", mi: "MIC", mic: "MIC",
    na: "NAM", nah: "NAM", ha: "HAB", hab: "HAB", so: "ZEP", soph: "ZEP", ag: "HAG", agg: "HAG", za: "ZEC", zach: "ZEC", ml: "MAL",
    mal: "MAL", esd: "EZR", ne: "NEH", neh: "NEH", est: "EST", rt: "RUT", jos: "JOS", lam: "LAM", lm: "LAM", ec: "ECC",
    "1s": "1SA", "2s": "2SA", "1sam": "1SA", "2sam": "2SA", "1r": "1KI", "2r": "2KI", "1ch": "1CH", "2ch": "2CH", "1chr": "1CH", "2chr": "2CH",
    "1co": "1CO", "2co": "2CO", "1cor": "1CO", "2cor": "2CO", "1th": "1TH", "2th": "2TH", "1tm": "1TI", "2tm": "2TI", "1ti": "1TI", "2ti": "2TI",
    "1tim": "1TI", "2tim": "2TI", "1p": "1PE", "2p": "2PE", "1pi": "1PE", "2pi": "2PE", "1pe": "1PE", "2pe": "2PE",
    "1jn": "1JN", "2jn": "2JN", "3jn": "3JN", "1j": "1JN", "2j": "2JN", "3j": "3JN", jude: "JUD", jud: "JUD"
  };
  let ALIAS = null;
  function bookFromName(key) {
    if (!ALIAS) {
      ALIAS = new Map();
      for (const b of BOOKS) {
        ALIAS.set(norm(b.nom).replace(/[^a-z0-9]/g, ""), b);
        ALIAS.set(norm(b.abrev).replace(/[^a-z0-9]/g, ""), b);
        ALIAS.set(b.code.toLowerCase(), b);
      }
      for (const k in EXTRA) if (CODE[EXTRA[k]] && !ALIAS.has(k)) ALIAS.set(k, CODE[EXTRA[k]]);
      ALIAS.set("jean", CODE.JHN);
    }
    if (ALIAS.has(key)) return ALIAS.get(key);
    if (key.replace(/^[1-3]/, "").length < 3) return null;
    const hits = BOOKS.filter((b) => norm(b.nom).replace(/[^a-z0-9]/g, "").startsWith(key));
    return hits.length === 1 ? hits[0] : null;
  }
  function parseRef(q) {
    const s = norm(q).replace(/[’']/g, " ").trim().replace(/\s+/g, " ");
    const m = /^(?:([1-3])\s*)?([a-z]+(?: [a-z]+)*)\s*\.?\s*(\d{1,3})(?:(?:\s*[:.,v]\s*|\s+)(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?$/.exec(s);
    if (!m) return null;
    const b = bookFromName((m[1] || "") + m[2].replace(/ /g, ""));
    if (!b) return null;
    let c = +m[3], v = m[4] ? +m[4] : 0, v2 = m[5] ? +m[5] : 0;
    if (b.ch.length === 1 && !m[4] && c > 1 && c <= b.ch[0].length) { v = c; c = 1; } // « Jude 3 »
    if (c < 1 || c > b.ch.length) return null;
    if (v && (v > b.ch[c - 1].length)) return null;
    if (v2 && (v2 < v || v2 > b.ch[c - 1].length)) v2 = 0;
    return { bi: b.i, c, v, v2 };
  }

  // ------------------------------------------------------------------ état personnel
  let HL = store.get("hl", {}), FAV = store.get("fav", {}), NOTES = store.get("notes", {});
  let PLANSTATE = store.get("plans", {});
  const saveHL = () => store.set("hl", HL), saveFAV = () => store.set("fav", FAV), saveNotes = () => store.set("notes", NOTES);
  const savePlans = () => store.set("plans", PLANSTATE);
  const DEFAULTS = { taille: window.innerWidth >= 700 ? 24 : 21, theme: null, police: "serif", nums: true, mise: "para" };
  let SET = Object.assign({}, DEFAULTS, store.get("reglages", {}));

  // ------------------------------------------------------------------ messages
  let toastTimer = 0;
  function toast(msg, action) {
    const t = $("#toast");
    t.innerHTML = "<span>" + esc(msg) + "</span>";
    if (action) {
      const b = document.createElement("button");
      b.textContent = action.label;
      b.onclick = () => { t.hidden = true; action.run(); };
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 9000 : 2600);
  }

  // ------------------------------------------------------------------ onglets et retour
  let curTab = "accueil";
  const tabHist = [];
  function showTab(name, opts) {
    opts = opts || {};
    if (name !== curTab && !opts.noHist) {
      tabHist.push(curTab);
      if (tabHist.length > 20) tabHist.shift();
    }
    curTab = name;
    $$(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    $$(".view").forEach((v) => v.classList.remove("on"));
    if (name === "lire") {
      (pickerOpen ? $("#v-picker") : $("#v-lire")).classList.add("on");
      if (!rendered) openChapter(cur.bi, cur.c, { v: cur.v, noAnim: true });
    } else {
      $("#v-" + name).classList.add("on");
    }
    if (name !== "lire") clearSel();
    if (name === "accueil") renderHome();
    if (name === "favoris") renderMine();
    if (name === "plans") renderPlans();
    if (name === "fouiller") {
      ensureIndex();
      if (!$("#s-input").value) setTimeout(() => { try { $("#s-input").focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
  }
  let modalOpen = null;
  function openModal(el) {
    closeModal();
    modalOpen = el;
    $("#scrim").hidden = false;
    el.hidden = false;
  }
  function closeModal() {
    if (!modalOpen) return false;
    modalOpen.hidden = true;
    modalOpen = null;
    $("#scrim").hidden = true;
    return true;
  }
  // Retour Android (MainActivity appelle window.bibleBack()) : renvoie true si l'appli a géré.
  window.bibleBack = function () {
    if (closeModal()) return true;
    if (sel.size) { clearSel(); return true; }
    if (curTab === "lire" && pickerOpen) { pickerBack(); return true; }
    if (curTab === "plans" && planOpen) { planOpen = null; renderPlans(); return true; }
    while (tabHist.length) {
      const t = tabHist.pop();
      if (t !== curTab) { showTab(t, { noHist: true }); return true; }
    }
    if (curTab !== "accueil") { showTab("accueil", { noHist: true }); return true; }
    return false;
  };

  // ------------------------------------------------------------------ réglages
  function applySettings() {
    const root = document.documentElement;
    const theme = SET.theme || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair");
    root.dataset.theme = theme;
    root.dataset.font = SET.police;
    root.style.setProperty("--taille", SET.taille + "px");
    const meta = $('meta[name="theme-color"]');
    const bg = theme === "sombre" ? "#121419" : theme === "sepia" ? "#f3e6cc" : "#fbf7ee";
    if (meta) meta.content = bg;
    if (window.AndroidApp && AndroidApp.setBars) { try { AndroidApp.setBars(bg, theme !== "sombre"); } catch (e) {} }
    const t = $("#r-text");
    t.classList.toggle("no-nums", !SET.nums);
    t.classList.toggle("lines", SET.mise === "ligne");
    $("#set-size").value = SET.taille;
    const mark = (id, v) => $$("#" + id + " button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    mark("set-theme", theme); mark("set-font", SET.police); mark("set-layout", SET.mise);
    $("#set-nums").checked = !!SET.nums;
  }
  function setSetting(k, v) {
    SET[k] = v;
    store.set("reglages", SET);
    applySettings();
  }
  function bindSettings() {
    $$("[data-open-settings]").forEach((b) => b.addEventListener("click", () => { applySettings(); openModal($("#settings")); }));
    $("#set-size").addEventListener("input", (e) => setSetting("taille", +e.target.value));
    $$("#set-theme button").forEach((b) => b.addEventListener("click", () => setSetting("theme", b.dataset.v)));
    $$("#set-font button").forEach((b) => b.addEventListener("click", () => setSetting("police", b.dataset.v)));
    $$("#set-layout button").forEach((b) => b.addEventListener("click", () => { setSetting("mise", b.dataset.v); }));
    $("#set-nums").addEventListener("change", (e) => setSetting("nums", e.target.checked));
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
    $("#scrim").addEventListener("click", closeModal);
    const ver = $('meta[name="version"]');
    $("#set-version").textContent = "Bible LSG · version " + (ver ? ver.content : "?") + (IS_APP ? " · Android" : "");
  }

  // ------------------------------------------------------------------ lecture
  let cur = Object.assign({ bi: 0, c: 1, v: 0 }, (function () {
    const p = store.get("pos", null);
    return p ? { code: p.b, c: p.c, v: p.v || 0 } : {};
  })());
  let rendered = false;

  function verseHtml(g) {
    const t = TXT[g];
    if (!t) return "";
    const k = keyOf(g);
    let cls = "v";
    if (HL[k]) cls += " h" + HL[k];
    let mk = "";
    if (FAV[k]) mk += '<span class="mk fav" aria-label="favori">★</span>';
    if (NOTES[k]) mk += '<span class="mk note" data-note="' + g + '" aria-label="note">✎</span>';
    return '<span class="' + cls + '" data-g="' + g + '"><sup>' + VV[g] + "</sup>" + esc(t) + mk + " </span>";
  }
  function openChapter(bi, c, opts) {
    opts = opts || {};
    const b = BOOKS[bi];
    if (!b) return;
    c = Math.max(1, Math.min(c, b.ch.length));
    const dir = opts.dir || 0;
    clearSel();
    if (TTS.on && !opts.keepTTS) TTS.stop();
    cur = { bi, c, v: opts.v || 0 };
    rendered = true;
    const start = b.chStart[c - 1], end = start + b.ch[c - 1].length;
    let html = '<h2 class="chap-h">' + esc(chapLabel(bi, c)) + "</h2>";
    html += '<div class="chap-sub">' + (b.t === "AT" ? "Ancien Testament" : "Nouveau Testament") + "</div><p>";
    for (let g = start; g < end; g++) html += verseHtml(g);
    html += "</p>";
    const art = $("#r-text");
    const paint = () => {
      art.innerHTML = html;
      $("#r-title-txt").textContent = chapLabel(bi, c);
      const prev = neighbour(bi, c, -1), next = neighbour(bi, c, 1);
      $("#r-prev").disabled = !prev; $("#r-next").disabled = !next;
      $("#r-prev2").disabled = !prev; $("#r-next2").disabled = !next;
      $("#r-prev2 span").textContent = prev ? chapLabel(prev[0], prev[1]) : "";
      $("#r-next2 span").textContent = next ? chapLabel(next[0], next[1]) : "";
      const view = $("#v-lire");
      let target = null;
      if (opts.v) {
        target = art.querySelector('[data-g="' + (start + opts.v - 1) + '"]');
        if (target && opts.flash) {
          const last = opts.v2 ? start + opts.v2 - 1 : start + opts.v - 1;
          for (let g = start + opts.v - 1; g <= last; g++) {
            const s = art.querySelector('[data-g="' + g + '"]');
            if (s) s.classList.add("target");
          }
        }
      }
      if (target) {
        requestAnimationFrame(() => scrollToVerse(target, opts.flash ? "center" : "top"));
      } else {
        view.scrollTop = 0;
      }
      savePos();
    };
    if (dir && !opts.noAnim) {
      art.classList.add(dir > 0 ? "slide-l" : "slide-r");
      setTimeout(() => {
        paint();
        art.classList.remove("slide-l", "slide-r");
        art.classList.add(dir > 0 ? "slide-r" : "slide-l");
        requestAnimationFrame(() => requestAnimationFrame(() => art.classList.remove("slide-l", "slide-r")));
      }, 140);
    } else {
      paint();
    }
  }
  function scrollToVerse(el, where) {
    const view = $("#v-lire");
    const bar = $(".rbar").getBoundingClientRect().height;
    const r = el.getBoundingClientRect(), vr = view.getBoundingClientRect();
    let y = view.scrollTop + r.top - vr.top - bar - 12;
    if (where === "center") y -= Math.max(0, (vr.height - bar - r.height) / 2 - 40);
    view.scrollTop = Math.max(0, y);
  }
  function neighbour(bi, c, d) {
    const b = BOOKS[bi];
    if (d > 0) {
      if (c < b.ch.length) return [bi, c + 1];
      return bi < BOOKS.length - 1 ? [bi + 1, 1] : null;
    }
    if (c > 1) return [bi, c - 1];
    return bi > 0 ? [bi - 1, BOOKS[bi - 1].ch.length] : null;
  }
  function go(d) {
    const n = neighbour(cur.bi, cur.c, d);
    if (n) openChapter(n[0], n[1], { dir: d });
  }
  function openRef(bi, c, v, v2) {
    pickerOpen = false;
    $("#v-picker").hidden = true;
    $("#v-lire").hidden = false;
    if (curTab !== "lire") showTab("lire");
    openChapter(bi, c, { v, v2, flash: !!v, noAnim: true });
    if (curTab === "lire") { $$(".view").forEach((x) => x.classList.remove("on")); $("#v-lire").classList.add("on"); }
  }
  let posTimer = 0;
  function savePos() {
    clearTimeout(posTimer);
    posTimer = setTimeout(() => {
      let v = 0;
      const view = $("#v-lire");
      if (view.classList.contains("on") && view.scrollTop > 40) {
        const bar = $(".rbar").getBoundingClientRect();
        const art = $("#r-text").getBoundingClientRect();
        const el = document.elementFromPoint(art.left + art.width / 2, bar.bottom + 14);
        const s = el && el.closest && el.closest(".v");
        if (s) v = VV[+s.dataset.g];
      }
      cur.v = v;
      store.set("pos", { b: BOOKS[cur.bi].code, c: cur.c, v });
    }, 400);
  }
  function bindReader() {
    $("#r-prev").addEventListener("click", () => go(-1));
    $("#r-next").addEventListener("click", () => go(1));
    $("#r-prev2").addEventListener("click", () => go(-1));
    $("#r-next2").addEventListener("click", () => go(1));
    $("#r-title").addEventListener("click", () => openPicker());
    $("#r-listen").addEventListener("click", () => {
      if (TTS.on) TTS.stop();
      else TTS.start(BOOKS[cur.bi].chStart[cur.c - 1] + (cur.v ? cur.v - 1 : 0));
    });
    const view = $("#v-lire");
    view.addEventListener("scroll", () => {
      $(".rbar").classList.toggle("scrolled", view.scrollTop > 4);
      savePos();
    }, { passive: true });
    $("#r-text").addEventListener("click", (e) => {
      const n = e.target.closest("[data-note]");
      if (n) { e.stopPropagation(); openNote([+n.dataset.note]); return; }
      const v = e.target.closest(".v");
      if (!v) return;
      if (window.getSelection && String(window.getSelection()).length > 1) return;
      toggleSel(+v.dataset.g, v);
    });
    // Glissement horizontal : chapitre suivant / précédent
    let sx = 0, sy = 0, st = 0, multi = false;
    view.addEventListener("touchstart", (e) => {
      multi = e.touches.length > 1;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    view.addEventListener("touchend", (e) => {
      if (multi) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - st < 700) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // ------------------------------------------------------------------ sélecteur livre / chapitre
  let pickerOpen = false, pkTestament = "AT", pkBook = -1;
  const GROUPS = [[0, "Pentateuque"], [5, "Livres historiques"], [17, "Livres poétiques"], [22, "Prophètes"],
    [39, "Évangiles et Actes"], [44, "Épîtres"], [65, "Prophétie"]];
  function openPicker(bookFirst) {
    pickerOpen = true;
    pkTestament = BOOKS[cur.bi].t;
    pkBook = bookFirst ? -1 : -1;
    $("#v-picker").hidden = false;
    renderPicker();
    $$(".view").forEach((x) => x.classList.remove("on"));
    $("#v-picker").classList.add("on");
    $("#v-picker").scrollTop = 0;
    const curBtn = $("#pk-list .cur");
    if (curBtn) curBtn.scrollIntoView({ block: "center" });
  }
  function closePicker() {
    pickerOpen = false;
    $("#v-picker").classList.remove("on");
    $("#v-lire").classList.add("on");
  }
  function pickerBack() {
    if (pkBook >= 0) { pkBook = -1; renderPicker(); } else closePicker();
  }
  function renderPicker() {
    $$("#pk-books .seg button").forEach((b) => b.classList.toggle("on", b.dataset.t === pkTestament));
    if (pkBook < 0) {
      $("#pk-title").textContent = "Choisir un livre";
      $("#pk-books").hidden = false; $("#pk-chaps").hidden = true;
      let h = "";
      for (const b of BOOKS) {
        if (b.t !== pkTestament) continue;
        const grp = GROUPS.find((x) => x[0] === b.i);
        if (grp) h += '<div class="grp">' + grp[1] + "</div>";
        h += '<button data-b="' + b.i + '"' + (b.i === cur.bi ? ' class="cur"' : "") + "><span>" + esc(b.nom) + "</span><small>" + b.ch.length + "</small></button>";
      }
      $("#pk-list").innerHTML = h;
    } else {
      const b = BOOKS[pkBook];
      $("#pk-title").textContent = b.nom;
      $("#pk-books").hidden = true; $("#pk-chaps").hidden = false;
      let h = "";
      for (let c = 1; c <= b.ch.length; c++) {
        h += '<button data-c="' + c + '"' + (pkBook === cur.bi && c === cur.c ? ' class="cur"' : "") + ">" + c + "</button>";
      }
      $("#pk-grid").innerHTML = h;
      $("#v-picker").scrollTop = 0;
    }
  }
  function bindPicker() {
    $("#pk-back").addEventListener("click", pickerBack);
    $$("#pk-books .seg button").forEach((b) => b.addEventListener("click", () => { pkTestament = b.dataset.t; renderPicker(); }));
    $("#pk-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-b]");
      if (!b) return;
      const bi = +b.dataset.b;
      if (BOOKS[bi].ch.length === 1) { closePicker(); openChapter(bi, 1, { noAnim: true }); return; }
      pkBook = bi; renderPicker();
    });
    $("#pk-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      closePicker();
      openChapter(pkBook, +b.dataset.c, { noAnim: true });
    });
  }

  // ------------------------------------------------------------------ sélection de versets
  const sel = new Set();
  function toggleSel(g, el) {
    if (sel.has(g)) { sel.delete(g); el.classList.remove("sel"); } else { sel.add(g); el.classList.add("sel"); }
    $$(".v.target").forEach((x) => x.classList.remove("target"));
    updateVbar();
  }
  function clearSel() {
    sel.clear();
    $$(".v.sel").forEach((x) => x.classList.remove("sel"));
    updateVbar();
  }
  function updateVbar() {
    const bar = $("#vbar");
    document.body.classList.toggle("has-sel", sel.size > 0);
    if (!sel.size) { bar.hidden = true; return; }
    bar.hidden = false;
    const ids = Array.from(sel);
    $("#vb-ref").textContent = refList(ids);
    const hls = new Set(ids.map((g) => HL[keyOf(g)] || 0));
    $$("#vbar [data-hl]").forEach((b) => b.classList.toggle("on", hls.size === 1 && +b.dataset.hl === [...hls][0] && b.dataset.hl !== "0"));
    $("#vb-fav").classList.toggle("on", ids.every((g) => FAV[keyOf(g)]));
    $("#vb-fav span").textContent = ids.every((g) => FAV[keyOf(g)]) ? "Retirer" : "Favori";
  }
  function refreshVerses(ids) {
    for (const g of ids) {
      const old = $('#r-text [data-g="' + g + '"]');
      if (!old) continue;
      const tmp = document.createElement("span");
      tmp.innerHTML = verseHtml(g);
      if (tmp.firstChild) old.replaceWith(tmp.firstChild);
    }
  }
  function selText(ids) {
    ids = Array.from(ids).sort((a, b) => a - b);
    const body = ids.length === 1 ? TXT[ids[0]] : ids.map((g) => VV[g] + " " + TXT[g]).join(" ");
    return "« " + body.trim() + " »\n" + refList(ids) + " (Louis Segond 1910)";
  }
  function bindVbar() {
    $("#vb-close").addEventListener("click", clearSel);
    $$("#vbar [data-hl]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.hl, ids = Array.from(sel);
      for (const g of ids) { const k = keyOf(g); if (n) HL[k] = n; else delete HL[k]; }
      saveHL(); refreshVerses(ids); clearSel();
      toast(n ? "Surligné" : "Surlignage enlevé");
    }));
    $("#vb-fav").addEventListener("click", () => {
      const ids = Array.from(sel);
      const all = ids.every((g) => FAV[keyOf(g)]);
      const now = Date.now();
      for (const g of ids) { const k = keyOf(g); if (all) delete FAV[k]; else FAV[k] = FAV[k] || now; }
      saveFAV(); refreshVerses(ids); clearSel();
      toast(all ? "Retiré des favoris" : "Ajouté aux favoris ★");
    });
    $("#vb-note").addEventListener("click", () => openNote(Array.from(sel)));
    $("#vb-copy").addEventListener("click", () => {
      copyText(selText(sel)).then((ok) => toast(ok ? "Copié" : "Impossible de copier"));
      clearSel();
    });
    $("#vb-share").addEventListener("click", () => { shareText(selText(sel)); clearSel(); });
    $("#vb-listen").addEventListener("click", () => {
      const first = Math.min.apply(null, Array.from(sel));
      clearSel();
      TTS.start(first);
    });
  }

  // ------------------------------------------------------------------ copier / partager / notes
  function copyText(t) {
    if (window.AndroidApp && AndroidApp.copy) {
      try { AndroidApp.copy(t); return Promise.resolve(true); } catch (e) {}
    }
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, fallback);
    return Promise.resolve(fallback());
  }
  function shareText(t) {
    if (window.AndroidApp && AndroidApp.share) { try { AndroidApp.share(t); return; } catch (e) {} }
    if (navigator.share) { navigator.share({ text: t }).catch(() => {}); return; }
    copyText(t).then((ok) => toast(ok ? "Partage indisponible : texte copié" : "Partage indisponible"));
  }
  let noteIds = [];
  function openNote(ids) {
    ids = ids.slice().sort((a, b) => a - b);
    if (!ids.length) return;
    noteIds = ids;
    const k = keyOf(ids[0]);
    const n = NOTES[k];
    if (n && n.fin && ids.length === 1) {
      const e = gidOf(n.fin);
      if (e > ids[0]) { noteIds = []; for (let g = ids[0]; g <= e; g++) noteIds.push(g); }
    }
    $("#nb-title").textContent = "Note · " + refList(noteIds);
    $("#nb-verse").textContent = noteIds.map((g) => TXT[g]).join(" ");
    $("#nb-text").value = n ? n.t : "";
    $("#nb-del").hidden = !n;
    openModal($("#notebox"));
    setTimeout(() => { try { $("#nb-text").focus(); } catch (e) {} }, 80);
  }
  function bindNotes() {
    $("#nb-save").addEventListener("click", () => {
      const t = $("#nb-text").value.trim();
      const k = keyOf(noteIds[0]);
      if (t) {
        NOTES[k] = { t, d: Date.now() };
        if (noteIds.length > 1) NOTES[k].fin = keyOf(noteIds[noteIds.length - 1]);
      } else delete NOTES[k];
      saveNotes(); refreshVerses([noteIds[0]]); closeModal(); clearSel();
      toast(t ? "Note enregistrée" : "Note supprimée");
      if (curTab === "favoris") renderMine();
    });
    $("#nb-del").addEventListener("click", () => {
      delete NOTES[keyOf(noteIds[0])];
      saveNotes(); refreshVerses([noteIds[0]]); closeModal(); clearSel();
      toast("Note supprimée");
      if (curTab === "favoris") renderMine();
    });
  }

  // ------------------------------------------------------------------ recherche
  let IDX = null, IDXP = null;
  function ensureIndex() {
    if (IDX) return Promise.resolve(IDX);
    if (IDXP) return IDXP;
    IDXP = new Promise((resolve) => {
      const t0 = performance.now();
      const norms = new Array(N), map = new Map();
      let g = 0;
      const step = () => {
        const end = Math.min(N, g + 2500);
        for (; g < end; g++) {
          const n = norm(TXT[g]);
          norms[g] = n;
          const ws = n.split(/[^a-z0-9]+/);
          for (let i = 0; i < ws.length; i++) {
            const w = ws[i];
            if (!w) continue;
            let a = map.get(w);
            if (!a) { a = []; map.set(w, a); }
            if (a[a.length - 1] !== g) a.push(g);
          }
        }
        if (g < N) { setTimeout(step, 0); return; }
        const words = Array.from(map.keys()).sort();
        const lists = new Map();
        map.forEach((a, w) => lists.set(w, Int32Array.from(a)));
        IDX = { norms, words, lists };
        window.__indexMs = performance.now() - t0;
        resolve(IDX);
      };
      setTimeout(step, 0);
    });
    return IDXP;
  }
  const EMPTY = new Int32Array(0);
  function lowerBound(arr, x) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  function unionOf(lists) {
    if (!lists.length) return EMPTY;
    if (lists.length === 1) return lists[0];
    const f = new Uint8Array(N);
    let n = 0;
    for (const l of lists) for (let i = 0; i < l.length; i++) if (!f[l[i]]) { f[l[i]] = 1; n++; }
    const out = new Int32Array(n);
    for (let g = 0, j = 0; g < N; g++) if (f[g]) out[j++] = g;
    return out;
  }
  function tokenList(tok, kind) {
    const { words, lists } = IDX;
    if (kind === "exact") return lists.get(tok) || EMPTY;
    const found = [];
    if (kind === "prefix") {
      for (let i = lowerBound(words, tok); i < words.length && words[i].startsWith(tok); i++) found.push(lists.get(words[i]));
    } else {
      for (const w of words) if (kind === "sub" ? w.includes(tok) : w.endsWith(tok)) found.push(lists.get(w));
    }
    return unionOf(found);
  }
  function intersect(a, b) {
    const out = new Int32Array(Math.min(a.length, b.length));
    let i = 0, j = 0, n = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out[n++] = a[i]; i++; j++; } else if (a[i] < b[j]) i++; else j++;
    }
    return out.subarray(0, n);
  }
  function parseQuery(q) {
    const terms = [];
    q = q.replace(/[“”«»„]/g, '"');
    q = q.replace(/"([^"]*)"?/g, (m, p) => { const t = tokens(p); if (t.length) terms.push({ toks: t, quoted: true }); return " "; });
    for (const w of q.split(/\s+/)) { const t = tokens(w); if (t.length) terms.push({ toks: t, quoted: false }); }
    return terms;
  }
  // Classes de lettres pour surligner dans le texte original (accents, œ).
  const CLS = { a: "aàâäáã", c: "cç", e: "eéèêë", i: "iîïí", o: "oôöó", u: "uùûüú", y: "yÿ", n: "nñ" };
  function hlTokenPattern(t) {
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === "o" && t[i + 1] === "e") { out += "(?:[oôöó][eéèêë]|œ)"; i++; continue; }
      out += CLS[ch] ? "[" + CLS[ch] + "]" : ch;
    }
    return out;
  }
  function compileTerms(terms, mode) {
    return terms.map((t) => {
      const one = t.toks.length === 1;
      const lk = one ? (t.quoted || mode !== "partout" ? "b" : "") : (mode === "partout" ? "" : "b");
      const rk = one ? (t.quoted || mode === "mot" ? "b" : "") : (mode === "mot" ? "b" : "");
      const kinds = t.toks.map((tok, i) => {
        if (one) return t.quoted ? "exact" : mode === "mot" ? "exact" : mode === "debut" ? "prefix" : "sub";
        if (i === 0) return mode === "partout" ? "suffix" : "exact";
        if (i === t.toks.length - 1) return mode === "mot" ? "exact" : "prefix";
        return "exact";
      });
      const pat = t.toks.join("[^a-z0-9]+");
      const re = new RegExp((lk ? "(?:^|[^a-z0-9])" : "") + "(" + pat + ")" + (rk ? "(?![a-z0-9])" : ""), "g");
      const hpat = t.toks.map(hlTokenPattern).join("[^\\p{L}\\p{N}]+");
      const hre = new RegExp((lk ? "(^|[^\\p{L}\\p{N}])" : "()") + "(" + hpat + ")" + (rk ? "(?![\\p{L}\\p{N}])" : ""), "giu");
      return { toks: t.toks, kinds, re, hre };
    });
  }
  function scopeRange(scope) {
    if (scope === "AT") return [0, CODE.MAT.start];
    if (scope === "NT") return [CODE.MAT.start, N];
    if (CODE[scope]) return [CODE[scope].start, CODE[scope].end];
    return [0, N];
  }
  // Recherche principale (synchrone, index prêt). Renvoie ids des versets, occurrences, répartition.
  function runSearch(q, mode, scope) {
    const t0 = performance.now();
    const terms = compileTerms(parseQuery(q), mode);
    if (!terms.length) return null;
    let cand = null;
    for (const t of terms) {
      for (let i = 0; i < t.toks.length; i++) {
        const l = tokenList(t.toks[i], t.kinds[i]);
        cand = cand ? intersect(cand, l) : l;
        if (!cand.length) break;
      }
      if (!cand.length) break;
    }
    const [lo, hi] = scopeRange(scope);
    const norms = IDX.norms;
    const ids = [];
    const perBook = new Uint32Array(BOOKS.length);
    let occ = 0;
    for (let i = lowerBound(cand, lo); i < cand.length && cand[i] < hi; i++) {
      const g = cand[i], s = norms[g];
      let n = 0, ok = true;
      for (const t of terms) {
        t.re.lastIndex = 0;
        let c = 0;
        while (t.re.exec(s)) c++;
        if (!c) { ok = false; break; }
        n += c;
      }
      if (!ok) continue;
      ids.push(g);
      occ += n;
      perBook[VB[g]] += n;
    }
    const ms = performance.now() - t0;
    window.__lastSearchMs = ms;
    return { ids, occ, perBook, terms, ms };
  }
  function highlight(text, terms) {
    const ranges = [];
    for (const t of terms) {
      t.hre.lastIndex = 0;
      let m;
      while ((m = t.hre.exec(text))) {
        const s = m.index + m[1].length;
        ranges.push([s, s + m[2].length]);
        if (m[0].length === 0) t.hre.lastIndex++;
      }
    }
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    let out = "", pos = 0;
    for (const [s, e] of ranges) {
      if (e <= pos) continue;
      const ss = Math.max(s, pos);
      out += esc(text.slice(pos, ss)) + "<mark>" + esc(text.slice(ss, e)) + "</mark>";
      pos = e;
    }
    return out + esc(text.slice(pos));
  }

  let S = { mode: store.get("smode", "mot"), scope: "tout", res: null, shown: 0, q: "" };
  const PAGE = 40;
  function searchNow(fromSubmit) {
    const q = $("#s-input").value.trim();
    $("#s-clear").hidden = !q;
    S.q = q;
    const ref = q ? parseRef(q) : null;
    renderRefCard(ref);
    if (fromSubmit && ref) {
      pushHistory(q);
      openRef(ref.bi, ref.c, ref.v, ref.v2);
      return;
    }
    if (!q || ref || (!fromSubmit && norm(q).replace(/[^a-z0-9]/g, "").length < 2)) {
      S.res = null;
      $("#s-status").textContent = "";
      $("#s-dist").innerHTML = ""; $("#s-results").innerHTML = ""; $("#s-more").innerHTML = "";
      $("#s-help").hidden = !!ref;
      if (!q) renderHistory();
      return;
    }
    $("#s-help").hidden = true;
    if (!IDX) {
      $("#s-status").textContent = "Préparation de la recherche…";
      ensureIndex().then(() => { if ($("#s-input").value.trim() === q) searchNow(fromSubmit); });
      return;
    }
    if (fromSubmit) pushHistory(q);
    S.res = runSearch(q, S.mode, S.scope);
    S.shown = 0;
    renderResults();
  }
  function renderRefCard(ref) {
    const box = $("#s-ref");
    if (!ref) { box.innerHTML = ""; return; }
    const b = BOOKS[ref.bi];
    const label = bookLabel(b, ref.c) + " " + ref.c + (ref.v ? ":" + ref.v + (ref.v2 ? "-" + ref.v2 : "") : "");
    const g = gid(ref.bi, ref.c, ref.v || 1);
    box.innerHTML = '<button class="refcard" id="s-refbtn"><svg viewBox="0 0 24 24"><use href="#i-livre"/></svg><span>' +
      "<small>Ouvrir le passage</small><strong>" + esc(label) + "</strong><p>" + esc(TXT[g] || "") + "</p></span></button>";
    $("#s-refbtn").onclick = () => { pushHistory($("#s-input").value.trim()); openRef(ref.bi, ref.c, ref.v, ref.v2); };
  }
  function scopeName(s) {
    return s === "AT" ? "l'Ancien Testament" : s === "NT" ? "le Nouveau Testament" : CODE[s] ? CODE[s].nom : "toute la Bible";
  }
  function renderResults() {
    const r = S.res;
    const list = $("#s-results");
    list.innerHTML = ""; $("#s-more").innerHTML = ""; $("#s-dist").innerHTML = "";
    if (!r) { $("#s-status").textContent = ""; return; }
    if (!r.ids.length) {
      $("#s-status").innerHTML = "";
      const tip = S.mode === "mot" ? "Essayez l'option « Début de mot » ou « Partout »." : "Vérifiez l'orthographe ou cherchez moins de mots.";
      list.innerHTML = '<li class="empty"><svg viewBox="0 0 24 24"><use href="#i-fouiller"/></svg>Aucun verset trouvé dans ' +
        esc(scopeName(S.scope)) + ".<br><small>" + tip + "</small></li>";
      return;
    }
    $("#s-status").innerHTML = "<b>" + fmt(r.occ) + "</b> occurrence" + (r.occ > 1 ? "s" : "") + " dans <b>" + fmt(r.ids.length) +
      "</b> verset" + (r.ids.length > 1 ? "s" : "") + (S.scope !== "tout" ? " · " + esc(scopeName(S.scope)) : "");
    renderDist(r);
    moreResults();
  }
  function renderDist(r) {
    const books = BOOKS.filter((b) => r.perBook[b.i]);
    if (books.length < 2 && S.scope === "tout") return;
    const max = Math.max.apply(null, Array.from(r.perBook));
    let strip = "";
    const [lo, hi] = S.scope === "AT" ? [0, 39] : S.scope === "NT" ? [39, 66] : [0, 66];
    if (!CODE[S.scope]) {
      for (let i = lo; i < hi; i++) {
        const v = r.perBook[i];
        strip += '<i class="' + (BOOKS[i].t === "NT" ? "nt" : "") + '" style="height:' + (v ? Math.max(6, Math.sqrt(v / max) * 100) : 0) + '%" title="' + esc(BOOKS[i].nom) + '"></i>';
      }
    }
    let bars = "";
    for (const b of books) {
      const v = r.perBook[b.i];
      bars += '<button class="bar' + (b.t === "NT" ? " nt" : "") + (S.scope === b.code ? " on" : "") + '" data-book="' + b.code + '"><span class="bn">' +
        esc(b.nom) + '</span><span class="bt"><i style="width:' + Math.max(3, (v / max) * 100) + '%"></i></span><span class="bc">' + fmt(v) + "</span></button>";
    }
    const back = CODE[S.scope] ? '<button class="chip" data-book="tout" style="margin-top:8px">Revenir à toute la Bible</button>' : "";
    $("#s-dist").innerHTML = '<div class="dist">' + (strip ? '<div class="dist-strip">' + strip + '</div><div class="dist-axis"><span>' +
      (S.scope === "NT" ? "Matthieu" : "Genèse") + "</span><span>" + (S.scope === "tout" ? "Matthieu" : "") + "</span><span>" +
      (S.scope === "AT" ? "Malachie" : "Apocalypse") + "</span></div>" : "") +
      "<details" + (books.length <= 6 ? " open" : "") + "><summary>Répartition par livre (" + plural(books.length, "livre") + ")</summary><div class=\"bars\">" + bars + "</div></details>" + back + "</div>";
  }
  let moreObs = null;
  function moreResults() {
    const r = S.res;
    if (!r) return;
    const list = $("#s-results");
    const end = Math.min(r.ids.length, S.shown + PAGE);
    let h = "";
    for (let i = S.shown; i < end; i++) {
      const g = r.ids[i];
      h += '<li><button data-g="' + g + '"><div class="rref">' + esc(refOf(g)) + "</div><div class=\"rtxt\">" + highlight(TXT[g], r.terms) + "</div></button></li>";
    }
    list.insertAdjacentHTML("beforeend", h);
    S.shown = end;
    const more = $("#s-more");
    if (end < r.ids.length) {
      more.innerHTML = '<div class="s-more"><button class="btn ghost" id="s-morebtn">Afficher la suite (' + fmt(r.ids.length - end) + ")</button></div>";
      $("#s-morebtn").onclick = moreResults;
      if ("IntersectionObserver" in window) {
        if (!moreObs) moreObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && S.res && S.shown < S.res.ids.length) moreResults(); }, { root: $("#v-fouiller"), rootMargin: "600px" });
        moreObs.disconnect();
        moreObs.observe(more);
      }
    } else {
      more.innerHTML = r.ids.length > PAGE ? '<div class="s-more">Fin des résultats</div>' : "";
      if (moreObs) moreObs.disconnect();
    }
  }
  function pushHistory(q) {
    if (!q) return;
    let h = store.get("histo", []).filter((x) => x.toLowerCase() !== q.toLowerCase());
    h.unshift(q);
    store.set("histo", h.slice(0, 12));
  }
  function renderHistory() {
    const h = store.get("histo", []);
    const box = $("#s-history");
    if (!h.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="hist"><h3>Recherches récentes</h3>' + h.map((q) => '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + "</button>").join("") +
      '<button class="hist-clear" id="hist-clear">Effacer</button></div>';
  }
  function fillScopes() {
    let h = '<option value="tout">Toute la Bible</option><option value="AT">Ancien Testament</option><option value="NT">Nouveau Testament</option>';
    h += '<optgroup label="Ancien Testament">' + BOOKS.filter((b) => b.t === "AT").map((b) => '<option value="' + b.code + '">' + esc(b.nom) + "</option>").join("") + "</optgroup>";
    h += '<optgroup label="Nouveau Testament">' + BOOKS.filter((b) => b.t === "NT").map((b) => '<option value="' + b.code + '">' + esc(b.nom) + "</option>").join("") + "</optgroup>";
    $("#s-scope").innerHTML = h;
  }
  function setScope(s) {
    S.scope = s;
    $("#s-scope").value = s;
    searchNow(false);
    $("#v-fouiller").scrollTop = 0;
  }
  function bindSearch() {
    fillScopes();
    $$("#s-mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === S.mode));
    let timer = 0;
    const input = $("#s-input");
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => searchNow(false), 280); });
    $("#s-form").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(timer); input.blur(); searchNow(true); });
    $("#s-clear").addEventListener("click", () => { input.value = ""; searchNow(false); input.focus(); });
    $$("#s-mode button").forEach((b) => b.addEventListener("click", () => {
      S.mode = b.dataset.m; store.set("smode", S.mode);
      $$("#s-mode button").forEach((x) => x.classList.toggle("on", x === b));
      searchNow(false);
    }));
    $("#s-scope").addEventListener("change", (e) => setScope(e.target.value));
    $("#s-dist").addEventListener("click", (e) => {
      const b = e.target.closest("[data-book]");
      if (b) setScope(S.scope === b.dataset.book ? "tout" : b.dataset.book);
    });
    $("#s-results").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      pushHistory(S.q);
      const g = +b.dataset.g;
      openRef(VB[g], VC[g], VV[g]);
    });
    $("#s-history").addEventListener("click", (e) => {
      const c = e.target.closest("[data-q]");
      if (c) { input.value = c.dataset.q; searchNow(true); return; }
      if (e.target.id === "hist-clear") { store.set("histo", []); renderHistory(); }
    });
    renderHistory();
  }

  // ------------------------------------------------------------------ mes versets
  let mineTab = "fav";
  function groupRuns(keys, sameFn) { // regroupe les versets consécutifs
    const ids = keys.map(gidOf).filter((g) => g >= 0).sort((a, b) => a - b);
    const runs = [];
    for (const g of ids) {
      const last = runs[runs.length - 1];
      if (last && g === last[last.length - 1] + 1 && VC[g] === VC[last[0]] && VB[g] === VB[last[0]] && sameFn(last[0], g)) last.push(g);
      else runs.push([g]);
    }
    return runs;
  }
  function renderMine() {
    $$("#f-seg button").forEach((b) => b.classList.toggle("on", b.dataset.s === mineTab));
    $("#f-search-wrap").hidden = mineTab !== "notes";
    const box = $("#f-list");
    let h = "";
    if (mineTab === "fav") {
      const runs = groupRuns(Object.keys(FAV), () => true);
      for (const r of runs) {
        h += item(r, "", "", "fav");
      }
      if (!runs.length) h = emptyMsg("i-etoile", "Aucun favori pour l'instant.", "Dans la lecture, touchez un verset puis « Favori ».");
    } else if (mineTab === "hl") {
      const runs = groupRuns(Object.keys(HL), (a, b) => HL[keyOf(a)] === HL[keyOf(b)]);
      for (const r of runs) h += item(r, "h" + HL[keyOf(r[0])], "", "hl");
      if (!runs.length) h = emptyMsg("i-surligner", "Aucun verset surligné.", "Touchez un verset puis choisissez une couleur.");
    } else {
      const q = norm($("#f-search").value.trim());
      const keys = Object.keys(NOTES).map((k) => [k, gidOf(k)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]);
      let n = 0;
      for (const [k, g] of keys) {
        const note = NOTES[k];
        const ids = [g];
        const e = note.fin ? gidOf(note.fin) : -1;
        for (let x = g + 1; x <= e; x++) ids.push(x);
        if (q && !norm(note.t + " " + refList(ids)).includes(q)) continue;
        h += item(ids, "", note.t, "note");
        n++;
      }
      if (!n) h = q ? emptyMsg("i-fouiller", "Aucune note ne contient ce texte.", "") :
        emptyMsg("i-note", "Aucune note pour l'instant.", "Touchez un verset puis « Note » pour écrire une méditation.");
    }
    box.innerHTML = h;
  }
  function emptyMsg(icon, a, b) {
    return '<div class="empty"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>' + esc(a) + (b ? "<br><small>" + esc(b) + "</small>" : "") + "</div>";
  }
  function item(ids, stripe, note, kind) {
    const text = ids.map((g, i) => (ids.length > 1 ? VV[g] + " " : "") + TXT[g]).join(" ");
    let date = "";
    if (kind === "note") {
      const d = NOTES[keyOf(ids[0])].d;
      if (d) date = new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    }
    return '<div class="item"><span class="stripe ' + stripe + '"></span><button class="body" data-open="' + ids[0] + '"><div class="iref"><span>' + esc(refList(ids)) +
      "</span><small>" + esc(date) + '</small></div><div class="itxt">' + esc(text) + "</div>" + (note ? '<div class="inote">' + esc(note) + "</div>" : "") +
      '</button><button class="del" data-del="' + kind + '" data-ids="' + ids.join(",") + '" aria-label="Retirer">×</button></div>';
  }
  function bindMine() {
    $$("#f-seg button").forEach((b) => b.addEventListener("click", () => { mineTab = b.dataset.s; renderMine(); }));
    $("#f-search").addEventListener("input", renderMine);
    $("#f-list").addEventListener("click", (e) => {
      const o = e.target.closest("[data-open]");
      if (o) { const g = +o.dataset.open; openRef(VB[g], VC[g], VV[g]); return; }
      const d = e.target.closest("[data-del]");
      if (!d) return;
      const ids = d.dataset.ids.split(",").map(Number);
      const kind = d.dataset.del;
      if (kind === "note") {
        if (d.dataset.confirm !== "1") { d.dataset.confirm = "1"; d.textContent = "?"; d.setAttribute("aria-label", "Toucher encore pour supprimer"); toast("Touchez encore × pour supprimer la note"); return; }
        delete NOTES[keyOf(ids[0])]; saveNotes();
      } else {
        const backup = {};
        const obj = kind === "fav" ? FAV : HL;
        for (const g of ids) { const k = keyOf(g); backup[k] = obj[k]; delete obj[k]; }
        kind === "fav" ? saveFAV() : saveHL();
        toast(kind === "fav" ? "Retiré des favoris" : "Surlignage enlevé", {
          label: "Annuler", run: () => { Object.assign(obj, backup); kind === "fav" ? saveFAV() : saveHL(); renderMine(); rendered = false; }
        });
      }
      rendered = false;
      renderMine();
    });
  }

  // ------------------------------------------------------------------ sauvegarde
  function exportData() {
    const data = { app: "bible-lsg", format: 1, date: new Date().toISOString(), favoris: FAV, surlignages: HL, notes: NOTES, plans: PLANSTATE, reglages: SET, position: store.get("pos", null) };
    const json = JSON.stringify(data, null, 1);
    const name = "bible-lsg-sauvegarde-" + todayStr() + ".json";
    if (window.AndroidApp && AndroidApp.saveFile) {
      let r = "";
      try { r = AndroidApp.saveFile(name, json); } catch (e) {}
      toast(r ? "Sauvegarde enregistrée : " + r : "Enregistrement impossible");
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Fichier de sauvegarde créé");
    } catch (e) { toast("Export impossible"); }
  }
  function importData(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { toast("Ce fichier n'est pas une sauvegarde valide"); return; }
    if (!d || d.app !== "bible-lsg") { toast("Ce fichier n'est pas une sauvegarde de Bible LSG"); return; }
    const okKeys = (o) => (o && typeof o === "object" ? Object.keys(o).filter((k) => gidOf(k) >= 0) : []);
    let nf = 0, nh = 0, nn = 0;
    for (const k of okKeys(d.favoris)) { if (!FAV[k]) nf++; FAV[k] = d.favoris[k]; }
    for (const k of okKeys(d.surlignages)) { const v = +d.surlignages[k]; if (v >= 1 && v <= 4) { if (!HL[k]) nh++; HL[k] = v; } }
    for (const k of okKeys(d.notes)) { const n = d.notes[k]; if (n && typeof n.t === "string") { if (!NOTES[k]) nn++; NOTES[k] = n; } }
    if (d.plans && typeof d.plans === "object") {
      for (const id in d.plans) {
        const p = d.plans[id];
        if (!PLANDEFS.some((x) => x.id === id) || !p || !p.start) continue;
        const mine = PLANSTATE[id];
        PLANSTATE[id] = { start: mine ? mine.start : p.start, done: Array.from(new Set([...(mine ? mine.done : []), ...(p.done || [])])).filter(Number.isInteger) };
      }
    }
    saveFAV(); saveHL(); saveNotes(); savePlans();
    rendered = false;
    toast("Importé : " + plural(nf, "favori") + ", " + plural(nh, "surlignage") + ", " + plural(nn, "note"));
    if (curTab === "favoris") renderMine();
    if (curTab === "plans") renderPlans();
  }
  function bindBackup() {
    $$("[data-export]").forEach((b) => b.addEventListener("click", exportData));
    $$("[data-import]").forEach((b) => b.addEventListener("click", () => $("#import-file").click()));
    $("#import-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => importData(String(r.result));
      r.readAsText(f);
      e.target.value = "";
    });
  }

  // ------------------------------------------------------------------ plans de lecture
  let PLANDEFS = [];
  function buildPlans() {
    const chapters = (from, to) => {
      const out = [];
      for (let i = from; i < to; i++) for (let c = 1; c <= BOOKS[i].ch.length; c++) out.push([i, c]);
      return out;
    };
    const spread = (list, days) => {
      const out = [];
      for (let d = 0; d < days; d++) out.push(list.slice(Math.floor(d * list.length / days), Math.floor((d + 1) * list.length / days)));
      return out;
    };
    const ps = chapters(CODE.PSA.i, CODE.PSA.i + 1), pr = chapters(CODE.PRO.i, CODE.PRO.i + 1);
    const psDays = spread(ps, 31);
    PLANDEFS = [
      { id: "an", nom: "La Bible en un an", desc: "Toute la Bible dans l'ordre, de la Genèse à l'Apocalypse : 3 ou 4 chapitres par jour.", days: spread(chapters(0, 66), 365) },
      { id: "nt", nom: "Le Nouveau Testament en 3 mois", desc: "Les Évangiles, les Actes, les Épîtres et l'Apocalypse : environ 3 chapitres par jour.", days: spread(chapters(CODE.MAT.i, 66), 90) },
      { id: "pp", nom: "Les Psaumes et les Proverbes en un mois", desc: "Chaque jour quelques psaumes et un chapitre des Proverbes.", days: psDays.map((d, i) => d.concat([pr[i]])) }
    ];
  }
  function dayGroups(day) { // [[bi, c1, c2], ...]
    const out = [];
    for (const [bi, c] of day) {
      const last = out[out.length - 1];
      if (last && last[0] === bi && last[2] === c - 1) last[2] = c; else out.push([bi, c, c]);
    }
    return out;
  }
  function groupLabel(g) {
    const b = BOOKS[g[0]];
    if (b.ch.length === 1) return b.nom;
    return (b.code === "PSA" ? (g[1] === g[2] ? "Psaume" : "Psaumes") : b.nom) + " " + g[1] + (g[2] > g[1] ? "–" + g[2] : "");
  }
  function planInfo(p) {
    const st = PLANSTATE[p.id];
    if (!st) return null;
    const total = p.days.length;
    const today = Math.max(0, Math.min(total - 1, daysBetween(st.start, todayStr())));
    const done = new Set(st.done || []);
    const late = [];
    for (let d = 0; d < today; d++) if (!done.has(d)) late.push(d);
    return { st, total, today, done, late, pct: Math.round(done.size / total * 100) };
  }
  function toggleDay(id, d) {
    const st = PLANSTATE[id];
    if (!st) return;
    const s = new Set(st.done || []);
    if (s.has(d)) s.delete(d); else s.add(d);
    st.done = Array.from(s).sort((a, b) => a - b);
    savePlans();
    const p = PLANDEFS.find((x) => x.id === id);
    if (st.done.length === p.days.length) toast("Bravo ! Plan terminé. Que Dieu vous bénisse !");
  }
  let planOpen = null;
  function dayRow(p, d, info) {
    const groups = dayGroups(p.days[d]);
    const date = new Date(Date.UTC.apply(null, info.st.start.split("-").map((x, i) => i === 1 ? x - 1 : +x)) + d * 86400000);
    const ds = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    return '<div class="day' + (d === info.today ? " is-today" : "") + '" data-day="' + d + '"><span class="dn"><b>Jour ' + (d + 1) + "</b>" + ds +
      '</span><span class="drefs">' + groups.map((g) => '<button data-read="' + g[0] + "." + g[1] + '">' + esc(groupLabel(g)) + "</button>").join("") +
      '</span><button class="check' + (info.done.has(d) ? " on" : "") + '" data-check="' + p.id + "." + d + '" aria-label="Marquer le jour ' + (d + 1) + ' comme lu">✓</button></div>';
  }
  function renderPlans() {
    const body = $("#pl-body");
    const head = $("#pl-head");
    if (!planOpen) {
      head.innerHTML = "<h2>Plans de lecture</h2>";
      body.innerHTML = PLANDEFS.map((p) => {
        const info = planInfo(p);
        const nch = p.days.reduce((a, d) => a + d.length, 0);
        return '<button class="card plan-card" data-plan="' + p.id + '"><h3>' + esc(p.nom) + "</h3><p>" + esc(p.desc) + " (" + p.days.length + " jours, " + nch + " chapitres)</p>" +
          (info ? '<div class="progress"><i style="width:' + info.pct + '%"></i></div><div class="plan-meta"><span>Jour ' + (info.today + 1) + " sur " + info.total +
            "</span><span>" + info.pct + " % lu" + (info.late.length ? " · " + plural(info.late.length, "jour") + " de retard" : "") + "</span></div>"
            : '<span class="chip">Commencer ce plan ›</span>') + "</button>";
      }).join("") + '<p class="mention">Cochez chaque jour lu. Vous pouvez rattraper un jour manqué à tout moment.</p>';
      return;
    }
    const p = PLANDEFS.find((x) => x.id === planOpen);
    const info = planInfo(p);
    head.innerHTML = '<button class="icon-btn" id="pl-back" aria-label="Retour"><svg viewBox="0 0 24 24"><use href="#i-gauche"/></svg></button><h2>' + esc(p.nom) + "</h2>";
    if (!info) {
      body.innerHTML = '<div class="card"><p style="margin-top:0">' + esc(p.desc) + "</p><p>Durée : " + p.days.length + " jours. Le jour 1 sera aujourd'hui.</p>" +
        '<button class="btn" data-start="' + p.id + '">Commencer aujourd\'hui</button></div><div class="days-head"><h3>Aperçu</h3></div>' +
        p.days.slice(0, 7).map((d, i) => '<div class="day"><span class="dn"><b>Jour ' + (i + 1) + '</b></span><span class="drefs">' + dayGroups(d).map((g) => esc(groupLabel(g))).join(" · ") + "</span></div>").join("");
      return;
    }
    let h = '<div class="card"><div class="progress"><i style="width:' + info.pct + '%"></i></div><div class="plan-meta"><span>' + plural(info.done.size, "jour") + " lu" + (info.done.size > 1 ? "s" : "") + " sur " + info.total +
      "</span><span>" + info.pct + " %</span></div></div>";
    h += '<div class="card today"><div class="eyebrow">Aujourd\'hui · jour ' + (info.today + 1) + "</div>" + dayRow(p, info.today, info) + "</div>";
    if (info.late.length) {
      h += '<div class="card late"><h3>Rattrapage : ' + plural(info.late.length, "jour") + " en retard</h3>" + info.late.slice(-7).map((d) => dayRow(p, d, info)).join("") +
        (info.late.length > 7 ? '<p class="plan-meta">Les autres jours en retard sont dans la liste complète ci-dessous.</p>' : "") + "</div>";
    }
    h += '<div class="days-head"><h3>Tous les jours</h3></div><div id="pl-days">' + p.days.map((_, d) => dayRow(p, d, info)).join("") + "</div>";
    h += '<div class="row" style="margin-top:20px"><button class="btn ghost" data-restart="' + p.id + '">Recommencer</button><button class="btn ghost danger" data-stop="' + p.id + '">Arrêter ce plan</button></div>';
    body.innerHTML = h;
  }
  function bindPlans() {
    const handler = (e) => {
      const confirmTwice = (el, msg) => {
        if (el.dataset.sure === "1") return true;
        el.dataset.sure = "1"; el.textContent = msg;
        setTimeout(() => { if (el.isConnected) { el.dataset.sure = ""; renderPlans(); } }, 4000);
        return false;
      };
      let el;
      if ((el = e.target.closest("[data-check]"))) {
        const [id, d] = el.dataset.check.split(".");
        toggleDay(id, +d);
        if (curTab === "plans") renderPlans(); else renderHome();
        return;
      }
      if ((el = e.target.closest("[data-read]"))) {
        const [bi, c] = el.dataset.read.split(".").map(Number);
        openRef(bi, c, 0);
        return;
      }
      if ((el = e.target.closest("[data-plan]"))) { planOpen = el.dataset.plan; renderPlans(); $("#v-plans").scrollTop = 0; if (curTab !== "plans") showTab("plans"); return; }
      if ((el = e.target.closest("#pl-back"))) { planOpen = null; renderPlans(); return; }
      if ((el = e.target.closest("[data-start]"))) { PLANSTATE[el.dataset.start] = { start: todayStr(), done: [] }; savePlans(); renderPlans(); toast("Plan commencé. Bonne lecture !"); return; }
      if ((el = e.target.closest("[data-restart]"))) {
        if (!confirmTwice(el, "Toucher encore pour recommencer")) return;
        PLANSTATE[el.dataset.restart] = { start: todayStr(), done: [] }; savePlans(); renderPlans(); return;
      }
      if ((el = e.target.closest("[data-stop]"))) {
        if (!confirmTwice(el, "Toucher encore pour arrêter")) return;
        delete PLANSTATE[el.dataset.stop]; savePlans(); planOpen = null; renderPlans();
      }
    };
    $("#v-plans").addEventListener("click", handler);
    $("#home-plan").addEventListener("click", handler);
  }

  // ------------------------------------------------------------------ accueil
  const VERSETS_DU_JOUR = `
GEN.1.1 GEN.1.27 GEN.1.31 GEN.2.7 GEN.12.2 GEN.15.6 GEN.18.14 GEN.28.15 GEN.50.20 EXO.14.14 EXO.15.2 EXO.20.12
EXO.33.14 EXO.34.6 LEV.19.18 NUM.6.24 NUM.6.25 NUM.6.26 NUM.23.19 DEU.6.5 DEU.7.9 DEU.8.3 DEU.31.6 DEU.31.8 DEU.33.27
JOS.1.8 JOS.1.9 JOS.24.15 RUT.1.16 1SA.2.2 1SA.16.7 1SA.17.47 2SA.22.2 2SA.22.31 1KI.8.56 1CH.16.11 1CH.16.34
1CH.29.11 2CH.7.14 2CH.16.9 2CH.20.15 NEH.8.10 JOB.1.21 JOB.19.25 JOB.42.2 PSA.1.1 PSA.1.2 PSA.1.3 PSA.4.9 PSA.5.4
PSA.8.2 PSA.16.8 PSA.16.11 PSA.18.2 PSA.18.3 PSA.19.2 PSA.19.8 PSA.19.15 PSA.23.1 PSA.23.2 PSA.23.3 PSA.23.4 PSA.23.6
PSA.25.4 PSA.25.5 PSA.27.1 PSA.27.4 PSA.27.14 PSA.28.7 PSA.29.11 PSA.30.6 PSA.31.25 PSA.32.8 PSA.33.12 PSA.34.2
PSA.34.5 PSA.34.9 PSA.34.19 PSA.37.4 PSA.37.5 PSA.37.7 PSA.37.23 PSA.40.2 PSA.42.2 PSA.42.12 PSA.46.2 PSA.46.11
PSA.51.12 PSA.55.23 PSA.56.4 PSA.62.2 PSA.62.9 PSA.63.2 PSA.66.20 PSA.68.20 PSA.71.5 PSA.73.26 PSA.84.11 PSA.84.12
PSA.86.5 PSA.90.12 PSA.91.1 PSA.91.2 PSA.91.11 PSA.95.6 PSA.96.1 PSA.100.4 PSA.100.5 PSA.103.1 PSA.103.2 PSA.103.8
PSA.103.12 PSA.107.1 PSA.112.7 PSA.118.6 PSA.118.24 PSA.119.11 PSA.119.105 PSA.119.114 PSA.121.1 PSA.121.2
PSA.121.7 PSA.121.8 PSA.126.5 PSA.127.1 PSA.133.1 PSA.136.1 PSA.139.14 PSA.139.23 PSA.143.8 PSA.145.18 PSA.147.3
PSA.150.6 PRO.3.5 PRO.3.6 PRO.3.9 PRO.4.23 PRO.9.10 PRO.10.12 PRO.11.25 PRO.12.25 PRO.14.26 PRO.15.1 PRO.16.3
PRO.16.9 PRO.17.17 PRO.18.10 PRO.18.24 PRO.19.17 PRO.19.21 PRO.22.6 PRO.30.5 PRO.31.30 ECC.3.1 ECC.3.11 ECC.4.9
SNG.8.7 ISA.1.18 ISA.9.5 ISA.12.2 ISA.26.3 ISA.26.4 ISA.30.15 ISA.40.8 ISA.40.29 ISA.40.31 ISA.41.10 ISA.41.13 ISA.43.1
ISA.43.2 ISA.43.19 ISA.49.15 ISA.49.16 ISA.53.5 ISA.54.10 ISA.55.6 ISA.55.8 ISA.55.11 ISA.58.11 ISA.60.1 ISA.61.1
ISA.64.7 JER.17.7 JER.29.11 JER.29.13 JER.31.3 JER.32.27 JER.33.3 LAM.3.22 LAM.3.23 LAM.3.25 EZK.36.26 DAN.2.20
DAN.12.3 HOS.6.3 JOL.2.13 AMO.5.24 MIC.6.8 MIC.7.7 NAM.1.7 HAB.2.14 HAB.3.18 HAB.3.19 ZEP.3.17 HAG.2.9 ZEC.4.6
MAL.3.10 MAT.4.4 MAT.5.3 MAT.5.4 MAT.5.5 MAT.5.6 MAT.5.7 MAT.5.8 MAT.5.9 MAT.5.14 MAT.5.16 MAT.5.44 MAT.6.6 MAT.6.21
MAT.6.33 MAT.6.34 MAT.7.7 MAT.7.12 MAT.11.28 MAT.11.29 MAT.16.24 MAT.17.20 MAT.18.20 MAT.19.26 MAT.22.37 MAT.22.39
MAT.24.35 MAT.25.40 MAT.28.19 MAT.28.20 MRK.9.23 MRK.10.27 MRK.10.45 MRK.11.24 MRK.12.30 MRK.16.15 LUK.1.37
LUK.1.46 LUK.2.11 LUK.2.14 LUK.6.31 LUK.6.36 LUK.6.38 LUK.9.23 LUK.11.9 LUK.12.32 LUK.18.27 LUK.19.10 JHN.1.1 JHN.1.5
JHN.1.12 JHN.1.14 JHN.3.16 JHN.3.17 JHN.4.24 JHN.5.24 JHN.6.35 JHN.6.37 JHN.8.12 JHN.8.32 JHN.10.10 JHN.10.11
JHN.10.27 JHN.10.28 JHN.11.25 JHN.13.34 JHN.13.35 JHN.14.1 JHN.14.2 JHN.14.6 JHN.14.13 JHN.14.15 JHN.14.21 JHN.14.27
JHN.15.4 JHN.15.5 JHN.15.7 JHN.15.12 JHN.15.13 JHN.15.16 JHN.16.24 JHN.16.33 JHN.17.17 JHN.20.29 ACT.1.8 ACT.2.21
ACT.4.12 ACT.16.31 ACT.20.35 ROM.1.16 ROM.3.23 ROM.5.1 ROM.5.5 ROM.5.8 ROM.6.23 ROM.8.1 ROM.8.18 ROM.8.28 ROM.8.31
ROM.8.37 ROM.8.38 ROM.8.39 ROM.10.9 ROM.10.17 ROM.12.1 ROM.12.2 ROM.12.10 ROM.12.12 ROM.12.21 ROM.15.4 ROM.15.13
1CO.2.9 1CO.10.13 1CO.10.31 1CO.13.4 1CO.13.7 1CO.13.13 1CO.15.57 1CO.15.58 1CO.16.14 2CO.4.16 2CO.4.18 2CO.5.7
2CO.5.17 2CO.9.7 2CO.9.8 2CO.12.9 GAL.2.20 GAL.5.1 GAL.5.13 GAL.5.22 GAL.6.2 GAL.6.9 EPH.2.8 EPH.2.10 EPH.3.20 EPH.4.2
EPH.4.26 EPH.4.32 EPH.5.2 EPH.6.10 EPH.6.11 PHP.1.6 PHP.1.21 PHP.2.3 PHP.2.5 PHP.3.13 PHP.3.14 PHP.4.4 PHP.4.6 PHP.4.7
PHP.4.8 PHP.4.13 PHP.4.19 COL.3.2 COL.3.12 COL.3.13 COL.3.14 COL.3.15 COL.3.17 COL.3.23 COL.4.2 1TH.5.11 1TH.5.16
1TH.5.17 1TH.5.18 2TH.3.3 1TI.4.12 1TI.6.6 1TI.6.12 2TI.1.7 2TI.2.15 2TI.3.16 2TI.4.7 TIT.2.11 TIT.3.5 PHM.1.6 HEB.4.12
HEB.4.16 HEB.10.23 HEB.10.24 HEB.11.1 HEB.11.6 HEB.12.1 HEB.12.2 HEB.12.11 HEB.13.5 HEB.13.8 HEB.13.16 JAS.1.2 JAS.1.5
JAS.1.12 JAS.1.17 JAS.1.19 JAS.1.22 JAS.4.7 JAS.4.8 JAS.5.16 1PE.1.3 1PE.2.9 1PE.3.15 1PE.4.8 1PE.5.6 1PE.5.7 2PE.1.3
2PE.3.9 1JN.1.7 1JN.1.9 1JN.3.1 1JN.3.18 1JN.4.4 1JN.4.7 1JN.4.8 1JN.4.16 1JN.4.18 1JN.4.19 1JN.5.4 1JN.5.14 3JN.1.2
JUD.1.24 REV.3.20 REV.21.4 REV.21.5 REV.22.13 REV.22.20
`;
  function verseOfDay(date) {
    const list = VERSETS_DU_JOUR.split(/\s+/).map(gidOf).filter((g) => g >= 0 && TXT[g]);
    if (!list.length) return -1;
    const d = date || new Date();
    const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    // Pas premier avec la longueur : chaque verset revient une fois par cycle, dans un ordre varié.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let step = Math.round(list.length * 0.381966);
    while (gcd(step, list.length) !== 1) step++;
    return list[(day * step) % list.length];
  }
  let votdG = -1;
  function renderHome() {
    votdG = verseOfDay();
    const d = new Date();
    $("#votd-date").textContent = "Verset du jour · " + d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    if (votdG >= 0) {
      $("#votd-text").textContent = TXT[votdG];
      $("#votd-ref").textContent = refOf(votdG);
    }
    $("#resume-ref").textContent = chapLabel(cur.bi, cur.c) + (cur.v > 1 ? ":" + cur.v : "");
    // Plan du jour
    const box = $("#home-plan");
    const active = PLANDEFS.filter((p) => PLANSTATE[p.id]);
    if (!active.length) {
      box.innerHTML = '<div class="eyebrow">Plan de lecture</div><h3>Lire la Bible avec régularité</h3><p class="refs" style="font-size:16px;color:var(--muted)">La Bible en un an, le Nouveau Testament en 3 mois, les Psaumes et les Proverbes en un mois.</p><button class="chip" data-go="plans">Choisir un plan ›</button>';
    } else {
      box.innerHTML = active.map((p) => {
        const info = planInfo(p);
        const groups = dayGroups(p.days[info.today]);
        const done = info.done.has(info.today);
        return '<div class="eyebrow">Plan du jour · ' + esc(p.nom) + "</div><h3>Jour " + (info.today + 1) + " sur " + info.total + (info.late.length ? ' <small style="color:#b2621f;font-size:14px">· ' + plural(info.late.length, "jour") + " de retard</small>" : "") +
          '</h3><p class="refs">' + groups.map((g) => '<button class="link" data-read="' + g[0] + "." + g[1] + '">' + esc(groupLabel(g)) + "</button>").join(" · ") +
          '</p><div class="row"><button class="btn small' + (done ? " ghost" : "") + '" data-check="' + p.id + "." + info.today + '">' + (done ? "✓ Lu aujourd'hui" : "J'ai lu") +
          '</button><button class="chip" data-plan="' + p.id + '">Voir le plan</button></div>';
      }).join('<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">');
    }
  }
  function bindHome() {
    $("#votd-ref").addEventListener("click", () => { if (votdG >= 0) openRef(VB[votdG], VC[votdG], VV[votdG]); });
    $("#votd-text").addEventListener("click", () => { if (votdG >= 0) openRef(VB[votdG], VC[votdG], VV[votdG]); });
    $("#votd-share").addEventListener("click", () => { if (votdG >= 0) shareText(selText([votdG])); });
    $("#resume").addEventListener("click", () => showTab("lire"));
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      if (b.dataset.sub) mineTab = b.dataset.sub;
      if (b.dataset.go === "plans") planOpen = null;
      showTab(b.dataset.go);
    });
    // Liens de téléchargement : seulement sur le site, et seulement si le fichier existe.
    if (!IS_APP && /^https?:$/.test(location.protocol)) {
      const show = (d) => { $("#dl-epub").hidden = !d.epub; $("#dl-apk").hidden = !d.apk; };
      show(store.get("dispo", {}));
      if (navigator.onLine !== false) {
        fetch("/dispo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (d) { store.set("dispo", d); show(d); }
        }).catch(() => {});
      }
    } else {
      $("#downloads").remove();
    }
  }

  // ------------------------------------------------------------------ lecture à voix haute
  const TTS = {
    on: false, paused: false, g: 0, end: 0, token: 0, u: null, voice: null,
    engine() {
      try { if (window.AndroidTTS && AndroidTTS.isAvailable()) return "android"; } catch (e) {}
      if ("speechSynthesis" in window && window.SpeechSynthesisUtterance) return "web";
      return null;
    },
    pickVoice() {
      if (!("speechSynthesis" in window)) return;
      const vs = speechSynthesis.getVoices() || [];
      this.voice = vs.find((v) => /^fr[-_]FR/i.test(v.lang) && /Google|Amélie|Thomas|Audrey|Marie/i.test(v.name)) ||
        vs.find((v) => /^fr[-_]FR/i.test(v.lang)) || vs.find((v) => /^fr/i.test(v.lang)) || null;
    },
    start(g) {
      const eng = this.engine();
      if (!eng) { toast("La lecture à voix haute n'est pas disponible sur cet appareil"); return; }
      this.stop(true);
      this.on = true; this.paused = false;
      const bi = VB[g], c = VC[g];
      this.g = g; this.end = BOOKS[bi].chStart[c - 1] + BOOKS[bi].ch[c - 1].length;
      if (curTab !== "lire" || cur.bi !== bi || cur.c !== c) {
        if (cur.bi !== bi || cur.c !== c) openChapter(bi, c, { keepTTS: true, noAnim: true });
      }
      $("#player").hidden = false;
      this.speak();
    },
    speak() {
      while (this.g < this.end && !TXT[this.g]) this.g++;
      if (this.g >= this.end) { this.stop(); toast("Fin du chapitre"); return; }
      const tok = ++this.token, g = this.g;
      $$(".v.reading").forEach((x) => x.classList.remove("reading"));
      const el = $('#r-text [data-g="' + g + '"]');
      if (el) {
        el.classList.add("reading");
        if ($("#v-lire").classList.contains("on")) {
          const r = el.getBoundingClientRect();
          if (r.top < 90 || r.bottom > window.innerHeight - 150) scrollToVerse(el, "center");
        }
      }
      $("#pl-label").textContent = "Lecture · " + refOf(g);
      this.ui();
      const text = TXT[g].replace(/\s*—\s*Pause\.?/g, ".");
      const done = () => { if (tok === this.token && this.on && !this.paused) { this.g++; this.speak(); } };
      if (this.engine() === "android") {
        window.bibleTtsDone = done;
        try { AndroidTTS.speak(text); } catch (e) { this.stop(); }
        return;
      }
      if (!this.voice) this.pickVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92;
      u.onend = done;
      u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") done(); };
      this.u = u;
      speechSynthesis.speak(u);
    },
    cancel() {
      try { if (window.AndroidTTS) AndroidTTS.stop(); } catch (e) {}
      try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
    },
    pause() { this.paused = true; this.token++; this.cancel(); this.ui(); },
    resume() { this.paused = false; this.speak(); },
    stop(silent) {
      const was = this.on;
      this.on = false; this.paused = false; this.token++;
      if (was || silent) this.cancel();
      $("#player").hidden = true;
      $$(".v.reading").forEach((x) => x.classList.remove("reading"));
    },
    ui() {
      $("#player").classList.toggle("paused", this.paused);
      $("#pl-toggle use").setAttribute("href", this.paused ? "#i-play" : "#i-pause");
      $("#pl-toggle").setAttribute("aria-label", this.paused ? "Reprendre" : "Pause");
    }
  };
  function bindTTS() {
    if ("speechSynthesis" in window) {
      TTS.pickVoice();
      try { speechSynthesis.addEventListener("voiceschanged", () => TTS.pickVoice()); } catch (e) {}
    }
    $("#pl-toggle").addEventListener("click", () => (TTS.paused ? TTS.resume() : TTS.pause()));
    $("#pl-stop").addEventListener("click", () => TTS.stop());
  }

  // ------------------------------------------------------------------ service worker (site web)
  function registerSW() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(() => {});
    let shown = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!had || shown) return;
      shown = true;
      toast("Nouvelle version installée.", { label: "Recharger", run: () => location.reload() });
    });
  }

  // ------------------------------------------------------------------ démarrage
  function loadData() {
    if (window.BIBLE_DATA) return Promise.resolve(window.BIBLE_DATA);
    if (location.protocol === "file:") {
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "bible.js";
        s.onload = () => (window.BIBLE_DATA ? res(window.BIBLE_DATA) : rej(new Error("bible.js vide")));
        s.onerror = () => rej(new Error("bible.js introuvable"));
        document.head.appendChild(s);
      });
    }
    return fetch("bible.json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function init(data) {
    buildModel(data);
    if (cur.code) {
      const b = CODE[cur.code];
      cur = b ? { bi: b.i, c: Math.min(cur.c || 1, b.ch.length), v: cur.v || 0 } : { bi: 0, c: 1, v: 0 };
    }
    buildPlans();
    applySettings();
    bindSettings(); bindReader(); bindPicker(); bindVbar(); bindNotes(); bindSearch(); bindMine(); bindBackup(); bindPlans(); bindHome(); bindTTS();
    $$(".tabbar button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.tab === curTab) {
        if (curTab === "lire" && pickerOpen) closePicker();
        else if (curTab === "plans" && planOpen) { planOpen = null; renderPlans(); }
        else $(".view.on").scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      showTab(b.dataset.tab);
    }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") window.bibleBack();
      if (curTab === "lire" && !modalOpen && !pickerOpen && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }
    });
    if (window.matchMedia) {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      const f = () => { if (!SET.theme) applySettings(); };
      if (mq.addEventListener) mq.addEventListener("change", f); else if (mq.addListener) mq.addListener(f);
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden) savePos(); });
    showTab("accueil", { noHist: true });
    $("#loading").classList.add("gone");
    setTimeout(() => $("#loading").remove(), 400);
    // L'index de recherche se prépare tranquillement après l'ouverture.
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    idle(() => ensureIndex());
    window.__bible = { runSearch: (q, m, s) => runSearch(q, m || "mot", s || "tout"), ensureIndex, parseRef, refOf, verseOfDay, N: () => N };
  }
  registerSW();
  loadData().then(init).catch((e) => {
    const l = $("#loading");
    if (l) l.innerHTML = '<span class="brand-mark big"></span><p>Impossible d\'ouvrir la Bible.<br><small>' + esc(e.message || e) + '</small></p><button class="btn" onclick="location.reload()">Réessayer</button>';
  });
})();
