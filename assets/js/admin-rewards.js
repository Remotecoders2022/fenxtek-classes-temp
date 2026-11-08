/* ============================================================
   FENXTEK — admin CRM: Refer & earn (E-coins)
   - Settings (site/rewards): on/off, coins for referrer / new
     student, max % of an order payable with coins, minimum
     qualifying order, terms note.
   - Referrals table: who referred whom, reward / void by hand.
   - Wallets: balances, earned / used, manual ± adjustments.
   - Helpers used by admin-store.js so approving / verifying an
     order settles the referral, and rejecting / refunding returns
     the E-coins the student spent.
   1 E-coin = ₹1. Coins are only ever credited by an admin action.
   ============================================================ */

import { dbGet, dbSet, dbWatch, dbUpdateRoot, dbKey, friendlyError } from "./firebase.js?v=5";
import { PATH, esc, money, num, formatDate, rewardsFrom, coinsLabel, TX_LABEL, coursesFrom, orderEarnCoins, orderReferrerCoins, flattenOrders } from "./commerce.js?v=5";
import { emiItemOf } from "./emi.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const val = (s) => (s && s.exists && s.exists() ? s.val() : null);
const fmt = (n) => Math.round(num(n)).toLocaleString("en-IN");

const R = {
  ctx: null,
  rewards: rewardsFrom(null),
  referrals: {}, // uid -> record
  wallets: {}, // uid -> { balance, earned, spent }
  orders: [], // flattened, for course-reward stats
  users: {}, // uid -> profile (loaded on demand)
  usersLoaded: false,
  filter: { q: "", status: "all" },
  walletQ: ""
};

const alert = (kind, msg) => R.ctx && R.ctx.showAlert(kind, msg);
const busy = (btn, label, fn) => (R.ctx ? R.ctx.withBusy(btn, label, fn) : fn());
const adminEmail = () => (R.ctx && R.ctx.user && R.ctx.user.email) || "admin";

/* ------------------------------------------------------------
   wallet maths (shared with admin-store.js)
   ------------------------------------------------------------ */

/* only the keys the database rules allow on wallets/<uid> */
function cleanWallet(w) {
  const out = { balance: Math.max(0, num(w && w.balance)), earned: Math.max(0, num(w && w.earned)), spent: Math.max(0, num(w && w.spent)) };
  if (w && w.lastSpend && typeof w.lastSpend === "object") {
    out.lastSpend = { orderId: String(w.lastSpend.orderId || ""), coins: Math.max(0, num(w.lastSpend.coins)), at: num(w.lastSpend.at) };
  }
  return out;
}

/* Build the updates that move `coins` (±) in or out of several wallets at once.
   entries: [{ uid, coins, type, note, key, orderId, orderNo, ref }] */
async function walletUpdates(entries, now = Date.now()) {
  const updates = {};
  const uids = Array.from(new Set(entries.map((e) => e.uid)));
  const current = {};
  await Promise.all(uids.map(async (uid) => (current[uid] = cleanWallet(val(await dbGet(`${PATH.wallets}/${uid}`))))));
  for (const e of entries) {
    const c = Math.round(num(e.coins));
    if (!c) continue;
    const w = current[e.uid];
    const take = c < 0 ? Math.min(w.balance, -c) : 0; // never below zero
    const delta = c > 0 ? c : -take;
    if (!delta) continue;
    w.balance += delta;
    if (e.type === "refund") w.spent = Math.max(0, w.spent - delta);
    else if (delta > 0) w.earned += delta;
    else w.earned = Math.max(0, w.earned + delta);
    w.updatedAt = now;
    const key = e.key || (await dbKey(`${PATH.walletTx}/${e.uid}`));
    const tx = { type: e.type, coins: delta, at: now, by: adminEmail() };
    if (e.note) tx.note = String(e.note).slice(0, 200);
    if (e.orderId) tx.orderId = String(e.orderId);
    if (e.orderNo) tx.orderNo = String(e.orderNo);
    if (e.ref) tx.ref = String(e.ref);
    updates[`${PATH.walletTx}/${e.uid}/${key}`] = tx;
  }
  uids.forEach((uid) => {
    if (Object.keys(updates).some((k) => k.startsWith(`${PATH.walletTx}/${uid}/`))) updates[`${PATH.wallets}/${uid}`] = current[uid];
  });
  return updates;
}

