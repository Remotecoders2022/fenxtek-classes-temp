/* ============================================================
   FENXTEK — admin CRM
   Guarded editor for site content, collections, membership plans,
   student memberships, achievements, students and leads.
   ============================================================ */

import {
  configured,
  waitForUser,
  signOutUser,
  isAdmin,
  isAdminEmail,
  sendVerification,
  dbGet,
  dbSet,
  dbUpdate,
  dbRemove,
  dbUpdateRoot,
  toList,
  friendlyError
} from "./firebase.js?v=5";
import { initStore, storeTabOpened } from "./admin-store.js?v=5";
import { initRewards, rewardsTabOpened } from "./admin-rewards.js?v=1";
import { qrSvg, membershipPoster } from "./qr.js?v=1";

import {
  defaultContent,
  defaultBatches,
  defaultFees,
  defaultFaqs,
  defaultTestimonials,
  defaultMemberships
} from "./cms-defaults.js?v=2";

import {
  esc,
  pad,
  rupees,
  toLines,
  safeImageUrl,
  safeDataImage,
  membershipStatus,
  fileToDataImage,
  prettyBytes,
  createAchievementImageLoader,
  achievementSource,
  hydrateAchievementImages,
  normalizeImageLink,
  formatDate as formatAnyDate
} from "./media.js?v=2";
import { firebaseConfig } from "./firebase-config.js?v=3";

/* "₹1,499" / "1499" / 1499 -> 1499 (number); blank stays "". Plan prices are
   stored as numbers so the database rules can check store checkouts. */
function toAmount(v) {
  const t = String(v == null ? "" : v).replace(/[^\d.]/g, "");
  if (!t) return "";
  const n = Math.round(Number(t));
  return isFinite(n) ? n : "";
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const uid = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 86400000;

const state = {
  user: null,
  content: {},
  batches: [],
  fees: [],
  faqs: [],
  testimonials: [],
  memberships: [],
  members: {},
  invites: {},
  codes: {},
  codeUsage: {},
  achievements: [],
  students: [],
  leads: []
};

/* ---------------- shell ---------------- */

let alertTimer;
let unlocked = false;

function showAlert(kind, message) {
  const box = $("#crmAlert");
  if (!box) return;
  box.dataset.kind = kind;
  box.textContent = message;
  box.hidden = false;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    box.hidden = true;
  }, 6500);
}

function showDenied(title, message, primaryLabel, primaryHref) {
  const loading = $("#crmLoading");
  const denied = $("#crmDenied");
  const body = $("#crmBody");

  /* Once a verified admin has the CRM open, nothing may swap it back
     to the sign-in gate. Late failures surface as an inline alert. */
  if (unlocked) {
    console.warn("[admin] ignored denied gate after unlock:", title, message);
    showAlert("err", message);
    return;
  }

  if (loading) loading.hidden = true;
  if (body) body.hidden = true;
  if (!denied) return;
  denied.hidden = false;
  $("#crmDeniedTitle").textContent = title;
  $("#crmDeniedText").textContent = message;
  const primary = $("#crmDeniedPrimary");
  if (primary) {
    primary.querySelector("span").textContent = primaryLabel;
    primary.setAttribute("href", primaryHref);
  }
}

function setState(id, text, kind) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = kind === "err" ? "#a42828" : kind === "ok" ? "#12674a" : "";
}

