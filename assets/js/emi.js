/* ============================================================
   FENXTEK — EMI / part payments (shared by the student portal and admin)

   A course can be paid in 2–6 parts. Each part is a normal order whose
   single item carries an `emi` block:
     { n, of, gap, start, total, plan:{p1..pN} (part 1 only), first, prev }
   - part 1 locks the schedule (`plan`) from site/courses/{id}/emi
   - part n>1 points at part 1 (`first`) and the paid part n-1 (`prev`)
   - access after part n (n < of) lasts until the next due date + grace;
     the final part unlocks the course for its full validity
   The database rules check every one of these numbers.
   ============================================================ */

export const DAY = 86400000;
export const EMI_GRACE_DAYS = 5;
export const EMI_MIN_PARTS = 2;
export const EMI_MAX_PARTS = 6;
export const EMI_GAPS = [7, 15, 30, 45, 60, 90];
export const EMI_DUE_SOON_DAYS = 3;

const n0 = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const asItems = (o) => (Array.isArray(o && o.items) ? o.items : Object.entries((o && o.items) || {}).map(([id, it]) => ({ ...it, id: (it && it.id) || id })));

/* Split a price into `parts`. With a down payment, the rest is split equally;
   any rupee left over goes on the earliest instalment so the sum is exact. */
export function splitEmi(price, parts, first = 0) {
  price = Math.round(n0(price));
  parts = Math.min(EMI_MAX_PARTS, Math.max(EMI_MIN_PARTS, Math.round(n0(parts))));
  first = Math.round(n0(first));
  if (price < parts) return [];
  const out = [];
  if (first > 0 && first < price && price - first >= parts - 1) {
    const rest = price - first;
    const base = Math.floor(rest / (parts - 1));
    out.push(first);
    for (let i = 1; i < parts; i++) out.push(base);
    out[1] += rest - base * (parts - 1);
  } else {
    const base = Math.floor(price / parts);
    for (let i = 0; i < parts; i++) out.push(base);
    out[0] += price - base * parts;
  }
  return out;
}

/* The EMI offer configured on a raw/normalised course, or null when it isn't
   valid (switched off, wrong sum after a price change, …). */
export function emiConfig(course) {
  const e = course && course.emi;
  if (!e || typeof e !== "object" || e.on !== true) return null;
  const price = Math.round(n0(course.price));
  const parts = Math.round(n0(e.parts));
  const gapDays = Math.round(n0(e.gapDays));
  if (price <= 0 || parts < EMI_MIN_PARTS || parts > EMI_MAX_PARTS || gapDays < 1 || gapDays > 120) return null;
  /* each part must fit inside the course validity (lifetime courses can't use EMI) */
  if (course.validityDays !== undefined && !emiValidityOk(course.validityDays, gapDays)) return null;
  const amounts = [];
  for (let i = 1; i <= parts; i++) {
    const a = e.amounts && e.amounts["p" + i];
    if (typeof a !== "number" || a < 1 || Math.round(a) !== a) return null;
    amounts.push(a);
  }
  if (amounts.reduce((t, a) => t + a, 0) !== price) return null;
  const plan = {};
  amounts.forEach((a, i) => (plan["p" + (i + 1)] = a));
  return { parts, gapDays, amounts, plan, total: price, first: amounts[0], rest: amounts.slice(1) };
}

export const emiValidityOk = (validityDays, gapDays) => n0(validityDays) > 0 && n0(validityDays) >= n0(gapDays) + EMI_GRACE_DAYS;

/* What gets saved on site/courses/{id}/emi from the editor fields. */
export function emiRecord({ on, parts, gapDays, first, price }) {
  if (!on) return null;
  const amounts = splitEmi(price, parts, first);
  if (!amounts.length) return null;
  const rec = { on: true, parts: amounts.length, gapDays: Math.round(n0(gapDays)) || 30, amounts: {} };
  amounts.forEach((a, i) => (rec.amounts["p" + (i + 1)] = a));
  return rec;
}

/* One-line summary: "₹600 today, then 2 × ₹450 every 30 days" */
export function emiSummary(cfg, money) {
  if (!cfg) return "";
  const rest = cfg.rest;
  const same = rest.every((a) => a === rest[0]);
  const tail = same ? `${rest.length} × ${money(rest[0])}` : rest.map((a) => money(a)).join(" + ");
  return `${money(cfg.first)} today, then ${tail} every ${cfg.gapDays} days`;
}

export const dueAtOf = (start, n, gap) => n0(start) + (n - 1) * n0(gap) * DAY;
/* how long a paid part n (not the last) keeps the course open */
export const accessUntilOf = (start, n, gap) => n0(start) + (n * n0(gap) + EMI_GRACE_DAYS) * DAY;

