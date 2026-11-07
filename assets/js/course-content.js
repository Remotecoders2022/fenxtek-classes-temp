/* ============================================================
   FENXTEK — course content (folders + link items)
   Shared by the admin content manager (admin-store.js) and the
   student classroom (dashboard.js). Pure helpers, no Firebase.

   Data model (flat map, parent pointers):
   courseContent/<courseId>/<itemId> = {
     type: folder | video | pdf | doc | web | audio | image | live | file,
     title, parent ("" = course root), order, url?, desc?, mins?,
     liveAt?, free?, hidden?, createdAt, updatedAt
   }
   courseOutline/<courseId>/<itemId>  public copy without links / hidden items
   coursePreview/<courseId>/<itemId>  link of a free-preview item (public)
   ============================================================ */

export const CC_PATH = {
  content: "courseContent",
  outline: "courseOutline",
  preview: "coursePreview",
  progress: "progress"
};

const svg = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;

export const CC_ICONS = {
  folder: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
  video: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>'),
  pdf: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16.5h7M8.5 13h7"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 15.5h6M9 8.5h2"/>'),
  web: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z"/>'),
  audio: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 9"/>'),
  live: svg('<circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  done: svg('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="m8 12.3 2.7 2.7L16 9.7" stroke="#fff" stroke-width="2.2"/>'),
  todo: svg('<circle cx="12" cy="12" r="8.5"/>'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  move: svg('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>')
};

/* label, plural, verb for the open button, colour key used by the CSS */
export const CC_TYPES = {
  folder: { label: "Folder", plural: "Folders", open: "Open", tone: "folder" },
  video: { label: "Video", plural: "Videos", open: "Watch", tone: "video" },
  pdf: { label: "PDF", plural: "PDFs", open: "Read", tone: "pdf" },
  doc: { label: "Document", plural: "Docs", open: "Open", tone: "doc" },
  web: { label: "Webpage", plural: "Webpages", open: "Open", tone: "web" },
  audio: { label: "Audio", plural: "Audio", open: "Listen", tone: "audio" },
  image: { label: "Image", plural: "Images", open: "View", tone: "image" },
  live: { label: "Live class", plural: "Live classes", open: "Join", tone: "live" },
  file: { label: "File", plural: "Files", open: "Open", tone: "file" }
};
export const CC_ITEM_TYPES = ["video", "pdf", "doc", "web", "audio", "image", "live", "file"];

export const ccIcon = (type) => CC_ICONS[type] || CC_ICONS.file;
export const ccType = (type) => CC_TYPES[type] || CC_TYPES.file;

export function safeLink(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(u)) return "";
  return u.slice(0, 2000);
}

const ext = (url) => {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
};
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return "";
  }
};
export const linkHost = host;

export function youtubeId(url) {
  const m = String(url).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}
const youtubeList = (url) => {
  const m = String(url).match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
};
const driveId = (url) => {
  const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : "";
};

/* Best guess of the item type from a pasted link. */
export function detectType(url) {
  const u = safeLink(url);
  if (!u) return "";
  const h = host(u);
  const e = ext(u);
  if (youtubeId(u) || youtubeList(u) && /youtu/.test(h)) return "video";
  if (/vimeo\.com$/.test(h) || /^(mp4|webm|mov|m4v|m3u8)$/.test(e)) return "video";
  if (/^(zoom\.us|us\d+web\.zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)$/.test(h) || /zoom\.us$/.test(h)) return "live";
  if (e === "pdf") return "pdf";
  if (/^(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/.test(e) || /soundcloud\.com$/.test(h)) return "audio";
  if (/^(jpg|jpeg|png|gif|webp|svg|avif)$/.test(e)) return "image";
  if (/docs\.google\.com$/.test(h) || /^(doc|docx|ppt|pptx|xls|xlsx|odt|txt)$/.test(e)) return "doc";
  if (/^(zip|rar|7z|apk|exe)$/.test(e)) return "file";
  if (/drive\.google\.com$/.test(h) || /dropbox\.com$/.test(h) || /onedrive|sharepoint|1drv\.ms/.test(h)) return "file";
  if (/t\.me$|telegram\./.test(h)) return "web";
  return "web";
}

/* A friendly title from a link when the admin doesn't type one. */
export function titleFromLink(url, n) {
  const u = safeLink(url);
  if (!u) return "";
  try {
    const p = new URL(u);
    const last = decodeURIComponent(p.pathname.split("/").filter(Boolean).pop() || "");
    if (/\.[a-z0-9]{2,5}$/i.test(last) && last.length < 90) {
      return last
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (c) => c.toUpperCase());
    }
  } catch (e) {}
  const t = detectType(u);
  return `${ccType(t).label} ${n || ""}`.trim();
}