function formatDate(value) {
  const date = new Date(Number(value) || 0);
  if (!date.getTime()) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* yyyy-mm-dd <-> epoch ms (local midnight) */
const toDateInput = (ms) => {
  const d = new Date(Number(ms) || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fromDateInput = (v, endOfDay) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return 0;
  const d = new Date(v + (endOfDay ? "T23:59:59" : "T00:00:00"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

async function withBusy(btn, label, fn) {
  const old = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = label;
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}

/* ---------------- tabs ---------------- */

function openTab(name) {
  $$("[data-crm-tab]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.crmTab === name)));
  $$("[data-crm-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.crmPanel !== name;
  });
  if (name === "students") loadStudents();
  if (name === "leads") loadLeads();
  if (name === "memberships") loadMembers();
  if (name === "overview") paintOverview();
  storeTabOpened(name);
  rewardsTabOpened(name);
  if (history.replaceState) history.replaceState(null, "", "#" + name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindTabs() {
  $$("[data-crm-tab]").forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.dataset.crmTab));
  });
}

/* ---------------- content ---------------- */

const CONTENT_FIELDS = [
  "heroLead",
  "announcement",
  "price",
  "directorName",
  "students",
  "dictations",
  "patterns",
  "phone",
  "email",
  "telegram",
  "instagram",
  "directorMessage"
];

async function loadContent() {
  const snap = await dbGet("site/content").catch((err) => {
    console.warn("[admin] content read", err);
    return null;
  });
  state.content = (snap && snap.exists && snap.exists() && snap.val()) || {};

  const form = $("#contentForm");
  if (form) {
    CONTENT_FIELDS.forEach((key) => {
      const input = form.elements[key];
      if (input) input.value = state.content[key] == null ? "" : state.content[key];
    });
  }
  setState("#contentState", snap && snap.exists && snap.exists() ? "Live values loaded" : "Static site values — save to publish");
}

function bindContentForm() {
  const form = $("#contentForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);

    const price = String(fd.get("price") || "").replace(/[^\d]/g, "");
    if (!price) {
      showAlert("err", "Starting price must be a number.");
      return;
    }

    const payload = {
      heroLead: String(fd.get("heroLead") || "").trim(),
      announcement: String(fd.get("announcement") || "").trim(),
      price,
      directorName: String(fd.get("directorName") || "").trim(),
      students: Number(String(fd.get("students") || "").replace(/[^\d]/g, "")) || 0,
      dictations: Number(String(fd.get("dictations") || "").replace(/[^\d]/g, "")) || 0,
      patterns: Number(String(fd.get("patterns") || "").replace(/[^\d]/g, "")) || 0,
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      telegram: String(fd.get("telegram") || "").trim(),
      instagram: String(fd.get("instagram") || "").trim(),
      directorMessage: String(fd.get("directorMessage") || "").trim(),
      updatedAt: Date.now()
    };

    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      showAlert("err", "That email address doesn’t look valid.");
      return;
    }

    await withBusy(btn, "Saving…", async () => {
      try {
        await dbSet("site/content", payload);
        state.content = payload;
        setState("#contentState", "Saved · live on the site", "ok");
        showAlert("ok", "Site content saved. Public pages update in real time.");
        paintOverview();
      } catch (err) {
        setState("#contentState", "Save failed", "err");
        showAlert("err", friendlyError(err));
      }
    });
  });
}

/* ---------------- collection editors ---------------- */

const EDITORS = {
  batches: {
    path: "site/batches",
    key: "batches",
    editor: "#batchEditor",
    add: "#batchAdd",
    save: "#batchSave",
    state: "#batchState",
    noun: "Batch",
    fields: [
      { key: "title", label: "Batch name", wide: true },
      { key: "tag", label: "Tag / category" },
      { key: "banner", label: "Course banner image link (optional)", wide: true, placeholder: "https://example.com/banner.jpg" },
      { key: "order", label: "Order", type: "number" }
    ],
    blank: () => ({ title: "", tag: "", banner: "", order: state.batches.length + 1 })
  },
  fees: {
    path: "site/fees",
    key: "fees",
    editor: "#feeEditor",
    add: "#feeAdd",
    save: "#feeSave",
    state: "#feeState",
    noun: "Plan",
    fields: [
      { key: "label", label: "Plan name", wide: true },
      { key: "note", label: "Note / category" },
      { key: "price", label: "Price (₹)" },
      { key: "was", label: "Original price (optional)" },
      { key: "order", label: "Order", type: "number" }
    ],
    blank: () => ({ label: "", note: "", price: "", was: "", order: state.fees.length + 1 })
  },
  memberships: {
    path: "site/memberships",
    key: "memberships",
    editor: "#planEditor",
    add: "#planAdd",
    save: "#planSave",
    state: "#planState",
    noun: "Membership plan",
    fields: [
      { key: "name", label: "Plan name", placeholder: "Quarterly Membership" },
      { key: "badge", label: "Highlight badge text", placeholder: "Most popular" },
      {
        key: "theme",
        label: "Card style",
        type: "select",
        options: [
          ["", "Auto (highlighted = Midnight)"],
          ["ink", "Midnight black"],
          ["violet", "Royal violet"],
          ["gold", "Champagne gold"],
          ["pearl", "Pearl white"]
        ]
      },
      { key: "tagline", label: "Short description", wide: true, placeholder: "All courses, dictations and mock tests in one plan." },
      { key: "price", label: "Price (₹)", placeholder: "549" },
      { key: "was", label: "Original price (optional)", placeholder: "799" },
      { key: "duration", label: "Validity label", placeholder: "3 months" },
      { key: "durationDays", label: "Validity in days (for student memberships)", type: "number", placeholder: "90" },
      { key: "courseOff", label: "Member discount on courses (% off, 0–90)", type: "number", placeholder: "10" },
      { key: "features", label: "Features — one per line", type: "lines", wide: true, rows: 5 },
      { key: "cta", label: "Button text", placeholder: "Choose plan" },
      { key: "order", label: "Order", type: "number" },
      { key: "highlight", label: "Highlight this plan (dark card + badge)", type: "checkbox" },
      { key: "active", label: "Visible on site", type: "checkbox" }
    ],
    blank: () => ({
      name: "",
      badge: "Most popular",
      theme: "",
      tagline: "",
      price: "",
      was: "",
      duration: "1 month",
      durationDays: 30,
      courseOff: 10,
      features: [],
      cta: "Choose plan",
      highlight: false,
      active: true,
      order: state.memberships.length + 1
    }),
    clean: (item, i) => {
      const name = String(item.name || "").trim();
      if (!name) throw new Error(`Plan ${pad(i + 1)} needs a name.`);
      const out = {
        id: item.id,
        name,
        badge: String(item.badge || "").trim(),
        theme: ["ink", "violet", "gold", "pearl"].includes(item.theme) ? item.theme : "",
        tagline: String(item.tagline || "").trim(),
        price: toAmount(item.price),
        was: toAmount(item.was),
        duration: String(item.duration || "").trim(),
        features: toLines(item.features),
        cta: String(item.cta || "").trim() || "Choose plan",
        highlight: Boolean(item.highlight),
        active: item.active !== false,
        order: item.order
      };
      const days = Number(item.durationDays);
      if (item.durationDays !== "" && item.durationDays != null && isFinite(days) && days >= 0) out.durationDays = Math.round(days);
      /* extra % off every course for members of this plan (0 = none) */
      out.courseOff = Math.min(90, Math.max(0, Math.round(Number(item.courseOff) || 0)));
      return out;
    },
    after: () => populateMemberSelects()
  },
  faqs: {
    path: "site/faqs",
    key: "faqs",
    editor: "#faqEditor",
    add: "#faqAdd",
    save: "#faqSave",
    state: "#faqState",
    noun: "Question",
    fields: [
      { key: "q", label: "Question", wide: true },
      { key: "a", label: "Answer", type: "textarea", wide: true, rows: 3 },
      { key: "order", label: "Order", type: "number" }
    ],
    blank: () => ({ q: "", a: "", order: state.faqs.length + 1 })
  },
  testimonials: {
    path: "site/testimonials",
    key: "testimonials",
    editor: "#testimonialEditor",
    add: "#testimonialAdd",
    save: "#testimonialSave",
    state: "#testimonialState",
    noun: "Testimonial",
    fields: [
      { key: "quote", label: "Quote", type: "textarea", wide: true, rows: 3 },
      { key: "name", label: "Student name" },
      { key: "exam", label: "Exam / result" },
      { key: "badge", label: "Badge" },
      { key: "order", label: "Order", type: "number" }
    ],
    blank: () => ({ quote: "", name: "", exam: "", badge: "Cleared", order: state.testimonials.length + 1 })
  }
};

function renderField(f, item) {
  const raw = item[f.key];
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  if (f.type === "checkbox") {
    const checked = f.key === "active" ? raw !== false : Boolean(raw);
    return `<label class="p-check p-field${f.wide ? " p-field--wide" : ""}"><input type="checkbox" data-field="${f.key}"${checked ? " checked" : ""}><span>${esc(f.label)}</span></label>`;
  }
  const label = `<span class="p-label">${esc(f.label)}</span>`;
  let control;
  if (f.type === "select") {
    control = `<select class="p-select" data-field="${f.key}">${f.options
      .map(([v, l]) => `<option value="${esc(v)}"${String(raw || "") === v ? " selected" : ""}>${esc(l)}</option>`)
      .join("")}</select>`;
  } else if (f.type === "lines") {
    control = `<textarea class="p-textarea" data-field="${f.key}" rows="${f.rows || 4}"${ph}>${esc(toLines(raw).join("\n"))}</textarea>`;
  } else if (f.type === "textarea") {
    control = `<textarea class="p-textarea" data-field="${f.key}" rows="${f.rows || 3}"${ph}>${esc(raw == null ? "" : raw)}</textarea>`;
  } else {
    control = `<input class="p-input" type="${f.type || "text"}" data-field="${f.key}" value="${esc(raw == null ? "" : raw)}"${ph}>`;
  }
  const value = raw == null ? "" : raw;
  const preview =
    f.key === "banner" && value && safeImageUrl(value)
      ? `<span class="crm-banner-preview"><img src="${esc(safeImageUrl(value))}" alt="Banner preview" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.dataset.bad='1'"><em>Preview unavailable — check the link</em></span>`
      : "";
  return `<label class="p-field${f.wide ? " p-field--wide" : ""}">${label}${control}${preview}</label>`;
}

function renderEditor(kind) {
  const spec = EDITORS[kind];
  const wrap = $(spec.editor);
  if (!wrap) return;
  const list = state[spec.key];

  if (!list.length) {
    wrap.innerHTML = `<p class="cms-empty">Nothing here yet. Use the add button to create the first ${spec.noun.toLowerCase()}.</p>`;
    return;
  }

  wrap.innerHTML = list
    .map(
      (item, i) => `
      <div class="crm-item" data-idx="${i}">
        <div class="crm-item-top">
          <b>${spec.noun} ${pad(i + 1)}${kind === "memberships" && item.name ? " · " + esc(item.name) : ""}${
            kind === "memberships" && item.active === false ? ' <em class="crm-pill crm-pill--off">Hidden</em>' : ""
          }</b>
          <button class="crm-remove" type="button" data-remove="${i}" aria-label="Remove ${spec.noun.toLowerCase()} ${i + 1}">×</button>
        </div>
        <div class="crm-form">
          ${spec.fields.map((f) => renderField(f, item)).join("")}
        </div>
      </div>`
    )
    .join("");
}

async function loadEditor(kind) {
  const spec = EDITORS[kind];
  const snap = await dbGet(spec.path).catch((err) => {
    console.warn("[admin] load " + spec.path, err);
    return null;
  });
  state[spec.key] = snap && snap.exists && snap.exists() ? toList(snap.val()) : [];
  state[spec.key].forEach((item, i) => {
    if (!item.id) item.id = uid();
    if (item.order == null || item.order === "") item.order = i + 1;
  });
  setState(spec.state, snap && snap.exists && snap.exists() ? "Live values loaded" : "Nothing published yet");
  renderEditor(kind);
  if (spec.after) spec.after();
}

function setDirty(kind) {
  const spec = EDITORS[kind];
  setState(spec.state, "Unsaved changes", "err");
}

function bindEditor(kind) {
  const spec = EDITORS[kind];
  const wrap = $(spec.editor);
  const addBtn = $(spec.add);
  const saveBtn = $(spec.save);
  if (!wrap) return;

  const onEdit = (e) => {
    const field = e.target.dataset ? e.target.dataset.field : "";
    const itemEl = e.target.closest(".crm-item");
    if (!field || !itemEl) return;
    const idx = Number(itemEl.dataset.idx);
    const def = spec.fields.find((f) => f.key === field);
    if (!state[spec.key][idx]) return;
    let value = e.target.value;
    if (def && def.type === "number") value = e.target.value === "" ? "" : Number(e.target.value);
    if (def && def.type === "checkbox") value = e.target.checked;
    if (def && def.type === "lines") value = toLines(e.target.value);
    state[spec.key][idx][field] = value;
    setDirty(kind);
  };
  wrap.addEventListener("input", onEdit);
  wrap.addEventListener("change", onEdit);

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    state[spec.key].splice(Number(btn.dataset.remove), 1);
    renderEditor(kind);
    setDirty(kind);
  });

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      state[spec.key].push({ id: uid(), ...spec.blank() });
      renderEditor(kind);
      setDirty(kind);
      const items = wrap.querySelectorAll(".crm-item");
      const last = items[items.length - 1];
      if (last) {
        last.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const input = last.querySelector("input, textarea");
        if (input) input.focus();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () =>
      withBusy(saveBtn, "Saving…", async () => {
        try {
          const payload = {};
          state[spec.key].forEach((item, i) => {
            if (!item.id) item.id = uid();
            item.order = item.order === "" || item.order == null ? i + 1 : Number(item.order);
            const clean = spec.clean ? spec.clean(item, i) : { ...item };
            payload[item.id] = clean;
          });
          await dbSet(spec.path, payload);
          setState(spec.state, "Saved · live on the site", "ok");
          showAlert("ok", `${spec.noun}s saved. The public pages are updated.`);
          if (spec.after) spec.after();
          renderEditor(kind);
          paintOverview();
        } catch (err) {
          setState(spec.state, "Save failed", "err");
          showAlert("err", err && !err.code && err.message ? err.message : friendlyError(err));
        }
      })
    );
  }
}

/* ---------------- student memberships ---------------- */