/* Enrolment `until` for a paid instalment item (prevUntil = current enrolment end). */
export function emiEnrollUntil(emi, validityDays, prevUntil = 0, now = Date.now()) {
  const n = n0(emi.n);
  const of = n0(emi.of);
  if (n < of) return accessUntilOf(emi.start, n, emi.gap);
  if (!n0(validityDays)) return 0;
  return Math.max(n0(emi.start) + n0(validityDays) * DAY, n0(prevUntil) > now ? n0(prevUntil) : 0);
}

export const isEmiItem = (it) => Boolean(it && it.emi && typeof it.emi === "object" && n0(it.emi.n) >= 1);
export const emiItemOf = (o) => asItems(o).find(isEmiItem) || null;
export const isEmiOrder = (o) => Boolean(emiItemOf(o));
/* non-final instalments don't earn coins / settle referrals — the final one does */
export const isPartialEmiOrder = (o) => {
  const it = emiItemOf(o);
  return Boolean(it && n0(it.emi.n) < n0(it.emi.of));
};
export const emiLabel = (emi) => `Instalment ${n0(emi.n)} of ${n0(emi.of)}`;

const RANK = { paid: 3, pending: 2 };

/* Group instalment orders into plans (one per course + start).
   orders: array of { id, uid?, status, createdAt, items, … } */
export function emiPlans(orders, now = Date.now()) {
  const map = new Map();
  (orders || []).forEach((o) => {
    if (!o || !RANK[o.status]) return; // rejected / refunded / cancelled parts don't count
    asItems(o).forEach((it) => {
      if (!isEmiItem(it)) return;
      const e = it.emi;
      const key = `${o.uid || ""}|${it.id}|${n0(e.start)}`;
      let p = map.get(key);
      if (!p) {
        p = { key, uid: o.uid || "", courseId: it.id, title: String(it.title || "").replace(/\s+[—-]\s+Instalment.*$/i, ""), start: n0(e.start), of: n0(e.of), gap: n0(e.gap), total: n0(e.total), validityDays: n0(it.validityDays), plan: null, firstId: "", parts: {}, name: o.name || "", email: o.email || "", phone: o.phone || "" };
        map.set(key, p);
      }
      if (n0(e.n) === 1 && e.plan) {
        p.plan = e.plan;
        p.firstId = o.id;
      }
      const cur = p.parts[n0(e.n)];
      if (!cur || RANK[o.status] > RANK[cur.status]) p.parts[n0(e.n)] = { n: n0(e.n), amount: n0(it.price), status: o.status, order: o };
    });
  });
  const list = [];
  map.forEach((p) => {
    if (!p.plan || !p.firstId) return; // part 1 missing — nothing to continue
    let paidN = 0;
    while (paidN < p.of && p.parts[paidN + 1] && p.parts[paidN + 1].status === "paid") paidN++;
    p.paidN = paidN;
    p.done = paidN >= p.of;
    p.paidAmount = Object.values(p.parts).filter((x) => x.status === "paid").reduce((t, x) => t + x.amount, 0);
    p.left = Math.max(0, p.total - p.paidAmount);
    p.amounts = Array.from({ length: p.of }, (_, i) => n0(p.plan["p" + (i + 1)]));
    if (p.done) {
      p.state = "done";
    } else {
      const nextN = paidN + 1;
      const nx = p.parts[nextN];
      p.nextN = nextN;
      p.nextAmount = p.amounts[nextN - 1];
      p.dueAt = dueAtOf(p.start, nextN, p.gap);
      p.accessUntil = paidN ? accessUntilOf(p.start, paidN, p.gap) : 0;
      p.prevId = paidN ? p.parts[paidN].order.id : "";
      p.pending = Boolean(nx && nx.status === "pending");
      p.daysToDue = Math.ceil((p.dueAt - now) / DAY);
      if (p.pending) p.state = "pending";
      else if (!paidN) p.state = "pending"; // part 1 still being verified
      else if (now > p.accessUntil) p.state = "locked";
      else if (now > p.dueAt) p.state = "overdue";
      else if (p.daysToDue <= EMI_DUE_SOON_DAYS) p.state = "due";
      else p.state = "ok";
    }
    list.push(p);
  });
  return list.sort((a, b) => b.start - a.start);
}

/* The newest plan for a course (student side). */
export const planForCourse = (plans, courseId) => (plans || []).find((p) => p.courseId === courseId) || null;

export const EMI_STATE = {
  ok: { label: "On track", tone: "ok" },
  due: { label: "Due soon", tone: "warn" },
  overdue: { label: "Overdue", tone: "err" },
  locked: { label: "Access paused", tone: "err" },
  pending: { label: "Verifying payment", tone: "warn" },
  done: { label: "Fully paid", tone: "ok" }
};