/* Wallet entries + bookkeeping for a pending referral. `order` = the qualifying order (optional). */
function settleParts(uid, ref, rw, order, referrerCoins, now) {
  const by = ref.by;
  const name = ref.name || "A friend";
  const give = Math.max(0, Math.round(num(referrerCoins)));
  const entries = [];
  if (give) entries.push({ uid: by, coins: give, type: "referral", key: `ref-${uid}`, note: `${name} joined with your code`, ref: uid, orderNo: order && order.orderNo });
  if (rw.refereeCoins) entries.push({ uid, coins: rw.refereeCoins, type: "welcome", key: `welcome-${by}`, note: `Joined with code ${ref.code || ""}`.trim(), ref: by, orderNo: order && order.orderNo });
  const updates = {};
  const r = `${PATH.referrals}/${uid}`;
  updates[`${r}/status`] = "rewarded";
  updates[`${r}/rewardedAt`] = now;
  updates[`${r}/referrerCoins`] = give;
  updates[`${r}/refereeCoins`] = rw.refereeCoins;
  if (order && order.id) updates[`${r}/orderId`] = String(order.id);
  if (order && order.orderNo) updates[`${r}/orderNo`] = String(order.orderNo);
  const b = `${PATH.referredBy}/${by}/${uid}`;
  updates[`${b}/status`] = "rewarded";
  updates[`${b}/coins`] = give;
  updates[`${b}/rewardedAt`] = now;
  return { entries, updates };
}

/* Manual "Reward now" from the referrals table (no order). */
async function settleUpdates(uid, ref, rw, order, now = Date.now()) {
  const parts = settleParts(uid, ref, rw, order, rw.referrerCoins, now);
  return Object.assign(await walletUpdates(parts.entries, now), parts.updates);
}

async function coursesMap() {
  const map = {};
  coursesFrom(val(await dbGet(PATH.courses).catch(() => null)), { all: true }).forEach((c) => (map[c.id] = c));
  return map;
}

/* Called when an order becomes paid by an admin action (approve UPI, verify
   Razorpay, offline sale). Credits, in ONE wallet write:
   - the buyer's purchase reward (per-course coins or the % rule), once per order
   - the referral reward for both sides if this is the friend's qualifying order
   Returns {} when there is nothing to credit. */
export async function orderRewardUpdates(o, now = Date.now()) {
  try {
    if (!o || !o.uid || num(o.total) <= 0) return {};
    /* EMI: earlier parts earn nothing; the final part earns (and settles the
       referral) on the full course price, exactly like a one-time purchase */
    const em = emiItemOf(o);
    if (em && num(em.emi.n) < num(em.emi.of)) return {};
    if (em) o = { ...o, total: num(em.emi.total) || num(o.total), items: { [em.id]: { ...em, price: num(em.emi.total) || num(em.price) } } };
    const rw = rewardsFrom(val(await dbGet(PATH.rewards)));
    if (!rw.enabled) return {};
    const courses = await coursesMap();
    const entries = [];
    let extra = {};
    const earn = o.coinsEarned ? 0 : orderEarnCoins(o, rw, courses);
    if (earn > 0) {
      entries.push({ uid: o.uid, coins: earn, type: "purchase", key: `buy-${o.id}`, note: `Earned on ${o.orderNo || "your order"}`, orderId: o.id, orderNo: o.orderNo });
      extra[`${PATH.orders}/${o.uid}/${o.id}/coinsEarned`] = earn;
    }
    if (num(o.total) >= rw.minOrder) {
      const ref = val(await dbGet(`${PATH.referrals}/${o.uid}`).catch(() => null));
      if (ref && ref.status === "pending" && ref.by && ref.by !== o.uid) {
        const parts = settleParts(o.uid, ref, rw, o, orderReferrerCoins(o, rw, courses), now);
        entries.push(...parts.entries);
        extra = Object.assign(extra, parts.updates);
      }
    }
    if (!entries.length) return {};
    return Object.assign(await walletUpdates(entries, now), extra);
  } catch (err) {
    console.warn("[rewards] order rewards", err);
    return {};
  }
}
/* kept for older call sites */
export const referralRewardUpdates = orderRewardUpdates;