/* Firebase keys can't contain "." — invites are keyed by the lower-cased
   email with dots swapped for commas (mirrored in database.rules.json). */
const emailKey = (email) => String(email || "").trim().toLowerCase().replace(/\./g, ",");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_LABEL = { store: "Store purchase", invite: "Gift by email", code: "QR code", admin: "Given by admin" };

function studentLabel(s) {
  if (!s) return "Unknown student";
  return (s.name || "Student") + (s.email ? " — " + s.email : "");
}

function studentByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return state.students.find((s) => String(s.email || "").trim().toLowerCase() === e) || null;
}

function planOptions() {
  const plans = state.memberships.filter((p) => p.name);
  return plans.length
    ? '<option value="">Choose a plan</option>' +
        plans
          .map(
            (p) =>
              `<option value="${esc(p.id)}">${esc(p.name)}${p.price ? " · ₹" + esc(rupees(p.price)) : ""}${
                p.duration ? " · " + esc(p.duration) : ""
              }${p.active === false ? " (hidden)" : ""}</option>`
          )
          .join("")
    : '<option value="">Create a plan first</option>';
}

function populateMemberSelects(preserve = true) {
  const list = $("#memberEmails");
  if (list) {
    list.innerHTML = state.students
      .filter((s) => s.email)
      .map((s) => `<option value="${esc(s.email)}">${esc(s.name || "Student")}</option>`)
      .join("");
  }
  ["#memberPlan", "#mcPlan"].forEach((sel) => {
    const planSel = $(sel);
    if (!planSel) return;
    const keep = preserve ? planSel.value : "";
    planSel.innerHTML = planOptions();
    if (keep) planSel.value = keep;
  });
  paintMemberWho();
}

/* Live "who is this?" hint under the email box. */
function paintMemberWho() {
  const form = $("#memberForm");
  const who = $("#memberWho");
  if (!form || !who) return;
  const email = String(form.elements.email.value || "").trim();
  const s = studentByEmail(email);
  form.elements.uid.value = s ? s.id : "";
  const btn = $("#memberSubmit span");
  if (!email) {
    who.dataset.kind = "idle";
    who.textContent = "Type an email — matching student accounts are suggested.";
  } else if (s) {
    const m = state.members[s.id];
    who.dataset.kind = "ok";
    who.textContent = `✓ ${s.name || "Student"} has an account` + (m && m.planId ? ` · currently on ${m.planName || "a plan"}` : "");
  } else if (EMAIL_RE.test(email)) {
    const inv = state.invites[emailKey(email)];
    who.dataset.kind = "invite";
    who.textContent = inv
      ? `Invite already waiting (${inv.planName}). Saving replaces it.`
      : "No account yet — the plan activates when they sign in with this email.";
  } else {
    who.dataset.kind = "idle";
    who.textContent = "Keep typing the full email address…";
  }
  if (btn) btn.textContent = !email || s || !EMAIL_RE.test(email) ? "Give membership" : "Send invite";
}

function autoEndDate() {
  const form = $("#memberForm");
  if (!form) return;
  const plan = state.memberships.find((p) => p.id === form.elements.planId.value);
  const start = fromDateInput(form.elements.start.value);
  const days = plan ? Number(plan.durationDays) : 0;
  if (plan && start && days > 0) {
    form.elements.end.value = toDateInput(start + (days - 1) * DAY);
    if (!form.elements.paid.value && plan.price) form.elements.paid.placeholder = String(plan.price);
  }
}

function sourceNote(m) {
  if (!m) return "";
  const label = SOURCE_LABEL[m.source] || (m.orderId ? SOURCE_LABEL.store : "");
  if (!label) return "";
  return label + (m.source === "code" && m.code ? " · " + m.code : "");
}

async function loadMembers() {
  const body = $("#membersBody");
  if (!state.students.length) await loadStudents({ silent: true });
  const [snap, inv] = await Promise.all([
    dbGet("members").catch((err) => {
      console.warn("[admin] members read", err);
      return null;
    }),
    dbGet("memberInvites").catch((err) => {
      console.warn("[admin] invites read", err);
      return null;
    })
  ]);
  state.members = (snap && snap.exists && snap.exists() && snap.val()) || {};
  state.invites = (inv && inv.exists && inv.exists() && inv.val()) || {};
  populateMemberSelects();
  paintOverview();
  paintStudentsTable();
  loadMemberCodes();

  if (!body) return;
  const ids = Object.keys(state.members);
  const keys = Object.keys(state.invites);
  if (!ids.length && !keys.length) {
    body.innerHTML = '<tr><td colspan="6" class="crm-table-empty">No memberships yet. Enter a student’s email above to give them a plan.</td></tr>';
    return;
  }
  ids.sort((a, b) => Number(state.members[b].updatedAt || 0) - Number(state.members[a].updatedAt || 0));
  keys.sort((a, b) => Number(state.invites[b].createdAt || 0) - Number(state.invites[a].createdAt || 0));
  const inviteRows = keys.map((k) => {
    const v = state.invites[k] || {};
    const days = Number(v.days) || 0;
    return (
      `<tr class="mc-invite-row"><td><b>${esc(v.email || k.replace(/,/g, "."))}</b><br><span class="muted">No account yet</span></td>` +
      `<td>${esc(v.planName || "—")}<br><span class="muted">Gift by email${v.paid ? ` · Paid ₹${esc(rupees(v.paid))}` : ""}</span></td>` +
      `<td class="muted">On first sign-in</td>` +
      `<td class="muted">${days ? `${days} days after sign-in` : "Open-ended"}</td>` +
      `<td><span class="crm-pill crm-pill--invite">Invite pending</span></td>` +
      `<td class="actions"><button class="crm-mini" type="button" data-invite-edit="${esc(k)}">Edit</button> ` +
      `<button class="crm-remove" type="button" data-invite-remove="${esc(k)}" aria-label="Cancel invite">×</button></td></tr>`
    );
  });
  const memberRows = ids.map((id) => {
    const m = state.members[id] || {};
    const s = state.students.find((x) => x.id === id);
    const st = membershipStatus(m);
    const src = sourceNote(m);
    const sub = [m.paid ? `Paid ₹${esc(rupees(m.paid))}` : "", src ? esc(src) : ""].filter(Boolean).join(" · ");
    return (
      `<tr><td><b>${esc((s && s.name) || m.name || "—")}</b><br><span class="muted">${esc((s && s.email) || m.email || id)}</span></td>` +
      `<td>${esc(m.planName || "—")}${sub ? `<br><span class="muted">${sub}</span>` : ""}</td>` +
      `<td class="muted">${formatDate(m.startAt)}</td>` +
      `<td class="muted">${m.endAt ? formatDate(m.endAt) : "Open-ended"}</td>` +
      `<td><span class="crm-pill crm-pill--${st.key}">${esc(st.label)}</span></td>` +
      `<td class="actions"><button class="crm-mini" type="button" data-member-edit="${esc(id)}">Edit</button> ` +
      `<button class="crm-remove" type="button" data-member-remove="${esc(id)}" aria-label="Remove membership">×</button></td></tr>`
    );
  });
  body.innerHTML = inviteRows.concat(memberRows).join("");
}

function fillMemberForm(id) {
  const form = $("#memberForm");
  if (!form) return;
  const m = state.members[id] || {};
  const s = state.students.find((x) => x.id === id) || {};
  populateMemberSelects(false);
  form.elements.email.value = s.email || m.email || "";
  form.elements.planId.value = m.planId || "";
  form.elements.start.value = toDateInput(m.startAt || Date.now());
  form.elements.end.value = m.endAt ? toDateInput(m.endAt) : "";
  form.elements.status.value = m.status || "active";
  form.elements.paid.value = m.paid || "";
  form.elements.note.value = m.note || "";
  paintMemberWho();
  form.elements.uid.value = id;
  if (!m.planId) autoEndDate();
  setState("#memberState", m.planId ? "Editing an existing membership" : "New membership for this student");
  form.scrollIntoView({ block: "start", behavior: "smooth" });
}

function fillInviteForm(key) {
  const form = $("#memberForm");
  const v = state.invites[key];
  if (!form || !v) return;
  populateMemberSelects(false);
  form.elements.email.value = v.email || "";
  form.elements.planId.value = v.planId || "";
  form.elements.start.value = toDateInput(Date.now());
  form.elements.end.value = Number(v.days) > 0 ? toDateInput(Date.now() + (Number(v.days) - 1) * DAY) : "";
  form.elements.status.value = "active";
  form.elements.paid.value = v.paid || "";
  form.elements.note.value = v.note || "";
  paintMemberWho();
  setState("#memberState", "Editing a pending invite — validity counts from the day they sign in.");
  form.scrollIntoView({ block: "start", behavior: "smooth" });
}

