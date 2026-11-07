/* ============================================================
   FENXTEK — admin CRM: store
   Orders (approve / reject / refund / offline sale / receipts),
   Courses (catalogue + classroom links), Coupons (single + bulk
   generator, course-scoped, % or flat) and Payment settings.
   Mounted by admin.js after the admin gate unlocks.
   ============================================================ */

import { dbGet, dbSet, dbUpdate, dbWatch, dbUpdateRoot, dbKey, friendlyError } from "./firebase.js?v=5";
import { fileToDataImage, safeImageUrl, safeDataImage, prettyBytes } from "./media.js?v=2";
import {
  PATH,
  DAY,
  ACCENTS,
  COURSE_CATEGORIES,
  COURSE_MODES,
  COURSE_LANGUAGES,
  esc,
  money,
  num,
  offPercent,
  formatDate,
  validityLabel,
  coursesFrom,
  normalizeCourse,
  coverHTML,
  normalizeCode,
  generateCode,
  couponLabel,
  couponScopeIds,
  couponState,
  orderNumber,
  flattenOrders,
  statusOf,
  methodLabel,
  csvCell,
  downloadText,
  plansFrom,
  isPlanItem,
  memberRecordFor
} from "./commerce.js?v=2";
import { downloadReceipt, receiptDataURL } from "./receipt.js?v=2";
import { openContentManager, watchContent, contentCount, contentDeleteUpdates } from "./admin-content.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;

const A = {
  ctx: null,
  courses: [],
  coursesRaw: {},
  plans: [],
  pay: {},
  offers: {},
  coupons: {},
  usage: {},
  orders: [],
  users: null,
  fees: [],
  editing: null, // course id being edited ("" = new)
  draft: null,
  couponFilter: { q: "", status: "all", batch: "" },
  couponLimit: 200,
  orderFilter: { q: "", status: "all", method: "all", range: "all" },
  lastCodes: []
};

