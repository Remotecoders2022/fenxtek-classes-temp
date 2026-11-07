/* ============================================================
   FENXTEK — admin CRM: notifications
   Compose an announcement for the students' bell (title, message,
   link, icon), choose who gets it (everyone / members / buyers /
   students of one course / one student) and when it expires.
   Shows a live preview and the list of sent announcements.
   Payment approvals, rejections, refunds and EMI reminders are sent
   automatically by the Orders and EMI tabs.
   ============================================================ */
import { dbGet, dbWatch, dbSet, dbRemove, dbKey, dbUpdateRoot, friendlyError } from "./firebase.js?v=5";
import { PATH, esc, coursesFrom } from "./commerce.js?v=5";
import { BROADCAST_PATH, NOTIF_KIND_ICON, noticeRecord, noticeUpdates, cleanLink, audienceLabel, timeAgo } from "./notices.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const DAY = 86400000;

const M = { ctx: null, list: [], courses: [], users: null, ready: false };

const ROUTES = [
  ["", "No link"],
  ["#store", "Course store"],
  ["#my-courses", "My courses"],
  ["#orders", "Orders & receipts"],
  ["#membership", "Membership"],
  ["#rewards", "Refer & earn"],
  ["#cart", "Cart"],
  ["course", "A course page…"],
  ["url", "Website link (https://)…"]
];
const KINDS = [
  ["info", "Update"],
  ["offer", "Offer"],
  ["class", "Class"],
  ["alert", "Important"]
];

export function initNotifyAdmin(ctx) {
  M.ctx = ctx;
  const form = $("#ntForm");
  if (!form) return;
  form.innerHTML = formHTML();
  dbWatch(BROADCAST_PATH, (v) => {
    M.list = Object.entries(v || {})
      .filter(([, n]) => n && typeof n === "object")
      .map(([id, n]) => ({ ...n, id }))
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
    M.ready = true;
    paintList();
  });
  dbWatch(PATH.courses, (v) => {
    M.courses = coursesFrom(v, { all: true });
    const opts = M.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
    ["ntCourse", "ntAudCourse"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) {
        const cur = sel.value;
        sel.innerHTML = opts || `<option value="">No courses yet</option>`;
        if (cur) sel.value = cur;
      }
    });
    paintPreview();
  });
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(form.querySelector('button[type="submit"]'));
  });
  $("#ntList").addEventListener("click", onListClick);
  sync();
}

export function notifyTabOpened(name) {
  if (name === "notify") paintList();
}

function formHTML() {
  return (
    `<label class="p-field p-field--wide"><span class="p-label">Title</span><input class="p-input" name="title" maxlength="120" placeholder="New batch starts Monday — seats filling fast" required></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Message</span><textarea class="p-textarea" name="body" rows="3" maxlength="500" placeholder="UPPCL Steno evening batch (6–8 PM) begins 10 Nov. Early-bird ₹200 off with code EARLY200 till Friday."></textarea><span class="p-hint" id="ntLen">0 / 500</span></label>` +
    `<div class="p-field p-field--wide"><span class="p-label">Icon</span><div class="as-seg nt-kinds">${KINDS.map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}"${i === 0 ? " checked" : ""}>${icon(NOTIF_KIND_ICON[k])}${esc(l)}</label>`).join("")}</div></div>` +
    `<label class="p-field"><span class="p-label">When tapped, open</span><select class="p-select" name="route">${ROUTES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label>` +
    `<label class="p-field" data-nt-when="course" hidden><span class="p-label">Course</span><select class="p-select" name="course" id="ntCourse"></select></label>` +
    `<label class="p-field" data-nt-when="url" hidden><span class="p-label">Link</span><input class="p-input" name="url" placeholder="https://t.me/fenxtekshorthand_classes"></label>` +
    `<label class="p-field"><span class="p-label">Send to</span><select class="p-select" name="audience"><option value="all">All students</option><option value="buyers">Students who bought any course</option><option value="course">Students of one course…</option><option value="members">Members (active plan)</option><option value="student">One student…</option></select></label>` +
    `<label class="p-field" data-nt-aud="course" hidden><span class="p-label">Students of</span><select class="p-select" name="audCourse" id="ntAudCourse"></select></label>` +
    `<label class="p-field" data-nt-aud="student" hidden><span class="p-label">Student email</span><input class="p-input" name="student" list="ntStudents" placeholder="student@gmail.com" autocomplete="off"><datalist id="ntStudents"></datalist><span class="p-hint" id="ntStudentHint">Goes only to this student’s bell.</span></label>` +
    `<label class="p-field" data-nt-exp><span class="p-label">Show for</span><select class="p-select" name="expires"><option value="0">Until I delete it</option><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label>` +
    `<div class="crm-actions p-field--wide"><span class="crm-save-state" id="ntState">Students see it in the bell instantly.</span><button class="p-btn p-btn--lime" type="submit">${icon("i-send")}<span>Send notification</span></button></div>`
  );
}

function read(form) {
  const f = form.elements;
  const route = f.route.value;
  let link = route;
  if (route === "course") link = f.course.value ? `#course/${f.course.value}` : "";
  if (route === "url") link = cleanLink(f.url.value);
  const aud = f.audience.value;
  return {
    title: f.title.value.trim(),
    body: f.body.value.trim(),
    kind: (form.querySelector('input[name="kind"]:checked') || {}).value || "info",
    link,
    route,
    audience: aud === "course" ? (f.audCourse.value ? `course:${f.audCourse.value}` : "") : aud,
    student: f.student.value.trim().toLowerCase(),
    expires: Number(f.expires.value) || 0
  };
}

