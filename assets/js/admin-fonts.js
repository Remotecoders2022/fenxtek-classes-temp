/* ============================================================
   FENXTEK — admin CRM: Fonts & text sizes
   Set a size in px (and a font) for every section of every page,
   plus a whole-site text size and a text scale that nudges
   everything at once. Changes save themselves and show up in the
   live preview straight away.
   ============================================================ */
import { dbWatch, dbSet, friendlyError, configured } from "./firebase.js?v=5";
import {
  FONT_PATH, PAGES, PAGE_BY_ID, FAMILIES, familyStack,
  itemsOf, valueOf, rawOf, sanitize, clampPx, scaleOf, MIN_PX, MAX_PX
} from "./font-map.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => Math.round(n * 10) / 10;

const F = {
  ctx: null,
  cfg: { scale: 100, pages: {} },
  saved: { scale: 100, pages: {} },
  savedKey: "",
  page: "global",
  q: "",
  device: "desktop",
  zoom: "fit",
  ready: false,
  saving: false,
  timer: 0,
  listKey: "",
  pagesKey: "",
  base: null
};

/* ---------------- boot ---------------- */

export function initFonts(ctx) {
  F.ctx = ctx;
  const panel = $('[data-crm-panel="fonts"]');
  if (!panel) return;
  F.base = itemsOf("global").find((i) => i.id === "base");
  if (!configured) {
    /* No Realtime Database: show the editor, but nothing can be saved. */
    F.ready = true;
    F.offline = true;
    paintAll();
    return;
  }

  dbWatch(FONT_PATH, (v) => {
    const next = sanitize(v);
    F.saved = next;
    F.savedKey = key(next);
    if (!F.ready) {
      F.ready = true;
      F.cfg = clone(next);
    } else if (!dirty()) {
      /* nothing of ours pending — take the fresh value */
      F.cfg = clone(next);
    }
    paintAll();
  });

  panel.addEventListener("input", onInput);
  panel.addEventListener("change", onChange);
  panel.addEventListener("click", onClick);
  panel.addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!$('[data-crm-panel="fonts"]').hidden) fitPreview();
  });
}

export function fontsTabOpened(name) {
  if (name !== "fonts") return;
  paintAll();
  mountPreview();
  requestAnimationFrame(fitPreview);
}

/* ---------------- data helpers ---------------- */

/* updatedAt changes on every sanitize, so it never takes part in
   the "has anything changed?" comparison. */
const key = (cfg) => {
  const c = sanitize(cfg);
  delete c.updatedAt;
  return JSON.stringify(c);
};
const clone = (cfg) => JSON.parse(JSON.stringify(sanitize(cfg)));
const dirty = () => F.ready && key(F.cfg) !== F.savedKey;

function setItem(pageId, itemId, patch) {
  const pages = F.cfg.pages || (F.cfg.pages = {});
  const bag = pages[pageId] || (pages[pageId] = {});
  const next = Object.assign({}, bag[itemId] || {}, patch);
  if (next.s == null || next.s === "" || !isFinite(Number(next.s))) delete next.s;
  if (!next.f) delete next.f;
  if (!Object.keys(next).length) delete bag[itemId];
  else bag[itemId] = next;
  if (!Object.keys(bag).length) delete pages[pageId];
}
function clearItem(pageId, itemId) {
  const bag = F.cfg.pages && F.cfg.pages[pageId];
  if (!bag) return;
  delete bag[itemId];
  if (!Object.keys(bag).length) delete F.cfg.pages[pageId];
}

/* ---------------- paint ---------------- */

function paintAll() {
  if (!$('[data-crm-panel="fonts"]')) return;
  paintGlobal();
  paintPages();
  paintList();
  paintState();
}

function paintGlobal() {
  const box = $("#ftGlobal");
  if (!box) return;
  if (F.offline) {
    box.innerHTML =
      `<div class="ft-global-head"><span class="th-k">Whole website</span><h3>Fonts are not connected</h3>` +
      `<p class="ft-note">The Realtime Database is not configured on this copy of the site, so sizes can be browsed but not saved.</p></div>`;
    return;
  }
  if (!F.ready || !F.base) {
    box.innerHTML = `<p class="ft-note">Loading font settings…</p>`;
    return;
  }
  if (!$("#ftBase", box)) box.innerHTML = globalHTML();
  const v = rawOf(F.cfg, "global", F.base);
  const scale = Math.round(scaleOf(F.cfg) * 100);
  const setIf = (sel, val) => {
    const el = $(sel, box);
    if (el && el !== document.activeElement) el.value = val;
  };
  setIf("#ftBase", r1(v.size));
  setIf("#ftScale", scale);
  const fam = $("#ftBaseFam", box);
  if (fam && fam !== document.activeElement) fam.value = v.family || "body";
  paintSample();
}