const alert = (kind, msg) => A.ctx && A.ctx.showAlert(kind, msg);
const busy = (btn, label, fn) => (A.ctx ? A.ctx.withBusy(btn, label, fn) : fn());
const today = () => new Date().toISOString().slice(0, 10);
const dateIn = (ms) => {
  if (!num(ms)) return "";
  const d = new Date(num(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateOut = (v, end) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return 0;
  const d = new Date(v + (end ? "T23:59:59" : "T00:00:00"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
};
const slug = (s) =>
  String(s || "course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "course";

function adminModal(title, html, onMount) {
  const wrap = document.createElement("div");
  wrap.className = "as-modal";
  wrap.innerHTML = `<div class="as-modal-box" role="dialog" aria-modal="true"><div class="as-modal-head"><h3>${esc(title)}</h3><button class="as-icon" type="button" data-x aria-label="Close">${icon("i-x")}</button></div>${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-x]")) close();
  });
  if (onMount) onMount(wrap.querySelector(".as-modal-box"), close);
  return close;
}

function receiptSettings() {
  return { ...A.pay };
}

/* ============================================================
   ORDERS
   ============================================================ */
function orderItems(o) {
  const items = o.items || {};
  return Array.isArray(items) ? items.filter(Boolean) : Object.keys(items).map((id) => ({ id, ...items[id] }));
}

function pill(o) {
  const s = statusOf(o.status);
  return `<span class="as-pill as-pill--${s.tone === "muted" ? "muted" : s.tone}">${esc(s.label)}</span>`;
}

function filteredOrders() {
  const f = A.orderFilter;
  const q = f.q.trim().toLowerCase();
  const since = f.range === "7" ? Date.now() - 7 * DAY : f.range === "30" ? Date.now() - 30 * DAY : f.range === "today" ? new Date(new Date().toDateString()).getTime() : 0;
  return A.orders.filter((o) => {
    if (f.status !== "all" && o.status !== f.status) return false;
    if (f.method !== "all" && o.method !== f.method) return false;
    if (since && num(o.createdAt) < since) return false;
    if (!q) return true;
    return [o.orderNo, o.name, o.email, o.phone, o.utr, o.paymentId, o.coupon && o.coupon.code, ...orderItems(o).map((i) => i.title)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

function paintOrderStats() {
  const box = $("#asOrderStats");
  if (!box) return;
  const paid = A.orders.filter((o) => o.status === "paid");
  const revenue = paid.reduce((s, o) => s + num(o.total), 0);
  const pending = A.orders.filter((o) => o.status === "pending").length;
  const unverified = paid.filter((o) => o.method === "razorpay" && !o.verified).length;
  const savings = paid.reduce((s, o) => s + num(o.discount), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const month = paid.filter((o) => num(o.paidAt || o.createdAt) >= monthStart).reduce((s, o) => s + num(o.total), 0);
  box.innerHTML =
    stat(money(revenue), "Revenue (all time)") +
    stat(money(month), "Revenue this month") +
    stat(String(paid.length), "Paid orders") +
    stat(String(pending), "Awaiting UPI check") +
    stat(String(unverified), "Razorpay to verify") +
    stat(paid.length ? money(revenue / paid.length) : "₹0", "Average order") +
    stat(money(savings), "Coupon discounts given") +
    stat(String(new Set(paid.map((o) => o.uid)).size), "Paying students");
  const badge = $('[data-crm-tab="orders"] span');
  if (badge) badge.textContent = pending ? `${pending} new` : "11";
}
const stat = (b, s) => `<div class="crm-stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`;

function paintOrders() {
  const body = $("#asOrdersBody");
  if (!body) return;
  paintOrderStats();
  const list = filteredOrders();
  const count = $("#asOrderCount");
  if (count) count.textContent = `${list.length} of ${A.orders.length} orders`;
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" class="crm-table-empty">${A.orders.length ? "No orders match these filters." : "No orders yet. They appear here the moment a student checks out."}</td></tr>`;
    return;
  }
  body.innerHTML = list
    .slice(0, 400)
    .map((o) => {
      const items = orderItems(o);
      const ref = o.paymentId || o.utr || "";
      const acts = [];
      acts.push(`<button class="as-icon" type="button" data-o-view="${esc(o.uid)}|${esc(o.id)}" title="View receipt">${icon("i-eye")}</button>`);
      if (o.status === "pending") {
        acts.push(`<button class="p-btn p-btn--lime p-btn--sm" type="button" data-o-approve="${esc(o.uid)}|${esc(o.id)}">${icon("i-check")}<span>Approve</span></button>`);
        acts.push(`<button class="as-icon as-icon--danger" type="button" data-o-reject="${esc(o.uid)}|${esc(o.id)}" title="Reject">${icon("i-x")}</button>`);
      }
      if (o.status === "paid" && !o.verified) acts.push(`<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-o-verify="${esc(o.uid)}|${esc(o.id)}">${icon("i-shield")}<span>Verify</span></button>`);
      if (o.status === "paid") acts.push(`<button class="as-icon" type="button" data-o-dl="${esc(o.uid)}|${esc(o.id)}" title="Download receipt">${icon("i-download")}</button>`);
      if (o.status === "paid") acts.push(`<button class="as-icon as-icon--danger" type="button" data-o-refund="${esc(o.uid)}|${esc(o.id)}" title="Mark refunded">${icon("i-refresh")}</button>`);
      return (
        `<tr>` +
        `<td><b class="as-code">${esc(o.orderNo || o.id)}</b><div class="as-sub">${esc(formatDate(o.createdAt, true))}</div></td>` +
        `<td><b>${esc(o.name || "—")}</b><div class="as-sub">${esc(o.email || "")}${o.phone ? " · " + esc(o.phone) : ""}</div></td>` +
        `<td>${items.map((i) => esc(i.title)).join("<br>")}</td>` +
        `<td><span class="as-amount">${money(o.total)}</span>${num(o.discount) ? `<div class="as-sub">${esc((o.coupon && o.coupon.code) || "Discount")} −${money(o.discount)}</div>` : ""}</td>` +
        `<td>${esc(methodLabel(o.method))}${ref ? `<div class="as-sub as-code">${esc(ref)}</div>` : ""}</td>` +
        `<td>${pill(o)}${o.status === "paid" ? `<div class="as-sub">${o.verified ? "Verified" : o.method === "razorpay" ? "Not verified" : ""}</div>` : ""}${o.rejectReason ? `<div class="as-sub">${esc(o.rejectReason)}</div>` : ""}</td>` +
        `<td class="actions"><div class="as-row-acts">${acts.join("")}</div></td>` +
        `</tr>`
      );
    })
    .join("");
}

const findOrder = (key) => {
  const [uid, id] = String(key).split("|");
  return A.orders.find((o) => o.uid === uid && o.id === id);
};

async function enrollmentUpdates(o, when) {
  const updates = {};
  const items = orderItems(o);
  const plan = items.find(isPlanItem);
  if (plan) {
    const ms = await dbGet(`${PATH.members}/${o.uid}`).catch(() => null);
    const prev = (ms && ms.val && ms.val()) || null;
    const rec = memberRecordFor({ ...plan, planId: plan.planId || String(plan.id).replace(/^plan_/, "") }, o, prev, when);
    if (items.length === 1) rec.paid = num(o.total);
    updates[`${PATH.members}/${o.uid}`] = rec;
  }
  const snap = await dbGet(`${PATH.enrollments}/${o.uid}`).catch(() => null);
  const current = (snap && snap.val && snap.val()) || {};
  items.filter((it) => !isPlanItem(it)).forEach((it) => {
    const prev = current[it.id];
    const days = num(it.validityDays);
    let until = 0;
    if (prev && num(prev.until) === 0) until = 0;
    else if (days) until = (prev && num(prev.until) > when ? num(prev.until) : when) + days * DAY;
    updates[`${PATH.enrollments}/${o.uid}/${it.id}`] = { orderId: o.id, orderNo: o.orderNo, since: when, until, title: it.title || "" };
  });
  return updates;
}

async function approveOrder(o, btn) {
  await busy(btn, "…", async () => {
    try {
      const now = Date.now();
      const by = (A.ctx.user && A.ctx.user.email) || "admin";
      const updates = await enrollmentUpdates(o, now);
      const base = `${PATH.orders}/${o.uid}/${o.id}`;
      updates[`${base}/status`] = "paid";
      updates[`${base}/paidAt`] = now;
      updates[`${base}/verified`] = true;
      updates[`${base}/verifiedBy`] = by;
      updates[`${base}/verifiedAt`] = now;
      await dbUpdateRoot(updates);
      alert("ok", `Approved ${o.orderNo} — ${o.name || "the student"} ${orderItems(o).some(isPlanItem) && orderItems(o).length === 1 ? "is now a member" : "is now enrolled"}.`);
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

async function rejectOrder(o) {
  const reason = window.prompt(`Reject ${o.orderNo}? Give a short reason the student will see:`, "Payment not received for this UTR");
  if (reason == null) return;
  const release = o.coupon && o.coupon.code ? window.confirm(`Release coupon ${o.coupon.code} so the student can use it again?`) : false;
  try {
    const base = `${PATH.orders}/${o.uid}/${o.id}`;
    const updates = {
      [`${base}/status`]: "rejected",
      [`${base}/rejectReason`]: String(reason).slice(0, 200),
      [`${base}/verifiedBy`]: (A.ctx.user && A.ctx.user.email) || "admin",
      [`${base}/verifiedAt`]: Date.now()
    };
    if (release) Object.assign(updates, releaseCoupon(o));
    await dbUpdateRoot(updates);
    alert("ok", `Rejected ${o.orderNo}.`);
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

function releaseCoupon(o) {
  const code = o.coupon.code;
  const u = A.usage[code] || {};
  return {
    [`${PATH.couponUsage}/${code}/count`]: Math.max(0, num(u.count) - 1),
    [`${PATH.couponUsage}/${code}/users/${o.uid}`]: null
  };
}

async function refundOrder(o) {
  if (!window.confirm(`Mark ${o.orderNo} (${money(o.total)}) as refunded? The student loses access to these courses (and the membership, if any). Process the actual refund in your payment app.`)) return;
  try {
    const snap = await dbGet(`${PATH.enrollments}/${o.uid}`).catch(() => null);
    const current = (snap && snap.val && snap.val()) || {};
    const base = `${PATH.orders}/${o.uid}/${o.id}`;
    const updates = { [`${base}/status`]: "refunded", [`${base}/refundedAt`]: Date.now() };
    orderItems(o).filter((it) => !isPlanItem(it)).forEach((it) => {
      if (current[it.id] && current[it.id].orderId === o.id) updates[`${PATH.enrollments}/${o.uid}/${it.id}`] = null;
    });
    if (orderItems(o).some(isPlanItem)) {
      const ms = await dbGet(`${PATH.members}/${o.uid}`).catch(() => null);
      const m = (ms && ms.val && ms.val()) || null;
      if (m && m.orderId === o.id) {
        updates[`${PATH.members}/${o.uid}/status`] = "cancelled";
        updates[`${PATH.members}/${o.uid}/note`] = `Refunded ${o.orderNo}`;
        updates[`${PATH.members}/${o.uid}/updatedAt`] = Date.now();
      }
    }
    await dbUpdateRoot(updates);
    alert("ok", `${o.orderNo} marked as refunded.`);
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

async function verifyOrder(o, btn) {
  await busy(btn, "…", async () => {
    try {
      await dbUpdate(`${PATH.orders}/${o.uid}/${o.id}`, { verified: true, verifiedBy: (A.ctx.user && A.ctx.user.email) || "admin", verifiedAt: Date.now() });
      alert("ok", `${o.orderNo} marked as verified.`);
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

function viewReceipt(o) {
  adminModal(
    `Receipt · ${o.orderNo}`,
    `<div id="asRcpt" class="as-note">Rendering…</div><div class="crm-actions"><button class="p-btn p-btn--lime" type="button" id="asRcptDl">${icon("i-download")}<span>Download PNG</span></button></div>`,
    (box) => {
      const order = { ...o, items: orderItems(o) };
      receiptDataURL(order, receiptSettings())
        .then((url) => {
          $("#asRcpt", box).outerHTML = `<img src="${url}" alt="Receipt ${esc(o.orderNo)}">`;
        })
        .catch((err) => ($("#asRcpt", box).textContent = err.message));
      $("#asRcptDl", box).addEventListener("click", (e) => busy(e.currentTarget, "Preparing…", () => downloadReceipt(order, receiptSettings())));
    }
  );
}

function exportOrders() {
  const rows = [["Order no", "Date", "Status", "Name", "Email", "Phone", "Items", "MRP", "Subtotal", "Coupon", "Discount", "Total", "Method", "UTR / Payment ID", "Verified"]];
  filteredOrders().forEach((o) =>
    rows.push([
      o.orderNo,
      new Date(num(o.createdAt)).toISOString(),
      o.status,
      o.name,
      o.email,
      o.phone,
      orderItems(o)
        .map((i) => i.title)
        .join(" | "),
      o.mrpTotal,
      o.subtotal,
      (o.coupon && o.coupon.code) || "",
      o.discount,
      o.total,
      o.method,
      o.paymentId || o.utr || "",
      o.verified ? "yes" : "no"
    ])
  );
  downloadText(`fenxtek-orders-${today()}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
}

async function loadUsers() {
  if (A.users) return A.users;
  const snap = await dbGet("users").catch(() => null);
  const v = (snap && snap.val && snap.val()) || {};
  A.users = Object.keys(v)
    .map((uid) => ({ uid, ...v[uid] }))
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
  return A.users;
}

const sellables = () => [...A.courses, ...A.plans.filter((p) => p.price > 0)];
const sellableById = (id) => sellables().find((x) => x.id === id);

async function offlineSale() {
  if (!sellables().length) {
    alert("err", "Create a course (Courses tab) or a membership plan first.");
    return;
  }
  const users = await loadUsers();
  adminModal(
    "Record an offline sale",
    `<p class="as-note">Use this when a student pays at the academy, by bank transfer or over the phone. The student is enrolled (or their membership activated) immediately and can download the receipt from their portal.</p>` +
      `<form class="crm-form" id="asSale" novalidate>` +
      `<label class="p-field p-field--wide"><span class="p-label">Student</span><select class="p-select" name="uid" required><option value="">Choose a student account</option>${users
        .map((u) => `<option value="${esc(u.uid)}">${esc(u.name || "Unnamed")} — ${esc(u.email || u.uid)}</option>`)
        .join("")}</select></label>` +
      `<div class="p-field p-field--wide"><span class="p-label">Courses${A.plans.length ? " &amp; membership" : ""}</span><div class="as-scope">${A.courses
        .map((c) => `<label><input type="checkbox" name="course" value="${esc(c.id)}">${esc(c.title)} · ${money(c.price)}</label>`)
        .join("")}${A.plans
        .filter((p) => p.price > 0)
        .map((p) => `<label class="as-scope-plan"><input type="checkbox" name="course" value="${esc(p.id)}" data-plan>${icon("i-crown")}${esc(p.title)} · ${money(p.price)} · ${esc(p.mode)}</label>`)
        .join("")}</div></div>` +
      `<label class="p-field"><span class="p-label">Discount (₹)</span><input class="p-input" name="discount" inputmode="numeric" value="0"></label>` +
      `<label class="p-field"><span class="p-label">Method</span><select class="p-select" name="method"><option value="cash">Cash at academy</option><option value="upi">UPI transfer</option><option value="bank">Bank transfer</option><option value="offline">Other / offline</option></select></label>` +
      `<label class="p-field"><span class="p-label">Reference / UTR (optional)</span><input class="p-input" name="ref" maxlength="40"></label>` +
      `<label class="p-field"><span class="p-label">Note (admin only)</span><input class="p-input" name="note" maxlength="200"></label>` +
      `</form><div class="crm-actions"><span class="crm-save-state" id="asSaleTotal">Total ₹0</span><button class="p-btn p-btn--lime" type="button" id="asSaleGo">${icon("i-check")}<span>Record sale &amp; enrol</span></button></div>`,
    (box, close) => {
      const form = $("#asSale", box);
      const calc = () => {
        /* one membership per order */
        const planBoxes = $$('input[data-plan]:checked', form);
        if (planBoxes.length > 1) planBoxes.slice(0, -1).forEach((b) => (b.checked = false));
        const ids = $$('input[name="course"]:checked', form).map((i) => i.value);
        const sub = ids.reduce((s, id) => s + num((sellableById(id) || {}).price), 0);
        const disc = Math.min(sub, Math.max(0, Math.round(num(form.discount.value))));
        $("#asSaleTotal", box).textContent = `Subtotal ${money(sub)} · Discount ${money(disc)} · Total ${money(sub - disc)}`;
        return { ids, sub, disc };
      };
      form.addEventListener("input", calc);
      $("#asSaleGo", box).addEventListener("click", (e) =>
        busy(e.currentTarget, "Saving…", async () => {
          const { ids, sub, disc } = calc();
          const uid = form.uid.value;
          if (!uid || !ids.length) {
            alert("err", "Pick a student and at least one course or plan.");
            return;
          }
          const u = users.find((x) => x.uid === uid) || {};
          try {
            const oid = await dbKey(`${PATH.orders}/${uid}`);
            const now = Date.now();
            const items = {};
            let mrpTotal = 0;
            ids.forEach((id) => {
              const c = sellableById(id);
              items[id] = isPlanItem(c)
                ? { kind: "plan", planId: c.planId, title: c.title, price: c.price, mrp: Math.max(c.mrp, c.price), validityDays: c.validityDays, category: "Membership", mode: c.mode }
                : { title: c.title, price: c.price, mrp: Math.max(c.mrp, c.price), validityDays: c.validityDays, category: c.category, mode: c.mode, language: c.language };
              mrpTotal += Math.max(c.mrp, c.price);
            });
            const order = {
              orderNo: orderNumber(),
              uid,
              name: u.name || "Student",
              email: u.email || "",
              phone: u.phone || "",
              items,
              mrpTotal,
              subtotal: sub,
              discount: disc,
              total: sub - disc,
              currency: "INR",
              status: "paid",
              method: form.method.value,
              verified: true,
              createdAt: now,
              paidAt: now,
              verifiedBy: (A.ctx.user && A.ctx.user.email) || "admin",
              verifiedAt: now
            };
            if (form.ref.value.trim()) order.utr = form.ref.value.trim().slice(0, 40);
            if (form.note.value.trim()) order.note = form.note.value.trim().slice(0, 200);
            const updates = await enrollmentUpdates({ ...order, id: oid }, now);
            updates[`${PATH.orders}/${uid}/${oid}`] = order;
            await dbUpdateRoot(updates);
            alert("ok", `Recorded ${order.orderNo} — ${order.name} is enrolled.`);
            close();
          } catch (err) {
            alert("err", friendlyError(err));
          }
        })
      );
    }
  );
}

function bindOrders() {
  const panel = $('[data-crm-panel="orders"]');
  if (!panel) return;
  const f = A.orderFilter;
  $("#asOrderQ").addEventListener("input", (e) => {
    f.q = e.target.value;
    paintOrders();
  });
  $("#asOrderStatus").addEventListener("change", (e) => {
    f.status = e.target.value;
    paintOrders();
  });
  $("#asOrderMethod").addEventListener("change", (e) => {
    f.method = e.target.value;
    paintOrders();
  });
  $("#asOrderRange").addEventListener("change", (e) => {
    f.range = e.target.value;
    paintOrders();
  });
  $("#asOrderExport").addEventListener("click", exportOrders);
  $("#asOrderSale").addEventListener("click", offlineSale);
  $("#asOrdersBody").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const key = b.dataset.oView || b.dataset.oApprove || b.dataset.oReject || b.dataset.oVerify || b.dataset.oDl || b.dataset.oRefund;
    const o = key && findOrder(key);
    if (!o) return;
    if (b.dataset.oView) viewReceipt(o);
    else if (b.dataset.oApprove) approveOrder(o, b);
    else if (b.dataset.oReject) rejectOrder(o);
    else if (b.dataset.oVerify) verifyOrder(o, b);
    else if (b.dataset.oDl) busy(b, "…", () => downloadReceipt({ ...o, items: orderItems(o) }, receiptSettings()));
    else if (b.dataset.oRefund) refundOrder(o);
  });
}

/* ============================================================
   COURSES
   ============================================================ */
function salesOf(id) {
  return A.orders.filter((o) => o.status === "paid" && orderItems(o).some((i) => i.id === id)).length;
}

function courseImgSrc(c, draftImg) {
  if (draftImg !== undefined) return draftImg;
  if (c.thumb === "link") return safeImageUrl(c.thumbUrl);
  return "";
}

function paintCourses() {
  const box = $("#asCourseList");
  if (!box) return;
  const count = $("#asCourseCount");
  if (count) count.textContent = `${A.courses.length} course${A.courses.length === 1 ? "" : "s"} · ${A.courses.filter((c) => c.published).length} published`;
  if (!A.courses.length) {
    box.innerHTML = `<div class="crm-card"><p class="crm-table-empty" style="padding:24px">No courses yet. Create one, or import your fee plans as a starting point.</p></div>`;
    return;
  }
  box.innerHTML = A.courses
    .map((c, i) => {
      const sold = salesOf(c.id);
      const cc = contentCount(c.id);
      return (
        `<div class="as-course${c.published ? "" : " is-off"}" data-cid="${esc(c.id)}">` +
        `<div class="as-course-cover" data-acover="${esc(c.id)}">${coverHTML(c, courseImgSrc(c), { size: "sm" })}</div>` +
        `<div><h4>${esc(c.title)}</h4><p>${money(c.price)}${c.mrp > c.price ? ` <s>${money(c.mrp)}</s> · ${offPercent(c.price, c.mrp)}% off` : ""} · ${esc(validityLabel(c.validityDays))} · ${esc(c.category)} · ${esc(c.mode)}</p>` +
        `<p><span class="as-pill ${c.published ? "as-pill--ok" : "as-pill--muted"}">${c.published ? "Published" : "Hidden"}</span> <span class="as-pill as-pill--violet">${sold} sold</span> <button class="as-pill as-pill--cc" type="button" data-c-content="${esc(c.id)}">${cc.items || cc.folders ? `${cc.folders} folder${cc.folders === 1 ? "" : "s"} · ${cc.items} item${cc.items === 1 ? "" : "s"}` : "No content yet"}</button>${c.badge ? ` <span class="as-pill as-pill--warn">${esc(c.badge)}</span>` : ""}</p></div>` +
        `<div class="as-course-acts">` +
        `<button class="as-icon" type="button" data-c-up="${esc(c.id)}" title="Move up"${i === 0 ? " disabled" : ""}>${icon("i-arr-u")}</button>` +
        `<button class="as-icon" type="button" data-c-down="${esc(c.id)}" title="Move down"${i === A.courses.length - 1 ? " disabled" : ""}>${icon("i-arr-d")}</button>` +
        `<button class="as-icon" type="button" data-c-pub="${esc(c.id)}" title="${c.published ? "Hide from store" : "Publish"}">${icon(c.published ? "i-eye" : "i-lock")}</button>` +
        `<button class="as-btn-cc" type="button" data-c-content="${esc(c.id)}" title="Folders, videos, PDFs and links">${icon("i-book")}<span>Content</span></button>` +
        `<button class="as-icon" type="button" data-c-access="${esc(c.id)}" title="Notice &amp; class links">${icon("i-link")}</button>` +
        `<button class="as-icon" type="button" data-c-edit="${esc(c.id)}" title="Edit">${icon("i-edit")}</button>` +
        `<button class="as-icon as-icon--danger" type="button" data-c-del="${esc(c.id)}" title="Delete">${icon("i-trash")}</button>` +
        `</div></div>`
      );
    })
    .join("");
  /* lazy uploaded thumbnails */
  A.courses
    .filter((c) => c.thumb === "upload")
    .forEach((c) =>
      dbGet(`${PATH.courseImages}/${c.id}`)
        .then((s) => {
          const src = safeDataImage(s && s.val ? s.val() : "");
          const el = box.querySelector(`[data-acover="${CSS.escape(c.id)}"]`);
          if (src && el) el.innerHTML = coverHTML(c, src, { size: "sm" });
        })
        .catch(() => {})
    );
}

function courseForm(c) {
  const opt = (list, v) => list.map((x) => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("");
  const presets = [[30, "1 month"], [90, "3 months"], [180, "6 months"], [365, "1 year"], [730, "2 years"], [0, "Lifetime"]];
  const isPreset = presets.some(([d]) => d === c.validityDays);
  return (
    `<div class="as-editor"><form class="crm-form" id="asCourseForm" novalidate>` +
    `<label class="p-field p-field--wide"><span class="p-label">Course title</span><input class="p-input" name="title" maxlength="140" value="${esc(c.title === "Untitled course" ? "" : c.title)}" placeholder="SSC Stenographer 100 WPM — Hindi" required></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Subtitle (one line)</span><input class="p-input" name="subtitle" maxlength="240" value="${esc(c.subtitle)}" placeholder="Daily dictations, weekly mock tests and transcription feedback"></label>` +
    `<label class="p-field"><span class="p-label">Selling price (₹)</span><input class="p-input" name="price" inputmode="numeric" value="${esc(c.price)}" required></label>` +
    `<label class="p-field"><span class="p-label">MRP (₹, shown struck-through)</span><input class="p-input" name="mrp" inputmode="numeric" value="${esc(c.mrp || "")}"></label>` +
    `<label class="p-field"><span class="p-label">Validity</span><select class="p-select" name="validityPreset">${presets
      .map(([d, l]) => `<option value="${d}"${isPreset && d === c.validityDays ? " selected" : ""}>${l}</option>`)
      .join("")}<option value="custom"${isPreset ? "" : " selected"}>Custom days…</option></select></label>` +
    `<label class="p-field"><span class="p-label">Custom validity (days)</span><input class="p-input" name="validityDays" inputmode="numeric" value="${esc(c.validityDays)}"${isPreset ? " disabled" : ""}></label>` +
    `<label class="p-field"><span class="p-label">Category</span><select class="p-select" name="category">${opt(COURSE_CATEGORIES, c.category)}</select></label>` +
    `<label class="p-field"><span class="p-label">Mode</span><select class="p-select" name="mode">${opt(COURSE_MODES, c.mode)}</select></label>` +
    `<label class="p-field"><span class="p-label">Language</span><select class="p-select" name="language">${opt(COURSE_LANGUAGES, c.language)}</select></label>` +
    `<label class="p-field"><span class="p-label">Badge (optional)</span><input class="p-input" name="badge" maxlength="24" value="${esc(c.badge)}" placeholder="Bestseller · New · Limited"></label>` +
    `<label class="p-field"><span class="p-label">Lessons / classes (optional)</span><input class="p-input" name="lessons" inputmode="numeric" value="${esc(c.lessons || "")}"></label>` +
    `<label class="p-field"><span class="p-label">Sort order</span><input class="p-input" name="order" inputmode="numeric" value="${esc(c.order)}"></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">What you get — one per line</span><textarea class="p-textarea" name="features" rows="5" placeholder="Daily 10-minute Hindi dictation&#10;Weekly full-length mock test&#10;Transcription error analysis">${esc(c.features.join("\n"))}</textarea></label>` +
    `<label class="p-field p-field--wide"><span class="p-label">Description (blank line = new paragraph)</span><textarea class="p-textarea" name="description" rows="5">${esc(c.description)}</textarea></label>` +
    `<div class="p-field p-field--wide"><span class="p-label">Cover theme</span><div class="as-accents">${Object.keys(ACCENTS)
      .map((k) => `<label class="as-accent" title="${esc(ACCENTS[k].label)}" style="background:linear-gradient(135deg,${ACCENTS[k].a},${ACCENTS[k].b})"><input type="radio" name="accent" value="${k}"${c.accent === k ? " checked" : ""}></label>`)
      .join("")}</div></div>` +
    `<div class="p-field p-field--wide"><span class="p-label">Cover picture</span><div class="as-seg">` +
    ["none", "upload", "link"].map((v) => `<label><input type="radio" name="thumb" value="${v}"${c.thumb === v ? " checked" : ""}>${v === "none" ? "Generated art" : v === "upload" ? "Upload" : "Image link"}</label>`).join("") +
    `</div></div>` +
    `<label class="p-field p-field--wide" data-thumb="upload"${c.thumb === "upload" ? "" : " hidden"}><span class="p-label">Upload image (16:9 works best)</span><input class="p-input" type="file" name="file" accept="image/*"><span class="p-hint" id="asThumbInfo">Compressed in your browser and stored in Realtime Database.</span></label>` +
    `<label class="p-field p-field--wide" data-thumb="link"${c.thumb === "link" ? "" : " hidden"}><span class="p-label">Image URL</span><input class="p-input" name="thumbUrl" value="${esc(c.thumbUrl)}" placeholder="https://…"></label>` +
    `<label class="as-check p-field--wide"><input type="checkbox" name="published"${c.published ? " checked" : ""}>Published — visible in the student store</label>` +
    `</form>` +
    `<aside class="as-preview"><span class="p-label">Live preview</span><div id="asCoursePrev"></div></aside></div>` +
    `<div class="crm-actions"><span class="crm-save-state" id="asCourseState">${A.editing ? "Editing" : "New course"}</span>` +
    `<button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asCourseCancel"><span>Cancel</span></button>` +
    `<button class="p-btn p-btn--lime" type="button" id="asCourseSave">${icon("i-check")}<span>Save course</span></button></div>`
  );
}

function readCourseForm(form) {
  const d = new FormData(form);
  const preset = String(d.get("validityPreset"));
  const validity = preset === "custom" ? Math.max(0, Math.round(num(form.validityDays.value))) : Number(preset);
  return normalizeCourse({
    ...A.draft,
    title: String(d.get("title") || "").trim() || "Untitled course",
    subtitle: String(d.get("subtitle") || "").trim(),
    price: num(d.get("price")),
    mrp: num(d.get("mrp")),
    validityDays: validity,
    category: d.get("category"),
    mode: d.get("mode"),
    language: d.get("language"),
    badge: String(d.get("badge") || "").trim(),
    lessons: num(d.get("lessons")),
    order: num(d.get("order")),
    features: String(d.get("features") || ""),
    description: String(d.get("description") || "").trim(),
    accent: d.get("accent") || "violet",
    thumb: d.get("thumb") || "none",
    thumbUrl: String(d.get("thumbUrl") || "").trim(),
    published: Boolean(d.get("published"))
  });
}

function paintCoursePreview(form) {
  const c = readCourseForm(form);
  const img = c.thumb === "upload" ? A.draft.image || "" : c.thumb === "link" ? safeImageUrl(c.thumbUrl) : "";
  $("#asCoursePrev").innerHTML =
    coverHTML(c, img, { size: "md" }) +
    `<div class="as-preview-card"><b>${esc(c.title)}</b>${c.subtitle ? `<span class="as-sub">${esc(c.subtitle)}</span>` : ""}` +
    `<span><b>${money(c.price)}</b>${c.mrp > c.price ? ` <s class="as-sub">${money(c.mrp)}</s> <span class="as-pill as-pill--ok">${offPercent(c.price, c.mrp)}% off</span>` : ""}</span>` +
    `<span class="as-sub">${esc(validityLabel(c.validityDays))} · ${esc(c.mode)} · ${esc(c.language)}</span></div>`;
}

async function openCourseEditor(id) {
  const card = $("#asCourseEditor");
  if (!card) return;
  const existing = id ? A.courses.find((c) => c.id === id) : null;
  A.editing = id || "";
  A.draft = existing ? { ...existing, image: undefined, imageChanged: false } : { ...normalizeCourse({ title: "", price: 0, validityDays: 365, order: A.courses.length + 1 }), image: "", imageChanged: false };
  card.hidden = false;
  card.innerHTML = courseForm(A.draft);
  if (existing && existing.thumb === "upload") {
    dbGet(`${PATH.courseImages}/${existing.id}`)
      .then((s) => {
        if (A.draft && A.draft.image === undefined) {
          A.draft.image = safeDataImage(s && s.val ? s.val() : "");
          paintCoursePreview($("#asCourseForm"));
        }
      })
      .catch(() => {});
  }
  const form = $("#asCourseForm");
  const sync = () => {
    const t = (form.querySelector('input[name="thumb"]:checked') || {}).value;
    $$("[data-thumb]", card).forEach((el) => (el.hidden = el.dataset.thumb !== t));
    form.validityDays.disabled = form.validityPreset.value !== "custom";
    if (form.validityPreset.value !== "custom") form.validityDays.value = form.validityPreset.value;
    paintCoursePreview(form);
  };
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  form.file.addEventListener("change", async () => {
    const file = form.file.files && form.file.files[0];
    if (!file) return;
    const info = $("#asThumbInfo");
    info.textContent = "Compressing…";
    try {
      const out = await fileToDataImage(file, { maxDim: 1600, budget: 900000 });
      const url = typeof out === "string" ? out : out.dataUrl;
      A.draft.image = url;
      A.draft.imageChanged = true;
      info.textContent = `Ready · ${prettyBytes(url.length)}`;
      paintCoursePreview(form);
    } catch (err) {
      info.textContent = err.message;
    }
  });
  sync();
  $("#asCourseCancel").addEventListener("click", closeCourseEditor);
  $("#asCourseSave").addEventListener("click", (e) => saveCourse(form, e.currentTarget));
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeCourseEditor() {
  const card = $("#asCourseEditor");
  if (card) {
    card.hidden = true;
    card.innerHTML = "";
  }
  A.editing = null;
  A.draft = null;
}

async function saveCourse(form, btn) {
  const c = readCourseForm(form);
  if (!c.title || c.title === "Untitled course") return alert("err", "Give the course a title.");
  if (!(c.price >= 0)) return alert("err", "Enter a valid price.");
  if (c.mrp && c.mrp < c.price) return alert("err", "MRP should be higher than the selling price (or leave it blank).");
  if (c.thumb === "link" && !safeImageUrl(c.thumbUrl).startsWith("http")) return alert("err", "Paste a full image URL starting with https://");
  if (c.thumb === "upload" && !A.draft.image && !A.editing) return alert("err", "Choose an image to upload, or switch the cover to generated art.");
  await busy(btn, "Saving…", async () => {
    try {
      const id = A.editing || `${slug(c.title)}-${generateCode("", 4).toLowerCase()}`;
      const now = Date.now();
      const rec = {
        title: c.title,
        subtitle: c.subtitle,
        category: c.category,
        language: c.language,
        mode: c.mode,
        price: c.price,
        mrp: Math.max(c.mrp, 0),
        validityDays: c.validityDays,
        badge: c.badge,
        accent: c.accent,
        features: c.features,
        description: c.description,
        thumb: c.thumb,
        thumbUrl: c.thumb === "link" ? c.thumbUrl : "",
        published: c.published,
        order: c.order,
        lessons: c.lessons,
        createdAt: (A.coursesRaw[id] && A.coursesRaw[id].createdAt) || now,
        updatedAt: now
      };
      const updates = { [`${PATH.courses}/${id}`]: rec };
      if (c.thumb === "upload" && A.draft.imageChanged && A.draft.image) updates[`${PATH.courseImages}/${id}`] = A.draft.image;
      if (c.thumb !== "upload") updates[`${PATH.courseImages}/${id}`] = null;
      await dbUpdateRoot(updates);
      alert("ok", `Saved “${c.title}”.${c.published ? " It’s live in the student store." : " It’s hidden until you publish it."}`);
      closeCourseEditor();
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

async function moveCourse(id, dir) {
  const list = A.courses.slice();
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const updates = {};
  list.forEach((c, k) => (updates[`${PATH.courses}/${c.id}/order`] = k + 1));
  await dbUpdateRoot(updates).catch((err) => alert("err", friendlyError(err)));
}

async function deleteCourse(id) {
  const c = A.courses.find((x) => x.id === id);
  if (!c) return;
  const sold = salesOf(id);
  if (!window.confirm(`Delete “${c.title}”?${sold ? ` ${sold} student(s) bought it — they keep their enrolment, but the course disappears from the store.` : ""} This can’t be undone.`)) return;
  try {
    await dbUpdateRoot({ [`${PATH.courses}/${id}`]: null, [`${PATH.courseImages}/${id}`]: null, [`${PATH.courseAccess}/${id}`]: null, ...contentDeleteUpdates(id) });
    alert("ok", `Deleted “${c.title}”.`);
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

async function editAccess(id) {
  const c = A.courses.find((x) => x.id === id);
  if (!c) return;
  const snap = await dbGet(`${PATH.courseAccess}/${id}`).catch(() => null);
  const v = (snap && snap.val && snap.val()) || {};
  const links = Array.isArray(v.links) ? v.links.filter(Boolean) : Object.values(v.links || {});
  const row = (l = {}) =>
    `<div class="as-link-row"><input class="p-input" data-l="label" placeholder="Label — e.g. Telegram batch group" value="${esc(l.label || "")}"><input class="p-input" data-l="url" placeholder="https://t.me/…" value="${esc(l.url || "")}"><button class="as-icon as-icon--danger" type="button" data-l-rm title="Remove">${icon("i-trash")}</button></div>`;
  adminModal(
    `Notice & class links · ${c.title}`,
    `<p class="as-note">Shown at the top of the classroom, above the course content. Only <b>enrolled students with active validity</b> can read this (enforced by the database rules). Use it for the batch notice, Telegram group or a standing Zoom/Meet link — add lectures, notes and files with <b>Content</b> instead.</p>` +
      `<label class="p-field"><span class="p-label">Message for students</span><textarea class="p-textarea" id="asAccMsg" rows="3" placeholder="Classes run Mon–Sat, 7 PM. Join the Telegram group first.">${esc(v.message || "")}</textarea></label>` +
      `<div class="p-field"><span class="p-label">Links</span><div class="as-links" id="asAccLinks">${(links.length ? links : [{}]).map(row).join("")}</div></div>` +
      `<div class="crm-actions"><button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asAccAdd">${icon("i-plus")}<span>Add link</span></button><button class="p-btn p-btn--lime" type="button" id="asAccSave">${icon("i-check")}<span>Save classroom</span></button></div>`,
    (box, close) => {
      const list = $("#asAccLinks", box);
      $("#asAccAdd", box).addEventListener("click", () => list.insertAdjacentHTML("beforeend", row()));
      list.addEventListener("click", (e) => {
        const b = e.target.closest("[data-l-rm]");
        if (b) b.closest(".as-link-row").remove();
      });
      $("#asAccSave", box).addEventListener("click", (e) =>
        busy(e.currentTarget, "Saving…", async () => {
          const out = [];
          let bad = false;
          $$(".as-link-row", list).forEach((r) => {
            const label = $('[data-l="label"]', r).value.trim();
            const url = $('[data-l="url"]', r).value.trim();
            if (!label && !url) return;
            if (!/^https?:\/\/\S+$/i.test(url)) bad = true;
            out.push({ label: label.slice(0, 80) || "Open link", url: url.slice(0, 500) });
          });
          if (bad) return alert("err", "Every link must start with https://");
          try {
            await dbSet(`${PATH.courseAccess}/${id}`, { message: $("#asAccMsg", box).value.trim().slice(0, 2000), links: out, updatedAt: Date.now() });
            alert("ok", `Classroom saved for “${c.title}”.`);
            close();
          } catch (err) {
            alert("err", friendlyError(err));
          }
        })
      );
    }
  );
}

async function importFees(btn) {
  await busy(btn, "Importing…", async () => {
    const snap = await dbGet("site/fees").catch(() => null);
    const v = (snap && snap.val && snap.val()) || {};
    const fees = Array.isArray(v) ? v.filter(Boolean) : Object.values(v);
    if (!fees.length) return alert("err", "No fee plans found under site/fees.");
    const have = new Set(A.courses.map((c) => c.title.toLowerCase()));
    const updates = {};
    let n = 0;
    const accents = Object.keys(ACCENTS);
    fees.forEach((f, i) => {
      const title = String(f.label || f.title || "").trim();
      if (!title || have.has(title.toLowerCase())) return;
      const id = `${slug(title)}-${generateCode("", 4).toLowerCase()}`;
      const price = Math.round(num(f.price));
      const was = Math.round(num(f.was));
      updates[`${PATH.courses}/${id}`] = {
        title,
        subtitle: String(f.note || ""),
        category: /typing/i.test(title) ? "Typing" : /dictation|editorial/i.test(title) ? "Dictation" : /ssc|upsssc|ahc|aps|uppcl|uppsc/i.test(title) ? "Exam pack" : "Shorthand",
        language: /english/i.test(title) ? "English" : "Hindi",
        mode: "Recorded",
        price,
        mrp: was > price ? was : 0,
        validityDays: 365,
        badge: "",
        accent: accents[i % accents.length],
        features: [],
        description: "",
        thumb: "none",
        thumbUrl: "",
        published: false,
        order: A.courses.length + n + 1,
        lessons: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      n++;
    });
    if (!n) return alert("ok", "All fee plans already exist as courses.");
    try {
      await dbUpdateRoot(updates);
      alert("ok", `Imported ${n} course${n === 1 ? "" : "s"} as hidden drafts — review, then publish.`);
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

function bindCourses() {
  $("#asCourseNew").addEventListener("click", () => openCourseEditor(""));
  $("#asCourseImport").addEventListener("click", (e) => importFees(e.currentTarget));
  $("#asCourseList").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.cEdit) openCourseEditor(d.cEdit);
    else if (d.cDel) deleteCourse(d.cDel);
    else if (d.cUp) moveCourse(d.cUp, -1);
    else if (d.cDown) moveCourse(d.cDown, 1);
    else if (d.cAccess) editAccess(d.cAccess);
    else if (d.cContent) {
      const c = A.courses.find((x) => x.id === d.cContent);
      if (c) openContentManager(c, { alert, busy });
    }
    else if (d.cPub) {
      const c = A.courses.find((x) => x.id === d.cPub);
      if (c) dbSet(`${PATH.courses}/${c.id}/published`, !c.published).catch((err) => alert("err", friendlyError(err)));
    }
  });
}

/* ============================================================
   COUPONS
   ============================================================ */
function couponList() {
  return Object.keys(A.coupons)
    .map((code) => ({ ...A.coupons[code], code, used: num((A.usage[code] || {}).count) }))
    .sort((a, b) => num(b.createdAt) - num(a.createdAt) || a.code.localeCompare(b.code));
}

function scopeLabel(c) {
  const ids = couponScopeIds(c);
  if (!ids) return "All courses & plans";
  const names = ids.map((id) => (sellableById(id) || A.plans.find((p) => p.id === id) || {}).title || id);
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

function paintCoupons() {
  const body = $("#asCouponsBody");
  if (!body) return;
  const all = couponList();
  const paid = A.orders.filter((o) => o.status === "paid" && o.coupon);
  const statsBox = $("#asCouponStats");
  if (statsBox) {
    const active = all.filter((c) => couponState(c, c.used).key === "active").length;
    statsBox.innerHTML =
      stat(String(all.length), "Coupon codes") +
      stat(String(active), "Active right now") +
      stat(String(all.reduce((s, c) => s + c.used, 0)), "Total redemptions") +
      stat(money(paid.reduce((s, o) => s + num(o.discount), 0)), "Discount given (paid)") +
      stat(money(paid.reduce((s, o) => s + num(o.total), 0)), "Revenue with coupons") +
      stat(String(Object.keys(A.offers).length), "Shown as offers");
  }
  /* batches */
  const batchSel = $("#asCouponBatch");
  if (batchSel) {
    const batches = Array.from(new Set(all.map((c) => c.batch).filter(Boolean)));
    const cur = A.couponFilter.batch;
    batchSel.innerHTML = `<option value="">All batches</option>` + batches.map((b) => `<option value="${esc(b)}"${b === cur ? " selected" : ""}>${esc(b)}</option>`).join("");
    const del = $("#asCouponBatchDel");
    if (del) del.hidden = !cur;
  }
  const f = A.couponFilter;
  const q = f.q.trim().toUpperCase();
  const list = all.filter((c) => {
    if (f.batch && c.batch !== f.batch) return false;
    if (f.status !== "all" && couponState(c, c.used).key !== f.status) return false;
    if (q && !(c.code.includes(q) || String(c.note || "").toUpperCase().includes(q))) return false;
    return true;
  });
  const count = $("#asCouponCount");
  if (count) count.textContent = `${list.length} of ${all.length} codes`;
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" class="crm-table-empty">${all.length ? "No coupons match these filters." : "No coupons yet — create one above."}</td></tr>`;
    return;
  }
  const shown = list.slice(0, A.couponLimit);
  body.innerHTML =
    shown
      .map((c) => {
        const st = couponState(c, c.used);
        const tone = st.key === "active" ? "ok" : st.key === "upcoming" ? "violet" : st.key === "off" ? "muted" : "err";
        return (
          `<tr>` +
          `<td><button type="button" class="as-code" data-k-copy="${esc(c.code)}" title="Copy">${esc(c.code)} ${icon("i-copy")}</button>${c.batch ? `<div class="as-sub">Batch ${esc(c.batch)}</div>` : ""}${c.note ? `<div class="as-sub">${esc(c.note)}</div>` : ""}</td>` +
          `<td><b>${esc(couponLabel(c))}</b>${num(c.minAmount) ? `<div class="as-sub">Min ${money(c.minAmount)}</div>` : ""}</td>` +
          `<td>${esc(scopeLabel(c))}</td>` +
          `<td><b>${c.used}</b> / ${num(c.maxUses) ? num(c.maxUses) : "∞"}</td>` +
          `<td><div class="as-sub">${num(c.startsAt) ? "From " + esc(formatDate(c.startsAt)) : "Now"}</div><div class="as-sub">${num(c.expiresAt) ? "Till " + esc(formatDate(c.expiresAt)) : "No expiry"}</div></td>` +
          `<td><span class="as-pill as-pill--${tone}">${esc(st.label)}</span>${A.offers[c.code] ? ` <span class="as-pill as-pill--violet">Offer</span>` : ""}</td>` +
          `<td class="actions"><div class="as-row-acts">` +
          `<button class="as-icon" type="button" data-k-offer="${esc(c.code)}" title="${A.offers[c.code] ? "Hide from student cart" : "Show in student cart as an offer"}">${icon("i-gift")}</button>` +
          `<button class="as-icon" type="button" data-k-toggle="${esc(c.code)}" title="${c.active === false ? "Enable" : "Disable"}">${icon(c.active === false ? "i-lock" : "i-eye")}</button>` +
          `<button class="as-icon as-icon--danger" type="button" data-k-del="${esc(c.code)}" title="Delete">${icon("i-trash")}</button>` +
          `</div></td></tr>`
        );
      })
      .join("") +
    (list.length > shown.length ? `<tr><td colspan="7" class="crm-table-empty"><button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asCouponMore"><span>Show ${Math.min(200, list.length - shown.length)} more</span></button></td></tr>` : "");
}

function couponFormHTML() {
  return (
    `<div class="as-seg" style="margin-bottom:16px"><label><input type="radio" name="asMode" value="single" checked>Single code</label><label><input type="radio" name="asMode" value="bulk">Bulk generate</label></div>` +
    `<form class="crm-form" id="asCouponForm" novalidate>` +
    `<div class="p-field p-field--wide" data-mode="single"><span class="p-label">Coupon code</span><div style="display:flex;gap:8px"><input class="p-input as-code" name="code" maxlength="24" placeholder="DIWALI25" style="text-transform:uppercase"><button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asGen">${icon("i-refresh")}<span>Generate</span></button></div></div>` +
    `<label class="p-field" data-mode="bulk" hidden><span class="p-label">Prefix (optional)</span><input class="p-input as-code" name="prefix" maxlength="10" placeholder="FXT" style="text-transform:uppercase"></label>` +
    `<label class="p-field" data-mode="bulk" hidden><span class="p-label">How many codes (1–500)</span><input class="p-input" name="count" inputmode="numeric" value="50"></label>` +
    `<label class="p-field" data-mode="bulk" hidden><span class="p-label">Random part length</span><select class="p-select" name="length"><option>5</option><option selected>6</option><option>8</option><option>10</option></select></label>` +
    `<label class="p-field" data-mode="bulk" hidden><span class="p-label">Batch name (to filter / delete later)</span><input class="p-input" name="batch" maxlength="30" placeholder="Seminar Nov"></label>` +
    `<div class="p-field"><span class="p-label">Discount type</span><div class="as-seg"><label><input type="radio" name="type" value="percent" checked>% off</label><label><input type="radio" name="type" value="flat">₹ flat off</label></div></div>` +
    `<label class="p-field"><span class="p-label" id="asValLabel">Percent off</span><input class="p-input" name="value" inputmode="numeric" placeholder="20" required></label>` +
    `<label class="p-field" data-pct><span class="p-label">Max discount (₹, optional cap)</span><input class="p-input" name="maxDiscount" inputmode="numeric" placeholder="No cap"></label>` +
    `<label class="p-field"><span class="p-label">Minimum eligible amount (₹)</span><input class="p-input" name="minAmount" inputmode="numeric" placeholder="0"></label>` +
    `<label class="p-field"><span class="p-label">Total uses allowed (0 = unlimited)</span><input class="p-input" name="maxUses" inputmode="numeric" value="0"></label>` +
    `<label class="p-field"><span class="p-label">Starts on (optional)</span><input class="p-input" type="date" name="startsAt"></label>` +
    `<label class="p-field"><span class="p-label">Expires on (optional)</span><input class="p-input" type="date" name="expiresAt"></label>` +
    `<label class="p-field"><span class="p-label">Internal note</span><input class="p-input" name="note" maxlength="120" placeholder="For Instagram followers"></label>` +
    `<div class="p-field p-field--wide"><span class="p-label">Applies to</span><div class="as-seg"><label><input type="radio" name="scope" value="all" checked>All courses &amp; plans</label><label><input type="radio" name="scope" value="some">Selected only</label></div><div class="as-scope" id="asScope" hidden style="margin-top:10px"></div></div>` +
    `<label class="as-check p-field--wide" data-mode="single"><input type="checkbox" name="offer">Show this code to students as an offer (store banner + cart)</label>` +
    `<label class="as-check p-field--wide"><input type="checkbox" name="active" checked>Active</label>` +
    `</form>` +
    `<p class="as-note" style="margin-top:12px">Each student can redeem a code <b>once</b>. “Total uses” caps redemptions across all students — set <b>1</b> for single-use codes (e.g. bulk codes handed out one per student).</p>` +
    `<div class="crm-actions"><span class="crm-save-state" id="asCouponState">Codes are case-insensitive and saved in CAPITALS.</span><button class="p-btn p-btn--lime" type="button" id="asCouponSave">${icon("i-check")}<span>Create coupon</span></button></div>` +
    `<div id="asCodesOut" hidden style="margin-top:14px"><span class="p-label">Generated codes</span><div class="as-codes-out" id="asCodesList"></div><div class="crm-actions"><button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asCodesCopy">${icon("i-copy")}<span>Copy all</span></button><button class="p-btn p-btn--ghost p-btn--sm" type="button" id="asCodesCsv">${icon("i-download")}<span>Download CSV</span></button></div></div>`
  );
}

function paintScope() {
  const box = $("#asScope");
  if (!box) return;
  const checked = new Set($$("input:checked", box).map((i) => i.value));
  box.innerHTML =
    A.courses.length || A.plans.length
      ? A.courses.map((c) => `<label><input type="checkbox" value="${esc(c.id)}"${checked.has(c.id) ? " checked" : ""}>${esc(c.title)}</label>`).join("") +
        A.plans.map((p) => `<label class="as-scope-plan"><input type="checkbox" value="${esc(p.id)}"${checked.has(p.id) ? " checked" : ""}>${icon("i-crown")}${esc(p.title)} <span class="as-sub">membership</span></label>`).join("")
      : `<span class="as-sub">Create courses or membership plans first.</span>`;
}

function readCouponForm(form) {
  const d = new FormData(form);
  const type = d.get("type") === "flat" ? "flat" : "percent";
  const scopeSome = d.get("scope") === "some";
  const ids = scopeSome ? $$("#asScope input:checked").map((i) => i.value) : [];
  const rec = {
    type,
    value: num(d.get("value")),
    maxUses: Math.max(0, Math.round(num(d.get("maxUses")))),
    minAmount: Math.max(0, Math.round(num(d.get("minAmount")))),
    startsAt: dateOut(d.get("startsAt")),
    expiresAt: dateOut(d.get("expiresAt"), true),
    note: String(d.get("note") || "").trim().slice(0, 120),
    active: Boolean(d.get("active")),
    createdAt: Date.now(),
    createdBy: (A.ctx.user && A.ctx.user.email) || "admin"
  };
  if (type === "percent" && num(d.get("maxDiscount"))) rec.maxDiscount = Math.round(num(d.get("maxDiscount")));
  if (ids.length) rec.courseIds = Object.fromEntries(ids.map((id) => [id, true]));
  return { rec, scopeSome, ids, offer: Boolean(d.get("offer")) };
}

function validateCoupon({ rec, scopeSome, ids }) {
  if (!(rec.value > 0)) return "Enter the discount value.";
  if (rec.type === "percent" && rec.value > 100) return "Percent off can’t be more than 100.";
  if (rec.type === "percent") rec.value = Math.round(rec.value * 100) / 100;
  else rec.value = Math.round(rec.value);
  if (scopeSome && !ids.length) return "Pick at least one course or plan, or choose “All courses & plans”.";
  if (rec.expiresAt && rec.startsAt && rec.expiresAt < rec.startsAt) return "Expiry is before the start date.";
  return "";
}

async function saveCoupons(btn) {
  const form = $("#asCouponForm");
  const mode = ($('input[name="asMode"]:checked') || {}).value || "single";
  const data = readCouponForm(form);
  const err = validateCoupon(data);
  if (err) return alert("err", err);
  const { rec } = data;
  await busy(btn, "Saving…", async () => {
    try {
      if (mode === "single") {
        const code = normalizeCode(form.code.value);
        if (!/^[A-Z0-9-]{3,24}$/.test(code)) return alert("err", "Codes are 3–24 letters, numbers or dashes.");
        if (A.coupons[code] && !window.confirm(`${code} already exists. Overwrite its settings? (Usage count is kept.)`)) return;
        const updates = { [`${PATH.coupons}/${code}`]: { ...rec, code } };
        updates[`site/offers/${code}`] = data.offer ? offerRecord(code, rec) : null;
        await dbUpdateRoot(updates);
        alert("ok", `Coupon ${code} saved — ${couponLabel(rec)}.`);
        form.code.value = "";
      } else {
        const n = Math.min(500, Math.max(1, Math.round(num(form.count.value))));
        const prefix = normalizeCode(form.prefix.value).replace(/-+$/, "").slice(0, 10);
        const len = Number(form.length.value) || 6;
        const batch = String(form.batch.value || "").trim().slice(0, 30) || `B${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${generateCode("", 3)}`;
        const codes = new Set();
        let guard = 0;
        while (codes.size < n && guard++ < n * 20) {
          const c = generateCode(prefix, len);
          if (!A.coupons[c]) codes.add(c);
        }
        const updates = {};
        codes.forEach((code) => (updates[`${PATH.coupons}/${code}`] = { ...rec, code, batch }));
        await dbUpdateRoot(updates);
        A.lastCodes = Array.from(codes).map((code) => ({ code, batch, label: couponLabel(rec), maxUses: rec.maxUses, expiresAt: rec.expiresAt }));
        $("#asCodesList").textContent = A.lastCodes.map((c) => c.code).join("\n");
        $("#asCodesOut").hidden = false;
        alert("ok", `Generated ${codes.size} codes in batch “${batch}” — ${couponLabel(rec)} each.`);
      }
    } catch (e) {
      alert("err", friendlyError(e));
    }
  });
}

function offerRecord(code, rec) {
  const o = { code, label: couponLabel(rec) + (num(rec.minAmount) ? ` on orders above ${money(rec.minAmount)}` : ""), type: rec.type, value: rec.value };
  if (rec.courseIds) o.courseIds = rec.courseIds;
  if (rec.expiresAt) o.expiresAt = rec.expiresAt;
  return o;
}

function exportCoupons(list) {
  const rows = [["Code", "Type", "Value", "Max discount", "Min amount", "Applies to", "Used", "Max uses", "Starts", "Expires", "Status", "Batch", "Note"]];
  list.forEach((c) =>
    rows.push([c.code, c.type, c.value, c.maxDiscount || "", c.minAmount || "", scopeLabel(c), c.used, c.maxUses || "unlimited", num(c.startsAt) ? dateIn(c.startsAt) : "", num(c.expiresAt) ? dateIn(c.expiresAt) : "", couponState(c, c.used).label, c.batch || "", c.note || ""])
  );
  downloadText(`fenxtek-coupons-${today()}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
}

function bindCoupons() {
  const card = $("#asCouponCreate");
  card.innerHTML = couponFormHTML();
  const form = $("#asCouponForm");
  paintScope();
  const sync = () => {
    const mode = ($('input[name="asMode"]:checked') || {}).value;
    $$("[data-mode]", card).forEach((el) => (el.hidden = el.dataset.mode !== mode));
    const type = (form.querySelector('input[name="type"]:checked') || {}).value;
    $("#asValLabel").textContent = type === "flat" ? "Amount off (₹)" : "Percent off";
    $$("[data-pct]", form).forEach((el) => (el.hidden = type === "flat"));
    $("#asScope").hidden = (form.querySelector('input[name="scope"]:checked') || {}).value !== "some";
    $("#asCouponSave span").textContent = mode === "bulk" ? "Generate codes" : "Create coupon";
    if (mode === "bulk" && form.maxUses.value === "0" && !form.maxUses.dataset.touched) form.maxUses.value = "1";
    if (mode === "single" && form.maxUses.value === "1" && !form.maxUses.dataset.touched) form.maxUses.value = "0";
  };
  form.maxUses.addEventListener("input", () => (form.maxUses.dataset.touched = "1"));
  card.addEventListener("change", sync);
  sync();
  $("#asGen").addEventListener("click", () => (form.code.value = generateCode("FXT", 6)));
  $("#asCouponSave").addEventListener("click", (e) => saveCoupons(e.currentTarget));
  $("#asCodesCopy").addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText($("#asCodesList").textContent).then(() => alert("ok", "Codes copied.")));
  $("#asCodesCsv").addEventListener("click", () => {
    const rows = [["Code", "Discount", "Max uses", "Expires", "Batch"], ...A.lastCodes.map((c) => [c.code, c.label, c.maxUses || "unlimited", num(c.expiresAt) ? dateIn(c.expiresAt) : "", c.batch])];
    downloadText(`fenxtek-codes-${A.lastCodes[0] ? A.lastCodes[0].batch : today()}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
  });

  const f = A.couponFilter;
  $("#asCouponQ").addEventListener("input", (e) => {
    f.q = e.target.value;
    A.couponLimit = 200;
    paintCoupons();
  });
  $("#asCouponStatus").addEventListener("change", (e) => {
    f.status = e.target.value;
    paintCoupons();
  });
  $("#asCouponBatch").addEventListener("change", (e) => {
    f.batch = e.target.value;
    paintCoupons();
  });
  $("#asCouponExport").addEventListener("click", () => {
    const q = f.q.trim().toUpperCase();
    exportCoupons(couponList().filter((c) => (!f.batch || c.batch === f.batch) && (f.status === "all" || couponState(c, c.used).key === f.status) && (!q || c.code.includes(q))));
  });
  $("#asCouponBatchDel").addEventListener("click", async () => {
    const b = f.batch;
    const codes = couponList().filter((c) => c.batch === b);
    if (!b || !codes.length) return;
    if (!window.confirm(`Delete all ${codes.length} codes in batch “${b}”? Redeemed orders keep their discount.`)) return;
    const updates = {};
    codes.forEach((c) => {
      updates[`${PATH.coupons}/${c.code}`] = null;
      updates[`site/offers/${c.code}`] = null;
    });
    try {
      await dbUpdateRoot(updates);
      f.batch = "";
      alert("ok", `Deleted batch “${b}”.`);
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
  $("#asCouponsBody").addEventListener("click", async (e) => {
    const more = e.target.closest("#asCouponMore");
    if (more) {
      A.couponLimit += 200;
      paintCoupons();
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    try {
      if (d.kCopy) {
        await navigator.clipboard.writeText(d.kCopy).catch(() => {});
        alert("ok", `Copied ${d.kCopy}`);
      } else if (d.kToggle) {
        const c = A.coupons[d.kToggle];
        await dbSet(`${PATH.coupons}/${d.kToggle}/active`, c.active === false);
      } else if (d.kOffer) {
        const c = A.coupons[d.kOffer];
        await dbSet(`site/offers/${d.kOffer}`, A.offers[d.kOffer] ? null : offerRecord(d.kOffer, c));
      } else if (d.kDel) {
        if (!window.confirm(`Delete coupon ${d.kDel}? Orders that used it keep their discount.`)) return;
        await dbUpdateRoot({ [`${PATH.coupons}/${d.kDel}`]: null, [`site/offers/${d.kDel}`]: null });
      }
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

/* ============================================================
   PAYMENT SETTINGS
   ============================================================ */
const PAY_FIELDS = ["businessName", "address", "gstin", "supportPhone", "receiptNote", "upiId", "payeeName", "razorpayKey"];

function fillPayments() {
  const form = $("#asPayForm");
  if (!form || form.dataset.dirty === "1") return;
  PAY_FIELDS.forEach((k) => {
    if (form.elements[k]) form.elements[k].value = A.pay[k] == null ? "" : A.pay[k];
  });
  form.upiEnabled.checked = Boolean(A.pay.upiEnabled);
  form.razorpayEnabled.checked = Boolean(A.pay.razorpayEnabled);
}

function bindPayments() {
  const form = $("#asPayForm");
  if (!form) return;
  form.addEventListener("input", () => (form.dataset.dirty = "1"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rec = {};
    PAY_FIELDS.forEach((k) => (rec[k] = String(form.elements[k].value || "").trim()));
    rec.upiEnabled = form.upiEnabled.checked;
    rec.razorpayEnabled = form.razorpayEnabled.checked;
    if (rec.upiEnabled && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(rec.upiId)) return alert("err", "Enter a valid UPI ID like fenxtek@okaxis to enable UPI.");
    if (rec.upiId && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(rec.upiId)) return alert("err", "That UPI ID doesn’t look right.");
    if (rec.razorpayEnabled && !/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(rec.razorpayKey)) return alert("err", "Enter your Razorpay Key ID (rzp_live_… or rzp_test_…) to enable Razorpay.");
    if (rec.razorpayKey && !/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(rec.razorpayKey)) return alert("err", "That Razorpay Key ID doesn’t look right.");
    busy(form.querySelector('button[type="submit"]'), "Saving…", async () => {
      try {
        await dbSet(PATH.payments, { ...rec, updatedAt: Date.now() });
        form.dataset.dirty = "0";
        alert("ok", "Payment settings saved. Checkout uses them immediately.");
      } catch (err) {
        alert("err", friendlyError(err));
      }
    });
  });
  $("#asPayPreview").addEventListener("click", () => {
    const now = Date.now();
    const c = A.courses[0] || normalizeCourse({ title: "SSC Stenographer 100 WPM — Hindi", price: 349, mrp: 599, validityDays: 365, category: "Exam pack", mode: "Recorded" });
    const sample = {
      id: "-SAMPLE0000",
      orderNo: orderNumber(),
      uid: "sample",
      name: "Aarav Sharma",
      email: "student@example.com",
      phone: "+91 98765 43210",
      items: [{ id: c.id || "x", title: c.title, price: c.price, mrp: Math.max(c.mrp, c.price), validityDays: c.validityDays, category: c.category, mode: c.mode, language: c.language }],
      subtotal: c.price,
      discount: Math.round(c.price * 0.1),
      total: c.price - Math.round(c.price * 0.1),
      coupon: { code: "WELCOME10" },
      status: "paid",
      method: "razorpay",
      paymentId: "pay_SAMPLE12345",
      createdAt: now,
      paidAt: now
    };
    const form2 = $("#asPayForm");
    const settings = {};
    PAY_FIELDS.forEach((k) => (settings[k] = form2.elements[k].value.trim()));
    adminModal("Receipt preview (sample data)", `<div id="asRcpt" class="as-note">Rendering…</div>`, (box) => {
      receiptDataURL(sample, settings).then((url) => ($("#asRcpt", box).outerHTML = `<img src="${url}" alt="Sample receipt">`));
    });
  });
}

/* ============================================================
   public API (called by admin.js)
   ============================================================ */
let started = false;
export function initStore(ctx) {
  if (started) return;
  started = true;
  A.ctx = ctx;
  try {
    bindOrders();
    bindCourses();
    bindCoupons();
    bindPayments();
  } catch (err) {
    console.warn("[admin-store] bind", err);
  }

  watchContent(() => paintCourses());
  dbWatch(PATH.courses, (v) => {
    A.coursesRaw = v || {};
    A.courses = coursesFrom(v, { all: true });
    paintCourses();
    paintScope();
    paintCoupons();
  });
  dbWatch(PATH.plans, (v) => {
    A.plans = plansFrom(v, { all: true });
    paintScope();
    paintCoupons();
  });
  dbWatch(PATH.payments, (v) => {
    A.pay = v || {};
    fillPayments();
  });
  dbWatch("site/offers", (v) => {
    A.offers = v || {};
    paintCoupons();
  });
  dbWatch(PATH.coupons, (v) => {
    A.coupons = v || {};
    paintCoupons();
  });
  dbWatch(PATH.couponUsage, (v) => {
    A.usage = v || {};
    paintCoupons();
  });
  dbWatch(PATH.orders, (v) => {
    A.orders = flattenOrders(v);
    paintOrders();
    paintCourses();
    paintCoupons();
  });
}

export function storeTabOpened(name) {
  if (name === "orders") paintOrders();
  if (name === "courses") paintCourses();
  if (name === "coupons") paintCoupons();
  if (name === "payments") fillPayments();
}
