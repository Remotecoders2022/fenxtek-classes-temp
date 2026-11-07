/* ============================================================
   FENXTEK — admin CRM: Overview dashboard (#ovDash)
   Business at a glance: revenue, orders, students, leads and
   E-coins, a 14-day revenue chart, a "needs attention" queue,
   quick actions, recent orders and best-selling courses.
   Listens to the same paths as the other admin modules (the
   Firebase SDK shares one subscription per path).
   ============================================================ */
import { dbWatch } from "./firebase.js?v=5";
import { PATH, esc, money, num, formatDate, flattenOrders, rewardsFrom, statusOf, coinsLabel } from "./commerce.js?v=4";

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const DAY = 864e5;
const fmtN = (n) => Math.round(num(n)).toLocaleString("en-IN");

const O = {
  ctx: null,
  orders: null,
  leads: null,
  users: null,
  referrals: {},
  wallets: {},
  courses: {},
  rewards: rewardsFrom(null),
  raf: 0
};

export function initOverview(ctx) {
  O.ctx = ctx;
  const box = $("#ovDash");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const go = e.target.closest("[data-ov-go]");
    if (!go) return;
    e.preventDefault();
    ctx.openTab(go.dataset.ovGo);
    const click = go.dataset.ovClick;
    if (click) setTimeout(() => { const b = document.querySelector(click); if (b) b.click(); }, 60);
  });
  paint();
  const watch = (path, fn) => dbWatch(path, (v) => { fn(v); schedule(); }).catch((err) => console.warn("[overview]", path, err));
  watch(PATH.orders, (v) => (O.orders = flattenOrders(v)));
  watch("site/leads", (v) => (O.leads = v && typeof v === "object" ? Object.values(v).filter((l) => l && typeof l === "object") : []));
  watch("users", (v) => (O.users = v && typeof v === "object" ? v : {}));
  watch(PATH.referrals, (v) => (O.referrals = v && typeof v === "object" ? v : {}));
  watch(PATH.wallets, (v) => (O.wallets = v && typeof v === "object" ? v : {}));
  watch(PATH.courses, (v) => (O.courses = v && typeof v === "object" ? v : {}));
  watch(PATH.rewards, (v) => (O.rewards = rewardsFrom(v)));
}

export function overviewOpened() {
  schedule();
}