function bindMembers() {
  const form = $("#memberForm");
  if (!form) return;
  form.elements.start.value = toDateInput(Date.now());

  form.elements.planId.addEventListener("change", autoEndDate);
  form.elements.start.addEventListener("change", autoEndDate);
  form.elements.email.addEventListener("input", paintMemberWho);
  form.elements.email.addEventListener("change", () => {
    paintMemberWho();
    const id = form.elements.uid.value;
    if (id && state.members[id] && !form.elements.planId.value) fillMemberForm(id);
  });
  form.addEventListener("reset", () =>
    setTimeout(() => {
      form.elements.start.value = toDateInput(Date.now());
      form.elements.uid.value = "";
      paintMemberWho();
      setState("#memberState", "Enter the student’s email and pick a plan — “Valid till” fills from the plan length.");
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const email = String(form.elements.email.value || "").trim();
    const s = studentByEmail(email);
    const id = s ? s.id : "";
    const plan = state.memberships.find((p) => p.id === form.elements.planId.value);
    const startAt = fromDateInput(form.elements.start.value);
    const endAt = fromDateInput(form.elements.end.value, true);
    if (!EMAIL_RE.test(email)) return showAlert("err", "Enter the student’s email address.");
    if (!plan) return showAlert("err", "Choose a membership plan (save new plans first).");
    if (!startAt) return showAlert("err", "Pick a start date.");
    if (endAt && endAt < startAt) return showAlert("err", "“Valid till” must be after the start date.");
    const paid = String(form.elements.paid.value || "").replace(/[^\d.]/g, "");
    const note = String(form.elements.note.value || "").trim();
    const by = (state.user && state.user.email) || "admin";
    const key = emailKey(email);

    if (!id) {
      /* No account yet — park it as an invite, claimed on first verified sign-in. */
      const days = endAt ? Math.max(1, Math.round((endAt - startAt) / DAY)) : 0;
      const invite = { email: email.toLowerCase(), planId: plan.id, planName: plan.name, days, createdAt: Date.now(), createdBy: by };
      if (paid) invite.paid = paid;
      if (note) invite.note = note;
      await withBusy(btn, "Sending…", async () => {
        try {
          await dbSet(`memberInvites/${key}`, invite);
          setState("#memberState", `Invite saved · ${plan.name} waits for ${invite.email}`, "ok");
          showAlert("ok", `Invite saved. ${plan.name} activates as soon as ${invite.email} signs up or signs in (with a verified email).`);
          form.reset();
          await loadMembers();
        } catch (err) {
          setState("#memberState", "Save failed", "err");
          showAlert("err", friendlyError(err));
        }
      });
      return;
    }

    const prev = state.members[id] || {};
    const record = {
      planId: plan.id,
      planName: plan.name,
      startAt,
      status: form.elements.status.value || "active",
      name: s.name || "",
      email: s.email || email,
      source: prev.planId === plan.id && prev.source ? prev.source : "admin",
      updatedAt: Date.now(),
      updatedBy: by
    };
    if (endAt) record.endAt = endAt;
    if (paid) record.paid = paid;
    if (note) record.note = note;
    if (record.source === "code" && prev.code) record.code = prev.code;

    await withBusy(btn, "Saving…", async () => {
      try {
        const updates = { [`members/${id}`]: record };
        if (state.invites[key]) updates[`memberInvites/${key}`] = null;
        await dbUpdateRoot(updates);
        setState("#memberState", `Saved · ${record.planName} active for ${s.name || s.email || "student"}`, "ok");
        showAlert("ok", "Membership saved. The student sees it on their dashboard right away.");
        await loadMembers();
      } catch (err) {
        setState("#memberState", "Save failed", "err");
        showAlert("err", friendlyError(err));
      }
    });
  });

  const body = $("#membersBody");
  if (body) {
    body.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-member-edit]");
      if (edit) return fillMemberForm(edit.dataset.memberEdit);
      const iedit = e.target.closest("[data-invite-edit]");
      if (iedit) return fillInviteForm(iedit.dataset.inviteEdit);
      const irm = e.target.closest("[data-invite-remove]");
      if (irm) {
        if (!confirm("Cancel this invite? The student won’t get the plan when they sign in.")) return;
        irm.disabled = true;
        try {
          await dbRemove(`memberInvites/${irm.dataset.inviteRemove}`);
          showAlert("ok", "Invite cancelled.");
          await loadMembers();
        } catch (err) {
          irm.disabled = false;
          showAlert("err", friendlyError(err));
        }
        return;
      }
      const rm = e.target.closest("[data-member-remove]");
      if (!rm) return;
      if (!confirm("Remove this student’s membership?")) return;
      rm.disabled = true;
      try {
        await dbRemove(`members/${rm.dataset.memberRemove}`);
        showAlert("ok", "Membership removed.");
        await loadMembers();
      } catch (err) {
        rm.disabled = false;
        showAlert("err", friendlyError(err));
      }
    });
  }
  bindMemberCodes();
}

/* ---------------- membership QR codes ---------------- */

const MC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const MC_RE = /^[A-Z0-9-]{4,24}$/;

function newJoinCode(plan) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let tail = "";
  bytes.forEach((b) => (tail += MC_ALPHABET[b % MC_ALPHABET.length]));
  const head = (String((plan && plan.name) || "JOIN")
    .toUpperCase()
    .match(/[A-Z0-9]+/) || ["JOIN"])[0]
    .slice(0, 10);
  return (head.length >= 2 ? head : "JOIN") + "-" + tail;
}

const joinUrl = (code) => new URL(`dashboard.html#redeem/${encodeURIComponent(code)}`, location.href).href;

function codeState(c, used) {
  if (c.active === false) return { key: "paused", label: "Paused" };
  if (Number(c.expiresAt) > 0 && Number(c.expiresAt) <= Date.now()) return { key: "expired", label: "Expired" };
  if (Number(c.maxUses) > 0 && used >= Number(c.maxUses)) return { key: "cancelled", label: "Full" };
  return { key: "active", label: "Live" };
}

function codeValidity(c) {
  const d = Number(c.days) || 0;
  return d ? `${d} days after joining` : "Open-ended access";
}

async function loadMemberCodes() {
  const box = $("#mcList");
  if (!box) return;
  const [codes, usage] = await Promise.all([
    dbGet("memberCodes").catch((err) => {
      console.warn("[admin] codes read", err);
      return null;
    }),
    dbGet("memberCodeUsage").catch(() => null)
  ]);
  state.codes = (codes && codes.exists && codes.exists() && codes.val()) || {};
  state.codeUsage = (usage && usage.exists && usage.exists() && usage.val()) || {};
  paintMemberCodes();
}

