/* ============================================================
   FENXTEK — admin CRM: course content manager
   Folders (nested) and link items — video, PDF, document, webpage,
   audio, image, live class, any file — per course. Every change
   rewrites the public outline + free-preview links in the same
   multi-path update so they never drift from the real content.
   ============================================================ */

import { dbWatch, dbUpdateRoot, dbKey, friendlyError } from "./firebase.js?v=5";
import {
  CC_PATH,
  CC_TYPES,
  CC_ITEM_TYPES,
  ccIcon,
  ccType,
  safeLink,
  detectType,
  titleFromLink,
  sourceLabel,
  itemsList,
  childrenOf,
  pathTo,
  descendantsOf,
  leavesUnder,
  countsLabel,
  countByType,
  minsLabel,
  outlineOf,
  previewsOf,
  liveLabel,
  CC_ICONS
} from "./course-content.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sprite = (id) => `<svg><use href="#${id}"/></svg>`;

const C = {
  all: {}, // courseId -> raw items map
  listeners: new Set(),
  watching: false
};

/* live copy of courseContent for the course list counts and the open manager */
export function watchContent(cb) {
  if (cb) C.listeners.add(cb);
  if (C.watching) {
    if (cb) cb(C.all);
    return;
  }
  C.watching = true;
  dbWatch(CC_PATH.content, (v) => {
    C.all = v && typeof v === "object" ? v : {};
    C.listeners.forEach((fn) => fn(C.all));
  });
}

export function contentCount(courseId) {
  const list = itemsList(C.all[courseId]);
  return { items: list.filter((i) => i.type !== "folder").length, folders: list.filter((i) => i.type === "folder").length };
}

/* nulls for every content node of a course (used when a course is deleted) */
export function contentDeleteUpdates(courseId) {
  return { [`${CC_PATH.content}/${courseId}`]: null, [`${CC_PATH.outline}/${courseId}`]: null, [`${CC_PATH.preview}/${courseId}`]: null };
}

const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ------------------------------------------------------------ */

