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

/* Source for an achievement: either an inline link or a lazy base64 id. */
export function achievementSource(item) {
  if (!item) return { kind: "none" };
  if (item.imageSource === "link") {
    const url = safeImageUrl(item.imageUrl);
    return url ? { kind: "link", url } : { kind: "none" };
  }
  return { kind: "upload", id: item.id };
}

/* Observe [data-ach-img] <img> tags and fill them in when visible. */
export function hydrateAchievementImages(root, load) {
  const imgs = Array.from((root || document).querySelectorAll("img[data-ach-img]"));
  if (!imgs.length) return;
  const fill = (img) => {
    const id = img.getAttribute("data-ach-img");
    img.removeAttribute("data-ach-img");
    load(id).then((src) => {
      const card = img.closest("[data-ach-card]");
      if (src) {
        img.src = src;
        if (card) card.classList.remove("is-loading");
      } else if (card) {
        card.classList.remove("is-loading");
        card.classList.add("is-broken");
      }
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
    { rootMargin: "400px 0px" }
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

export async function fileToDataImage(file, opts = {}) {
  if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type || "")) {
    throw new Error("Please use a PNG, JPG, WEBP or GIF image.");
  }
  if (file.size > 25 * 1024 * 1024) throw new Error("That image is larger than 25 MB.");

  const maxDim = opts.maxDim || 1600;
  const budget = opts.budget || 900000;
  const original = await readAsDataURL(file);
  const img = await loadImage(original);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  /* Small, already-compressed files are kept byte-for-byte. */
  if (original.length <= Math.min(budget, 420000) && Math.max(w, h) <= maxDim && safeDataImage(original)) {
    return { dataUrl: original, width: w, height: h, bytes: original.length, resized: false };
  }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  let cw = Math.max(1, Math.round(w * scale));
  let ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let out = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = cw;
    canvas.height = ch;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const quality = Math.max(0.5, 0.86 - attempt * 0.06);
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= budget) break;
    if (attempt >= 3) {
      cw = Math.round(cw * 0.82);
      ch = Math.round(ch * 0.82);
    }
  }
  if (!safeDataImage(out) || out.length > MAX_DATA_URL) {
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