function globalHTML() {
  return (
    `<div class="ft-global-head">` +
    `<span class="th-k">Whole website</span>` +
    `<h3>Every page at once</h3>` +
    `<p class="ft-note">These three controls touch the entire site. Everything below them is per page, per section.</p>` +
    `</div>` +
    `<div class="ft-global-grid">` +
    `<label class="ft-field"><span class="th-k">Body text size</span>` +
    `<span class="ft-px ft-px--lg">` +
    `<button class="ft-step-btn" type="button" data-ft-nudge="-1" aria-label="Smaller">−</button>` +
    `<input class="p-input" id="ftBase" type="number" min="10" max="40" step="1" value="16" aria-label="Body text size in pixels">` +
    `<span class="ft-unit">px</span>` +
    `<button class="ft-step-btn" type="button" data-ft-nudge="1" aria-label="Bigger">+</button>` +
    `</span>` +
    `<small class="ft-hint">Paragraphs, lists and form fields — the size of “the whole webpage”.</small></label>` +
    `<label class="ft-field"><span class="th-k">Body font</span>` +
    `<select class="p-select" id="ftBaseFam" aria-label="Body font">` +
    FAMILIES.filter((f) => f.id)
      .map((f) => `<option value="${f.id}"${f.id === "body" ? " selected" : ""}>${esc(f.label)}</option>`)
      .join("") +
    `</select><small class="ft-hint">The font used for running text on every page.</small></label>` +
    `<label class="ft-field"><span class="th-k">Text scale</span>` +
    `<span class="ft-px ft-px--lg">` +
    `<button class="ft-step-btn" type="button" data-ft-scale="-5" aria-label="Scale down 5 percent">−</button>` +
    `<input class="p-input" id="ftScale" type="number" min="40" max="200" step="5" value="100" aria-label="Text scale percent">` +
    `<span class="ft-unit">%</span>` +
    `<button class="ft-step-btn" type="button" data-ft-scale="5" aria-label="Scale up 5 percent">+</button>` +
    `</span>` +
    `<small class="ft-hint">Multiplies every size you set below — the quickest way to make the whole site larger or smaller.</small></label>` +
    `</div>` +
    `<div class="ft-sample-card" id="ftSampleCard">` +
    `<p class="ft-s-lead"></p><p class="ft-s-body"></p>` +
    `</div>`
  );
}

function paintSample() {
  const card = $("#ftSampleCard");
  if (!card || !F.base) return;
  const v = valueOf(F.cfg, "global", F.base);
  const stack = familyStack(v.family || "body");
  const lead = $(".ft-s-lead", card);
  const body = $(".ft-s-body", card);
  if (lead) {
    lead.style.fontSize = r1(v.size * 1.15) + "px";
    lead.style.fontFamily = stack;
  }
  if (body) {
    body.style.fontSize = v.size + "px";
    body.style.fontFamily = stack;
  }
}

function paintPages() {
  const box = $("#ftPages");
  if (!box) return;
  const sig = F.page + "|" + PAGES.map((p) => Object.keys((F.cfg.pages && F.cfg.pages[p.id]) || {}).length).join(",");
  if (sig === F.pagesKey && box.children.length) return;
  F.pagesKey = sig;
  box.innerHTML = PAGES.map((p) => {
    const n = Object.keys((F.cfg.pages && F.cfg.pages[p.id]) || {}).length;
    return (
      `<button class="em-chip${F.page === p.id ? " is-on" : ""}" type="button" data-ft-page="${p.id}">` +
      `<span>${esc(p.label)}</span>${n ? `<b>${n}</b>` : ""}</button>`
    );
  }).join("");
  const head = $("#ftPageHead");
  const page = PAGE_BY_ID[F.page];
  if (head && page) {
    head.innerHTML =
      `<h3>${esc(page.label)}</h3><p>${esc(page.hint || "")}</p>` +
      `<p class="ft-note ft-note--mono">${esc(page.file || "shared by every page")}</p>`;
  }
}

