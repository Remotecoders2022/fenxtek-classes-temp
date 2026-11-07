/* ============================================================
   FENXTEK — commerce core
   Shared by the student portal (dashboard.js) and the admin CRM
   (admin-store.js): course catalogue helpers, pricing, coupon
   validation, order numbers, enrolment validity and cover art.
   Pure functions only — no Firebase calls in here.
   ============================================================ */

export const DAY = 86400000;
export const CURRENCY = "INR";

/* RTDB paths — one place to change if the data model moves. */
export const PATH = {
  courses: "site/courses",
  courseImages: "site/courseImages",
  payments: "site/payments",
  offers: "site/offers",
  coupons: "coupons",
  couponUsage: "couponUsage",
  orders: "orders",
  carts: "carts",
  enrollments: "enrollments",
  courseAccess: "courseAccess",
  plans: "site/memberships",
  members: "members",
  rewards: "site/rewards",
  refCodes: "refCodes",
  referrals: "referrals",
  referredBy: "referredBy",
  wallets: "wallets",
  walletTx: "walletTx"
};

export const COURSE_CATEGORIES = ["Shorthand", "Typing", "Exam pack", "Dictation", "Mentorship", "Other"];
export const COURSE_MODES = ["Recorded", "Live", "Live + Recorded", "Practice"];
export const COURSE_LANGUAGES = ["Hindi", "English", "Hindi + English"];

/* Generative cover themes (used when a course has no picture). */
export const ACCENTS = {
  violet: { label: "Violet", a: "#6A5CFF", b: "#2A1DB0", ink: "#FFFFFF", glow: "#D9FF57", text: "#5A4BFF" },
  lime: { label: "Lime", a: "#E4FF7A", b: "#A8DB1F", ink: "#0B0B10", glow: "#5A4BFF", text: "#5C7800" },
  ink: { label: "Midnight", a: "#23232E", b: "#0B0B10", ink: "#FFFFFF", glow: "#D9FF57", text: "#23232E" },
  ocean: { label: "Ocean", a: "#1FC8F5", b: "#1848F0", ink: "#FFFFFF", glow: "#D9FF57", text: "#1848F0" },
  sunset: { label: "Sunset", a: "#FF9A4D", b: "#E5397A", ink: "#FFFFFF", glow: "#FFE29A", text: "#D9346F" },
  gold: { label: "Gold", a: "#FFD15C", b: "#F08C00", ink: "#0B0B10", glow: "#FFFFFF", text: "#A35F00" }
};
export const accentOf = (key) => ACCENTS[key] || ACCENTS.violet;

/* ---------------- formatting ---------------- */

export const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function money(value, opts = {}) {
  const n = Math.round(Number(value) || 0);
  const s = n.toLocaleString("en-IN");
  return opts.plain ? s : "₹" + s;
}