function paintMemberCodes() {
  const box = $("#mcList");
  if (!box) return;
  const list = Object.keys(state.codes || {})
    .map((k) => ({ id: k, ...state.codes[k] }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  if (!list.length) {
    box.innerHTML = '<p class="mc-empty">No QR codes yet. Create one above — print it on a poster or share the link in your WhatsApp group.</p>';
    return;
  }
  box.innerHTML = list
    .map((c) => {
      const used = Number((state.codeUsage[c.id] || {}).count) || 0;
      const max = Number(c.maxUses) || 0;
      const st = codeState(c, used);
      const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
      const meta = [codeValidity(c), Number(c.expiresAt) > 0 ? "Code expires " + formatDate(c.expiresAt) : ""].filter(Boolean).join(" · ");
      return `<article class="mc-card" data-state="${st.key}">
        <button class="mc-qr" type="button" data-mc-show="${esc(c.id)}" aria-label="Show QR for ${esc(c.id)}"><span data-mc-qr="${esc(c.id)}"></span></button>
        <div class="mc-body">
          <div class="mc-top"><code class="mc-code">${esc(c.id)}</code><span class="crm-pill crm-pill--${st.key}">${esc(st.label)}</span></div>
          <b class="mc-plan">${esc(c.planName || "Plan")}</b>
          <p class="mc-meta">${esc(meta)}${c.note ? `<br><span>${esc(c.note)}</span>` : ""}</p>
          <div class="mc-uses"><span class="mc-bar"><i style="width:${max ? pct : used ? 100 : 0}%"></i></span><span>${used} ${max ? "/ " + max : ""} joined</span></div>
          <div class="mc-actions">
            <button class="crm-mini" type="button" data-mc-show="${esc(c.id)}">Show QR</button>
            <button class="crm-mini" type="button" data-mc-poster="${esc(c.id)}">Poster</button>
            <button class="crm-mini" type="button" data-mc-copy="${esc(c.id)}">Copy link</button>
            <button class="crm-mini" type="button" data-mc-toggle="${esc(c.id)}">${c.active === false ? "Resume" : "Pause"}</button>
            <button class="crm-remove" type="button" data-mc-delete="${esc(c.id)}" aria-label="Delete code">×</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
  list.forEach((c) => {
    qrSvg(joinUrl(c.id), { ecc: "M", margin: 1 })
      .then((svg) => {
        const slot = box.querySelector(`[data-mc-qr="${CSS.escape(c.id)}"]`);
        if (slot) slot.innerHTML = svg;
      })
      .catch(() => {});
  });
}

function closeCodeModal() {
  const m = document.querySelector(".mc-modal");
  if (m) m.remove();
  document.removeEventListener("keydown", modalKeys);
}
function modalKeys(e) {
  if (e.key === "Escape") closeCodeModal();
}

async function openCodeModal(id) {
  const c = state.codes[id];
  if (!c) return;
  closeCodeModal();
  const usage = state.codeUsage[id] || {};
  const used = Number(usage.count) || 0;
  const joined = Object.entries(usage.users || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([uid2, at]) => {
      const s = state.students.find((x) => x.id === uid2) || {};
      return `<li><b>${esc(s.name || "Student")}</b><span>${esc(s.email || uid2)}</span><time>${formatDate(at)}</time></li>`;
    })
    .join("");
  const url = joinUrl(id);
  const wrap = document.createElement("div");
  wrap.className = "mc-modal";
  wrap.innerHTML = `<div class="mc-sheet" role="dialog" aria-modal="true" aria-label="Join code ${esc(id)}">
      <button class="mc-x" type="button" data-mc-close aria-label="Close">×</button>
      <span class="mc-kicker">Scan to join</span>
      <h3>${esc(c.planName || "Membership")}</h3>
      <p class="mc-meta">${esc(codeValidity(c))}</p>
      <div class="mc-big" data-mc-big><span class="muted">Drawing QR…</span></div>
      <code class="mc-code mc-code--lg">${esc(id)}</code>
      <a class="mc-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
      <div class="mc-actions mc-actions--center">
        <button class="p-btn p-btn--lime p-btn--sm" type="button" data-mc-poster="${esc(id)}"><span>Download poster</span></button>
        <button class="p-btn p-btn--ghost p-btn--sm" type="button" data-mc-copy="${esc(id)}"><span>Copy link</span></button>
      </div>
      <div class="mc-joined">
        <b>${used} student${used === 1 ? "" : "s"} joined${Number(c.maxUses) ? ` of ${Number(c.maxUses)}` : ""}</b>
        ${joined ? `<ul>${joined}</ul>` : '<p class="muted">Nobody has used this code yet.</p>'}
      </div>
    </div>`;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-mc-close]")) closeCodeModal();
  });
  document.body.appendChild(wrap);
  document.addEventListener("keydown", modalKeys);
  try {
    wrap.querySelector("[data-mc-big]").innerHTML = await qrSvg(url, { ecc: "Q", margin: 2 });
  } catch (err) {
    wrap.querySelector("[data-mc-big]").innerHTML = '<span class="muted">QR library could not load — share the link instead.</span>';
  }
}

async function downloadPoster(id, btn) {
  const c = state.codes[id];
  if (!c) return;
  await withBusy(btn, "Drawing…", async () => {
    try {
      const png = await membershipPoster({
        url: joinUrl(id),
        code: id,
        planName: c.planName || "Membership",
        validity: codeValidity(c)
      });
      const a = document.createElement("a");
      a.href = png;
      a.download = `fenxtek-join-${id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      showAlert("err", "Couldn’t draw the poster: " + (err.message || err));
    }
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

async function codeActions(e) {
  const show = e.target.closest("[data-mc-show]");
  if (show) return openCodeModal(show.dataset.mcShow);
  const poster = e.target.closest("[data-mc-poster]");
  if (poster) return downloadPoster(poster.dataset.mcPoster, poster);
  const copy = e.target.closest("[data-mc-copy]");
  if (copy) {
    const ok = await copyText(joinUrl(copy.dataset.mcCopy));
    return showAlert(ok ? "ok" : "err", ok ? "Join link copied — paste it in WhatsApp, Telegram or email." : "Couldn’t copy. Open “Show QR” and copy the link from there.");
  }
  const tog = e.target.closest("[data-mc-toggle]");
  if (tog) {
    const id = tog.dataset.mcToggle;
    const c = state.codes[id];
    if (!c) return;
    tog.disabled = true;
    try {
      await dbUpdate(`memberCodes/${id}`, { active: c.active === false, updatedAt: Date.now() });
      showAlert("ok", c.active === false ? `${id} is live again.` : `${id} paused — scans will show “code paused”.`);
      await loadMemberCodes();
    } catch (err) {
      tog.disabled = false;
      showAlert("err", friendlyError(err));
    }
    return;
  }
  const del = e.target.closest("[data-mc-delete]");
  if (del) {
    const id = del.dataset.mcDelete;
    if (!confirm(`Delete join code ${id}? Students who already joined keep their membership; the QR stops working.`)) return;
    del.disabled = true;
    try {
      await dbUpdateRoot({ [`memberCodes/${id}`]: null, [`memberCodeUsage/${id}`]: null });
      showAlert("ok", `Code ${id} deleted.`);
      await loadMemberCodes();
    } catch (err) {
      del.disabled = false;
      showAlert("err", friendlyError(err));
    }
  }
}

function bindMemberCodes() {
  const form = $("#mcForm");
  if (!form) return;
  const planOf = () => state.memberships.find((p) => p.id === form.elements.planId.value);
  const fresh = () => {
    form.elements.code.value = newJoinCode(planOf());
  };
  fresh();
  $("#mcShuffle").addEventListener("click", fresh);
  form.elements.planId.addEventListener("change", () => {
    const p = planOf();
    if (!form.elements.code.dataset.touched) fresh();
    form.elements.days.placeholder = p && Number(p.durationDays) > 0 ? String(p.durationDays) : p ? "0 (open-ended)" : "From plan";
  });
  form.elements.code.addEventListener("input", () => {
    form.elements.code.value = form.elements.code.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    form.elements.code.dataset.touched = "1";
  });
  form.addEventListener("reset", () =>
    setTimeout(() => {
      delete form.elements.code.dataset.touched;
      fresh();
      form.elements.days.placeholder = "From plan";
      setState("#mcState", "Validity 0 = open-ended. Leave “Max students” blank for unlimited.");
    })
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const plan = planOf();
    const code = String(form.elements.code.value || "").trim().toUpperCase();
    if (!plan) return showAlert("err", "Choose the plan this QR code gives.");
    if (!MC_RE.test(code)) return showAlert("err", "Codes are 4–24 characters: letters, numbers and dashes.");
    const rawDays = String(form.elements.days.value || "").trim();
    const days = rawDays === "" ? Math.max(0, Math.round(Number(plan.durationDays) || 0)) : Math.round(Number(rawDays));
    if (!isFinite(days) || days < 0 || days > 3660) return showAlert("err", "Validity must be between 0 and 3660 days.");
    const maxUses = Math.max(0, Math.round(Number(String(form.elements.maxUses.value || "").replace(/[^\d]/g, "")) || 0));
    const expiresAt = fromDateInput(form.elements.expires.value, true);
    if (expiresAt && expiresAt < Date.now()) return showAlert("err", "The expiry date is in the past.");
    const record = {
      code,
      planId: plan.id,
      planName: plan.name,
      days,
      maxUses,
      expiresAt: expiresAt || 0,
      active: true,
      createdAt: Date.now(),
      createdBy: (state.user && state.user.email) || "admin"
    };
    const note = String(form.elements.note.value || "").trim();
    if (note) record.note = note;
    await withBusy(btn, "Creating…", async () => {
      try {
        const exists = await dbGet(`memberCodes/${code}`);
        if (exists && exists.exists && exists.exists()) {
          setState("#mcState", "That code already exists — pick another.", "err");
          return showAlert("err", `Code ${code} already exists. Tap “New” for a fresh one.`);
        }
        await dbUpdateRoot({ [`memberCodes/${code}`]: record, [`memberCodeUsage/${code}`]: null });
        setState("#mcState", `Created · ${code} gives ${plan.name}`, "ok");
        showAlert("ok", `QR code ${code} is live. Print the poster or share the link.`);
        form.reset();
        await loadMemberCodes();
        openCodeModal(code);
      } catch (err) {
        setState("#mcState", "Save failed", "err");
        showAlert("err", friendlyError(err));
      }
    });
  });
  const list = $("#mcList");
  if (list) list.addEventListener("click", codeActions);
  document.addEventListener("click", (e) => {
    if (e.target.closest(".mc-modal") && (e.target.closest("[data-mc-poster]") || e.target.closest("[data-mc-copy]"))) codeActions(e);
  });
}

/* ---------------- achievements ---------------- */

let loadAchImage = createAchievementImageLoader(dbGet);
const draft = { source: "upload", dataUrl: "", url: "", editingId: "", imageChanged: false, width: 0, height: 0 };

async function loadAchievements() {
  const snap = await dbGet("site/achievements").catch((err) => {
    console.warn("[admin] achievements read", err);
    return null;
  });
  state.achievements = snap && snap.exists && snap.exists() ? toList(snap.val()) : [];
  loadAchImage = createAchievementImageLoader(dbGet);
  renderAchievementList();
  paintOverview();
  checkAchievementsPublic();
}

/* Visitors are not signed in. Ask the REST API anonymously (shallow =
   keys only, no image bytes) whether they can read the posts and the
   uploaded pictures — if not, the live rules were never published. */
async function checkAchievementsPublic() {
  const box = $("#achPublicWarn");
  const base = String((firebaseConfig && firebaseConfig.databaseURL) || "").replace(/\/+$/, "");
  if (!box || !base || !/^https:\/\//.test(base) || !state.achievements.length) {
    if (box) box.hidden = true;
    return;
  }
  const blocked = [];
  const paths = ["site/achievements"];
  if (state.achievements.some((a) => achievementSource(a).kind === "upload")) paths.push("site/achievementImages");
  await Promise.all(
    paths.map((p) =>
      fetch(`${base}/${p}.json?shallow=true`, { cache: "no-store" })
        .then((r) => {
          if (r.status === 401 || r.status === 403) blocked.push(p);
        })
        .catch(() => {})
    )
  );
  box.hidden = !blocked.length;
  if (blocked.length) {
    box.innerHTML =
      `<b>Visitors can’t see these posts yet.</b> The live database blocks public reads of <code>${blocked.map(esc).join("</code> and <code>")}</code>, ` +
      `so uploaded photos show as “Photo unavailable” on the website. Publish <code>database.rules.json</code> in Firebase console → Realtime Database → Rules.`;
  }
}

function renderAchievementList() {
  const wrap = $("#achList");
  const count = $("#achListCount");
  if (count) count.textContent = state.achievements.length;
  const tags = $("#achTags");
  if (tags) {
    tags.innerHTML = Array.from(new Set(state.achievements.map((a) => a.tag).filter(Boolean)))
      .map((t) => `<option value="${esc(t)}">`)
      .join("");
  }
  if (!wrap) return;
  if (!state.achievements.length) {
    wrap.innerHTML = '<p class="cms-empty">No achievement posts yet. Drop a photo above and add a caption to publish the first one.</p>';
    return;
  }
  const last = state.achievements.length - 1;
  wrap.innerHTML = state.achievements
    .map((a, i) => {
      const src = achievementSource(a);
      const img =
        src.kind === "link"
          ? `<img src="${esc(src.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('[data-ach-card]').classList.add('is-broken')">`
          : src.kind === "upload"
          ? `<img data-ach-img="${esc(src.id)}" alt="">`
          : "";
      return (
        `<article class="ach-row${a.published === false ? " is-hidden" : ""}${src.kind === "upload" ? " is-loading" : ""}" data-ach-card data-id="${esc(a.id)}">` +
        `<span class="ach-thumb">${img}<em>${src.kind === "link" ? "Link" : "Base64"}</em></span>` +
        `<div class="ach-row-body">` +
        `<span class="ach-row-meta">${esc([a.tag, formatAnyDate(a.date)].filter(Boolean).join(" · ") || "No tag")}` +
        `${a.published === false ? ' <em class="crm-pill crm-pill--off">Hidden</em>' : ' <em class="crm-pill crm-pill--active">Live</em>'}</span>` +
        (a.title ? `<b>${esc(a.title)}</b>` : "") +
        `<p>${esc(a.caption || "")}</p></div>` +
        `<div class="ach-row-actions">` +
        `<button class="crm-mini" type="button" data-ach-act="up" ${i === 0 ? "disabled" : ""} aria-label="Move up"><svg><use href="#i-arr-u"/></svg></button>` +
        `<button class="crm-mini" type="button" data-ach-act="down" ${i === last ? "disabled" : ""} aria-label="Move down"><svg><use href="#i-arr-d"/></svg></button>` +
        `<button class="crm-mini" type="button" data-ach-act="edit">Edit</button>` +
        `<button class="crm-mini" type="button" data-ach-act="toggle">${a.published === false ? "Show" : "Hide"}</button>` +
        `<button class="crm-remove" type="button" data-ach-act="delete" aria-label="Delete post">×</button>` +
        `</div></article>`
      );
    })
    .join("");
  hydrateAchievementImages(wrap, loadAchImage);
}

function setAchSource(source) {
  draft.source = source;
  $$(".ach-src").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === source)));
  const linkRow = $("#achLinkRow");
  if (linkRow) linkRow.hidden = source !== "link";
  const drop = $("#achDrop");
  if (drop) drop.classList.toggle("is-link", source === "link");
  paintAchPreview();
}

function paintAchPreview() {
  const img = $("#achPreview");
  const drop = $("#achDrop");
  const clear = $("#achClear");
  const meta = $("#achMeta");
  const src = draft.source === "link" ? safeImageUrl(draft.url) : draft.dataUrl;
  if (img) {
    if (src) img.src = src;
    else img.removeAttribute("src");
    img.hidden = !src;
  }
  if (drop) drop.classList.toggle("has-img", Boolean(src));
  if (clear) clear.hidden = !src;
  if (meta) {
    if (draft.source === "upload" && draft.dataUrl) {
      meta.textContent = `Ready · ${draft.width}×${draft.height}px · ${prettyBytes(draft.dataUrl.length)} as base64 in Realtime Database`;
    } else if (draft.source === "link" && draft.url) {
      meta.textContent = "Google Drive and Dropbox share links are converted to direct picture links. The file must be public (Drive: “Anyone with the link”).";
    } else {
      meta.textContent =
        draft.source === "link"
          ? "Paste a direct image link (ending in .jpg, .png, .webp…) and press Preview."
          : "Photos are kept sharp (up to ~4 MP, full width for tall result lists); screenshots stay PNG and transparent backgrounds become white.";
    }
  }
}

async function takeFile(file) {
  if (!file) return;
  setAchSource("upload");
  setState("#achState", "Processing image…");
  const drop = $("#achDrop");
  if (drop) drop.classList.add("is-busy");
  try {
    const out = await fileToDataImage(file);
    draft.dataUrl = out.dataUrl;
    draft.width = out.width;
    draft.height = out.height;
    draft.imageChanged = true;
    setState("#achState", out.resized ? "Image compressed and ready." : "Image ready.", "ok");
  } catch (err) {
    setState("#achState", err.message || "Could not read that image.", "err");
    showAlert("err", err.message || "Could not read that image.");
  } finally {
    if (drop) drop.classList.remove("is-busy");
    paintAchPreview();
  }
}

function takeUrl(url) {
  const safe = normalizeImageLink(url);
  if (!safe || !/^https?:\/\//i.test(safe)) {
    setState("#achState", "Use a full https:// picture link.", "err");
    return false;
  }
  setAchSource("link");
  draft.url = safe;
  draft.imageChanged = true;
  const input = $("#achUrl");
  if (input) input.value = safe;
  setState("#achState", "Link attached — check the preview.", "ok");
  paintAchPreview();
  return true;
}

function resetComposer() {
  const form = $("#achForm");
  if (form) form.reset();
  Object.assign(draft, { source: "upload", dataUrl: "", url: "", editingId: "", imageChanged: false, width: 0, height: 0 });
  const url = $("#achUrl");
  if (url) url.value = "";
  if (form) form.elements.date.value = toDateInput(Date.now());
  const mode = $("#achFormMode");
  if (mode) mode.textContent = "New post";
  const submit = $("#achSubmit span");
  if (submit) submit.textContent = "Publish post";
  const cancel = $("#achCancel");
  if (cancel) cancel.hidden = true;
  setAchSource("upload");
  setState("#achState", "Add a picture and a caption.");
}

async function editAchievement(id) {
  const a = state.achievements.find((x) => x.id === id);
  const form = $("#achForm");
  if (!a || !form) return;
  resetComposer();
  draft.editingId = id;
  form.elements.caption.value = a.caption || "";
  form.elements.title.value = a.title || "";
  form.elements.tag.value = a.tag || "";
  form.elements.date.value = a.date || "";
  form.elements.published.checked = a.published !== false;
  if (a.imageSource === "link") {
    draft.url = a.imageUrl || "";
    const url = $("#achUrl");
    if (url) url.value = draft.url;
    setAchSource("link");
  } else {
    setAchSource("upload");
    draft.dataUrl = await loadAchImage(id);
    draft.width = a.width || 0;
    draft.height = a.height || 0;
    paintAchPreview();
  }
  draft.imageChanged = false;
  const mode = $("#achFormMode");
  if (mode) mode.textContent = "Editing post";
  const submit = $("#achSubmit span");
  if (submit) submit.textContent = "Update post";
  const cancel = $("#achCancel");
  if (cancel) cancel.hidden = false;
  setState("#achState", "Editing — drop a new picture to replace it.");
  form.scrollIntoView({ block: "start", behavior: "smooth" });
}

function bindAchievements() {
  const form = $("#achForm");
  const drop = $("#achDrop");
  const file = $("#achFile");
  if (!form || !drop || !file) return;
  form.elements.date.value = toDateInput(Date.now());

  $$(".ach-src").forEach((b) => b.addEventListener("click", () => setAchSource(b.dataset.src)));

  drop.addEventListener("click", (e) => {
    if (e.target.closest("#achClear")) return;
    if (draft.source === "link") return;
    file.click();
  });
  drop.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && draft.source !== "link") {
      e.preventDefault();
      file.click();
    }
  });
  file.addEventListener("change", () => {
    takeFile(file.files && file.files[0]);
    file.value = "";
  });

  let depth = 0;
  drop.addEventListener("dragenter", (e) => {
    e.preventDefault();
    depth++;
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  drop.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) drop.classList.remove("is-over");
  });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    drop.classList.remove("is-over");
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || ""));
    if (files.length) {
      if (files.length > 1) showAlert("info", "One picture per post — using the first image you dropped.");
      takeFile(files[0]);
      return;
    }
    /* An image dragged from another web page arrives as a link. */
    const html = dt.getData("text/html") || "";
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const link = (m && m[1]) || (dt.getData("text/uri-list") || "").split(/\r?\n/).find((l) => l && !l.startsWith("#")) || dt.getData("text/plain");
    if (link && /^data:image\//i.test(link)) {
      fetch(link)
        .then((r) => r.blob())
        .then((b) => takeFile(new File([b], "dropped", { type: b.type })))
        .catch(() => showAlert("err", "Could not read that dropped image."));
      return;
    }
    if (link && takeUrl(link.trim())) return;
    showAlert("err", "Drop an image file (PNG, JPG, WEBP or GIF).");
  });

  /* Paste a screenshot / copied image while the panel is open. */
  document.addEventListener("paste", (e) => {
    const panel = $('[data-crm-panel="achievements"]');
    if (!panel || panel.hidden) return;
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = items.find((it) => it.kind === "file" && /^image\//.test(it.type));
    if (img) {
      e.preventDefault();
      takeFile(img.getAsFile());
    }
  });

  $("#achClear").addEventListener("click", (e) => {
    e.stopPropagation();
    if (draft.source === "link") {
      draft.url = "";
      $("#achUrl").value = "";
    } else {
      draft.dataUrl = "";
    }
    draft.imageChanged = true;
    paintAchPreview();
  });

  const urlInput = $("#achUrl");
  $("#achUrlUse").addEventListener("click", () => takeUrl(urlInput.value.trim()));
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      takeUrl(urlInput.value.trim());
    }
  });
  $("#achPreview").addEventListener("error", () => {
    if (draft.source === "link" && draft.url) setState("#achState", "Preview failed to load — the link may be private or not a direct image.", "err");
  });

  $("#achNew").addEventListener("click", () => {
    resetComposer();
    form.scrollIntoView({ block: "start", behavior: "smooth" });
    form.elements.caption.focus();
  });
  $("#achCancel").addEventListener("click", resetComposer);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#achSubmit");
    const caption = String(form.elements.caption.value || "").trim();
    const title = String(form.elements.title.value || "").trim();
    const tag = String(form.elements.tag.value || "").trim();
    const date = String(form.elements.date.value || "").trim();
    const published = form.elements.published.checked;

    if (draft.source === "link" && urlInput.value.trim() && urlInput.value.trim() !== draft.url) {
      if (!takeUrl(urlInput.value.trim())) return;
    }
    const hasImage = draft.source === "link" ? Boolean(safeImageUrl(draft.url)) : Boolean(safeDataImage(draft.dataUrl));
    if (!hasImage) {
      setState("#achState", draft.source === "link" ? "Attach a picture link first." : "Drop or choose a picture first.", "err");
      return showAlert("err", "Every achievement post needs a picture.");
    }
    if (!caption) {
      form.elements.caption.focus();
      setState("#achState", "Write a caption.", "err");
      return showAlert("err", "Add a caption — it is shown under the picture.");
    }

    const editing = draft.editingId ? state.achievements.find((a) => a.id === draft.editingId) : null;
    const id = editing ? editing.id : uid();
    const orders = state.achievements.map((a) => Number(a.order)).filter((n) => isFinite(n));
    const meta = {
      caption,
      title,
      tag,
      date,
      published,
      imageSource: draft.source,
      order: editing ? Number(editing.order) || 0 : (orders.length ? Math.min.apply(null, orders) : 1) - 1,
      createdAt: editing ? editing.createdAt || Date.now() : Date.now(),
      updatedAt: Date.now(),
      createdBy: editing ? editing.createdBy || "" : (state.user && state.user.email) || "admin"
    };
    if (draft.source === "link") meta.imageUrl = draft.url;
    else if (draft.width) {
      meta.width = draft.width;
      meta.height = draft.height;
    }

    const updates = { [`achievements/${id}`]: meta };
    if (draft.source === "upload") {
      if (!editing || draft.imageChanged || editing.imageSource !== "upload") updates[`achievementImages/${id}`] = draft.dataUrl;
    } else {
      updates[`achievementImages/${id}`] = null;
    }

    await withBusy(btn, editing ? "Updating…" : "Publishing…", async () => {
      try {
        await dbUpdate("site", updates);
        showAlert("ok", editing ? "Post updated." : published ? "Achievement published on the website." : "Saved as hidden post.");
        resetComposer();
        await loadAchievements();
      } catch (err) {
        setState("#achState", "Save failed", "err");
        showAlert("err", friendlyError(err));
      }
    });
  });

  $("#achList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ach-act]");
    if (!btn) return;
    const row = btn.closest("[data-id]");
    const id = row && row.dataset.id;
    const i = state.achievements.findIndex((a) => a.id === id);
    if (i < 0) return;
    const a = state.achievements[i];
    const act = btn.dataset.achAct;
    try {
      if (act === "edit") return editAchievement(id);
      btn.disabled = true;
      if (act === "toggle") {
        await dbUpdate(`site/achievements/${id}`, { published: a.published === false, updatedAt: Date.now() });
        showAlert("ok", a.published === false ? "Post is visible again." : "Post hidden from the website.");
      } else if (act === "delete") {
        if (!confirm("Delete this achievement post and its picture?")) {
          btn.disabled = false;
          return;
        }
        await dbUpdate("site", { [`achievements/${id}`]: null, [`achievementImages/${id}`]: null });
        if (draft.editingId === id) resetComposer();
        showAlert("ok", "Post deleted.");
      } else if (act === "up" || act === "down") {
        const j = act === "up" ? i - 1 : i + 1;
        const b = state.achievements[j];
        if (!b) return;
        /* Normalise order to the current list position, then swap. */
        const upd = {};
        state.achievements.forEach((x, k) => (upd[`${x.id}/order`] = k));
        upd[`${a.id}/order`] = j;
        upd[`${b.id}/order`] = i;
        await dbUpdate("site/achievements", upd);
      }
      await loadAchievements();
    } catch (err) {
      btn.disabled = false;
      showAlert("err", friendlyError(err));
    }
  });
}