function paintList() {
  const box = $("#ftList");
  if (!box) return;
  if (!F.ready) {
    box.innerHTML = `<p class="ft-note">Loading…</p>`;
    return;
  }
  const sig = F.page + "|" + F.q.trim().toLowerCase();
  if (sig !== F.listKey) {
    F.listKey = sig;
    box.innerHTML = listHTML();
    return;
  }
  $$("[data-ft-row]", box).forEach(syncRow);
}

function listHTML() {
  const page = PAGE_BY_ID[F.page];
  const q = F.q.trim().toLowerCase();
  let html = "";
  page.groups.forEach((g) => {
    const rows = g.items.map((it) => rowHTML(it, q)).filter(Boolean).join("");
    if (!rows) return;
    html +=
      `<div class="ft-group"><div class="ft-group-head"><b>${esc(g.label)}</b>` +
      `<span class="crm-save-state">${g.items.length} ${g.items.length === 1 ? "control" : "controls"}</span></div>` +
      `<div class="ft-rows">${rows}</div></div>`;
  });
  return html || `<p class="ft-note">Nothing matches “${esc(F.q)}”.</p>`;
}

function rowHTML(it, q) {
  const v = valueOf(F.cfg, F.page, it);
  const raw = rawOf(F.cfg, F.page, it);
  if (q && (it.label + " " + it.sel + " " + (it.sample || "") + " " + (it.hint || "")).toLowerCase().indexOf(q) === -1) return "";
  const stack = familyStack(v.family);
  return (
    `<div class="ft-row${v.saved ? " is-set" : ""}" data-ft-row="${it.id}">` +
    `<div class="ft-row-main"><b class="ft-row-name">${rowName(it, v.saved)}</b>` +
    `<code>${esc(it.sel)}</code>` +
    (it.hint ? `<small class="ft-hint">${esc(it.hint)}</small>` : "") +
    `</div>` +
    `<div class="ft-preview" aria-hidden="true"><span class="ft-preview-txt" style="font-size:${Math.min(v.size, 44)}px${stack ? ";font-family:" + stack : ""}">${esc(it.sample || it.label)}</span></div>` +
    `<div class="ft-row-ctl">` +
    `<span class="ft-px">` +
    `<button class="ft-step-btn" type="button" data-ft-step="-1" aria-label="Smaller">−</button>` +
    `<input class="p-input ft-px-in" type="number" min="${MIN_PX}" max="${MAX_PX}" step="1" value="${r1(raw)}" data-ft-size aria-label="${esc(it.label)} size in pixels">` +
    `<span class="ft-unit">px</span>` +
    `<button class="ft-step-btn" type="button" data-ft-step="1" aria-label="Bigger">+</button>` +
    `</span>` +
    `<span class="ft-eff" data-ft-eff${scaleOf(F.cfg) === 1 ? " hidden" : ""}>→ ${r1(v.size)}px</span>` +
    `<select class="p-select ft-fam" data-ft-family aria-label="${esc(it.label)} font">` +
    FAMILIES.map((f) => `<option value="${f.id}"${f.id === (v.family || "") ? " selected" : ""}>${esc(f.label)}</option>`).join("") +
    `</select>` +
    `<button class="ft-row-reset" type="button" data-ft-reset title="Back to the page default">${icon("i-refresh")}<span>Reset</span></button>` +
    `</div></div>`
  );
}

const rowName = (it, saved) => esc(it.label) + (saved ? `<i class="ft-dot" title="Changed from the default">•</i>` : "");

/* Push the current value into a row without rebuilding it, so
   typing in an input is never interrupted. */
function syncRow(row) {
  const it = itemsOf(F.page).find((i) => i.id === row.dataset.ftRow);
  if (!it) return;
  const v = valueOf(F.cfg, F.page, it);
  const raw = rawOf(F.cfg, F.page, it);
  const active = document.activeElement;
  const input = row.querySelector("[data-ft-size]");
  const fam = row.querySelector("[data-ft-family]");
  if (input && input !== active) input.value = r1(raw);
  if (fam && fam !== active) fam.value = v.family || "";
  const eff = row.querySelector("[data-ft-eff]");
  if (eff) {
    eff.textContent = "→ " + r1(v.size) + "px";
    eff.hidden = scaleOf(F.cfg) === 1;
  }
  row.classList.toggle("is-set", v.saved);
  const name = row.querySelector(".ft-row-name");
  if (name) name.innerHTML = rowName(it, v.saved);
  const pv = row.querySelector(".ft-preview-txt");
  if (pv) {
    pv.style.fontSize = Math.min(v.size, 44) + "px";
    pv.style.fontFamily = familyStack(v.family) || "";
  }
}

