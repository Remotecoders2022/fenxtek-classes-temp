/* ============================================================
   FENXTEK — admin CRM: EMI & part payments
   Every instalment plan built from orders: who is on track, due soon,
   overdue or paused, how much has been collected and what is still
   outstanding. Remind students in their bell (one or all overdue) or
   on WhatsApp.
   ============================================================ */
import { dbWatch, dbUpdateRoot, friendlyError } from "./firebase.js?v=5";
import { PATH, esc, money, num, formatDate, flattenOrders, coursesFrom } from "./commerce.js?v=5";
import { emiPlans, EMI_STATE, DAY } from "./emi.js?v=1";
import { noticeUpdates } from "./notices.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;

const E = { ctx: null, orders: [], plans: [], courses: {}, filter: "active", q: "", ready: false, reminded: new Map() };

export function initEmi(ctx) {
  E.ctx = ctx;
  const panel = $('[data-crm-panel="emi"]');
  if (!panel) return;
  dbWatch(PATH.orders, (v) => {
    E.orders = flattenOrders(v);
    E.ready = true;
    rebuild();
  });
  dbWatch(PATH.courses, (v) => {
    E.courses = {};
    coursesFrom(v, { all: true }).forEach((c) => (E.courses[c.id] = c));
    paint();
  });
  setInterval(() => {
    rebuild();
  }, 5 * 60000);
  panel.addEventListener("click", onClick);
  const q = $("#emQ");
  if (q) q.addEventListener("input", (e) => ((E.q = e.target.value), paintTable()));
}

export function emiTabOpened(name) {
  if (name === "emi") rebuild();
}

function rebuild() {
  E.plans = emiPlans(E.orders);
  paint();
}

const titleOf = (p) => (E.courses[p.courseId] && E.courses[p.courseId].title) || p.title || p.courseId;
const isActive = (p) => !p.done;

function paint() {
  paintStats();
  paintChips();
  paintTable();
  const badge = $('[data-crm-tab="emi"] .crm-badge');
  const late = E.plans.filter((p) => p.state === "overdue" || p.state === "locked").length;
  if (badge) badge.textContent = late ? `${late} late` : "";
}

function paintStats() {
  const box = $("#emStats");
  if (!box) return;
  const active = E.plans.filter(isActive);
  const week = active.filter((p) => !p.pending && p.paidN && p.dueAt - Date.now() <= 7 * DAY && p.dueAt >= Date.now()).length;
  const late = active.filter((p) => p.state === "overdue" || p.state === "locked");
  const collected = E.plans.reduce((t, p) => t + p.paidAmount, 0);
  const outstanding = active.reduce((t, p) => t + p.left, 0);
  const stat = (b, s, tone = "") => `<div class="crm-stat${tone ? ` crm-stat--${tone}` : ""}"><b>${esc(b)}</b><span>${esc(s)}</span></div>`;
  box.innerHTML =
    stat(String(active.length), "Active EMI plans") +
    stat(String(E.plans.filter((p) => p.done).length), "Fully paid plans") +
    stat(String(week), "Due in the next 7 days") +
    stat(String(late.length), "Overdue / paused", late.length ? "warn" : "") +
    stat(money(collected), "Collected via EMI") +
    stat(money(outstanding), "Still to collect");
}

const FILTERS = [
  ["active", "Active"],
  ["due", "Due soon"],
  ["late", "Overdue & paused"],
  ["pending", "Verifying"],
  ["done", "Fully paid"],
  ["all", "All"]
];
function matches(p) {
  const f = E.filter;
  if (f === "active" && p.done) return false;
  if (f === "due" && p.state !== "due") return false;
  if (f === "late" && p.state !== "overdue" && p.state !== "locked") return false;
  if (f === "pending" && p.state !== "pending") return false;
  if (f === "done" && !p.done) return false;
  const q = E.q.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.email, p.phone, titleOf(p), ...Object.values(p.parts).map((x) => x.order.orderNo)].join(" ").toLowerCase().includes(q);
}

function paintChips() {
  const box = $("#emChips");
  if (!box) return;
  const count = (f) => E.plans.filter((p) => ((E.filter = f), matches(p))).length;
  const cur = E.filter;
  const q = E.q;
  E.q = "";
  const counts = FILTERS.map(([f]) => count(f));
  E.filter = cur;
  E.q = q;
  box.innerHTML = FILTERS.map(([f, l], i) => `<button type="button" class="em-chip${f === cur ? " is-on" : ""}" data-em-filter="${f}">${esc(l)}<b>${counts[i]}</b></button>`).join("");
}

function dots(p) {
  return `<span class="em-dots">${p.amounts
    .map((a, i) => {
      const part = p.parts[i + 1];
      const cls = part && part.status === "paid" ? "is-paid" : part && part.status === "pending" ? "is-pending" : i + 1 === p.nextN ? `is-next is-${p.state}` : "";
      return `<i class="${cls}" title="Part ${i + 1}: ${money(a)}${part ? ` · ${part.status}` : ""}"></i>`;
    })
    .join("")}</span>`;
}

