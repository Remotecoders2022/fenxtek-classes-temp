/* ============================================================
   FENXTEK — admin CRM: Store theme (festive themes, Blinkit-style)
   - Live now: what students see, auto-schedule switch, back to normal
   - Gallery: Normal + Diwali / Holi / Christmas / New Year / Holiday
     sale with live thumbnails, status, Go live / Customise
   - Editor: banner text, button target, coupon, colours, effect and
     intensity, card ribbon, countdown, schedule — with a live store
     preview (desktop / mobile) rendered by store-theme.js
   ============================================================ */
import { dbWatch, dbUpdate, dbSet, friendlyError } from "./firebase.js?v=5";
import { PATH, esc, money, num, coursesFrom } from "./commerce.js?v=5";
import { THEME_PATH, THEME_IDS, PRESETS, EFFECTS, LEVELS, themeOf, resolveTheme, themeStatus, heroHTML, fxHTML, ribbonHTML, themeVars, garlandHTML, marqueeHTML, shortDate, startCountdowns } from "./store-theme.js?v=2";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;

const T = {
  ctx: null,
  value: {},
  courses: [],
  coupons: [],
  editing: "",
  device: "desktop",
  ready: false
};

export function initTheme(ctx) {
  T.ctx = ctx;
  if (!$("#thGallery")) return;
  dbWatch(THEME_PATH, (v) => {
    T.value = v && typeof v === "object" ? v : {};
    T.ready = true;
    paint();
  });
  dbWatch(PATH.courses, (v) => {
    T.courses = coursesFrom(v).filter((c) => c.published !== false);
    if (T.editing) fillLinkOptions();
  });
  dbWatch(PATH.coupons, (v) => {
    T.coupons = Object.keys(v || {});
    const dl = $("#thCoupons");
    if (dl) dl.innerHTML = T.coupons.map((c) => `<option value="${esc(c)}">`).join("");
  });
  /* status chips depend on the clock (schedules) */
  setInterval(() => {
    if (!$('[data-crm-panel="theme"]').hidden) paintLive(), paintGallery();
  }, 60000);
  startCountdowns();

  const panel = $('[data-crm-panel="theme"]');
  panel.addEventListener("click", onClick);
  panel.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".th-thumb[data-th-edit]")) {
      e.preventDefault();
      openEditor(e.target.dataset.thEdit);
    }
  });
}

export function themeTabOpened(name) {
  if (name === "theme") paint();
}

function paint() {
  paintLive();
  paintGallery();
  paintBadge();
}

function paintBadge() {
  const live = resolveTheme(T.value);
  const badge = $('[data-crm-tab="theme"] .crm-badge');
  if (badge) badge.textContent = live ? "Live" : "";
  const pill = $("#thLivePill");
  if (pill) {
    pill.textContent = live ? `${live.name} live` : "Normal";
    pill.className = `as-pill ${live ? "as-pill--ok" : "as-pill--muted"}`;
  }
}