export function sourceLabel(url) {
  const u = safeLink(url);
  if (!u) return "";
  const h = host(u);
  if (/youtu/.test(h)) return "YouTube";
  if (/vimeo/.test(h)) return "Vimeo";
  if (/drive\.google/.test(h)) return "Google Drive";
  if (/docs\.google/.test(h)) return /presentation/.test(u) ? "Google Slides" : /spreadsheets/.test(u) ? "Google Sheets" : /forms/.test(u) ? "Google Forms" : "Google Docs";
  if (/dropbox/.test(h)) return "Dropbox";
  if (/zoom/.test(h)) return "Zoom";
  if (/meet\.google/.test(h)) return "Google Meet";
  if (/t\.me|telegram/.test(h)) return "Telegram";
  return h;
}

/* How to show a link inside the classroom.
   -> { mode: "iframe" | "video" | "audio" | "image" | "external", src, note? } */
export function embedFor(url, type) {
  const u = safeLink(url);
  if (!u) return { mode: "external", src: "" };
  const h = host(u);
  const e = ext(u);
  const yt = youtubeId(u);
  if (yt) return { mode: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`, ratio: "16/9" };
  const list = /youtu/.test(h) ? youtubeList(u) : "";
  if (list) return { mode: "iframe", src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&rel=0&modestbranding=1`, ratio: "16/9" };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { mode: "iframe", src: `https://player.vimeo.com/video/${vm[1]}`, ratio: "16/9" };
  const dr = driveId(u);
  if (dr) return { mode: "iframe", src: `https://drive.google.com/file/d/${dr}/preview`, ratio: type === "video" ? "16/9" : "doc" };
  const df = u.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/);
  if (df) return { mode: "iframe", src: `https://drive.google.com/embeddedfolderview?id=${df[1]}#grid`, ratio: "doc" };
  const gd = u.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([A-Za-z0-9_-]{10,})/);
  if (gd) return { mode: "iframe", src: `https://docs.google.com/${gd[1]}/d/${gd[2]}/preview`, ratio: gd[1] === "presentation" ? "16/9" : "doc" };
  if (/docs\.google\.com\/forms\//.test(u)) return { mode: "iframe", src: u.replace(/\/viewform.*$|\/edit.*$/, "/viewform") + (u.includes("?") ? "&" : "?") + "embedded=true", ratio: "doc" };
  let direct = u;
  if (/dropbox\.com$/.test(h)) {
    direct = /[?&]dl=0/.test(u) ? u.replace(/([?&])dl=0/, "$1raw=1") : /[?&](raw|dl)=1/.test(u) ? u : u + (u.includes("?") ? "&" : "?") + "raw=1";
  }
  if (/^(mp4|webm|mov|m4v)$/.test(e)) return { mode: "video", src: direct };
  if (/^(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/.test(e)) return { mode: "audio", src: direct };
  if (/^(jpg|jpeg|png|gif|webp|svg|avif)$/.test(e)) return { mode: "image", src: direct };
  if (e === "pdf") return { mode: "iframe", src: `https://docs.google.com/viewer?url=${encodeURIComponent(direct)}&embedded=true`, ratio: "doc", alt: direct };
  if (type === "live" || /zoom\.us|meet\.google|teams\./.test(h)) return { mode: "external", src: u };
  if (/^(zip|rar|7z|apk|exe|doc|docx|ppt|pptx|xls|xlsx)$/.test(e)) return { mode: "external", src: u };
  if (/t\.me$|telegram\./.test(h)) return { mode: "external", src: u };
  if (type === "web" || type === "doc" || type === "pdf") return { mode: "iframe", src: u, ratio: "doc", web: true };
  return { mode: "external", src: u };
}

/* ---------- tree helpers (items = { id: item }) ---------- */

export function itemsList(map) {
  return Object.keys(map || {})
    .filter((id) => map[id] && typeof map[id] === "object" && map[id].title)
    .map((id) => ({ ...map[id], id, parent: map[id].parent || "" }));
}

export const sortItems = (list) =>
  list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.title).localeCompare(String(b.title)));