/* Reject: give back the E-coins spent on the order (once). */
export async function coinRefundUpdates(o, reason, now = Date.now()) {
  const coins = Math.round(num(o && o.coins));
  if (!coins || o.coinsReturned) return {};
  const updates = await walletUpdates([{ uid: o.uid, coins, type: "refund", key: `refund-${o.id}`, note: reason || `Returned from ${o.orderNo}`, orderId: o.id, orderNo: o.orderNo }], now);
  updates[`${PATH.orders}/${o.uid}/${o.id}/coinsReturned`] = true;
  return updates;
}

/* The referral this order paid out, if any (to ask the admin before taking it back). */
export async function referralOfOrder(o) {
  const ref = val(await dbGet(`${PATH.referrals}/${o.uid}`).catch(() => null));
  return ref && ref.status === "rewarded" && ref.orderId === o.id ? ref : null;
}

/* Refund: in ONE wallet write, return the coins the student spent, take back the
   purchase reward and (optionally) the referral reward this order earned. */
export async function orderReversalUpdates(o, { reason = "", clawReferral = null, clawPurchase = true } = {}, now = Date.now()) {
  const entries = [];
  const extra = {};
  const base = `${PATH.orders}/${o.uid}/${o.id}`;
  const spent = Math.round(num(o.coins));
  if (spent && !o.coinsReturned) {
    entries.push({ uid: o.uid, coins: spent, type: "refund", key: `refund-${o.id}`, note: reason || `Returned from ${o.orderNo}`, orderId: o.id, orderNo: o.orderNo });
    extra[`${base}/coinsReturned`] = true;
  }
  const earned = Math.round(num(o.coinsEarned));
  if (clawPurchase && earned && !o.coinsEarnedReversed) {
    entries.push({ uid: o.uid, coins: -earned, type: "debit", key: `unbuy-${o.id}`, note: `Course reward reversed — ${o.orderNo} refunded`, orderId: o.id, orderNo: o.orderNo });
    extra[`${base}/coinsEarnedReversed`] = true;
  }
  const ref = clawReferral;
  if (ref) {
    if (num(ref.referrerCoins)) entries.push({ uid: ref.by, coins: -num(ref.referrerCoins), type: "debit", note: `Referral reversed — ${o.orderNo} refunded`, ref: o.uid });
    if (num(ref.refereeCoins)) entries.push({ uid: o.uid, coins: -num(ref.refereeCoins), type: "debit", note: `Welcome bonus reversed — ${o.orderNo} refunded`, ref: ref.by });
    extra[`${PATH.referrals}/${o.uid}/status`] = "void";
    extra[`${PATH.referrals}/${o.uid}/note`] = `Reversed: ${o.orderNo} refunded`;
    extra[`${PATH.referredBy}/${ref.by}/${o.uid}/status`] = "void";
  }
  if (!entries.length) return extra;
  return Object.assign(await walletUpdates(entries, now), extra);
}

/* kept for older call sites */
export async function referralClawbackUpdates(o, now = Date.now()) {
  const ref = await referralOfOrder(o);
  if (!ref) return null;
  return { updates: await orderReversalUpdates(o, { clawReferral: ref, clawPurchase: false }, now), ref };
}

/* ------------------------------------------------------------
   panel
   ------------------------------------------------------------ */
const userOf = (uid) => R.users[uid] || null;
const who = (uid, fallback) => {
  const u = userOf(uid);
  return u ? u.name || u.email || uid : fallback || uid;
};
const whoSub = (uid) => {
  const u = userOf(uid);
  return u ? [u.email, u.phone].filter(Boolean).join(" · ") : uid;
};

async function loadUsers(force) {
  if (R.usersLoaded && !force) return;
  const v = val(await dbGet("users").catch(() => null)) || {};
  R.users = v;
  R.usersLoaded = true;
}