/* ---------------- Live now ---------------- */
function paintLive() {
  const box = $("#thLive");
  if (!box) return;
  if (!T.ready) {
    box.innerHTML = `<div class="crm-card"><span class="ov-sk" style="width:40%"></span></div>`;
    return;
  }
  const live = resolveTheme(T.value);
  const auto = Boolean(T.value.auto);
  const why = live ? (live.why === "schedule" ? `Running on schedule until ${fmtWhen(live.to)}` : live.to ? `Switches back to normal on ${fmtWhen(live.to)}` : "Stays live until you switch it off") : "Students see the regular store";
  box.innerHTML =
    `<div class="th-live-pv">${live ? heroHTML(live, { preview: true }) : normalArt(true)}</div>` +
    `<div class="crm-card th-live-side">` +
    `<span class="th-k">Live now</span>` +
    `<h3>${live ? esc(live.name) : "Normal store"}</h3>` +
    `<p class="th-why">${icon(live ? "i-zap" : "i-info")}<span>${esc(why)}</span></p>` +
    `<label class="ar-switch th-auto"><input type="checkbox" id="thAuto"${auto ? " checked" : ""}><span class="ar-switch-ui" aria-hidden="true"></span><span><b>Switch automatically on dates</b><small>Each theme goes live at its start date and ends on its own. Outside those dates the store uses your manual choice.</small></span></label>` +
    `<div class="th-live-acts">` +
    (live ? `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-th-edit="${live.id}">${icon("i-edit")}<span>Customise ${esc(live.name)}</span></button>` : "") +
    (T.value.active && T.value.active !== "normal" ? `<button class="p-btn p-btn--sm" type="button" data-th-live="normal">${icon("i-refresh")}<span>Back to normal</span></button>` : "") +
    `<a class="p-btn p-btn--ghost p-btn--sm" href="dashboard.html#store" target="_blank" rel="noopener">${icon("i-arr-ur")}<span>Open store</span></a>` +
    `</div></div>`;
  const a = $("#thAuto", box);
  a.addEventListener("change", () => save({ auto: a.checked }, a.checked ? "Automatic schedule on — themes follow their dates." : "Automatic schedule off — the store uses your manual choice."));
}

function normalArt(big) {
  return (
    `<div class="th-normal${big ? " is-big" : ""}">` +
    `<div class="th-normal-bar"><i></i><i></i><i></i></div>` +
    `<div class="th-normal-row"><span></span><span></span><span></span></div>` +
    `<div class="th-normal-grid"><b></b><b></b><b></b></div>` +
    (big ? `<p>${icon("i-check")}Regular store — no festive banner or effects</p>` : "") +
    `</div>`
  );
}

/* ---------------- Gallery ---------------- */
function paintGallery() {
  const box = $("#thGallery");
  if (!box) return;
  const active = THEME_IDS.includes(T.value.active) ? T.value.active : "normal";
  const live = resolveTheme(T.value);
  const card = (id) => {
    if (id === "normal") {
      const isLive = !live;
      return (
        `<article class="th-card${isLive ? " is-live" : ""}">` +
        `<div class="th-thumb th-thumb--normal">${normalArt(false)}</div>` +
        `<div class="th-card-b"><div class="th-card-t"><b>Normal</b><span class="as-pill ${isLive ? "as-pill--ok" : "as-pill--muted"}">${isLive ? "Live" : active === "normal" ? "Fallback" : "Off"}</span></div>` +
        `<small>The regular store, no decorations</small>` +
        `<div class="th-card-acts">${active === "normal" ? `<span class="th-chosen">${icon("i-check")}Manual choice</span>` : `<button class="p-btn p-btn--sm" type="button" data-th-live="normal">Use normal</button>`}</div></div></article>`
      );
    }
    const saved = (T.value.themes || {})[id];
    const t = themeOf(id, saved);
    const st = themeStatus(id, T.value);
    const when = t.from && t.to ? `${shortDate(t.from)} – ${shortDate(t.to)}` : t.to ? `Until ${shortDate(t.to)}` : "No dates set";
    const tone = st.key === "live" ? "ok" : st.key === "scheduled" ? "violet" : st.key === "ended" ? "warn" : "muted";
    return (
      `<article class="th-card${st.key === "live" ? " is-live" : ""}" style="${themeVars(t)}">` +
      `<div class="th-thumb" role="button" tabindex="0" data-th-edit="${id}" aria-label="Customise ${esc(t.name)}"><div class="th-thumb-in" inert>${heroHTML(t, { preview: true })}</div></div>` +
      `<div class="th-card-b"><div class="th-card-t"><b>${esc(t.name)}</b><span class="as-pill as-pill--${tone}">${esc(st.label)}</span></div>` +
      `<small>${esc(t.tagline)}${t.custom ? " · customised" : ""}</small>` +
      `<small class="th-when">${icon("i-clock")}${esc(when)}${t.coupon ? ` · <code>${esc(t.coupon)}</code>` : ""}</small>` +
      `<div class="th-card-acts">` +
      (active === id ? `<span class="th-chosen">${icon("i-check")}Manual choice</span>` : `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-th-live="${id}">${icon("i-zap")}<span>Go live</span></button>`) +
      `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-th-edit="${id}">${icon("i-edit")}<span>Customise</span></button>` +
      `</div></div></article>`
    );
  };
  box.innerHTML = ["normal", ...THEME_IDS].map(card).join("");
}