function schedule() {
  if (O.raf) return;
  O.raf = requestAnimationFrame(() => {
    O.raf = 0;
    paint();
  });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function itemsOf(o) {
  const items = o.items || {};
  return Array.isArray(items) ? items.filter(Boolean) : Object.keys(items).map((id) => ({ id, ...items[id] }));
}

const sk = (w = "60%") => `<span class="ov-sk" style="width:${w}"></span>`;

function paint() {
  const box = $("#ovDash");
  if (!box) return;
  const loaded = O.orders !== null;
  const orders = O.orders || [];
  const now = Date.now();
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const dayOfMonth = d.getDate();
  const paid = orders.filter((o) => o.status === "paid");
  const paidAt = (o) => num(o.paidAt || o.createdAt);
  const sum = (list) => list.reduce((t, o) => t + num(o.total), 0);
  const month = paid.filter((o) => paidAt(o) >= monthStart);
  /* compare with the same days of last month */
  const lastSame = paid.filter((o) => paidAt(o) >= lastMonthStart && paidAt(o) < lastMonthStart + dayOfMonth * DAY && paidAt(o) < monthStart);
  const rev = sum(month);
  const revLast = sum(lastSame);
  const delta = revLast ? Math.round(((rev - revLast) / revLast) * 100) : null;
  const pending = orders.filter((o) => o.status === "pending");
  const unverified = paid.filter((o) => o.method === "razorpay" && !o.verified);
  const leads = O.leads || [];
  const newLeads = leads.filter((l) => !l.status || l.status === "new");
  const students = O.users ? Object.keys(O.users).length : null;
  const newStudents = O.users ? Object.values(O.users).filter((u) => u && num(u.createdAt) >= now - 7 * DAY).length : 0;
  const refs = Object.values(O.referrals);
  const refPending = refs.filter((r) => r && r.status === "pending").length;
  const ws = Object.values(O.wallets).filter(Boolean);
  const issued = ws.reduce((t, w) => t + num(w.earned), 0);
  const outstanding = ws.reduce((t, w) => t + num(w.balance), 0);
  const rw = O.rewards;
  const name = String((O.ctx && O.ctx.user && (O.ctx.user.displayName || "")) || "").split(" ")[0];

  /* 14-day revenue */
  const today0 = new Date(d.toDateString()).getTime();
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today0 - (13 - i) * DAY;
    const list = paid.filter((o) => paidAt(o) >= start && paidAt(o) < start + DAY);
    return { start, total: sum(list), n: list.length };
  });
  const max = Math.max(1, ...days.map((x) => x.total));
  const twoWeeks = days.reduce((t, x) => t + x.total, 0);

  /* top courses by paid units */
  const top = {};
  paid.forEach((o) =>
    itemsOf(o).forEach((it) => {
      if (it.kind === "plan") return;
      const k = it.id || it.title;
      if (!k) return;
      top[k] = top[k] || { title: (O.courses[it.id] && O.courses[it.id].title) || it.title || "Course", n: 0, amt: 0 };
      top[k].n += 1;
      top[k].amt += num(it.price);
    })
  );
  const topList = Object.values(top).sort((a, b) => b.n - a.n || b.amt - a.amt).slice(0, 5);
  const topMax = Math.max(1, ...topList.map((t) => t.n));

  const kpi = (ic, label, value, sub, tone = "", go = "") =>
    `<${go ? `button type="button" data-ov-go="${go}"` : "div"} class="ov-kpi${tone ? ` ov-kpi--${tone}` : ""}">` +
    `<span class="ov-kpi-ic">${icon(ic)}</span><span class="ov-kpi-l">${label}</span><b class="ov-kpi-v">${value}</b><small class="ov-kpi-s">${sub}</small>` +
    `</${go ? "button" : "div"}>`;

  const tasks = [];
  if (pending.length) tasks.push(["warn", "i-receipt", `${pending.length} UPI payment${pending.length === 1 ? "" : "s"} to check`, "Match the UTR with your bank app, then approve", "orders"]);
  if (unverified.length) tasks.push(["warn", "i-shield", `${unverified.length} Razorpay payment${unverified.length === 1 ? "" : "s"} to verify`, "Confirm in the Razorpay dashboard", "orders"]);
  if (newLeads.length) tasks.push(["new", "i-phone", `${newLeads.length} new lead${newLeads.length === 1 ? "" : "s"} to call`, "Enquiries from the contact form", "leads"]);
  if (refPending) tasks.push(["coin", "i-users", `${refPending} referral${refPending === 1 ? "" : "s"} waiting`, "Rewarded automatically when their first payment is confirmed", "rewards"]);
  if (!rw.enabled) tasks.push(["muted", "i-coin", "E-coins & referrals are off", "Turn on cashback and refer & earn to grow by word of mouth", "rewards"]);
  if (loaded && !Object.keys(O.courses).length) tasks.push(["muted", "i-book", "No courses in the store yet", "Add your first course so students can buy online", "courses"]);

  box.innerHTML =
    /* hero */
    `<section class="ov-hero">` +
    `<div class="ov-hero-txt"><span class="ov-hero-k">${esc(formatDate(now))}</span>` +
    `<h2>${greeting()}${name ? `, ${esc(name)}` : ""}.</h2>` +
    `<p>${loaded ? (pending.length || newLeads.length ? `You have <b>${pending.length + unverified.length}</b> payment${pending.length + unverified.length === 1 ? "" : "s"} to check and <b>${newLeads.length}</b> new lead${newLeads.length === 1 ? "" : "s"}.` : "All caught up — no payments or leads waiting.") : "Loading today’s numbers…"}</p></div>` +
    `<div class="ov-hero-rev"><small>Revenue this month</small><b>${loaded ? money(rev) : sk("120px")}</b>` +
    (delta == null ? `<em class="ov-delta">${month.length} paid order${month.length === 1 ? "" : "s"}</em>` : `<em class="ov-delta ${delta >= 0 ? "is-up" : "is-down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs same days last month</em>`) +
    `</div></section>` +
    /* KPIs */
    `<div class="ov-kpis">` +
    kpi("i-cart", "Paid orders", loaded ? fmtN(paid.length) : sk("40px"), loaded ? `${fmtN(month.length)} this month · avg ${paid.length ? money(sum(paid) / paid.length) : "₹0"}` : "", "", "orders") +
    kpi("i-users", "Students", students == null ? sk("40px") : fmtN(students), students == null ? "" : `+${fmtN(newStudents)} joined in 7 days`, "", "students") +
    kpi("i-phone", "Leads", O.leads ? fmtN(leads.length) : sk("40px"), O.leads ? `${fmtN(newLeads.length)} new to call` : "", newLeads.length ? "hot" : "", "leads") +
    kpi("i-coin", "E-coins issued", fmtN(issued), rw.enabled ? `${fmtN(outstanding)} unspent · ${fmtN(refs.length)} referrals` : "Rewards are off", "coin", "rewards") +
    `</div>` +
    /* chart + attention */
    `<div class="ov-row">` +
    `<section class="ov-card ov-chart"><div class="ov-card-h"><div><span class="ov-k">Last 14 days</span><b>${money(twoWeeks)}</b></div><button class="ov-link" type="button" data-ov-go="orders">All orders ${icon("i-chev-r")}</button></div>` +
    `<div class="ov-bars" role="img" aria-label="Revenue for the last 14 days">${days
      .map((x, i) => {
        const dt = new Date(x.start);
        const lbl = dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return `<div class="ov-bar${i === 13 ? " is-today" : ""}" title="${esc(lbl)} · ${esc(money(x.total))} · ${x.n} order${x.n === 1 ? "" : "s"}"><i style="height:${x.total ? Math.max(6, Math.round((x.total / max) * 100)) : 2}%"></i><span>${i % 2 === 1 || i === 13 ? dt.getDate() : ""}</span></div>`;
      })
      .join("")}</div></section>` +
    `<section class="ov-card ov-tasks"><div class="ov-card-h"><div><span class="ov-k">Needs attention</span><b>${tasks.filter((t) => t[0] !== "muted").length || "Nothing"} ${tasks.filter((t) => t[0] !== "muted").length === 1 ? "item" : tasks.filter((t) => t[0] !== "muted").length ? "items" : "urgent"}</b></div></div>` +
    (tasks.length
      ? `<ul class="ov-task-list">${tasks
          .map(([tone, ic, t, s, go]) => `<li><button type="button" class="ov-task ov-task--${tone}" data-ov-go="${go}"><span class="ov-task-ic">${icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(s)}</small></span>${icon("i-chev-r")}</button></li>`)
          .join("")}</ul>`
      : `<div class="ov-clear">${icon("i-check")}<b>You’re all caught up</b><small>New payments and enquiries show up here.</small></div>`) +
    `</section></div>` +
    /* quick actions */
    `<section class="ov-quick"><span class="ov-k">Quick actions</span><div class="ov-quick-grid">` +
    [
      ["i-plus", "Add a course", "courses", "#asCourseNew"],
      ["i-tag", "Create a coupon", "coupons", ""],
      ["i-coin", "E-coin rewards", "rewards", ""],
      ["i-edit", "Post announcement", "content", ""],
      ["i-crown", "Membership plans", "memberships", ""],
      ["i-award", "Share a result", "achievements", ""]
    ]
      .map(([ic, t, go, click]) => `<button type="button" class="ov-q" data-ov-go="${go}"${click ? ` data-ov-click="${click}"` : ""}><span>${icon(ic)}</span>${esc(t)}</button>`)
      .join("") +
    `</div></section>` +
    /* recent + top */
    `<div class="ov-row ov-row--b">` +
    `<section class="ov-card"><div class="ov-card-h"><div><span class="ov-k">Recent orders</span><b>Latest activity</b></div><button class="ov-link" type="button" data-ov-go="orders">View all ${icon("i-chev-r")}</button></div>` +
    (orders.length
      ? `<ul class="ov-orders">${orders
          .slice(0, 6)
          .map((o) => {
            const s = statusOf(o.status);
            const items = itemsOf(o);
            const first = items[0] ? (O.courses[items[0].id] && O.courses[items[0].id].title) || items[0].title || "Course" : "Order";
            return (
              `<li><span class="ov-o-av">${esc(String(o.name || o.email || "S").trim().charAt(0).toUpperCase())}</span>` +
              `<div class="ov-o-txt"><b>${esc(o.name || o.email || "Student")}</b><small>${esc(first)}${items.length > 1 ? ` +${items.length - 1}` : ""} · ${esc(formatDate(num(o.createdAt), true))}</small></div>` +
              `<div class="ov-o-amt"><b>${money(o.total)}</b><span class="as-pill as-pill--${s.tone === "muted" ? "muted" : s.tone}">${esc(s.label)}</span>${num(o.coinsEarned) ? `<small class="ov-o-coin">+${esc(coinsLabel(o.coinsEarned))}</small>` : ""}</div></li>`
            );
          })
          .join("")}</ul>`
      : `<div class="ov-clear">${loaded ? `${icon("i-cart")}<b>No orders yet</b><small>They appear here the moment a student checks out.</small>` : sk("80%") + sk("60%")}</div>`) +
    `</section>` +
    `<section class="ov-card"><div class="ov-card-h"><div><span class="ov-k">Best sellers</span><b>Top courses</b></div><button class="ov-link" type="button" data-ov-go="courses">Courses ${icon("i-chev-r")}</button></div>` +
    (topList.length
      ? `<ol class="ov-top">${topList
          .map((t, i) => `<li><span class="ov-top-n">${i + 1}</span><div><b>${esc(t.title)}</b><span class="ov-top-bar"><i style="width:${Math.round((t.n / topMax) * 100)}%"></i></span></div><small>${fmtN(t.n)} sold<br>${money(t.amt)}</small></li>`)
          .join("")}</ol>`
      : `<div class="ov-clear">${icon("i-book")}<b>No sales yet</b><small>Your best-selling courses will be ranked here.</small></div>`) +
    `</section></div>`;
}
