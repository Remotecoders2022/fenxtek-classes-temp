/* ============================================================
   FENXTEK — shared media + escaping helpers
   Used by the public pages (content.js), the student dashboard
   and the admin CRM so every surface validates images the same way.
   ============================================================ */

export const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const pad = (n) => String(n).padStart(2, "0");

/* Max size of a base64 data URL we will write to RTDB (characters).
   Must stay below the limit in database.rules.json (site/achievementImages). */
export const MAX_DATA_URL = 1400000;

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/* Only http(s), protocol-relative or plain relative image paths are allowed. */
export function safeImageUrl(value) {
  const url = String(value == null ? "" : value).trim();
  if (!url || url.length > 2000) return "";
  if (/^(javascript|vbscript|data|file|blob):/i.test(url)) return "";
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
  if (/^\/\/[^\s"'<>]+$/.test(url)) return url;
  if (/^[a-z0-9][a-z0-9._~\-/]*$/i.test(url)) return url;
  return "";
}

/* A base64 image data URL produced by the CRM uploader. */
export function safeDataImage(value) {
  const url = String(value == null ? "" : value);
  if (!url || url.length > MAX_DATA_URL + 1000) return "";
  return DATA_IMAGE_RE.test(url) ? url : "";
}

/* Either kind of image source. */
export function safeAnyImage(value) {
  return safeDataImage(value) || safeImageUrl(value);
}

export function formatDate(value, opts) {
  if (value == null || value === "") return "";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value) + (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? "T00:00:00" : ""));
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", opts || { day: "2-digit", month: "short", year: "numeric" });
}

export function rupees(value) {
  if (value == null || value === "") return "";
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!isFinite(n)) return String(value);
  return n.toLocaleString("en-IN");
}