/* ---------------- students ---------------- */

function paintStudentsTable() {
  const body = $("#studentsBody");
  if (!body) return;
  if (!state.students.length) {
    body.innerHTML = '<tr><td colspan="7" class="crm-table-empty">No student accounts yet. They appear here as soon as someone signs up.</td></tr>';
    return;
  }
  body.innerHTML = state.students
    .map((s) => {
      const m = state.members[s.id];
      const st = membershipStatus(m);
      const plan = m && m.planId ? `${esc(m.planName || "Plan")}<br><span class="crm-pill crm-pill--${st.key}">${esc(st.label)}</span>` : '<span class="muted">—</span>';
      return (
        `<tr><td><b>${esc(s.name || "—")}</b></td>` +
        `<td class="muted">${esc(s.email || "—")}</td>` +
        `<td class="muted">${esc(s.phone || "—")}</td>` +
        `<td>${esc(s.exam || "—")}</td>` +
        `<td>${plan}</td>` +
        `<td class="muted">${formatDate(s.createdAt)}</td>` +
        `<td class="actions"><button class="crm-mini" type="button" data-assign="${esc(s.id)}">${m && m.planId ? "Manage plan" : "Assign plan"}</button></td></tr>`
      );
    })
    .join("");
}

async function loadStudents(opts = {}) {
  const body = $("#studentsBody");
  if (body && !opts.silent) body.innerHTML = '<tr><td colspan="7" class="crm-table-empty">Loading students…</td></tr>';

  const snap = await dbGet("users").catch((err) => {
    console.warn("[admin] users read", err);
    return null;
  });

  const list = [];
  if (snap && snap.forEach) {
    snap.forEach((child) => {
      const value = child.val() || {};
      list.push({ id: child.key, ...value });
    });
  }
  state.students = list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  populateMemberSelects();
  paintStudentsTable();
  paintOverview();
}