function fillForm() {
  const f = $("#arForm");
  if (!f || f.contains(document.activeElement)) return;
  const r = R.rewards;
  f.enabled.checked = r.enabled;
  f.referrerCoins.value = r.referrerCoins;
  f.refereeCoins.value = r.refereeCoins;
  f.maxRedeemPct.value = r.maxRedeemPct;
  f.minOrder.value = r.minOrder;
  f.buyOn.checked = r.buyOn;
  f.buyPct.value = r.buyPct;
  f.buyMax.value = r.buyMax || "";
  f.note.value = r.note || "";
  if (f.typingOn) {
    f.typingOn.checked = r.typingOn;
    f.typingCoins.value = r.typingCoins;
    f.typingMinWpm.value = r.typingMinWpm;
    f.typingDailyMax.value = r.typingDailyMax;
    f.typingNote.value = r.typingNote || "";
  }
  previewRules();
  const st = $("#arLive");
  if (st) {
    st.textContent = r.enabled ? "Live" : "Off";
    st.className = `as-pill ${r.enabled ? "as-pill--ok" : "as-pill--muted"}`;
  }
}

/* Live "what students get" summary next to the settings */
function previewRules() {
  const f = $("#arForm");
  const box = $("#arPreview");
  if (!f || !box) return;
  const n = (k) => Math.max(0, Math.round(num(f[k].value)));
  const on = f.enabled.checked;
  const buy = f.buyOn.checked && n("buyPct") > 0;
  const ex = 1499;
  const exCoins = buy ? (n("buyMax") ? Math.min(n("buyMax"), Math.floor((ex * n("buyPct")) / 100)) : Math.floor((ex * n("buyPct")) / 100)) : 0;
  const row = (ic, t, d) => `<li><span class="ar-pv-ic">${icon(ic)}</span><div><b>${t}</b><small>${d}</small></div></li>`;
  box.innerHTML =
    `<span class="ar-pv-k">What students see</span>` +
    (on
      ? `<ul class="ar-pv">` +
        row("i-users", `Refer a friend → <em>${fmt(n("referrerCoins"))}</em> E-coins`, `When a friend joins with their link or invite code and their first order is confirmed. Courses can offer more.`) +
        row("i-gift", `Friend gets <em>${fmt(n("refereeCoins"))}</em> E-coins`, "Welcome bonus, added with that first order.") +
        row("i-cart", buy ? `Buy a course → <em>${n("buyPct")}%</em> back in E-coins` : "Purchase rewards are off", buy ? `A ₹${ex.toLocaleString("en-IN")} course earns ${fmt(exCoins)} E-coins${n("buyMax") ? ` (max ${fmt(n("buyMax"))} per order)` : ""}. Courses with fixed coins override this.` : "Turn on to give E-coins back on every paid order, or set fixed coins on individual courses.") +
        row("i-coin", `Pay up to <em>${Math.min(90, n("maxRedeemPct"))}%</em> with E-coins`, "1 E-coin = ₹1 at checkout.") +
        (f.typingOn && f.typingOn.checked
          ? row("i-keyboard", `Typing personal best → up to <em>${fmt(n("typingCoins"))}</em> E-coins`, `Typing test (English, Kruti Dev, Mangal): 1 coin per 5 wpm above ${fmt(n("typingMinWpm"))} wpm, capped at ${fmt(n("typingDailyMax"))} a day.`)
          : row("i-keyboard", "Typing rewards are off", "Students can still practise — they just don’t earn E-coins from it.")) +
        `</ul>`
      : `<p class="ar-pv-off">${icon("i-info")}<span>The program is off — students don’t see E-coins, invite links or rewards.</span></p>`);
}

