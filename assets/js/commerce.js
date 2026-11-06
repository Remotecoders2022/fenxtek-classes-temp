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
  courseAccess: "courseAccess"
};

export const COURSE_CATEGORIES = ["Shorthand", "Typing", "Exam pack", "Dictation", "Mentorship", "Other"];
export const COURSE_MODES = ["Recorded", "Live", "Live + Recorded", "Practice"];
export const COURSE_LANGUAGES = ["Hindi", "English", "Hindi + English"];

/* Generative cover themes (used when a course has no picture). */
export const ACCENTS = {
  violet: { label: "Violet", a: "#6A5CFF", b: "#2A1DB0", ink: "#FFFFFF", glow: "#D9FF57" },
  lime: { label: "Lime", a: "#E4FF7A", b: "#A8DB1F", ink: "#0B0B10", glow: "#5A4BFF" },
  ink: { label: "Midnight", a: "#23232E", b: "#0B0B10", ink: "#FFFFFF", glow: "#D9FF57" },
  ocean: { label: "Ocean", a: "#1FC8F5", b: "#1848F0", ink: "#FFFFFF", glow: "#D9FF57" },
  sunset: { label: "Sunset", a: "#FF9A4D", b: "#E5397A", ink: "#FFFFFF", glow: "#FFE29A" },
  gold: { label: "Gold", a: "#FFD15C", b: "#F08C00", ink: "#0B0B10", glow: "#FFFFFF" }
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
export function normalizeCourse(raw) {
  const c = raw || {};
  const features = Array.isArray(c.features)
    ? c.features
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

/* Validate a coupon against a cart.
   ctx = { coupon, usedCount, usedByMe, items, now } */
export function checkCoupon(ctx) {
  const { coupon: c, usedCount = 0, usedByMe = false, items = [], now = Date.now() } = ctx;
  if (!c) return { ok: false, reason: "That coupon code doesn’t exist." };
  const st = couponState(c, usedCount, now);
  if (st.key === "off") return { ok: false, reason: "This coupon is no longer active." };
  if (st.key === "upcoming") return { ok: false, reason: `This coupon starts on ${formatDate(c.startsAt)}.` };
  if (st.key === "expired") return { ok: false, reason: `This coupon expired on ${formatDate(c.expiresAt)}.` };
  if (st.key === "exhausted") return { ok: false, reason: "This coupon has reached its usage limit." };
  if (usedByMe) return { ok: false, reason: "You have already used this coupon." };
  const scope = couponScopeIds(c);
  const eligible = scope ? items.filter((i) => scope.includes(i.id)) : items;
  if (!eligible.length) return { ok: false, reason: "This coupon doesn’t apply to the courses in your cart." };
  const eligibleSubtotal = eligible.reduce((s, i) => s + num(i.price), 0);
  if (num(c.minAmount) && eligibleSubtotal < num(c.minAmount)) {
    return { ok: false, reason: `Add courses worth ${money(c.minAmount)} or more to use this coupon.` };
  }
  return { ok: true, eligibleIds: eligible.map((i) => i.id), eligibleSubtotal };
}

export function couponDiscount(c, eligibleSubtotal) {
  if (!c) return 0;
  const base = Math.max(0, num(eligibleSubtotal));
  let d = c.type === "flat" ? num(c.value) : Math.floor((base * num(c.value)) / 100);
  if (c.type !== "flat" && num(c.maxDiscount)) d = Math.min(d, num(c.maxDiscount));
  return Math.max(0, Math.min(base, Math.round(d)));
}

/* ---------------- pricing ---------------- */

/* items: normalised courses. applied: { coupon, check } or null. */
export function priceCart(items, applied) {
  const subtotal = items.reduce((s, i) => s + num(i.price), 0);
  const mrpTotal = items.reduce((s, i) => s + Math.max(num(i.mrp), num(i.price)), 0);
  const courseSavings = Math.max(0, mrpTotal - subtotal);
  let discount = 0;
  if (applied && applied.coupon && applied.check && applied.check.ok) {
    discount = couponDiscount(applied.coupon, applied.check.eligibleSubtotal);
  }
  const total = Math.max(0, subtotal - discount);
  return { count: items.length, subtotal, mrpTotal, courseSavings, discount, total, savings: courseSavings + discount };
}

/* ---------------- orders ---------------- */

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
        if (!item || !item.id) return;
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