function paintState() {
  const el = $("#ftState");
  const save = $("#ftSave");
  if (!el) return;
  if (F.offline) {
    el.textContent = "Database not connected";
    el.className = "crm-save-state";
    if (save) save.disabled = true;
    return;
  }
  if (!F.ready) {
    el.textContent = "Loading…";
    el.className = "crm-save-state";
    if (save) save.disabled = true;
    return;
  }
  if (F.saving) {
    el.textContent = "Saving…";
    el.className = "crm-save-state is-busy";
  } else if (dirty()) {
    el.textContent = "Unsaved changes";
    el.className = "crm-save-state is-dirty";
  } else {
    const n = Object.keys(F.cfg.pages || {}).reduce((a, p) => a + Object.keys(F.cfg.pages[p]).length, 0);
    el.textContent = n ? `Saved · ${n} custom ${n === 1 ? "size" : "sizes"} live on the site` : "Saved · the site uses its default sizes";
    el.className = "crm-save-state is-ok";
  }
  if (save) {
    save.disabled = !dirty() || F.saving;
    save.innerHTML = `<span>${F.saving ? "Saving…" : "Save changes"}</span>${icon("i-check")}`;
  }
  const count = $("#ftCount");
  if (count) {
    const set = Object.keys((F.cfg.pages && F.cfg.pages[F.page]) || {}).length;
    count.textContent = set ? `${set} changed on this page` : "Defaults";
  }
}

/* ---------------- live preview ---------------- */

function previewSrc() {
  const p = PAGE_BY_ID[F.page];
  return p && p.file ? p.file : "index.html";
}

function mountPreview() {
  const stage = $("#ftStage");
  if (!stage) return;
  const want = previewSrc();
  const w = F.device === "mobile" ? 390 : 1280;
  const cur = stage.querySelector("iframe");
  if (cur && cur.dataset.src === want) {
    cur.style.width = w + "px";
    cur.style.height = (F.device === "mobile" ? 844 : 900) + "px";
    fitPreview();
    return;
  }
  if (cur) cur.remove();
  const f = document.createElement("iframe");
  f.className = "ft-frame";
  f.dataset.src = want;
  f.title = "Live preview — " + want;
  f.style.width = w + "px";
  f.style.height = (F.device === "mobile" ? 844 : 900) + "px";
  f.src = want;
  stage.appendChild(f);
  const open = $("#ftOpen");
  if (open) open.href = want;
  fitPreview();
}

function fitPreview() {
  const stage = $("#ftStage");
  const f = stage && stage.querySelector("iframe");
  if (!f) return;
  const w = F.device === "mobile" ? 390 : 1280;
  const z = F.zoom === "fit" ? Math.min(1, (stage.clientWidth || w) / w) : Number(F.zoom) / 100;
  f.style.zoom = String(Math.round(z * 1000) / 1000);
  const label = $("#ftZoomLabel");
  if (label) label.textContent = F.zoom === "fit" ? Math.round(z * 100) + "%" : F.zoom + "%";
}

/* ---------------- events ---------------- */

function onInput(e) {
  const t = e.target;
  if (t.id === "ftScale") {
    const n = parseFloat(t.value);
    if (!isFinite(n)) return;
    F.cfg.scale = Math.min(200, Math.max(40, Math.round(n)));
    soft();
    queueSave();
    return;
  }
  if (t.id === "ftBase") {
    const n = parseFloat(t.value);
    if (!isFinite(n)) return;
    setItem("global", "base", { s: clampPx(n) });
    paintSample();
    soft();
    queueSave();
    return;
  }
  if (t.matches("[data-ft-size]")) {
    const row = t.closest("[data-ft-row]");
    if (!row) return;
    const n = parseFloat(t.value);
    if (!isFinite(n)) return;
    setItem(F.page, row.dataset.ftRow, { s: clampPx(n) });
    syncRow(row);
    paintState();
    queueSave();
    return;
  }
  if (t.id === "ftQ") {
    F.q = t.value;
    paintList();
  }
}