function sync() {
  const form = $("#ntForm");
  const f = form.elements;
  form.querySelectorAll("[data-nt-when]").forEach((el) => (el.hidden = el.dataset.ntWhen !== f.route.value));
  form.querySelectorAll("[data-nt-aud]").forEach((el) => (el.hidden = el.dataset.ntAud !== f.audience.value));
  form.querySelector("[data-nt-exp]").hidden = f.audience.value === "student";
  $("#ntLen").textContent = `${f.body.value.length} / 500`;
  if (f.audience.value === "student") loadUsers();
  paintPreview();
}

async function loadUsers() {
  if (M.users) return;
  M.users = [];
  try {
    const snap = await dbGet("users");
    const v = (snap && snap.val && snap.val()) || {};
    M.users = Object.entries(v)
      .filter(([, u]) => u && u.email)
      .map(([uid, u]) => ({ uid, email: String(u.email).toLowerCase(), name: u.name || "" }));
    $("#ntStudents").innerHTML = M.users.map((u) => `<option value="${esc(u.email)}">${esc(u.name)}</option>`).join("");
  } catch (err) {
    console.warn("[admin-notify] users", err);
  }
}

function paintPreview() {
  const box = $("#ntPreview");
  const form = $("#ntForm");
  if (!box || !form) return;
  const d = read(form);
  const course = d.audience.startsWith("course:") ? M.courses.find((c) => c.id === d.audience.slice(7)) : null;
  const kind = NOTIF_KIND_ICON[d.kind] ? d.kind : "info";
  box.innerHTML =
    `<div class="nt-demo">` +
    `<div class="nt-demo-bar"><span>${icon("i-bell")}<b>1</b></span></div>` +
    `<div class="nt-demo-panel"><div class="nt-head"><div><span class="nt-k">Notifications</span><b>1 new</b></div></div>` +
    `<div class="nt-list"><div class="nt-item nt-item--${kind} is-new"><span class="nt-ic">${icon(NOTIF_KIND_ICON[kind])}</span><span class="nt-body"><b>${esc(d.title || "Your title appears here")}</b><span class="nt-text">${esc(d.body || "Write a short, clear message. Add a link so students can act on it in one tap.")}</span><small>${d.audience === "student" ? "For you" : "FenxTek academy"} · just now</small></span></div></div></div>` +
    `</div>` +
    `<p class="as-sub nt-demo-meta">${icon("i-users")}${esc(d.audience === "student" ? d.student || "One student" : audienceLabel(d.audience, course && course.title))}${d.link ? ` · opens ${esc(d.link)}` : ""}${d.audience !== "student" && d.expires ? ` · hides after ${d.expires} day${d.expires === 1 ? "" : "s"}` : ""}</p>`;
}