/* ---------------- actions ---------------- */
async function save(patch, msg) {
  try {
    await dbUpdate(THEME_PATH, { ...patch, updatedAt: Date.now() });
    if (msg) T.ctx.showAlert("ok", msg);
  } catch (err) {
    T.ctx.showAlert("err", friendlyError(err));
  }
}

function onClick(e) {
  const live = e.target.closest("[data-th-live]");
  if (live) {
    const id = live.dataset.thLive;
    const name = id === "normal" ? "Normal" : PRESETS[id].name;
    const t = id === "normal" ? null : themeOf(id, (T.value.themes || {})[id]);
    if (t && t.to && t.to <= Date.now()) {
      T.ctx.showAlert("err", `${name} ended on ${fmtWhen(t.to)}. Customise it and change or clear the end date first.`);
      return;
    }
    save({ active: id }, id === "normal" ? "The store is back to normal." : `${name} theme is live on the student store.`);
    return;
  }
  const edit = e.target.closest("[data-th-edit]");
  if (edit) {
    openEditor(edit.dataset.thEdit);
    return;
  }
}

/* ---------------- editor ---------------- */
const toLocal = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v) => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isFinite(t) ? t : 0;
};
const fmtWhen = (ms) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function openEditor(id) {
  const box = $("#thEditor");
  if (!box || !PRESETS[id]) return;
  T.editing = id;
  const saved = (T.value.themes || {})[id] || {};
  const raw = themeOf(id, saved);
  /* keep {year} tokens editable: show stored text, or the preset text */
  const field = (k) => (saved[k] !== undefined ? saved[k] : PRESETS[id][k]);
  const p = PRESETS[id];
  const color = (name, label) =>
    `<label class="th-color"><input type="color" name="${name}" value="${esc(raw[name])}"><span><b>${label}</b><code data-hex="${name}">${esc(raw[name].toUpperCase())}</code></span></label>`;
  box.hidden = false;
  box.innerHTML =
    `<div class="th-ed-head"><div><span class="th-k">Customise theme</span><h3>${esc(p.name)}</h3></div>` +
    `<button class="crm-mini" type="button" id="thClose" aria-label="Close editor">${icon("i-x")}</button></div>` +
    `<div class="th-ed">` +
    `<form class="th-form" id="thForm" novalidate>` +
    /* banner */
    `<fieldset class="ar-group"><legend><span class="ar-group-ic">${icon("i-edit")}</span>Banner</legend>` +
    `<div class="crm-form">` +
    `<label class="p-field"><span class="p-label">Badge</span><input class="p-input" name="badge" maxlength="40" value="${esc(field("badge"))}"></label>` +
    `<label class="p-field"><span class="p-label">Button label</span><input class="p-input" name="cta" maxlength="30" value="${esc(field("cta"))}"></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Headline</span><input class="p-input" name="title" maxlength="90" value="${esc(field("title"))}"><span class="p-hint">Wrap words in *stars* to highlight them. <code>{year}</code> becomes the coming year.</span></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Sub-text</span><textarea class="p-textarea" name="subtitle" rows="2" maxlength="200">${esc(field("subtitle"))}</textarea></label>` +
    `<label class="p-field"><span class="p-label">Button opens</span><select class="p-select" name="link" id="thLink"></select></label>` +
    `<label class="p-field"><span class="p-label">Festive coupon (optional)</span><input class="p-input" name="coupon" list="thCoupons" maxlength="24" value="${esc(field("coupon"))}" placeholder="e.g. DIWALI20" autocapitalize="characters"><span class="p-hint">Create it under Coupons. Students tap to copy; it's applied in their cart.</span></label>` +
    `<datalist id="thCoupons">${T.coupons.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>` +
    `</div></fieldset>` +
    /* look */
    `<fieldset class="ar-group"><legend><span class="ar-group-ic">${icon("i-image")}</span>Look &amp; feel</legend>` +
    `<div class="th-colors">${color("c1", "Background 1")}${color("c2", "Background 2")}${color("accent", "Accent")}${color("text", "Text")}</div>` +
    `<button class="th-linkbtn" type="button" id="thResetColors">${icon("i-refresh")}Reset colours</button>` +
    `<div class="crm-form" style="margin-top:14px">` +
    `<label class="p-field"><span class="p-label">Effect</span><select class="p-select" name="effect">${Object.keys(EFFECTS)
      .map((k) => `<option value="${k}"${raw.effect === k ? " selected" : ""}>${esc(EFFECTS[k])}</option>`)
      .join("")}</select></label>` +
    `<div class="p-field"><span class="p-label">Intensity</span><div class="th-seg" role="radiogroup">${[1, 2, 3]
      .map((l) => `<label><input type="radio" name="level" value="${l}"${raw.level === l ? " checked" : ""}><span>${LEVELS[l]}</span></label>`)
      .join("")}</div></div>` +
    `<label class="p-field"><span class="p-label">Course card ribbon</span><input class="p-input" name="ribbon" maxlength="24" value="${esc(saved.ribbon !== undefined ? saved.ribbon : p.ribbon)}" placeholder="Leave blank for none"></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Offer ticker line</span><input class="p-input" name="marquee" maxlength="160" value="${esc(field("marquee"))}" placeholder="e.g. Festive prices · instant access"><span class="p-hint">Scrolls under the banner with your live offers. Leave blank to show offers and perks only.</span></label>` +
    `<div class="p-field p-field--wide"><span class="p-label">Store dressing</span><div class="th-switches">` +
    `<label class="as-check th-check"><input type="checkbox" name="garland"${raw.garland ? " checked" : ""}>Hanging garland above the banner</label>` +
    `<label class="as-check th-check"><input type="checkbox" name="glow"${raw.glow ? " checked" : ""}>Ambient festival light on the store</label>` +
    `</div><span class="p-hint">At intensity <b>Festive</b> the ticker, category rail, count-down bar and cards also pick up the theme.</span></div>` +
    `<label class="as-check th-check"><input type="checkbox" name="countdown"${raw.countdown ? " checked" : ""}>Show a countdown to the end date</label>` +
    `</div></fieldset>` +
    /* schedule */
    `<fieldset class="ar-group"><legend><span class="ar-group-ic">${icon("i-clock")}</span>Schedule</legend>` +
    `<p class="ar-group-sub">With <b>Switch automatically on dates</b> on, the theme goes live at the start and ends on its own. A theme you set live by hand also switches off after its end date.</p>` +
    `<div class="crm-form">` +
    `<label class="p-field"><span class="p-label">Starts</span><input class="p-input" type="datetime-local" name="from" value="${toLocal(raw.from)}"></label>` +
    `<label class="p-field"><span class="p-label">Ends</span><input class="p-input" type="datetime-local" name="to" value="${toLocal(raw.to)}"></label>` +
    `<label class="as-check th-check p-field--wide"><input type="checkbox" name="on"${raw.on ? " checked" : ""}>Include in the automatic schedule</label>` +
    `</div></fieldset>` +
    `<div class="crm-actions th-actions">` +
    `<button class="p-btn p-btn--ghost p-btn--sm th-reset" type="button" id="thReset">${icon("i-refresh")}<span>Reset to default</span></button>` +
    `<span class="as-grow"></span>` +
    `<button class="p-btn p-btn--ghost" type="submit" data-golive="0"><span>Save</span></button>` +
    `<button class="p-btn p-btn--lime" type="submit" data-golive="1">${icon("i-zap")}<span>Save &amp; go live</span></button>` +
    `</div>` +
    `</form>` +
    /* preview */
    `<aside class="th-pv">` +
    `<div class="th-pv-head"><span class="th-k">Live preview</span><div class="th-seg th-seg--sm" role="tablist">` +
    `<button type="button" data-dev="desktop" class="${T.device === "desktop" ? "is-on" : ""}">${icon("i-grid")}Desktop</button>` +
    `<button type="button" data-dev="mobile" class="${T.device === "mobile" ? "is-on" : ""}">${icon("i-phone")}Mobile</button></div></div>` +
    `<div class="th-stage"><div class="th-frame is-${T.device}" id="thFrame"></div></div>` +
    `<p class="th-pv-note">${icon("i-info")}Exactly what students see on the course store. Effects also play on course pages and the cart.</p>` +
    `</aside>` +
    `</div>`;
  fillLinkOptions(field("link"));
  const f = $("#thForm", box);
  f.addEventListener("input", () => {
    $$("[data-hex]", box).forEach((c) => (c.textContent = f[c.dataset.hex].value.toUpperCase()));
    preview();
  });
  f.addEventListener("change", preview);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(e.submitter && e.submitter.dataset.golive === "1", e.submitter);
  });
  $("#thClose", box).addEventListener("click", closeEditor);
  $("#thResetColors", box).addEventListener("click", () => {
    ["c1", "c2", "accent", "text"].forEach((k) => (f[k].value = p[k]));
    f.dispatchEvent(new Event("input"));
  });
  $("#thReset", box).addEventListener("click", resetTheme);
  $$("[data-dev]", box).forEach((b) =>
    b.addEventListener("click", () => {
      T.device = b.dataset.dev;
      $$("[data-dev]", box).forEach((x) => x.classList.toggle("is-on", x === b));
      $("#thFrame", box).className = `th-frame is-${T.device}`;
      fitFrame();
    })
  );
  if (!T.ro && window.ResizeObserver) {
    T.ro = new ResizeObserver(() => fitFrame());
  }
  if (T.ro) T.ro.observe($(".th-stage", box));
  fitFrame();
  preview();
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* desktop preview renders at a real 960px and is zoomed to fit the stage */
const DESK = 960;
function fitFrame() {
  const frame = $("#thFrame");
  const stage = frame && frame.parentElement;
  if (!stage) return;
  if (T.device === "desktop") {
    const avail = stage.clientWidth - 28;
    frame.style.width = `${DESK}px`;
    frame.style.zoom = String(Math.min(1, avail / DESK));
  } else {
    frame.style.width = "";
    frame.style.zoom = "";
  }
}