function onChange(e) {
  const t = e.target;
  if (t.id === "ftBaseFam") {
    setItem("global", "base", { f: t.value });
    paintSample();
    paintState();
    queueSave();
    return;
  }
  if (t.matches("[data-ft-family]")) {
    const row = t.closest("[data-ft-row]");
    if (!row) return;
    setItem(F.page, row.dataset.ftRow, { f: t.value });
    syncRow(row);
    paintState();
    queueSave();
  }
}

function onClick(e) {
  const t = e.target;

  const chip = t.closest("[data-ft-page]");
  if (chip) {
    F.page = chip.dataset.ftPage;
    F.q = "";
    const q = $("#ftQ");
    if (q) q.value = "";
    paintPages();
    paintList();
    paintState();
    mountPreview();
    return;
  }

  const nudge = t.closest("[data-ft-nudge]");
  if (nudge) {
    const next = clampPx(rawOf(F.cfg, "global", F.base) + Number(nudge.dataset.ftNudge));
    setItem("global", "base", { s: next });
    paintGlobal();
    soft();
    queueSave();
    return;
  }

  const scaleBtn = t.closest("[data-ft-scale]");
  if (scaleBtn) {
    F.cfg.scale = Math.min(200, Math.max(40, Math.round(scaleOf(F.cfg) * 100) + Number(scaleBtn.dataset.ftScale)));
    paintGlobal();
    soft();
    queueSave();
    return;
  }

  const stepBtn = t.closest("[data-ft-step]");
  if (stepBtn) {
    const row = stepBtn.closest("[data-ft-row]");
    if (!row) return;
    const input = row.querySelector("[data-ft-size]");
    setItem(F.page, row.dataset.ftRow, { s: clampPx((parseFloat(input.value) || rawOf(F.cfg, F.page, itemsOf(F.page).find((i) => i.id === row.dataset.ftRow))) + Number(stepBtn.dataset.ftStep)) });
    syncRow(row);
    paintState();
    queueSave();
    return;
  }

  const reset = t.closest("[data-ft-reset]");
  if (reset) {
    const row = reset.closest("[data-ft-row]");
    if (!row) return;
    clearItem(F.page, row.dataset.ftRow);
    F.pagesKey = "";
    syncRow(row);
    paintPages();
    paintState();
    queueSave();
    return;
  }

  if (t.closest("#ftSave")) {
    saveNow();
    return;
  }

  const zoomBtn = t.closest("[data-ft-zoom]");
  if (zoomBtn) {
    F.zoom = zoomBtn.dataset.ftZoom;
    $$("[data-ft-zoom]").forEach((b) => b.classList.toggle("is-on", b === zoomBtn));
    fitPreview();
    return;
  }

  const dev = t.closest("[data-ft-dev]");
  if (dev) {
    F.device = dev.dataset.ftDev;
    $$("[data-ft-dev]").forEach((b) => b.classList.toggle("is-on", b === dev));
    mountPreview();
    return;
  }

  if (t.closest("#ftResetPage")) {
    if (!confirm("Put every size on " + PAGE_BY_ID[F.page].label + " back to the page default?")) return;
    delete F.cfg.pages[F.page];
    F.pagesKey = "";
    F.listKey = "";
    paintAll();
    queueSave();
    return;
  }

  if (t.closest("#ftResetAll")) {
    if (!confirm("Reset every font size on every page, and the text scale? The website goes back to its designed sizes.")) return;
    F.cfg = { scale: 100, pages: {} };
    F.pagesKey = "";
    F.listKey = "";
    paintAll();
    queueSave();
  }
}

/* Rows follow the scale/base without being rebuilt. */
function soft() {
  $$("#ftList [data-ft-row]").forEach(syncRow);
  paintState();
}

/* ---------------- save ---------------- */

function queueSave() {
  clearTimeout(F.timer);
  F.timer = setTimeout(saveNow, 700);
}

async function saveNow() {
  clearTimeout(F.timer);
  if (!F.ready || !dirty() || F.saving) return;
  F.saving = true;
  paintState();
  const payload = sanitize(F.cfg);
  try {
    await dbSet(FONT_PATH, payload);
    F.saved = clone(payload);
    F.savedKey = key(payload);
    F.saving = false;
    if (F.ctx) F.ctx.showAlert("ok", "Font sizes saved — they are live on the website now.");
  } catch (err) {
    F.saving = false;
    if (F.ctx) F.ctx.showAlert("err", friendlyError(err));
  }
  paintAll();
}