function bindStudents() {
  const body = $("#studentsBody");
  if (!body) return;
  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-assign]");
    if (!btn) return;
    openTab("memberships");
    setTimeout(() => fillMemberForm(btn.dataset.assign), 50);
  });
}

/* ---------------- leads ---------------- */

async function loadLeads() {
  const body = $("#leadsBody");
  if (body) body.innerHTML = '<tr><td colspan="5" class="crm-table-empty">Loading leads…</td></tr>';

  const snap = await dbGet("site/leads").catch((err) => {
    console.warn("[admin] leads read", err);
    return null;
  });

  const list = [];
  if (snap && snap.forEach) {
    snap.forEach((child) => {
      const value = child.val() || {};
      list.push({ id: child.key, email: value.email || "", plan: value.plan || "", source: value.source || "", at: value.at || 0 });
    });
  }
  state.leads = list.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

  if (!body) return;
  if (!state.leads.length) {
    body.innerHTML = '<tr><td colspan="5" class="crm-table-empty">No leads captured yet.</td></tr>';
    paintOverview();
    return;
  }

  body.innerHTML = state.leads
    .map(
      (lead) =>
        `<tr><td><b>${esc(lead.email)}</b></td>` +
        `<td>${lead.plan ? `<span class="crm-pill crm-pill--active">${esc(lead.plan)}</span>` : '<span class="muted">—</span>'}</td>` +
        `<td class="muted">${esc(lead.source || "—")}</td>` +
        `<td class="muted">${formatDate(lead.at)}</td>` +
        `<td class="actions"><button class="crm-remove" type="button" data-lead="${esc(lead.id)}" aria-label="Delete lead">×</button></td></tr>`
    )
    .join("");
  paintOverview();
}