function fillLinkOptions(value) {
  const sel = $("#thLink");
  if (!sel) return;
  const cur = value !== undefined ? value : sel.value;
  const opts = [
    ["store", "Course store (scroll to courses)"],
    ["membership", "Membership plans"],
    ["cart", "Cart"],
    ["rewards", "Refer & earn"],
    ...T.courses.map((c) => [`course:${c.id}`, `Course · ${c.title}`])
  ];
  sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
}

function formValues() {
  const f = $("#thForm");
  const v = {
    badge: f.badge.value.trim(),
    title: f.title.value.trim(),
    subtitle: f.subtitle.value.trim(),
    cta: f.cta.value.trim(),
    link: f.link.value || "store",
    coupon: f.coupon.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
    c1: f.c1.value,
    c2: f.c2.value,
    accent: f.accent.value,
    text: f.text.value,
    effect: f.effect.value,
    level: Number((f.querySelector('input[name="level"]:checked') || {}).value || 2),
    ribbon: f.ribbon.value.trim(),
    marquee: f.marquee.value.trim(),
    garland: f.garland.checked,
    glow: f.glow.checked,
    countdown: f.countdown.checked,
    on: f.on.checked
  };
  const from = fromLocal(f.from.value);
  const to = fromLocal(f.to.value);
  if (from) v.from = from;
  if (to) v.to = to;
  return v;
}