function paintTable() {
  const body = $("#emBody");
  if (!body) return;
  if (!E.ready) return;
  const list = E.plans.filter(matches).sort((a, b) => (a.done - b.done) || (a.dueAt || 0) - (b.dueAt || 0));
  const count = $("#emCount");
  if (count) count.textContent = `${list.length} of ${E.plans.length} plans`;
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="crm-table-empty">${E.plans.length ? "No plans match this filter." : "No EMI plans yet. Turn on “Pay in parts” in a course (Courses → Edit) and students will see it on the course page."}</td></tr>`;
    return;
  }
  body.innerHTML = list
    .map((p) => {
      const st = EMI_STATE[p.state] || EMI_STATE.ok;
      const tone = st.tone === "ok" ? "ok" : st.tone === "err" ? "err" : "warn";
      let next = "—";
      if (p.done) next = `<span class="as-sub">Completed</span>`;
      else if (p.pending || !p.paidN) next = `Part ${p.nextN} · ${money(p.nextAmount)}<div class="as-sub">Waiting for your approval in Orders</div>`;
      else
        next =
          `<b>${money(p.nextAmount)}</b> · part ${p.nextN}<div class="as-sub">Due ${esc(formatDate(p.dueAt))}${p.state === "overdue" ? ` · access ends ${esc(formatDate(p.accessUntil))}` : p.state === "locked" ? ` · paused since ${esc(formatDate(p.accessUntil))}` : p.daysToDue >= 0 ? ` · in ${p.daysToDue} d` : ""}</div>`;
      const last = E.reminded.get(p.key);
      const canRemind = !p.done && !p.pending && p.paidN;
      const wa = p.phone ? waLink(p) : "";
      return (
        `<tr>` +
        `<td><b>${esc(p.name || "Student")}</b><div class="as-sub">${esc(p.email)}${p.phone ? ` · ${esc(p.phone)}` : ""}</div></td>` +
        `<td><b>${esc(titleOf(p))}</b><div class="as-sub">Started ${esc(formatDate(p.start))} · every ${p.gap} days</div></td>` +
        `<td>${dots(p)}<div class="as-sub">${p.paidN}/${p.of} paid · ${money(p.paidAmount)} of ${money(p.total)}</div></td>` +
        `<td>${next}</td>` +
        `<td><span class="as-pill as-pill--${tone}">${esc(st.label)}</span></td>` +
        `<td class="actions"><div class="as-row-acts">` +
        (canRemind ? `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-em-remind="${esc(p.key)}" title="${last ? `Reminded ${new Date(last).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Send a reminder to the student’s bell"}">${icon("i-bell")}<span>${last ? "Reminded" : "Remind"}</span></button>` : "") +
        (wa ? `<a class="as-icon" href="${esc(wa)}" target="_blank" rel="noopener" title="WhatsApp the student">${icon("i-wa")}</a>` : "") +
        `</div></td>` +
        `</tr>`
      );
    })
    .join("");
}

function waLink(p) {
  const digits = String(p.phone).replace(/\D/g, "");
  const ph = digits.length === 10 ? "91" + digits : digits;
  if (ph.length < 11) return "";
  const msg = p.done
    ? `Hi ${p.name || ""}, thank you for completing your instalments for ${titleOf(p)}! — FenxTek`
    : `Hi ${p.name || ""}, a gentle reminder from FenxTek: part ${p.nextN} of ${p.of} (${money(p.nextAmount)}) for ${titleOf(p)} is due on ${formatDate(p.dueAt)}. You can pay from your portal → Orders. Thank you!`;
  return `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
}

function reminderFor(p) {
  const t = titleOf(p);
  if (p.state === "locked") return { title: "Your course access is paused", body: `Part ${p.nextN} of ${p.of} (${money(p.nextAmount)}) for ${t} was due on ${formatDate(p.dueAt)}. Pay now to unlock it again.`, link: `#course/${p.courseId}`, kind: "emi" };
  if (p.state === "overdue") return { title: `Instalment overdue — ${money(p.nextAmount)}`, body: `Part ${p.nextN} of ${p.of} for ${t} was due on ${formatDate(p.dueAt)}. Pay before ${formatDate(p.accessUntil)} to keep your access.`, link: `#course/${p.courseId}`, kind: "emi" };
  return { title: `Instalment due ${formatDate(p.dueAt)}`, body: `Part ${p.nextN} of ${p.of} for ${t} — ${money(p.nextAmount)}. Pay from Orders or the course page.`, link: `#course/${p.courseId}`, kind: "emi" };
}

async function remind(plans, btn) {
  const go = async () => {
    const now = Date.now();
    const updates = {};
    for (const p of plans) Object.assign(updates, await noticeUpdates(p.uid, reminderFor(p), now));
    if (!Object.keys(updates).length) return;
    await dbUpdateRoot(updates);
    plans.forEach((p) => E.reminded.set(p.key, now));
    E.ctx.showAlert("ok", plans.length === 1 ? `Reminder sent to ${plans[0].name || "the student"}.` : `Reminders sent to ${plans.length} students.`);
    paintTable();
  };
  try {
    if (btn && E.ctx.withBusy) await E.ctx.withBusy(btn, "Sending…", go);
    else await go();
  } catch (err) {
    E.ctx.showAlert("err", friendlyError(err));
  }
}

function onClick(e) {
  const f = e.target.closest("[data-em-filter]");
  if (f) {
    E.filter = f.dataset.emFilter;
    paintChips();
    paintTable();
    return;
  }
  const r = e.target.closest("[data-em-remind]");
  if (r) {
    const p = E.plans.find((x) => x.key === r.dataset.emRemind);
    if (p) remind([p], r);
    return;
  }
  if (e.target.closest("#emRemindAll")) {
    const late = E.plans.filter((p) => !p.done && !p.pending && p.paidN && (p.state === "overdue" || p.state === "locked" || p.state === "due"));
    if (!late.length) return E.ctx.showAlert("ok", "Nobody is due or overdue right now. 🎉");
    if (!window.confirm(`Send a bell reminder to ${late.length} student${late.length === 1 ? "" : "s"} who are due soon, overdue or paused?`)) return;
    remind(late, e.target.closest("#emRemindAll"));
  }
}
