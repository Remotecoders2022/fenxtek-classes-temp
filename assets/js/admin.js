/* ============================================================
   FENXTEK — admin CRM
   Guarded editor for site content, collections, students, leads.
   ============================================================ */

import {
  configured,
  waitForUser,
  signOutUser,
  isAdmin,
  dbGet,
  dbSet,
  dbRemove,
  toList,
  friendlyError
} from "./firebase.js?v=3";

import {
  defaultContent,
  defaultBatches,
  defaultFees,
  defaultFaqs,
  defaultTestimonials
} from "./cms-defaults.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pad = (n) => String(n).padStart(2, "0");
const uid = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const state = {
  user: null,
  content: {},
  batches: [],
  fees: [],
  faqs: [],
  testimonials: [],
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

/* ---------------- tabs ---------------- */

function bindTabs() {
  $$("[data-crm-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.crmTab;
      $$("[data-crm-tab]").forEach((b) => b.setAttribute("aria-current", String(b === btn)));
      $$("[data-crm-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.crmPanel !== name;
      });
      if (name === "students") loadStudents();
      if (name === "leads") loadLeads();
      if (name === "overview") paintOverview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
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

    const old = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await dbSet("site/content", payload);
      state.content = payload;
      setState("#contentState", "Saved · live on the site", "ok");
      showAlert("ok", "Site content saved. Public pages update in real time.");
      paintOverview();
    } catch (err) {
      setState("#contentState", "Save failed", "err");
      showAlert("err", friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
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
          <b>${spec.noun} ${pad(i + 1)}</b>
          <button class="crm-remove" type="button" data-remove="${i}" aria-label="Remove ${spec.noun.toLowerCase()} ${i + 1}">×</button>
        </div>
        <div class="crm-form">
          ${spec.fields
            .map((f) => {
              const value = item[f.key] == null ? "" : item[f.key];
              const label = `<span class="p-label">${esc(f.label)}</span>`;
              const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
              const control =
                f.type === "textarea"
                  ? `<textarea class="p-textarea" data-field="${f.key}" rows="${f.rows || 3}"${ph}>${esc(value)}</textarea>`
                  : `<input class="p-input" type="${f.type || "text"}" data-field="${f.key}" value="${esc(value)}"${ph}>`;
              const preview =
                f.key === "banner" && value
                  ? `<span class="crm-banner-preview"><img src="${esc(value)}" alt="Banner preview" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.dataset.bad='1'"><em>Preview unavailable — check the link</em></span>`
                  : "";
              return `<label class="p-field${f.wide ? " p-field--wide" : ""}">${label}${control}${preview}</label>`;
            })
            .join("")}
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

  wrap.addEventListener("input", (e) => {
    const field = e.target.dataset ? e.target.dataset.field : "";
    const itemEl = e.target.closest(".crm-item");
    if (!field || !itemEl) return;
    const idx = Number(itemEl.dataset.idx);
    const def = spec.fields.find((f) => f.key === field);
    if (!state[spec.key][idx]) return;
    state[spec.key][idx][field] =
      def && def.type === "number"
        ? e.target.value === ""
          ? ""
          : Number(e.target.value)
        : e.target.value;
    setDirty(kind);
  });

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
    saveBtn.addEventListener("click", async () => {
      const old = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        const payload = {};
        state[spec.key].forEach((item, i) => {
          if (!item.id) item.id = uid();
          item.order = item.order === "" || item.order == null ? i + 1 : Number(item.order);
          payload[item.id] = { ...item };
        });
        await dbSet(spec.path, payload);
        setState(spec.state, "Saved · live on the site", "ok");
        showAlert("ok", `${spec.noun}s saved. The public pages are updated.`);
        paintOverview();
      } catch (err) {
        setState(spec.state, "Save failed", "err");
        showAlert("err", friendlyError(err));
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = old;
      }
    });
  }
}

/* ---------------- students ---------------- */

async function loadStudents() {
  const body = $("#studentsBody");
  if (body) body.innerHTML = '<tr><td colspan="5" class="crm-table-empty">Loading students…</td></tr>';

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

  if (!body) return;
  if (!state.students.length) {
    body.innerHTML = '<tr><td colspan="5" class="crm-table-empty">No student accounts yet. They appear here as soon as someone signs up.</td></tr>';
    paintOverview();
    return;
  }

  body.innerHTML = state.students
    .map(
      (s) =>
        `<tr><td><b>${esc(s.name || "—")}</b></td>` +
        `<td class="muted">${esc(s.email || "—")}</td>` +
        `<td class="muted">${esc(s.phone || "—")}</td>` +
        `<td>${esc(s.exam || "—")}</td>` +
        `<td class="muted">${formatDate(s.createdAt)}</td></tr>`
    )
    .join("");
  paintOverview();
}

/* ---------------- leads ---------------- */

async function loadLeads() {
  const body = $("#leadsBody");
  if (body) body.innerHTML = '<tr><td colspan="4" class="crm-table-empty">Loading leads…</td></tr>';

  const snap = await dbGet("site/leads").catch((err) => {
    console.warn("[admin] leads read", err);
    return null;
  });

  const list = [];
  if (snap && snap.forEach) {
    snap.forEach((child) => {
      const value = child.val() || {};
      list.push({ id: child.key, email: value.email || "", source: value.source || "", at: value.at || 0 });
    });
  }
  state.leads = list.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

  if (!body) return;
  if (!state.leads.length) {
    body.innerHTML = '<tr><td colspan="4" class="crm-table-empty">No leads captured yet.</td></tr>';
    paintOverview();
    return;
  }

  body.innerHTML = state.leads
    .map(
      (lead) =>
        `<tr><td><b>${esc(lead.email)}</b></td>` +
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
      const rows = [["Email", "Source", "Captured"]].concat(
        state.leads.map((l) => [l.email, l.source, formatDate(l.at)])
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
  if (!confirm("Replace the live content and all collections with the starter content from this website?")) return;
  try {
    await dbSet("site/content", { ...defaultContent, updatedAt: Date.now() });
    await dbSet("site/batches", keyed(defaultBatches));
    await dbSet("site/fees", keyed(defaultFees));
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
  await Promise.all([loadContent(), loadEditor("batches"), loadEditor("fees"), loadEditor("faqs"), loadEditor("testimonials"), loadStudents(), loadLeads()]);
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
  bindLeads();
  paintOverview();

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
  if (studentsRefresh) studentsRefresh.addEventListener("click", loadStudents);

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