function preview() {
  const frame = $("#thFrame");
  if (!frame || !T.editing) return;
  const t = themeOf(T.editing, formValues());
  /* preview the countdown even before the dates are real */
  const shown = { ...t, to: t.to && t.to > Date.now() ? t.to : t.countdown ? Date.now() + 3 * 864e5 + 5 * 36e5 : 0 };
  const c = T.courses[0] || { title: "SSC Stenographer 100 WPM — Hindi", price: 1499, mrp: 2499 };
  const card = (title, price, mrp, accent) =>
    `<div class="th-mcard"><div class="th-mcover" style="--a:${accent}">${ribbonHTML(shown)}<b>${esc(title)}</b></div>` +
    `<div class="th-mbody"><b>${esc(title)}</b><span>${money(price)} ${mrp > price ? `<s>${money(mrp)}</s>` : ""}</span></div></div>`;
  frame.innerHTML =
    `<div class="th-fbar" style="${themeVars(shown)}"><span class="th-fbar-t"><small>Learn</small>Course store</span><i></i><i></i></div>` +
    `<div class="th-fbody">` +
    garlandHTML(shown) +
    heroHTML(shown, { preview: true }) +
    marqueeHTML(
      [
        shown.coupon ? { tone: "pill", text: `${shown.coupon} · festive offer` } : null,
        shown.marquee ? { tone: "spark", text: shown.marquee } : null,
        { tone: "dot", text: "Instant access the moment payment lands" },
        { tone: "coin", text: "Members get an extra 10% off every course" }
      ].filter(Boolean),
      shown
    ) +
    `<div class="th-mgrid">${card(c.title, num(c.price), num(c.mrp), "#6A5CFF")}${card((T.courses[1] || {}).title || "Hindi Typing Pro — Mangal & Kruti Dev", num((T.courses[1] || {}).price) || 499, num((T.courses[1] || {}).mrp) || 799, "#1FC8F5")}${card((T.courses[2] || {}).title || "High Court Steno 80 WPM — English", num((T.courses[2] || {}).price) || 999, num((T.courses[2] || {}).mrp) || 1499, "#9BD21F")}</div>` +
    `</div>` +
    fxHTML(shown, { contained: true });
}