export function openContentManager(course, { alert, busy }) {
  const cid = course.id;
  const st = { folder: "", q: "", form: null }; // form: { mode: "item"|"folder"|"bulk", id? }
  const list = () => itemsList(C.all[cid]);

  const wrap = document.createElement("div");
  wrap.className = "as-modal cm-modal";
  wrap.innerHTML = `<div class="as-modal-box cm-box" role="dialog" aria-modal="true" aria-label="Course content"></div>`;
  const box = $(".cm-box", wrap);
  document.body.appendChild(wrap);
  document.documentElement.style.overflow = "hidden";

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (st.form) {
      st.form = null;
      paint();
    } else close();
  };
  const listener = () => paint({ keepForm: true });
  function close() {
    C.listeners.delete(listener);
    document.removeEventListener("keydown", onKey);
    document.documentElement.style.overflow = "";
    wrap.remove();
  }
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  watchContent(listener);

  /* ---------- writes ---------- */
  async function commit(changes, okMsg) {
    /* changes: { itemId: record | null } */
    const map = { ...(C.all[cid] || {}) };
    Object.keys(changes).forEach((id) => {
      if (changes[id] === null) delete map[id];
      else map[id] = changes[id];
    });
    const next = itemsList(map);
    const updates = {};
    Object.keys(changes).forEach((id) => (updates[`${CC_PATH.content}/${cid}/${id}`] = changes[id]));
    const outline = outlineOf(next);
    const previews = previewsOf(next);
    updates[`${CC_PATH.outline}/${cid}`] = Object.keys(outline).length ? outline : null;
    updates[`${CC_PATH.preview}/${cid}`] = Object.keys(previews).length ? previews : null;
    try {
      await dbUpdateRoot(updates);
      C.all = { ...C.all, [cid]: map };
      if (okMsg) alert("ok", okMsg);
      return true;
    } catch (err) {
      alert("err", friendlyError(err));
      return false;
    }
  }

  const nextOrder = (parent) => {
    const sibs = list().filter((i) => (i.parent || "") === (parent || ""));
    return sibs.reduce((m, i) => Math.max(m, Number(i.order) || 0), 0) + 1;
  };
  const clean = (o) => {
    const r = {};
    Object.keys(o).forEach((k) => {
      if (o[k] === "" || o[k] === undefined || o[k] === null || o[k] === false || (typeof o[k] === "number" && !isFinite(o[k]))) return;
      r[k] = o[k];
    });
    return r;
  };
  const raw = (id) => (C.all[cid] || {})[id];

  async function move(id, dir) {
    const it = list().find((i) => i.id === id);
    if (!it) return;
    const sibs = childrenOf(list(), it.parent);
    const i = sibs.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
    const changes = {};
    sibs.forEach((s, k) => {
      if (Number(raw(s.id).order) !== k + 1) changes[s.id] = { ...raw(s.id), order: k + 1 };
    });
    await commit(changes);
  }

  async function toggleHidden(id) {
    const r = raw(id);
    if (!r) return;
    const next = { ...r, updatedAt: Date.now() };
    if (r.hidden) delete next.hidden;
    else next.hidden = true;
    await commit({ [id]: next }, r.hidden ? `“${r.title}” is visible to students.` : `“${r.title}” hidden from students (draft).`);
  }

  async function remove(id) {
    const it = list().find((i) => i.id === id);
    if (!it) return;
    const kids = it.type === "folder" ? descendantsOf(list(), id) : [];
    const msg = it.type === "folder" ? `Delete the folder “${it.title}”${kids.length ? ` and the ${kids.length} item${kids.length === 1 ? "" : "s"} inside it` : ""}? This can’t be undone.` : `Delete “${it.title}”?`;
    if (!window.confirm(msg)) return;
    const changes = { [id]: null };
    kids.forEach((k) => (changes[k.id] = null));
    if (await commit(changes, "Deleted.")) {
      if (st.folder && (st.folder === id || kids.some((k) => k.id === st.folder))) st.folder = it.parent || "";
      paint();
    }
  }

  /* ---------- painting ---------- */
  function folderOptions(selected, excludeId) {
    const all = list();
    const banned = new Set(excludeId ? [excludeId, ...descendantsOf(all, excludeId).map((d) => d.id)] : []);
    const opts = [`<option value="">${esc(course.title)} (top level)</option>`];
    const walk = (parent, depth) =>
      childrenOf(all, parent)
        .filter((i) => i.type === "folder" && !banned.has(i.id))
        .forEach((f) => {
          opts.push(`<option value="${esc(f.id)}"${f.id === selected ? " selected" : ""}>${"\u00a0\u00a0\u00a0".repeat(depth)}${depth ? "└ " : ""}${esc(f.title)}</option>`);
          walk(f.id, depth + 1);
        });
    walk("", 1);
    return opts.join("");
  }

  function rowHTML(it, { showPath } = {}) {
    const all = list();
    const t = ccType(it.type);
    let meta;
    if (it.type === "folder") {
      const leaves = leavesUnder(all, it.id);
      const subs = descendantsOf(all, it.id).filter((d) => d.type === "folder").length;
      meta = [subs ? `${subs} folder${subs === 1 ? "" : "s"}` : "", leaves.length ? countsLabel(leaves) : "Empty folder"].filter(Boolean).join(" · ");
    } else {
      meta = [t.label, sourceLabel(it.url), it.type === "live" && it.liveAt ? liveLabel(it.liveAt) : "", minsLabel(it.mins)].filter(Boolean).join(" · ");
    }
    if (showPath) {
      const p = pathTo(all, it.id).slice(0, -1).map((x) => x.title);
      meta = (p.length ? p.join(" › ") : "Top level") + " · " + meta;
    }
    const sibs = childrenOf(all, it.parent);
    const idx = sibs.findIndex((s) => s.id === it.id);
    return (
      `<div class="cm-row${it.hidden ? " is-hidden" : ""}" data-id="${esc(it.id)}">` +
      `<span class="cc-tile cc-tone--${t.tone}">${ccIcon(it.type)}</span>` +
      `<div class="cm-row-main">` +
      (it.type === "folder"
        ? `<button class="cm-row-title" type="button" data-cm-open="${esc(it.id)}">${esc(it.title)}</button>`
        : `<button class="cm-row-title" type="button" data-cm-edit="${esc(it.id)}">${esc(it.title)}</button>`) +
      `<span class="cm-row-meta">${esc(meta)}</span></div>` +
      `<div class="cm-badges">${it.free ? `<span class="as-pill as-pill--ok">Free preview</span>` : ""}${it.hidden ? `<span class="as-pill as-pill--muted">Draft</span>` : ""}</div>` +
      `<div class="cm-row-acts">` +
      (showPath ? "" : `<button class="as-icon" type="button" data-cm-up="${esc(it.id)}" title="Move up"${idx <= 0 ? " disabled" : ""}>${sprite("i-arr-u")}</button>` + `<button class="as-icon" type="button" data-cm-down="${esc(it.id)}" title="Move down"${idx >= sibs.length - 1 ? " disabled" : ""}>${sprite("i-arr-d")}</button>`) +
      (it.url ? `<a class="as-icon" href="${esc(safeLink(it.url))}" target="_blank" rel="noopener" title="Open link">${CC_ICONS.ext}</a>` : "") +
      `<button class="as-icon" type="button" data-cm-hide="${esc(it.id)}" title="${it.hidden ? "Show to students" : "Hide (draft)"}">${sprite(it.hidden ? "i-lock" : "i-eye")}</button>` +
      `<button class="as-icon" type="button" data-cm-edit="${esc(it.id)}" title="Edit">${sprite("i-edit")}</button>` +
      `<button class="as-icon as-icon--danger" type="button" data-cm-del="${esc(it.id)}" title="Delete">${sprite("i-trash")}</button>` +
      `</div></div>`
    );
  }

  function formHTML() {
    const f = st.form;
    if (!f) return "";
    if (f.mode === "bulk") {
      return (
        `<form class="cm-form" data-cm-form novalidate>` +
        `<div class="cm-form-head"><b>Bulk add links</b><span>One per line: <code>Title | link</code> or just the link. Types are detected automatically.</span></div>` +
        `<textarea class="p-textarea cm-bulk" name="lines" rows="7" placeholder="Lecture 1 — Introduction | https://youtu.be/…&#10;Outline sheet | https://drive.google.com/file/d/…/view&#10;https://example.com/dictation-80wpm.mp3"></textarea>` +
        `<p class="cm-detect" data-cm-bulk-info>Paste links above.</p>` +
        `<div class="cm-form-grid">` +
        `<label class="p-field"><span class="p-label">Add into</span><select class="p-select" name="parent">${folderOptions(st.folder)}</select></label>` +
        `<label class="cm-check"><input type="checkbox" name="free"><span>Mark all as <b>free preview</b></span></label>` +
        `</div>` +
        `<div class="cm-form-acts"><button class="p-btn p-btn--ghost p-btn--sm" type="button" data-cm-cancel><span>Cancel</span></button><button class="p-btn p-btn--lime p-btn--sm" type="submit">${sprite("i-plus")}<span>Add all</span></button></div>` +
        `</form>`
      );
    }
    const r = f.id ? raw(f.id) || {} : {};
    const isFolder = f.mode === "folder";
    const type = isFolder ? "folder" : r.type || f.type || "video";
    return (
      `<form class="cm-form" data-cm-form novalidate>` +
      `<div class="cm-form-head"><b>${f.id ? "Edit" : "New"} ${isFolder ? "folder" : "content"}</b><span>${
        isFolder ? "Folders can hold videos, notes and more folders — e.g. Chapter 1 › Dictations." : "Paste a link — YouTube, Vimeo, Google Drive / Docs, Dropbox, a PDF, an MP3, Zoom / Meet or any webpage."
      }</span></div>` +
      (isFolder
        ? ""
        : `<div class="cm-types" role="radiogroup" aria-label="Type">${CC_ITEM_TYPES.map(
            (t) => `<label class="cm-type cc-tone--${CC_TYPES[t].tone}"><input type="radio" name="type" value="${t}"${t === type ? " checked" : ""}><span>${ccIcon(t)}${esc(CC_TYPES[t].label)}</span></label>`
          ).join("")}</div>`) +
      `<div class="cm-form-grid">` +
      (isFolder ? "" : `<label class="p-field cm-wide"><span class="p-label">Link</span><input class="p-input" name="url" type="url" inputmode="url" placeholder="https://" value="${esc(r.url || "")}" autocomplete="off" spellcheck="false"><small class="cm-detect" data-cm-detect></small></label>`) +
      `<label class="p-field cm-wide"><span class="p-label">Title</span><input class="p-input" name="title" maxlength="200" placeholder="${isFolder ? "Chapter 1 — Basics" : "Lecture 1 — Strokes & circles"}" value="${esc(r.title || "")}"></label>` +
      (isFolder
        ? ""
        : `<label class="p-field" data-cm-mins><span class="p-label">Duration (minutes, optional)</span><input class="p-input" name="mins" inputmode="numeric" placeholder="24" value="${esc(r.mins || "")}"></label>` +
          `<label class="p-field" data-cm-live><span class="p-label">Live class starts</span><input class="p-input" name="liveAt" type="datetime-local" value="${esc(toLocalInput(r.liveAt))}"></label>`) +
      `<label class="p-field"><span class="p-label">Folder</span><select class="p-select" name="parent">${folderOptions(f.id ? r.parent || "" : st.folder, isFolder ? f.id : "")}</select></label>` +
      `<label class="p-field cm-wide"><span class="p-label">Description (optional)</span><textarea class="p-textarea" name="desc" rows="2" maxlength="2000" placeholder="${isFolder ? "What students will find in this folder" : "Notes, instructions or the passage details"}">${esc(r.desc || "")}</textarea></label>` +
      `</div>` +
      `<div class="cm-checks">` +
      (isFolder ? "" : `<label class="cm-check"><input type="checkbox" name="free"${r.free ? " checked" : ""}><span><b>Free preview</b> — anyone can open it from the course page</span></label>`) +
      `<label class="cm-check"><input type="checkbox" name="hidden"${r.hidden ? " checked" : ""}><span><b>Hidden</b> — save as a draft; students don’t see it</span></label>` +
      `</div>` +
      `<div class="cm-form-acts"><button class="p-btn p-btn--ghost p-btn--sm" type="button" data-cm-cancel><span>Cancel</span></button><button class="p-btn p-btn--lime p-btn--sm" type="submit">${sprite("i-check")}<span>${f.id ? "Save changes" : isFolder ? "Create folder" : "Add content"}</span></button></div>` +
      `</form>`
    );
  }

  function paint({ keepForm } = {}) {
    const all = list();
    if (st.folder && !all.some((i) => i.id === st.folder && i.type === "folder")) st.folder = "";
    if (keepForm && st.form && $("[data-cm-form]", box)) {
      /* don't wipe a half-typed form when a live update arrives — refresh the list only */
      paintList();
      paintStats();
      return;
    }
    const crumbs = pathTo(all, st.folder);
    box.innerHTML =
      `<header class="cm-head">` +
      `<div class="cm-title"><span class="cm-k">Course content</span><h3>${esc(course.title)}</h3><p class="cm-stats" data-cm-stats></p></div>` +
      `<div class="cm-head-acts"><a class="p-btn p-btn--ghost p-btn--sm" href="dashboard.html#learn/${encodeURIComponent(cid)}" target="_blank" rel="noopener">${sprite("i-eye")}<span>Preview as student</span></a>` +
      `<button class="as-icon" type="button" data-cm-close aria-label="Close">${sprite("i-x")}</button></div>` +
      `</header>` +
      `<div class="cm-bar">` +
      `<nav class="cm-crumbs" aria-label="Folder path"><button type="button" data-cm-open=""${crumbs.length ? "" : ' aria-current="true"'}>${CC_ICONS.folder}<span>All content</span></button>${crumbs
        .map((f, i) => `<span class="cm-sep">›</span><button type="button" data-cm-open="${esc(f.id)}"${i === crumbs.length - 1 ? ' aria-current="true"' : ""}>${esc(f.title)}</button>`)
        .join("")}</nav>` +
      `<div class="cm-bar-acts">` +
      `<label class="cm-search">${sprite("i-search")}<input type="search" placeholder="Search all content" value="${esc(st.q)}" data-cm-q></label>` +
      `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-cm-new="folder">${CC_ICONS.folder}<span>New folder</span></button>` +
      `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-cm-new="bulk">${sprite("i-link")}<span>Bulk add</span></button>` +
      `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-cm-new="item">${sprite("i-plus")}<span>Add content</span></button>` +
      `</div></div>` +
      `<div class="cm-form-slot">${formHTML()}</div>` +
      `<div class="cm-list" data-cm-list></div>`;
    paintStats();
    paintList();
    bindForm();
  }

  function paintStats() {
    const all = list();
    const el = $("[data-cm-stats]", box);
    if (!el) return;
    const c = countByType(all);
    const free = all.filter((i) => i.free && i.type !== "folder").length;
    const drafts = all.filter((i) => i.hidden).length;
    const parts = [];
    if (c.folder) parts.push(`${c.folder} folder${c.folder === 1 ? "" : "s"}`);
    const leaves = all.filter((i) => i.type !== "folder");
    if (leaves.length) parts.push(countsLabel(leaves, { max: 9 }));
    if (free) parts.push(`${free} free preview${free === 1 ? "" : "s"}`);
    if (drafts) parts.push(`${drafts} draft${drafts === 1 ? "" : "s"}`);
    el.textContent = parts.length ? parts.join(" · ") : "No content yet — create folders and add your first video, PDF or link.";
  }

  function paintList() {
    const el = $("[data-cm-list]", box);
    if (!el) return;
    const all = list();
    const q = st.q.trim().toLowerCase();
    if (q) {
      const hits = all.filter((i) => String(i.title).toLowerCase().includes(q) || String(i.url || "").toLowerCase().includes(q));
      el.innerHTML = hits.length
        ? `<p class="cm-list-k">${hits.length} result${hits.length === 1 ? "" : "s"} for “${esc(st.q.trim())}”</p>` + hits.map((i) => rowHTML(i, { showPath: true })).join("")
        : `<div class="cm-empty">${CC_ICONS.web}<b>No matches</b><span>Try another word.</span></div>`;
      return;
    }
    const kids = childrenOf(all, st.folder);
    if (!kids.length) {
      el.innerHTML =
        `<div class="cm-empty">${CC_ICONS.folder}<b>${st.folder ? "This folder is empty" : "Start building your course"}</b>` +
        `<span>${st.folder ? "Add videos, notes or sub-folders here." : "Create folders like “Chapter 1” or “Dictations”, then add videos, PDFs, audio and links inside them."}</span>` +
        `<div class="cm-empty-acts"><button class="p-btn p-btn--ghost p-btn--sm" type="button" data-cm-new="folder">${CC_ICONS.folder}<span>New folder</span></button><button class="p-btn p-btn--lime p-btn--sm" type="button" data-cm-new="item">${sprite("i-plus")}<span>Add content</span></button></div></div>`;
      return;
    }
    el.innerHTML = kids.map((i) => rowHTML(i)).join("");
  }

  function bindForm() {
    const form = $("[data-cm-form]", box);
    if (!form) return;
    const f = st.form;
    const first = form.querySelector(f.mode === "bulk" ? "textarea" : f.mode === "folder" ? "[name=title]" : "[name=url]");
    if (first) setTimeout(() => first.focus(), 30);
    form.scrollIntoView({ block: "nearest" });

    if (f.mode === "bulk") {
      const info = $("[data-cm-bulk-info]", form);
      form.elements.lines.addEventListener("input", () => {
        const rows = parseBulk(form.elements.lines.value);
        const bad = rows.filter((r) => !r.url).length;
        const c = countByType(rows.filter((r) => r.url));
        info.textContent = rows.length
          ? `${rows.length - bad} link${rows.length - bad === 1 ? "" : "s"} ready${Object.keys(c).length ? " — " + Object.keys(c).map((t) => `${c[t]} ${c[t] === 1 ? CC_TYPES[t].label.toLowerCase() : CC_TYPES[t].plural.toLowerCase()}`).join(", ") : ""}${bad ? ` · ${bad} line${bad === 1 ? "" : "s"} without a valid https:// link will be skipped` : ""}`
          : "Paste links above.";
        info.dataset.kind = bad ? "warn" : "";
      });
      return;
    }
    if (f.mode === "folder") return;

    let typeTouched = Boolean(f.id);
    const detect = $("[data-cm-detect]", form);
    const syncType = () => {
      const t = (form.querySelector("[name=type]:checked") || {}).value || "video";
      const live = $("[data-cm-live]", form);
      if (live) live.hidden = t !== "live";
      const mins = $("[data-cm-mins]", form);
      if (mins) mins.hidden = !["video", "audio", "live"].includes(t);
    };
    const onUrl = () => {
      const u = form.elements.url.value.trim();
      const ok = safeLink(u);
      if (!u) {
        detect.textContent = "";
        detect.dataset.kind = "";
        return;
      }
      if (!ok) {
        detect.textContent = "Links must start with https://";
        detect.dataset.kind = "warn";
        return;
      }
      const t = detectType(ok);
      detect.textContent = `${sourceLabel(ok)} · looks like ${/^[aeiou]/i.test(CC_TYPES[t].label) ? "an" : "a"} ${CC_TYPES[t].label.toLowerCase()}`;
      detect.dataset.kind = "ok";
      if (!typeTouched) {
        const radio = form.querySelector(`[name=type][value="${t}"]`);
        if (radio) radio.checked = true;
        syncType();
      }
    };
    form.elements.url.addEventListener("input", onUrl);
    form.elements.url.addEventListener("blur", () => {
      const ok = safeLink(form.elements.url.value.trim());
      if (ok && !form.elements.title.value.trim()) {
        const n = list().filter((i) => i.type === detectType(ok)).length + 1;
        form.elements.title.value = titleFromLink(ok, n);
        form.elements.title.select();
      }
    });
    $$("[name=type]", form).forEach((r) =>
      r.addEventListener("change", () => {
        typeTouched = true;
        syncType();
      })
    );
    syncType();
    onUrl();
  }

  function parseBulk(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        let title = "";
        let url = l;
        const bar = l.lastIndexOf("|");
        if (bar > -1) {
          title = l.slice(0, bar).trim();
          url = l.slice(bar + 1).trim();
        } else {
          const m = l.match(/^(.*?)\s*(https?:\/\/\S+)$/);
          if (m) {
            title = m[1].replace(/[-–—:]\s*$/, "").trim();
            url = m[2];
          }
        }
        url = safeLink(url);
        return { title, url, type: url ? detectType(url) : "" };
      });
  }

  async function submitForm(form, btn) {
    const f = st.form;
    const now = Date.now();
    if (f.mode === "bulk") {
      const rows = parseBulk(form.elements.lines.value).filter((r) => r.url);
      if (!rows.length) return alert("err", "Paste at least one link that starts with https://");
      const parent = form.elements.parent.value || "";
      const free = form.elements.free.checked;
      let order = nextOrder(parent);
      const changes = {};
      const counts = {};
      for (const r of rows) {
        const id = await dbKey(`${CC_PATH.content}/${cid}`);
        counts[r.type] = (counts[r.type] || 0) + 1;
        changes[id] = clean({ type: r.type, title: (r.title || titleFromLink(r.url, list().filter((i) => i.type === r.type).length + counts[r.type])).slice(0, 200), url: r.url, parent, order: order++, free: free || false, createdAt: now, updatedAt: now });
      }
      await busy(btn, "Adding…", async () => {
        if (await commit(changes, `Added ${rows.length} item${rows.length === 1 ? "" : "s"}.`)) {
          st.form = null;
          st.folder = parent;
          paint();
        }
      });
      return;
    }
    const isFolder = f.mode === "folder";
    const title = form.elements.title.value.trim();
    const parent = form.elements.parent.value || "";
    const desc = form.elements.desc.value.trim().slice(0, 2000);
    const hidden = form.elements.hidden.checked;
    const prev = f.id ? raw(f.id) || {} : {};
    let rec;
    if (isFolder) {
      if (!title) return alert("err", "Give the folder a name.");
      rec = clean({ type: "folder", title: title.slice(0, 200), desc, parent, hidden, order: prev.parent === parent && prev.order ? prev.order : nextOrder(parent), createdAt: prev.createdAt || now, updatedAt: now });
    } else {
      const type = (form.querySelector("[name=type]:checked") || {}).value || "video";
      const url = safeLink(form.elements.url.value);
      if (!url) return alert("err", "Paste a link that starts with https://");
      const finalTitle = title || titleFromLink(url, list().filter((i) => i.type === type).length + 1);
      const mins = Math.max(0, Math.round(Number(String(form.elements.mins.value || "").replace(/[^\d.]/g, "")) || 0));
      const liveAt = type === "live" && form.elements.liveAt.value ? new Date(form.elements.liveAt.value).getTime() : 0;
      rec = clean({
        type,
        title: finalTitle.slice(0, 200),
        url,
        desc,
        parent,
        mins: ["video", "audio", "live"].includes(type) ? mins : 0,
        liveAt: liveAt || 0,
        free: form.elements.free.checked,
        hidden,
        order: prev.parent === parent && prev.order ? prev.order : nextOrder(parent),
        createdAt: prev.createdAt || now,
        updatedAt: now
      });
      if (!rec.parent) rec.parent = "";
    }
    if (!rec.parent) rec.parent = "";
    const id = f.id || (await dbKey(`${CC_PATH.content}/${cid}`));
    await busy(btn, "Saving…", async () => {
      if (await commit({ [id]: rec }, f.id ? "Saved." : isFolder ? `Folder “${rec.title}” created.` : `Added “${rec.title}”.`)) {
        st.form = null;
        if (!f.id && !isFolder) st.folder = parent;
        paint();
      }
    });
  }

  /* ---------- events ---------- */
  box.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t || !box.contains(t)) return;
    const d = t.dataset;
    if (d.cmClose !== undefined) return close();
    if (d.cmOpen !== undefined) {
      st.folder = d.cmOpen;
      st.q = "";
      st.form = null;
      return paint();
    }
    if (d.cmNew) {
      st.form = { mode: d.cmNew };
      return paint();
    }
    if (d.cmCancel !== undefined) {
      st.form = null;
      return paint();
    }
    if (d.cmEdit) {
      const r = raw(d.cmEdit);
      if (!r) return;
      st.form = { mode: r.type === "folder" ? "folder" : "item", id: d.cmEdit };
      return paint();
    }
    if (d.cmUp) return move(d.cmUp, -1);
    if (d.cmDown) return move(d.cmDown, 1);
    if (d.cmHide) return toggleHidden(d.cmHide);
    if (d.cmDel) return remove(d.cmDel);
  });
  box.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-cm-form]");
    if (!form) return;
    e.preventDefault();
    submitForm(form, form.querySelector('button[type="submit"]'));
  });
  box.addEventListener("input", (e) => {
    if (!e.target.matches("[data-cm-q]")) return;
    st.q = e.target.value;
    paintList();
  });

  paint();
  return close;
}