function paintStats() {
  const box = $("#arStats");
  if (!box) return;
  const refs = Object.values(R.referrals);
  const ws = Object.values(R.wallets);
  const stat = (b, s) => `<div class="crm-stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`;
  box.innerHTML =
    stat(String(refs.length), "Referrals") +
    stat(String(refs.filter((r) => r.status === "pending").length), "Waiting for first order") +
    stat(String(refs.filter((r) => r.status === "rewarded").length), "Rewarded") +
    stat(fmt(R.orders.reduce((t, o) => t + (o.coinsEarnedReversed ? 0 : num(o.coinsEarned)), 0)), "Course rewards paid") +
    stat(String(R.orders.filter((o) => num(o.coinsEarned) > 0 && !o.coinsEarnedReversed).length), "Orders that earned coins") +
    stat(fmt(ws.reduce((t, w) => t + num(w.earned), 0)), "E-coins issued") +
    stat(fmt(ws.reduce((t, w) => t + num(w.spent), 0)), "E-coins redeemed (₹)") +
    stat(fmt(ws.reduce((t, w) => t + num(w.balance), 0)), "Outstanding balance");
}

function paintReferrals() {
  const body = $("#arRefBody");
  if (!body) return;
  const q = R.filter.q.trim().toLowerCase();
  const list = Object.keys(R.referrals)
    .map((uid) => ({ uid, ...R.referrals[uid] }))
    .filter((r) => R.filter.status === "all" || r.status === R.filter.status)
    .filter((r) => !q || [r.name, r.code, who(r.uid), whoSub(r.uid), who(r.by), whoSub(r.by), r.orderNo].join(" ").toLowerCase().includes(q))
    .sort((a, b) => num(b.at) - num(a.at));
  const count = $("#arRefCount");
  if (count) count.textContent = `${list.length} of ${Object.keys(R.referrals).length}`;
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="crm-table-empty">${Object.keys(R.referrals).length ? "No referrals match." : "No referrals yet. They appear when a student signs up with a friend’s code."}</td></tr>`;
    return;
  }
  const pillOf = (s) =>
    s === "rewarded" ? `<span class="as-pill as-pill--ok">Rewarded</span>` : s === "void" ? `<span class="as-pill as-pill--muted">Void</span>` : `<span class="as-pill as-pill--warn">Pending</span>`;
  body.innerHTML = list
    .slice(0, 400)
    .map(
      (r) =>
        `<tr>` +
        `<td><b>${esc(who(r.uid, r.name || "Student"))}</b><div class="as-sub">${esc(whoSub(r.uid))}</div></td>` +
        `<td><b>${esc(who(r.by))}</b><div class="as-sub">${esc(whoSub(r.by))}</div></td>` +
        `<td><span class="as-code">${esc(r.code || "—")}</span></td>` +
        `<td>${esc(formatDate(r.at, true))}${r.orderNo ? `<div class="as-sub as-code">${esc(r.orderNo)}</div>` : ""}</td>` +
        `<td>${pillOf(r.status)}${r.status === "rewarded" ? `<div class="as-sub">+${fmt(r.referrerCoins)} / +${fmt(r.refereeCoins)}</div>` : ""}${r.note ? `<div class="as-sub">${esc(r.note)}</div>` : ""}</td>` +
        `<td class="actions"><div class="as-row-acts">` +
        (r.status === "pending"
          ? `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-ar-reward="${esc(r.uid)}">${icon("i-check")}<span>Reward now</span></button>` +
            `<button class="as-icon as-icon--danger" type="button" data-ar-void="${esc(r.uid)}" title="Mark not eligible">${icon("i-x")}</button>`
          : "") +
        `</div></td></tr>`
    )
    .join("");
}

function paintWallets() {
  const body = $("#arWalletBody");
  if (!body) return;
  const q = R.walletQ.trim().toLowerCase();
  let rows = Object.keys(R.wallets).map((uid) => ({ uid, ...R.wallets[uid] }));
  if (q && R.usersLoaded) {
    /* searching also finds students who don't have a wallet yet */
    Object.keys(R.users).forEach((uid) => {
      if (!R.wallets[uid]) rows.push({ uid, balance: 0, earned: 0, spent: 0, none: true });
    });
  }
  rows = rows
    .filter((w) => !q || [who(w.uid), whoSub(w.uid), w.uid].join(" ").toLowerCase().includes(q))
    .sort((a, b) => num(b.balance) - num(a.balance) || num(b.earned) - num(a.earned));
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="crm-table-empty">${q ? "No student matches." : "No wallets yet — they are created when coins are first credited."}</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .slice(0, 200)
    .map(
      (w) =>
        `<tr><td><b>${esc(who(w.uid, "Student"))}</b><div class="as-sub">${esc(whoSub(w.uid))}</div></td>` +
        `<td><span class="as-amount">${fmt(w.balance)}</span></td><td>${fmt(w.earned)}</td><td>${fmt(w.spent)}</td>` +
        `<td class="actions"><div class="as-row-acts">` +
        `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-ar-adj="${esc(w.uid)}">${icon("i-plus")}<span>Add / remove</span></button>` +
        (w.none ? "" : `<button class="as-icon" type="button" data-ar-hist="${esc(w.uid)}" title="History">${icon("i-eye")}</button>`) +
        `</div></td></tr>`
    )
    .join("");
}

function paintAll() {
  fillForm();
  paintStats();
  paintReferrals();
  paintWallets();
}

async function rewardNow(uid, btn) {
  const ref = R.referrals[uid];
  if (!ref || ref.status !== "pending") return;
  const rw = R.rewards;
  if (!window.confirm(`Reward this referral now?\n\n${who(ref.by)} gets ${coinsLabel(rw.referrerCoins)} and ${who(uid, ref.name)} gets ${coinsLabel(rw.refereeCoins)}.`)) return;
  await busy(btn, "…", async () => {
    try {
      await dbUpdateRoot(await settleUpdates(uid, ref, rw, null));
      alert("ok", "Referral rewarded — both wallets were credited.");
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

async function voidRef(uid) {
  const ref = R.referrals[uid];
  if (!ref) return;
  const note = window.prompt("Mark this referral as not eligible? Reason (shown to the students):", "Not eligible");
  if (note == null) return;
  try {
    await dbUpdateRoot({
      [`${PATH.referrals}/${uid}/status`]: "void",
      [`${PATH.referrals}/${uid}/note`]: String(note).slice(0, 200),
      [`${PATH.referredBy}/${ref.by}/${uid}/status`]: "void"
    });
    alert("ok", "Referral marked as not eligible.");
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

async function adjust(uid) {
  const raw = window.prompt(`Add or remove E-coins for ${who(uid, "this student")}.\nUse a minus sign to remove (e.g. -50). Current balance: ${fmt((R.wallets[uid] || {}).balance)}`, "50");
  if (raw == null) return;
  const coins = Math.round(Number(String(raw).replace(/[^\d-]/g, "")));
  if (!coins || !isFinite(coins)) {
    alert("err", "Enter a whole number of coins, like 50 or -50.");
    return;
  }
  const note = window.prompt("Note the student will see in their coin history:", coins > 0 ? "Bonus from FenxTek" : "Adjusted by the academy");
  if (note == null) return;
  try {
    const updates = await walletUpdates([{ uid, coins, type: coins > 0 ? "admin" : "debit", note: note || TX_LABEL[coins > 0 ? "admin" : "debit"] }]);
    if (!Object.keys(updates).length) {
      alert("err", "Nothing to remove — the wallet is already empty.");
      return;
    }
    await dbUpdateRoot(updates);
    alert("ok", `${coins > 0 ? "Added" : "Removed"} ${coinsLabel(Math.abs(coins))} ${coins > 0 ? "to" : "from"} ${who(uid, "the student")}’s wallet.`);
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

async function history(uid, btn) {
  await busy(btn, "…", async () => {
    const v = val(await dbGet(`${PATH.walletTx}/${uid}`).catch(() => null)) || {};
    const list = Object.keys(v)
      .map((k) => v[k])
      .sort((a, b) => num(b.at) - num(a.at))
      .slice(0, 50);
    const box = $("#arHist");
    if (!box) return;
    box.hidden = false;
    box.innerHTML =
      `<div class="as-bar"><b>${esc(who(uid, "Student"))} · coin history</b><button class="as-icon" type="button" id="arHistX" title="Close">${icon("i-x")}</button></div>` +
      (list.length
        ? `<ul class="ar-tx">${list
            .map((t) => `<li><span>${esc(TX_LABEL[t.type] || t.type)}</span><small>${esc([t.note, t.orderNo, formatDate(t.at, true), t.by].filter(Boolean).join(" · "))}</small><b class="${num(t.coins) < 0 ? "is-out" : "is-in"}">${num(t.coins) < 0 ? "−" : "+"}${fmt(Math.abs(num(t.coins)))}</b></li>`)
            .join("")}</ul>`
        : `<p class="as-note">No transactions yet.</p>`);
    $("#arHistX", box).addEventListener("click", () => (box.hidden = true));
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function bind() {
  const panel = $('[data-crm-panel="rewards"]');
  if (!panel) return false;
  const f = $("#arForm", panel);
  f.addEventListener("input", previewRules);
  f.addEventListener("change", previewRules);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = (k, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(f[k].value))));
    const rec = {
      enabled: f.enabled.checked,
      referrerCoins: n("referrerCoins", 0, 100000),
      refereeCoins: n("refereeCoins", 0, 100000),
      maxRedeemPct: n("maxRedeemPct", 0, 90),
      minOrder: n("minOrder", 0, 10000000),
      buyOn: f.buyOn.checked,
      buyPct: n("buyPct", 0, 50),
      buyMax: n("buyMax", 0, 100000),
      note: String(f.note.value || "").trim().slice(0, 300),
      typingOn: f.typingOn ? f.typingOn.checked : false,
      typingCoins: f.typingCoins ? n("typingCoins", 0, 500) : 0,
      typingMinWpm: f.typingMinWpm ? n("typingMinWpm", 0, 300) : 0,
      typingDailyMax: f.typingDailyMax ? n("typingDailyMax", 0, 5000) : 0,
      typingNote: f.typingNote ? String(f.typingNote.value || "").trim().slice(0, 300) : "",
      updatedAt: Date.now()
    };
    busy(f.querySelector('button[type="submit"]'), "Saving…", async () => {
      try {
        await dbSet(PATH.rewards, rec);
        alert("ok", rec.enabled ? "Refer & earn is live for students." : "Refer & earn settings saved (program is off).");
      } catch (err) {
        alert("err", friendlyError(err));
      }
    });
  });
  $("#arRefQ", panel).addEventListener("input", (e) => {
    R.filter.q = e.target.value;
    paintReferrals();
  });
  $("#arRefStatus", panel).addEventListener("change", (e) => {
    R.filter.status = e.target.value;
    paintReferrals();
  });
  $("#arWalletQ", panel).addEventListener("input", (e) => {
    R.walletQ = e.target.value;
    paintWallets();
  });
  panel.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ar-reward],[data-ar-void],[data-ar-adj],[data-ar-hist]");
    if (!t) return;
    if (t.dataset.arReward) rewardNow(t.dataset.arReward, t);
    else if (t.dataset.arVoid) voidRef(t.dataset.arVoid);
    else if (t.dataset.arAdj) adjust(t.dataset.arAdj);
    else if (t.dataset.arHist) history(t.dataset.arHist, t);
  });
  return true;
}

let started = false;
export function initRewards(ctx) {
  if (started) return;
  started = true;
  R.ctx = ctx;
  if (!bind()) return;
  dbWatch(PATH.rewards, (v) => {
    R.rewards = rewardsFrom(v);
    fillForm();
  });
  dbWatch(PATH.referrals, (v) => {
    R.referrals = v && typeof v === "object" ? v : {};
    paintStats();
    paintReferrals();
    const badge = $('[data-crm-tab="rewards"] .crm-badge');
    const pending = Object.values(R.referrals).filter((r) => r && r.status === "pending").length;
    if (badge) badge.textContent = pending ? `${pending} new` : "";
  });
  dbWatch(PATH.orders, (v) => {
    R.orders = flattenOrders(v);
    paintStats();
  });
  dbWatch(PATH.wallets, (v) => {
    R.wallets = v && typeof v === "object" ? v : {};
    paintStats();
    paintWallets();
  });
}

export function rewardsTabOpened(name) {
  if (name !== "rewards") return;
  paintAll();
  loadUsers()
    .then(paintAll)
    .catch(() => {});
}
