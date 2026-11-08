/* ============================================================
   FENXTEK — site fonts (runs on every public page)
   Reads the sizes saved by Admin → Website → Fonts & text sizes
   and writes one small stylesheet for this page.

   Two-stage: the last known CSS is kept in localStorage so the
   page paints with your sizes straight away, then the Realtime
   Database value replaces it the moment it arrives.
   ============================================================ */
import { dbWatch, configured } from "./firebase.js?v=5";
import { FONT_PATH, fontCss, cssPageFor, sanitize } from "./font-map.js?v=1";

const STYLE_ID = "ftFontCss";
const CACHE_KEY = "ft:fontcss:";

const pageKey = () => (document.body && document.body.dataset.page) || "";
const scope = () => cssPageFor(pageKey());

function styleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

function paint(css) {
  const el = styleEl();
  el.textContent = css || "";
  try {
    if (css) localStorage.setItem(CACHE_KEY + scope(), css);
    else localStorage.removeItem(CACHE_KEY + scope());
  } catch (_) {}
}

function fromCache() {
  try {
    return localStorage.getItem(CACHE_KEY + scope()) || "";
  } catch (_) {
    return "";
  }
}

/* 1. cached CSS first — no flash of the default size */
const cached = fromCache();
if (cached) styleEl().textContent = cached;

/* 2. live value from the database */
function start() {
  if (!configured) return;
  dbWatch(FONT_PATH, (value) => {
    const cfg = value && typeof value === "object" ? sanitize(value) : null;
    paint(cfg ? fontCss(cfg, scope()) : "");
  }).catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

/* Small helper for the admin panel: it can call this to try the
   sizes out on the real page it is editing. Not used by visitors. */
window.__ftFontsDebug = { pageKey, scope, fontCss };