/* Plan features may arrive as an array, an RTDB object or a newline string. */
export function toLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "object") return Object.keys(value).map((k) => String(value[k] || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/* Membership status from a members/{uid} record. */
export function membershipStatus(record, now = Date.now()) {
  if (!record || !record.planId) return { key: "none", label: "No membership" };
  const status = String(record.status || "active");
  if (status === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (status === "paused") return { key: "paused", label: "Paused" };
  const end = Number(record.endAt) || 0;
  if (end && end < now) return { key: "expired", label: "Expired" };
  const start = Number(record.startAt) || 0;
  if (start && start > now) return { key: "upcoming", label: "Starts soon" };
  return { key: "active", label: "Active" };
}

export function daysLeft(record, now = Date.now()) {
  const end = Number(record && record.endAt) || 0;
  if (!end) return null;
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

/* ------------------------------------------------------------
   Lazy loader for base64 achievement images.
   site/achievements holds the light metadata; the heavy base64
   payload lives in site/achievementImages/{id} so listing pages
   stay fast and each picture is fetched only when it scrolls in.
   ------------------------------------------------------------ */
export function createAchievementImageLoader(dbGet) {
  const cache = new Map();
  return function load(id) {
    if (!id) return Promise.resolve("");
    if (cache.has(id)) return cache.get(id);
    const p = dbGet(`site/achievementImages/${id}`)
      .then((snap) => safeDataImage(snap && snap.val ? snap.val() : ""))
      .catch((err) => {
        console.warn("[media] image " + id, err);
        cache.delete(id);
        return "";
      });
    cache.set(id, p);
    return p;
  };
}

/* Share links from Google Drive / Dropbox / GitHub point at an HTML page,
   not at the picture. Rewrite them to the direct image URL so they render. */
export function normalizeImageLink(value) {
  const url = safeImageUrl(value);
  if (!url || !/^https?:\/\//i.test(url)) return url;
  let m = url.match(/^https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=|thumbnail\?(?:.*&)?id=)([\w-]{10,})/i);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2400`;
  m = url.match(/^https?:\/\/(?:www\.)?dropbox\.com\/(.+)$/i);
  if (m) {
    const clean = url.replace(/([?&])(dl|raw)=\d/g, "$1").replace(/[?&]+$/, "").replace(/\?&/, "?");
    return clean + (clean.includes("?") ? "&" : "?") + "raw=1";
  }
  m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  return url;
}

/* Source for an achievement: either an inline link or a lazy base64 id.
   Older / hand-edited posts without imageSource still work if they carry
   an http(s) imageUrl. */
export function achievementSource(item) {
  if (!item) return { kind: "none" };
  const link = normalizeImageLink(item.imageUrl);
  if (item.imageSource === "link" || (!item.imageSource && /^https?:\/\//i.test(link))) {
    return link && /^https?:\/\//i.test(link) ? { kind: "link", url: link } : { kind: "none" };
  }
  return { kind: "upload", id: item.id };
}

/* Base64 data URL -> object URL, so "Open original" works (browsers block
   opening data: URLs in a new tab). */
export function dataUrlToObjectUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) return "";
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: m[1] }));
}

export function imageExtension(src) {
  const m = String(src || "").match(/^data:image\/(png|jpe?g|webp|gif)/i) || String(src || "").match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/* Marks a card once its picture has decoded (or failed). */
export function markAchievementImage(img, ok) {
  const card = img.closest("[data-ach-card]");
  if (!card) return;
  card.classList.remove("is-loading");
  if (!ok) {
    card.classList.add("is-broken");
    card.dispatchEvent(new CustomEvent("ach:broken", { bubbles: true }));
    return;
  }
  card.classList.remove("is-broken");
  card.classList.add("is-ready");
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (w && h && h / w > 1.45) card.classList.add("is-tall");
}

/* Observe [data-ach-img] <img> tags and fill them in when visible. */
export function hydrateAchievementImages(root, load) {
  const scope = root || document;
  /* Link images are already loading: only wire up their status. */
  scope.querySelectorAll("img[data-ach-link]").forEach((img) => {
    img.removeAttribute("data-ach-link");
    const done = (ok) => markAchievementImage(img, ok);
    if (img.complete && img.naturalWidth) done(true);
    else if (img.complete && img.getAttribute("src")) done(false);
    else {
      img.addEventListener("load", () => done(true), { once: true });
      img.addEventListener("error", () => done(false), { once: true });
    }
  });
  const imgs = Array.from(scope.querySelectorAll("img[data-ach-img]"));
  if (!imgs.length) return;
  const fill = (img) => {
    const id = img.getAttribute("data-ach-img");
    img.removeAttribute("data-ach-img");
    load(id).then((src) => {
      if (!src) return markAchievementImage(img, false);
      img.addEventListener("load", () => markAchievementImage(img, true), { once: true });
      img.addEventListener("error", () => markAchievementImage(img, false), { once: true });
      img.src = src;
    });
  };
  if (!("IntersectionObserver" in window)) {
    imgs.forEach(fill);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        fill(en.target);
      });
    },
    { rootMargin: "600px 0px" }
  );
  imgs.forEach((img) => io.observe(img));
}

/* ------------------------------------------------------------
   Client-side image -> base64 (CRM only)
   Resizes large photos so a single post stays well below the
   RTDB per-value budget while keeping them sharp on screen.
   ------------------------------------------------------------ */
function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Could not read the file."));
    r.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a readable image."));
    img.src = src;
  });
}

const IMAGE_EXT_RE = /\.(png|jpe?g|jfif|pjpeg|webp|gif|bmp|avif|heic|heif)$/i;

/* Draw onto a white sheet: transparent PNG/WEBP screenshots would otherwise
   show dark text on the dark lightbox and become unreadable. */
function paint(canvas, img, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

/* Downscale in halving steps — much sharper text than one big jump. */
function stepDown(img, w, h, tw, th) {
  let src = img;
  let cw = w;
  let ch = h;
  while (cw / 2 >= tw && ch / 2 >= th) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    const c = document.createElement("canvas");
    paint(c, src, cw, ch);
    src = c;
  }
  return src;
}

export async function fileToDataImage(file, opts = {}) {
  const type = (file && file.type) || "";
  const looksImage = /^image\//i.test(type) || (!type && IMAGE_EXT_RE.test((file && file.name) || ""));
  if (!file || !looksImage) throw new Error("Please use a PNG, JPG, WEBP or GIF image.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That image is larger than 25 MB.");

  /* Limit by pixel area (~4.2 MP) and a 3600 px long side rather than a
     fixed width, so tall result lists keep their full width and their small
     text stays legible when zoomed. Budget stays under the RTDB rule limit. */
  const maxDim = opts.maxDim || 3600;
  const maxArea = opts.maxArea || 4200000;
  const budget = Math.min(opts.budget || 1150000, MAX_DATA_URL);
  const original = await readAsDataURL(file);
  let img;
  try {
    img = await loadImage(original);
  } catch (err) {
    throw new Error(
      /hei[cf]/i.test(type + (file.name || ""))
        ? "This browser cannot read HEIC photos. Export the picture as JPG (or take a screenshot) and try again."
        : "That file is not a readable image."
    );
  }
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("That file is not a readable image.");

  /* Keep byte-for-byte: small JPEGs (no transparency) and GIFs (animation). */
  const isJpeg = /^data:image\/jpe?g;base64,/i.test(original);
  const isGif = /^data:image\/gif;base64,/i.test(original);
  if ((isJpeg || isGif) && original.length <= budget && Math.max(w, h) <= maxDim && w * h <= maxArea && safeDataImage(original)) {
    return { dataUrl: original, width: w, height: h, bytes: original.length, resized: false };
  }

  const canvas = document.createElement("canvas");
  let scale = Math.min(1, maxDim / Math.max(w, h), Math.sqrt(maxArea / (w * h)));
  let out = "";
  let cw = 0;
  let ch = 0;
  const isPng = /^data:image\/png;base64,/i.test(original);

  for (let round = 0; round < 6 && !out; round++) {
    cw = Math.max(1, Math.round(w * scale));
    ch = Math.max(1, Math.round(h * scale));
    paint(canvas, stepDown(img, w, h, cw, ch), cw, ch);
    /* Screenshots (PNG) of result lists stay razor sharp as PNG when they fit. */
    if (isPng) {
      const png = canvas.toDataURL("image/png");
      if (png.length <= budget) {
        out = png;
        break;
      }
    }
    for (const q of [0.92, 0.88, 0.84, 0.8, 0.76]) {
      const jpg = canvas.toDataURL("image/jpeg", q);
      if (jpg.length <= budget) {
        out = jpg;
        break;
      }
    }
    scale *= 0.82;
  }
  if (!out || !safeDataImage(out) || out.length > MAX_DATA_URL) {
    throw new Error("The image is still too large after compression. Try a smaller picture.");
  }
  return { dataUrl: out, width: cw, height: ch, bytes: out.length, resized: true };
}

export function prettyBytes(chars) {
  const bytes = Math.round((Number(chars) || 0) * 0.75);
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}