export function num(value, fallback = 0) {
  const n = Number(String(value == null ? "" : value).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}

export function offPercent(price, mrp) {
  const p = num(price);
  const m = num(mrp);
  if (!(m > p) || m <= 0) return 0;
  return Math.round(((m - p) / m) * 100);
}

export function formatDate(ms, withTime) {
  const d = new Date(Number(ms) || 0);
  if (!d.getTime()) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (!withTime) return date;
  return date + ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function validityLabel(days) {
  const d = num(days);
  if (!d) return "Lifetime access";
  if (d % 365 === 0) return `${d / 365} year${d === 365 ? "" : "s"} access`;
  if (d % 30 === 0) return `${d / 30} month${d === 30 ? "" : "s"} access`;
  return `${d} days access`;
}

/* ---------------- catalogue ---------------- */

export function toList(value) {
  if (!value) return [];
  const arr = Array.isArray(value)
    ? value.map((v, i) => (v && typeof v === "object" ? { id: v.id || String(i), ...v } : null)).filter(Boolean)
    : Object.keys(value).map((k) => ({ id: k, ...(value[k] && typeof value[k] === "object" ? value[k] : {}) }));
  return arr.sort((a, b) => {
    const ao = Number(a.order);
    const bo = Number(b.order);
    if (isFinite(ao) && isFinite(bo) && ao !== bo) return ao - bo;
    return String(a.id).localeCompare(String(b.id));
  });
}

/* Normalise a raw course record into a predictable shape. */
const optCoins = (v) => (v === undefined || v === null || v === "" || !isFinite(Number(v)) || Number(v) < 0 ? -1 : Math.min(100000, Math.round(Number(v))));

export function normalizeCourse(raw) {
  const c = raw || {};
  const features = Array.isArray(c.features)
    ? c.features.map(String)
    : c.features && typeof c.features === "object"
    ? Object.values(c.features).map(String)
    : String(c.features || "")
        .split(/\n+/)
        .map((s) => s.trim());
  return {
    id: String(c.id || ""),
    title: String(c.title || "Untitled course"),
    subtitle: String(c.subtitle || ""),
    category: String(c.category || "Shorthand"),
    language: String(c.language || "Hindi"),
    mode: String(c.mode || "Recorded"),
    price: Math.max(0, Math.round(num(c.price))),
    mrp: Math.max(0, Math.round(num(c.mrp))),
    validityDays: Math.max(0, Math.round(num(c.validityDays))),
    badge: String(c.badge || ""),
    accent: ACCENTS[c.accent] ? c.accent : "violet",
    features: features.filter(Boolean).slice(0, 12),
    description: String(c.description || ""),
    thumb: c.thumb === "upload" || c.thumb === "link" ? c.thumb : "none",
    thumbUrl: String(c.thumbUrl || ""),
    published: c.published !== false,
    order: num(c.order, 0),
    lessons: Math.max(0, Math.round(num(c.lessons))),
    memberPrice: Math.max(0, Math.round(num(c.memberPrice))), // 0 = use the plan's % off
    /* E-coins: -1 = follow the academy-wide rule in site/rewards */
    earnCoins: optCoins(c.earnCoins), // coins the buyer earns on this course
    referCoins: optCoins(c.referCoins), // coins the referrer earns when a friend's first order includes it
    emi: c.emi && typeof c.emi === "object" ? c.emi : null, // part-payment plan (see emi.js)
    createdAt: num(c.createdAt, 0),
    updatedAt: num(c.updatedAt, 0)
  };
}

export function coursesFrom(value, opts = {}) {
  const list = toList(value).map(normalizeCourse);
  return opts.all ? list : list.filter((c) => c.published);
}

/* Generative cover art. `img` = resolved picture src (optional). */
export function coverHTML(course, img, opts = {}) {
  const a = accentOf(course.accent);
  const size = opts.size || "md";
  const bars = Array.from({ length: 18 }, (_, i) => {
    const h = (0.25 + Math.abs(Math.sin((i + course.title.length) * 1.3)) * 0.75).toFixed(2);
    return `<i style="--h:${h}"></i>`;
  }).join("");
  const picture = img
    ? `<img class="cv-img" src="${esc(img)}" alt="" loading="lazy" decoding="async">`
    : "";
  return (
    `<div class="cv cv--${size}${img ? " cv--pic" : ""}" style="--cv-a:${a.a};--cv-b:${a.b};--cv-ink:${a.ink};--cv-glow:${a.glow}">` +
    picture +
    `<div class="cv-art" aria-hidden="true"><span class="cv-ring"></span><span class="cv-wave">${bars}</span></div>` +
    `<div class="cv-top"><span class="cv-cat">${esc(course.category)}</span>` +
    (course.badge ? `<span class="cv-badge">${esc(course.badge)}</span>` : "") +
    `</div>` +
    (img ? "" : `<div class="cv-title">${esc(course.title)}</div>`) +
    `<div class="cv-meta"><span>${esc(course.mode)}</span><span>${esc(course.language)}</span></div>` +
    `</div>`
  );
}

/* ---------------- membership plans ----------------
   Plans live in site/memberships (edited in the CRM's Memberships tab).
   In carts, orders and coupon scopes a plan is keyed "plan_<id>" so it
   can never collide with a course slug (slugs only use a-z, 0-9 and -). */

export const PLAN_PREFIX = "plan_";
export const PLAN_THEMES = ["ink", "violet", "gold", "pearl"];
export const isPlanId = (id) => String(id || "").startsWith(PLAN_PREFIX);
export const isPlanItem = (it) => Boolean(it && (it.kind === "plan" || isPlanId(it.id)));
export const planKey = (planId) => PLAN_PREFIX + planId;

/* Same "Auto" colour logic as the public Membership page. */
export function planThemes(list) {
  let k = 0;
  const cycle = ["violet", "gold", "pearl"];
  return list.map((p) => {
    if (PLAN_THEMES.includes(p.theme)) return p.theme;
    if (p.highlight) return "ink";
    return cycle[k++ % cycle.length];
  });
}

/* Normalise a raw plan into a cart-compatible item. `buyable` means the
   price and validity are stored in a form the database rules can check. */
export function normalizePlan(raw, theme) {
  const p = raw || {};
  const planId = String(p.id || "");
  const price = Math.max(0, Math.round(num(p.price)));
  const was = Math.max(0, Math.round(num(p.was)));
  const hasDays = p.durationDays !== "" && p.durationDays != null && isFinite(Number(p.durationDays)) && Number(p.durationDays) >= 0;
  const days = hasDays ? Math.round(Number(p.durationDays)) : 0;
  const rawPrice = typeof p.price === "number" ? String(p.price) : String(p.price == null ? "" : p.price).trim();
  const features = Array.isArray(p.features)
    ? p.features.map(String)
    : p.features && typeof p.features === "object"
    ? Object.values(p.features).map(String)
    : String(p.features || "")
        .split(/\n+/)
        .map((s) => s.trim());
  return {
    id: planKey(planId),
    kind: "plan",
    planId,
    title: String(p.name || p.title || "Membership"),
    subtitle: String(p.tagline || ""),
    category: "Membership",
    mode: String(p.duration || "") || validityLabel(days).replace(" access", ""),
    language: "",
    duration: String(p.duration || ""),
    price,
    mrp: Math.max(was, price),
    validityDays: days,
    badge: String(p.badge || ""),
    highlight: Boolean(p.highlight),
    theme: PLAN_THEMES.includes(theme) ? theme : "violet",
    features: features.filter(Boolean).slice(0, 10),
    cta: String(p.cta || ""),
    active: p.active !== false,
    order: num(p.order, 0),
    courseOff: Math.min(90, Math.max(0, Math.round(num(p.courseOff)))), // members' extra % off courses
    buyable: price > 0 && hasDays && rawPrice === String(price)
  };
}

export function plansFrom(value, opts = {}) {
  const list = toList(value).filter((p) => p.name || p.title);
  const themes = planThemes(list);
  const out = list.map((p, i) => normalizePlan(p, themes[i]));
  return opts.all ? out : out.filter((p) => p.active);
}

/* ≈ ₹N a day, like the public Membership page. */
export function perDay(price, days) {
  const p = num(price);
  const d = num(days);
  if (!(p > 0 && d > 0)) return "";
  const v = p / d;
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
}

/* The members/<uid> record a paid plan order produces. Re-buying the
   plan you already hold extends it from its current end date. */
export function memberRecordFor(item, order, prev, paidAt) {
  const days = num(item.validityDays);
  const sameActive =
    prev && prev.planId === item.planId && String(prev.status || "active") === "active" && num(prev.endAt) > paidAt;
  const startAt = sameActive ? num(prev.startAt) || paidAt : paidAt;
  const endAt = days ? (sameActive ? num(prev.endAt) : paidAt) + days * DAY : 0;
  return {
    planId: item.planId,
    planName: String(item.title || "Membership"),
    startAt,
    endAt,
    status: "active",
    paid: num(item.price),
    orderId: order.id,
    orderNo: order.orderNo,
    orderPaidAt: paidAt,
    name: order.name || "",
    email: order.email || "",
    source: "store",
    updatedAt: paidAt
  };
}

/* ---------------- coupons ---------------- */

export const normalizeCode = (code) =>
  String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function generateCode(prefix = "", length = 6) {
  const p = normalizeCode(prefix).replace(/-+$/, "");
  const n = Math.min(16, Math.max(4, Number(length) || 6));
  const bytes = new Uint32Array(n);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < n; i++) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return (p ? p + "-" : "") + body;
}

export function couponLabel(c) {
  if (!c) return "";
  return c.type === "flat" ? `${money(c.value)} off` : `${num(c.value)}% off` + (num(c.maxDiscount) ? ` (up to ${money(c.maxDiscount)})` : "");
}

export function couponScopeIds(c) {
  if (!c || !c.courseIds || typeof c.courseIds !== "object") return null; // null = all courses
  const ids = Object.keys(c.courseIds).filter((k) => c.courseIds[k]);
  return ids.length ? ids : null;
}

export function couponState(c, usedCount = 0, now = Date.now()) {
  if (!c) return { key: "missing", label: "Not found" };
  if (c.active === false) return { key: "off", label: "Disabled" };
  if (num(c.startsAt) && now < num(c.startsAt)) return { key: "upcoming", label: "Scheduled" };
  if (num(c.expiresAt) && now > num(c.expiresAt)) return { key: "expired", label: "Expired" };
  if (num(c.maxUses) && usedCount >= num(c.maxUses)) return { key: "exhausted", label: "Used up" };
  return { key: "active", label: "Active" };
}

/* Member-only coupons: { members: true, memberPlans?: { planId: true } } */
export function couponPlanIds(c) {
  if (!c || !c.memberPlans || typeof c.memberPlans !== "object") return null; // null = any plan
  const ids = Object.keys(c.memberPlans).filter((k) => c.memberPlans[k]);
  return ids.length ? ids : null;
}

/* Validate a coupon against a cart.
   ctx = { coupon, usedCount, usedByMe, items, now,
           member: { active, planId }   (for member-only coupons)
           prices: { itemId: price }     (member prices; the coupon applies after them) } */
export function checkCoupon(ctx) {
  const { coupon: c, usedCount = 0, usedByMe = false, items = [], now = Date.now(), member = null, prices = null } = ctx;
  if (!c) return { ok: false, reason: "That coupon code doesn’t exist." };
  const st = couponState(c, usedCount, now);
  if (st.key === "off") return { ok: false, reason: "This coupon is no longer active." };
  if (st.key === "upcoming") return { ok: false, reason: `This coupon starts on ${formatDate(c.startsAt)}.` };
  if (st.key === "expired") return { ok: false, reason: `This coupon expired on ${formatDate(c.expiresAt)}.` };
  if (st.key === "exhausted") return { ok: false, reason: "This coupon has reached its usage limit." };
  if (usedByMe) return { ok: false, reason: "You have already used this coupon." };
  if (c.members) {
    if (!member || !member.active) return { ok: false, members: true, reason: "This coupon is only for FenxTek members — join a membership plan to use it." };
    const pids = couponPlanIds(c);
    if (pids && !pids.includes(member.planId)) return { ok: false, members: true, reason: "This coupon is for members of a different plan." };
  }
  const scope = couponScopeIds(c);
  const eligible = scope ? items.filter((i) => scope.includes(i.id)) : items;
  if (!eligible.length) return { ok: false, reason: "This coupon doesn’t apply to the items in your cart." };
  const priceOf = (i) => (prices && prices[i.id] != null ? num(prices[i.id]) : num(i.price));
  const eligibleSubtotal = eligible.reduce((s, i) => s + priceOf(i), 0);
  if (num(c.minAmount) && eligibleSubtotal < num(c.minAmount)) {
    return { ok: false, reason: `Add courses worth ${money(c.minAmount)} or more to use this coupon.` };
  }
  return { ok: true, eligibleIds: eligible.map((i) => i.id), eligibleSubtotal, rawEligibleSubtotal: eligible.reduce((s, i) => s + num(i.price), 0) };
}

export function couponDiscount(c, eligibleSubtotal) {
  if (!c) return 0;
  const base = Math.max(0, num(eligibleSubtotal));
  let d = c.type === "flat" ? num(c.value) : Math.floor((base * num(c.value)) / 100);
  if (c.type !== "flat" && num(c.maxDiscount)) d = Math.min(d, num(c.maxDiscount));
  return Math.max(0, Math.min(base, Math.round(d)));
}

/* ---------------- membership perks ---------------- */

/* What a member of `plan` pays for a course: the plan's "% off courses" or
   the course's own member price, whichever is lower. null = no member price
   (plans themselves never get one). */
export function memberPriceOf(course, plan) {
  if (!course || !plan || isPlanItem(course)) return null;
  const price = num(course.price);
  if (!price) return null;
  const cands = [];
  const off = Math.min(90, Math.max(0, num(plan.courseOff)));
  if (off) cands.push(Math.round((price * (100 - off)) / 100));
  const mp = num(course.memberPrice);
  if (mp > 0 && mp < price) cands.push(Math.round(mp));
  if (!cands.length) return null;
  const best = Math.max(0, Math.min(...cands));
  return best < price ? best : null;
}

/* { prices: { id: price }, memberDiscount } for a cart priced for `plan` */
export function memberPrices(items, plan) {
  const prices = {};
  let memberDiscount = 0;
  items.forEach((i) => {
    const mp = memberPriceOf(i, plan);
    prices[i.id] = mp == null ? num(i.price) : mp;
    memberDiscount += num(i.price) - prices[i.id];
  });
  return { prices, memberDiscount };
}

/* ---------------- pricing ---------------- */

/* items: normalised courses/plans. applied: { coupon, check } or null.
   opts: { plan (member perks), useCoins, balance, maxCoinPct }
   Order of savings: member price → coupon → E-coins (1 coin = ₹1). */
export function priceCart(items, applied, opts = {}) {
  const { plan = null, useCoins = false, balance = 0, maxCoinPct = 0 } = opts;
  const subtotal = items.reduce((s, i) => s + num(i.price), 0);
  const mrpTotal = items.reduce((s, i) => s + Math.max(num(i.mrp), num(i.price)), 0);
  const courseSavings = Math.max(0, mrpTotal - subtotal);
  let { prices, memberDiscount } = memberPrices(items, plan);
  let couponOff = 0;
  const ok = applied && applied.coupon && applied.check && applied.check.ok;
  if (ok) couponOff = couponDiscount(applied.coupon, applied.check.eligibleSubtotal);
  if (ok && memberDiscount > 0 && subtotal - memberDiscount - couponOff <= 0) {
    /* a free order must be covered by the coupon alone (the database rules
       check that), so drop the member price instead of stacking to ₹0 */
    memberDiscount = 0;
    prices = Object.fromEntries(items.map((i) => [i.id, num(i.price)]));
    couponOff = couponDiscount(applied.coupon, applied.check.rawEligibleSubtotal != null ? applied.check.rawEligibleSubtotal : applied.check.eligibleSubtotal);
  }
  const discount = Math.min(subtotal, memberDiscount + couponOff);
  const after = Math.max(0, subtotal - discount);
  const pct = Math.min(90, Math.max(0, num(maxCoinPct)));
  const coinsMax = after > 1 ? Math.max(0, Math.min(Math.floor(num(balance)), Math.floor((after * pct) / 100), after - 1)) : 0;
  const coins = useCoins ? coinsMax : 0;
  const total = Math.max(0, after - coins);
  return {
    count: items.length,
    subtotal,
    mrpTotal,
    courseSavings,
    memberDiscount,
    couponDiscount: couponOff,
    discount,
    coinsMax,
    coins,
    total,
    prices,
    savings: courseSavings + discount + coins
  };
}

/* ---------------- refer & earn (E-coins) ---------------- */

export const REWARDS_DEFAULT = { enabled: false, referrerCoins: 100, refereeCoins: 50, maxRedeemPct: 20, minOrder: 0, buyOn: false, buyPct: 5, buyMax: 0 };
export function rewardsFrom(v) {
  const r = v || {};
  const int = (x, d, lo, hi) => Math.min(hi, Math.max(lo, Math.round(x === undefined || x === null || x === "" || !isFinite(Number(x)) ? d : Number(x))));
  return {
    enabled: r.enabled === true,
    referrerCoins: int(r.referrerCoins, REWARDS_DEFAULT.referrerCoins, 0, 100000),
    refereeCoins: int(r.refereeCoins, REWARDS_DEFAULT.refereeCoins, 0, 100000),
    maxRedeemPct: int(r.maxRedeemPct, REWARDS_DEFAULT.maxRedeemPct, 0, 90),
    minOrder: int(r.minOrder, 0, 0, 10000000),
    buyOn: r.buyOn === true, // purchase rewards (cashback in E-coins)
    buyPct: int(r.buyPct, REWARDS_DEFAULT.buyPct, 0, 50), // % of the amount paid
    buyMax: int(r.buyMax, 0, 0, 100000), // cap per order for the % reward, 0 = no cap
    note: String(r.note || "")
  };
}
export const cleanRefCode = (v) =>
  String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
export function makeRefCode(name) {
  const base = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
  return (base.length >= 3 ? base : "FXT" + base).slice(0, 5) + generateCode("", 4);
}
export const coinsLabel = (n) => `${Math.round(num(n)).toLocaleString("en-IN")} E-coin${Math.round(num(n)) === 1 ? "" : "s"}`;
export const TX_LABEL = {
  referral: "Referral reward",
  welcome: "Welcome bonus",
  spend: "Used on order",
  refund: "Refunded to wallet",
  admin: "Added by academy",
  debit: "Adjusted by academy",
  purchase: "Course reward"
};

/* ---------------- E-coin rewards on purchases ----------------
   Per course the admin can set a fixed number of coins (earnCoins >= 0).
   Otherwise, when purchase rewards are on, the buyer earns buyPct % of
   what they paid (capped at buyMax per order). Memberships use the %. */
const itemsOf = (o) => {
  const items = (o && o.items) || {};
  return Array.isArray(items) ? items.filter(Boolean) : Object.keys(items).map((id) => ({ id, ...items[id] }));
};

/* What a single course earns at `price` (shown on cards / course page). */
export function courseEarnCoins(course, rw, price) {
  if (!rw || !rw.enabled || !course) return 0;
  if (optCoins(course.earnCoins) >= 0) return optCoins(course.earnCoins);
  if (!rw.buyOn || !rw.buyPct) return 0;
  const p = Math.max(0, num(price === undefined ? course.price : price));
  const c = Math.floor((p * rw.buyPct) / 100);
  return rw.buyMax ? Math.min(rw.buyMax, c) : c;
}

/* What a paid order earns. `courses` = { id: course }. Free orders earn nothing. */
export function orderEarnCoins(order, rw, courses = {}) {
  if (!rw || !rw.enabled || !order) return 0;
  const paid = Math.max(0, num(order.total));
  if (!paid) return 0;
  const items = itemsOf(order);
  const subtotal = items.reduce((t, it) => t + Math.max(0, num(it.price)), 0) || paid;
  let fixed = 0;
  let pctBase = 0;
  items.forEach((it) => {
    const c = !isPlanItem(it) ? courses[it.id] : null;
    if (c && optCoins(c.earnCoins) >= 0) fixed += optCoins(c.earnCoins);
    else pctBase += Math.max(0, num(it.price));
  });
  let pct = 0;
  if (rw.buyOn && rw.buyPct && pctBase) {
    pct = Math.floor((paid * (pctBase / subtotal) * rw.buyPct) / 100);
    if (rw.buyMax) pct = Math.min(rw.buyMax, pct);
  }
  return Math.max(0, fixed + pct);
}

/* Coins for the referrer when this order is the friend's first purchase:
   the highest per-course "referCoins" in the order, else the default. */
export function orderReferrerCoins(order, rw, courses = {}) {
  let best = -1;
  itemsOf(order).forEach((it) => {
    const c = !isPlanItem(it) ? courses[it.id] : null;
    if (c && optCoins(c.referCoins) > best) best = optCoins(c.referCoins);
  });
  return best >= 0 ? best : rw.referrerCoins;
}

/* Referrer reward shown on a course's share button. */
export const courseReferCoins = (course, rw) => (course && optCoins(course.referCoins) >= 0 ? optCoins(course.referCoins) : (rw && rw.referrerCoins) || 0);

/* ---------------- orders ---------------- */

/* Split an order's savings for display. Older orders only have a coupon
   discount; newer ones also carry memberDiscount and coins. */
export function orderBreakdown(o) {
  const member = Math.max(0, num(o && o.memberDiscount));
  const discount = Math.max(0, num(o && o.discount));
  return { member, coupon: Math.max(0, discount - member), coins: Math.max(0, num(o && o.coins)), discount };
}


export function orderNumber(now = new Date()) {
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `FXT-${y}${m}${d}-${generateCode("", 5)}`;
}

export const ORDER_STATUS = {
  pending: { label: "Under verification", tone: "warn" },
  paid: { label: "Paid", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
  refunded: { label: "Refunded", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" }
};
export const statusOf = (s) => ORDER_STATUS[s] || { label: s || "Unknown", tone: "muted" };

export const METHOD_LABEL = {
  razorpay: "Razorpay (online)",
  upi: "UPI transfer",
  free: "Coupon — fully discounted",
  cash: "Cash at academy",
  offline: "Offline payment",
  bank: "Bank transfer"
};
export const methodLabel = (m) => METHOD_LABEL[m] || m || "—";

/* Flatten orders/{uid}/{id} into a newest-first array. */
export function flattenOrders(value) {
  const out = [];
  if (!value || typeof value !== "object") return out;
  Object.keys(value).forEach((uid) => {
    const bucket = value[uid];
    if (!bucket || typeof bucket !== "object") return;
    Object.keys(bucket).forEach((id) => {
      const o = bucket[id];
      if (o && typeof o === "object") out.push({ ...o, id, uid: o.uid || uid });
    });
  });
  return out.sort((a, b) => num(b.createdAt) - num(a.createdAt));
}

export function ordersOf(value) {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .map((id) => ({ ...value[id], id }))
    .filter((o) => o && o.orderNo)
    .sort((a, b) => num(b.createdAt) - num(a.createdAt));
}

/* Courses a student owns, derived from their paid orders.
   Returns Map courseId -> { orderId, orderNo, since, until, item } (latest wins). */
export function ownedCourses(orders, now = Date.now()) {
  const map = new Map();
  orders
    .filter((o) => o.status === "paid")
    .sort((a, b) => num(a.paidAt || a.createdAt) - num(b.paidAt || b.createdAt))
    .forEach((o) => {
      const since = num(o.paidAt || o.createdAt);
      (Array.isArray(o.items) ? o.items : Object.values(o.items || {})).forEach((item) => {
        if (!item || !item.id || isPlanItem(item)) return;
        const days = num(item.validityDays);
        const prev = map.get(item.id);
        /* Re-buying an active course extends it from its current end date. */
        const start = prev && prev.until && prev.until > since ? prev.until : since;
        const until = days ? start + days * DAY : 0;
        map.set(item.id, { orderId: o.id, orderNo: o.orderNo, since: prev ? prev.since : since, until, item });
      });
    });
  map.forEach((v) => {
    v.active = !v.until || v.until > now;
    v.daysLeft = v.until ? Math.max(0, Math.ceil((v.until - now) / DAY)) : null;
    v.progress = v.until ? Math.min(1, Math.max(0, (now - v.since) / (v.until - v.since))) : 0;
  });
  return map;
}

/* UPI deep link (works in any UPI app on mobile). */
export function upiLink({ upiId, payee, amount, note }) {
  const q = new URLSearchParams({
    pa: String(upiId || "").trim(),
    pn: String(payee || "FenxTek Shorthand Classes").slice(0, 50),
    am: String(Math.round(num(amount))),
    cu: "INR",
    tn: String(note || "").slice(0, 60)
  });
  return "upi://pay?" + q.toString();
}

export function csvCell(value) {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