async function send(btn) {
  const form = $("#ntForm");
  const d = read(form);
  if (!d.title) return M.ctx.showAlert("err", "Give the notification a title.");
  if (d.route === "url" && !d.link) return M.ctx.showAlert("err", "Paste a full link starting with https://");
  if (d.route === "course" && !d.link) return M.ctx.showAlert("err", "Choose the course to open.");
  if (!d.audience) return M.ctx.showAlert("err", "Choose who should get it.");
  const by = (M.ctx.user && M.ctx.user.email) || "admin";
  await M.ctx.withBusy(btn, "Sending…", async () => {
    try {
      const now = Date.now();
      if (d.audience === "student") {
        await loadUsers();
        const u = (M.users || []).find((x) => x.email === d.student);
        if (!u) return M.ctx.showAlert("err", "No student with that email has signed up yet.");
        await dbUpdateRoot(await noticeUpdates(u.uid, d, now));
        M.ctx.showAlert("ok", `Sent to ${u.name || u.email}.`);
      } else {
        const id = await dbKey(BROADCAST_PATH);
        const rec = { ...noticeRecord(d, now), audience: d.audience, by };
        if (d.expires) rec.expiresAt = now + d.expires * DAY;
        await dbSet(`${BROADCAST_PATH}/${id}`, rec);
        M.ctx.showAlert("ok", `Sent to ${audienceLabel(d.audience, (M.courses.find((c) => `course:${c.id}` === d.audience) || {}).title).toLowerCase()} — it’s in their bell now.`);
      }
      form.elements.title.value = "";
      form.elements.body.value = "";
      sync();
    } catch (err) {
      M.ctx.showAlert("err", friendlyError(err));
    }
  });
}

function paintList() {
  const box = $("#ntList");
  if (!box) return;
  const badge = $('[data-crm-tab="notify"] .crm-badge');
  const now = Date.now();
  const live = M.list.filter((n) => !Number(n.expiresAt) || Number(n.expiresAt) > now);
  if (badge) badge.textContent = live.length ? `${live.length} live` : "";
  if (!M.ready) return;
  if (!M.list.length) {
    box.innerHTML = `<p class="crm-table-empty">Nothing sent yet. Your announcements will be listed here.</p>`;
    return;
  }
  box.innerHTML = M.list
    .slice(0, 100)
    .map((n) => {
      const exp = Number(n.expiresAt);
      const on = !exp || exp > now;
      const course = String(n.audience || "").startsWith("course:") ? M.courses.find((c) => c.id === String(n.audience).slice(7)) : null;
      const kind = NOTIF_KIND_ICON[n.kind] ? n.kind : "info";
      return (
        `<article class="nt-sent${on ? "" : " is-off"}">` +
        `<span class="nt-ic nt-item--${kind}">${icon(NOTIF_KIND_ICON[kind])}</span>` +
        `<div class="nt-sent-body"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ""}` +
        `<div class="nt-sent-meta"><span class="as-pill as-pill--violet">${esc(audienceLabel(n.audience, course && course.title))}</span><span class="as-pill as-pill--${on ? "ok" : "muted"}">${on ? (exp ? `Live till ${new Date(exp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Live") : "Expired"}</span>${n.link ? `<span class="as-sub">→ ${esc(n.link)}</span>` : ""}<span class="as-sub">${esc(timeAgo(n.at))}${n.by ? ` · ${esc(n.by)}` : ""}</span></div></div>` +
        `<button class="as-icon as-icon--danger" type="button" data-nt-del="${esc(n.id)}" title="Delete for everyone">${icon("i-trash")}</button>` +
        `</article>`
      );
    })
    .join("");
}

async function onListClick(e) {
  const del = e.target.closest("[data-nt-del]");
  if (!del) return;
  const n = M.list.find((x) => x.id === del.dataset.ntDel);
  if (!n || !window.confirm(`Delete “${n.title}”? It disappears from every student’s bell.`)) return;
  try {
    await dbRemove(`${BROADCAST_PATH}/${n.id}`);
    M.ctx.showAlert("ok", "Notification deleted.");
  } catch (err) {
    M.ctx.showAlert("err", friendlyError(err));
  }
}