async function submit(goLive, btn) {
  const id = T.editing;
  const v = formValues();
  if (!v.title) return T.ctx.showAlert("err", "Add a headline for the banner.");
  if (v.from && v.to && v.to <= v.from) return T.ctx.showAlert("err", "The end date must be after the start date.");
  if (goLive && v.to && v.to <= Date.now()) return T.ctx.showAlert("err", "The end date is in the past — change or clear it to go live.");
  const payload = { ...v };
  const run = async () => {
    await dbSet(`${THEME_PATH}/themes/${id}`, payload);
    const patch = { updatedAt: Date.now() };
    if (goLive) patch.active = id;
    await dbUpdate(THEME_PATH, patch);
  };
  try {
    if (T.ctx.withBusy && btn) await T.ctx.withBusy(btn, "Saving…", run);
    else await run();
    T.ctx.showAlert("ok", goLive ? `${PRESETS[id].name} saved and live on the student store.` : `${PRESETS[id].name} saved.${resolveTheme({ ...T.value, themes: { ...(T.value.themes || {}), [id]: payload } })?.id === id ? " Students see the changes now." : ""}`);
  } catch (err) {
    T.ctx.showAlert("err", friendlyError(err));
  }
}

async function resetTheme() {
  const id = T.editing;
  if (!confirm(`Reset ${PRESETS[id].name} to the original design? Your text, colours and dates for this theme are cleared.`)) return;
  try {
    await dbSet(`${THEME_PATH}/themes/${id}`, null);
    T.ctx.showAlert("ok", `${PRESETS[id].name} reset to the original design.`);
    openEditor(id);
  } catch (err) {
    T.ctx.showAlert("err", friendlyError(err));
  }
}

function closeEditor() {
  const box = $("#thEditor");
  if (T.ro) T.ro.disconnect();
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
  T.editing = "";
}