/* folders first, then items, each in admin order */
export function childrenOf(list, parent, { foldersFirst = true } = {}) {
  const kids = sortItems(list.filter((i) => (i.parent || "") === (parent || "")));
  if (!foldersFirst) return kids;
  return kids.filter((i) => i.type === "folder").concat(kids.filter((i) => i.type !== "folder"));
}

export function pathTo(list, id) {
  const byId = new Map(list.map((i) => [i.id, i]));
  const out = [];
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent ? byId.get(cur.parent) : null;
  }
  return out;
}

export function descendantsOf(list, id) {
  const out = [];
  const walk = (pid) =>
    list.forEach((i) => {
      if (i.parent === pid && !out.includes(i)) {
        out.push(i);
        if (i.type === "folder") walk(i.id);
      }
    });
  walk(id);
  return out;
}

/* hidden items, and everything inside a hidden folder, are drafts */
export function visibleList(list) {
  const byId = new Map(list.map((i) => [i.id, i]));
  const hiddenUp = (i) => {
    const seen = new Set();
    let cur = i;
    while (cur && !seen.has(cur.id)) {
      if (cur.hidden) return true;
      seen.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : null;
    }
    return false;
  };
  return list.filter((i) => !hiddenUp(i) && (!i.parent || byId.has(i.parent)));
}

/* leaf items (non-folders) under a folder ("" = whole course) */
export function leavesUnder(list, id) {
  return (id ? descendantsOf(list, id) : list).filter((i) => i.type !== "folder");
}

export function countByType(list) {
  const c = {};
  list.forEach((i) => (c[i.type] = (c[i.type] || 0) + 1));
  return c;
}

/* "video"/"videos", but keep acronyms like PDF/PDFs upper-case */
export function typeWord(t, n) {
  const w = n === 1 ? ccType(t).label : ccType(t).plural;
  return /^[A-Z]{2,}/.test(w) ? w : w.toLowerCase();
}

export function countsLabel(list, { max = 3 } = {}) {
  const c = countByType(list.filter((i) => i.type !== "folder"));
  const order = ["video", "pdf", "audio", "doc", "live", "web", "image", "file"];
  const parts = order.filter((t) => c[t]).map((t) => `${c[t]} ${typeWord(t, c[t])}`);
  if (!parts.length) return "Empty";
  const rest = parts.length > max ? order.filter((t) => c[t]).slice(max).reduce((s, t) => s + c[t], 0) : 0;
  return parts.slice(0, max).join(" · ") + (rest ? ` · +${rest} more` : "");
}

export function minsLabel(m) {
  const n = Math.round(Number(m) || 0);
  if (!n) return "";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/* public outline: no links, no descriptions, no drafts */
export function outlineOf(list) {
  const out = {};
  visibleList(list).forEach((i) => {
    const o = { type: i.type, title: String(i.title).slice(0, 200), parent: i.parent || "", order: Number(i.order) || 0 };
    if (i.mins) o.mins = Number(i.mins) || 0;
    if (i.free && i.type !== "folder") o.free = true;
    if (i.liveAt) o.liveAt = Number(i.liveAt) || 0;
    if (i.createdAt) o.createdAt = Number(i.createdAt) || 0;
    out[i.id] = o;
  });
  return out;
}

export function previewsOf(list) {
  const out = {};
  visibleList(list).forEach((i) => {
    if (i.free && i.type !== "folder" && safeLink(i.url)) out[i.id] = safeLink(i.url);
  });
  return out;
}

export function isNew(item, days = 7) {
  return Number(item.createdAt) > Date.now() - days * 86400000;
}

export function liveLabel(ms) {
  const t = Number(ms) || 0;
  if (!t) return "";
  const d = new Date(t);
  const now = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (same(d, now)) return `Today, ${time}`;
  if (same(d, tomorrow)) return `Tomorrow, ${time}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + time;
}