function bindLeads() {
  const body = $("#leadsBody");
  if (body) {
    body.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-lead]");
      if (!btn) return;
      const id = btn.dataset.lead;
      btn.disabled = true;
      try {
        await dbRemove(`site/leads/${id}`);
        state.leads = state.leads.filter((lead) => lead.id !== id);
        showAlert("ok", "Lead removed.");
        await loadLeads();
      } catch (err) {
        btn.disabled = false;
        showAlert("err", friendlyError(err));
      }
    });
  }

  const exportBtn = $("#leadsExport");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!state.leads.length) {
        showAlert("err", "There are no leads to export yet.");
        return;
      }
      const rows = [["Email", "Plan enquiry", "Source", "Captured"]].concat(
        state.leads.map((l) => [l.email, l.plan, l.source, formatDate(l.at)])
      );
      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell == null ? "" : cell).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fenxtek-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const refresh = $("#leadsRefresh");
  if (refresh) refresh.addEventListener("click", loadLeads);
}

/* ---------------- overview ---------------- */

function paintOverview() {
  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };
  set("#statBatches", state.batches.length);
  set("#statFees", state.fees.length);
  set("#statFaqs", state.faqs.length);
  set("#statTestimonials", state.testimonials.length);
  set("#statStudents", state.students.length);
  set("#statLeads", state.leads.length);
  set("#statPlans", state.memberships.filter((p) => p.active !== false).length);
  set("#statMembers", Object.keys(state.members).filter((k) => membershipStatus(state.members[k]).key === "active").length);
  set("#statAchievements", state.achievements.length);
  set("#statEnquiries", state.leads.filter((l) => l.plan).length);
  set("#statPrice", state.content.price ? "₹" + state.content.price : "—");
  set("#statAnnounce", state.content.announcement ? "Live" : "—");

  const announce = $("#overviewAnnounce");
  const announceText = $("#overviewAnnounceText");
  if (announce) announce.textContent = state.content.announcement ? "Published to dashboards" : "No announcement yet";
  if (announceText) {
    announceText.textContent = state.content.announcement
      ? state.content.announcement
      : "Open “Site content” to publish a message to every student dashboard.";
  }

  const config = $("#checkConfig");
  if (config) config.textContent = configured ? "Done" : "Missing";
}

/* ---------------- seed ---------------- */

function keyed(list) {
  const out = {};
  list.forEach((item, i) => {
    out["s" + (i + 1)] = { ...item, id: "s" + (i + 1), order: item.order || i + 1 };
  });
  return out;
}

async function seedAll() {
  if (
    !confirm(
      "Replace the live site content, batches, fees, membership plans, FAQs and testimonials with the starter content?\n\nAchievement posts, student memberships, students and leads are NOT touched."
    )
  )
    return;
  try {
    await dbSet("site/content", { ...defaultContent, updatedAt: Date.now() });
    await dbSet("site/batches", keyed(defaultBatches));
    await dbSet("site/fees", keyed(defaultFees));
    await dbSet("site/memberships", keyed(defaultMemberships));
    await dbSet("site/faqs", keyed(defaultFaqs));
    await dbSet("site/testimonials", keyed(defaultTestimonials));
    showAlert("ok", "Starter content published. Every page now reads from the database.");
    await loadAll();
  } catch (err) {
    showAlert("err", friendlyError(err));
  }
}

/* ---------------- boot ---------------- */

async function loadAll() {
  await Promise.all([
    loadContent(),
    loadEditor("batches"),
    loadEditor("fees"),
    loadEditor("memberships"),
    loadEditor("faqs"),
    loadEditor("testimonials"),
    loadStudents(),
    loadLeads(),
    loadAchievements()
  ]);
  await loadMembers();
  paintOverview();
}

async function init() {
  if (!configured) {
    showDenied(
      "Firebase not configured",
      "Add your apiKey, projectId and databaseURL to assets/js/firebase-config.js, enable Email/Password and Google sign-in, then deploy database.rules.json.",
      "Open sign in",
      "auth.html"
    );
    return;
  }

  const user = await waitForUser();
  if (!user) {
    location.replace("auth.html?next=" + encodeURIComponent("admin.html"));
    return;
  }
  state.user = user;

  const admin = await isAdmin(user).catch(() => false);
  if (!admin && isAdminEmail(user) && !user.emailVerified) {
    const sent = await sendVerification().then(() => true).catch(() => false);
    showDenied(
      "Verify your admin email",
      `${user.email} is the admin account, but its email isn’t verified yet. ` +
        (sent ? "We just sent a verification link to that inbox — open it, then reload this page. " : "Reload this page in a minute to get a verification link. ") +
        "Or sign out and use “Continue with Google” with the same Gmail — it’s verified instantly.",
      "Reload",
      "admin.html"
    );
    return;
  }
  if (!admin) {
    showDenied(
      "No admin access",
      `You are signed in as ${user.email || "this account"}, but it is not an admin. Sign in with the admin Gmail, or add this uid to admins/${user.uid} in Realtime Database.`,
      "Go to dashboard",
      "dashboard.html"
    );
    return;
  }

  const email = $("#crmEmail");
  if (email) email.textContent = user.email || "admin";

  const loading = $("#crmLoading");
  const body = $("#crmBody");
  const denied = $("#crmDenied");

  unlocked = true;
  if (loading) loading.hidden = true;
  if (denied) denied.hidden = true;
  if (body) body.hidden = false;

  const portal = document.getElementById("portalLink");
  if (portal) {
    portal.setAttribute("href", "admin.html");
    const label = portal.querySelector("span");
    if (label) label.textContent = "CRM";
  }
  const menuLink = document.querySelector('.menu-list a[href="auth.html"]');
  if (menuLink) {
    menuLink.setAttribute("href", "admin.html");
    const label = menuLink.querySelector("span");
    if (label) label.textContent = "Admin CRM";
  }

  bindTabs();
  bindContentForm();
  Object.keys(EDITORS).forEach(bindEditor);
  bindMembers();
  bindAchievements();
  bindStudents();
  bindLeads();
  paintOverview();

  /* Store: orders, courses, coupons, payment settings (admin-store.js) */
  try {
    initStore({ user, showAlert, withBusy, setState });
  } catch (err) {
    console.warn("[admin] store init", err);
  }
  try {
    initRewards({ user, showAlert, withBusy });
  } catch (err) {
    console.warn("[admin] rewards init", err);
  }

  /* Deep links: admin.html#achievements opens that tab. */
  const hash = location.hash.replace("#", "");
  if (hash && $(`[data-crm-panel="${hash}"]`)) openTab(hash);

  const signOut = async () => {
    try {
      await signOutUser();
    } finally {
      location.replace("index.html");
    }
  };
  ["#crmSignOut", "#crmSignOut2"].forEach((sel) => {
    const btn = $(sel);
    if (btn) btn.addEventListener("click", signOut);
  });

  const seedBtn = $("#seedBtn");
  if (seedBtn) seedBtn.addEventListener("click", seedAll);

  const refresh = $("#refreshStats");
  if (refresh) refresh.addEventListener("click", loadAll);

  const studentsRefresh = $("#studentsRefresh");
  if (studentsRefresh) studentsRefresh.addEventListener("click", () => loadStudents().then(loadMembers));

  /* Never let a data hiccup tear down the whole CRM. */
  try {
    await loadAll();
  } catch (err) {
    console.warn("[admin] initial load", err);
    showAlert(
      "err",
      "Some sections couldn’t load from Realtime Database. Check the rules, then press Refresh. " +
        ((err && (err.code || err.message)) || "")
    );
  }
}

init().catch((err) => {
  console.error("[admin]", err);
  showDenied(
    "Couldn’t open the CRM",
    "Check your connection and the Realtime Database rules, then refresh the page. " +
      ((err && (err.code || err.message)) || ""),
    "Back to site",
    "index.html"
  );
});
