/* ============================================================
   FENXTEK — student portal (app shell)
   Hash-routed single page: Home, My courses, Course store,
   course detail, Cart + coupons, checkout (Razorpay / UPI / free),
   order success, Orders & receipts, Membership (plans are bought
   through the same cart/checkout as courses) and Profile.

   Adding a section later = add one entry to ROUTES (+ a view fn).
   ============================================================ */

import {
  configured,
  waitForUser,
  signOutUser,
  isAdmin,
  sendVerification,
  dbGet,
  dbSet,
  dbUpdate,
  dbWatch,
  dbUpdateRoot,
  dbKey,
  friendlyError,
  fb,
  initFirebase
} from "./firebase.js?v=5";
import { membershipStatus, daysLeft, safeImageUrl, safeDataImage } from "./media.js?v=2";
import { loadQR } from "./qr.js?v=1";
import {
  CC_PATH,
  CC_ICONS,
  ccIcon,
  ccType,
  safeLink,
  detectType,
  embedFor,
  sourceLabel,
  itemsList,
  visibleList,
  childrenOf,
  pathTo,
  descendantsOf,
  leavesUnder,
  countsLabel,
  typeWord,
  countByType,
  minsLabel,
  liveLabel,
  isNew
} from "./course-content.js?v=1";
import {
  PATH,
  DAY,
  esc,
  money,
  num,
  offPercent,
  formatDate,
  validityLabel,
  coursesFrom,
  coverHTML,
  normalizeCode,
  checkCoupon,
  couponLabel,
  couponScopeIds,
  priceCart,
  orderNumber,
  ordersOf,
  statusOf,
  methodLabel,
  upiLink,
  accentOf,
  plansFrom,
  isPlanId,
  isPlanItem,
  planKey,
  perDay,
  memberRecordFor,
  couponPlanIds,
  memberPriceOf,
  memberPrices,
  rewardsFrom,
  cleanRefCode,
  makeRefCode,
  coinsLabel,
  TX_LABEL,
  orderBreakdown
} from "./commerce.js?v=3";
import { downloadReceipt, receiptDataURL } from "./receipt.js?v=3";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (id, cls = "") => `<svg${cls ? ` class="${cls}"` : ""}><use href="#${id}"/></svg>`;

/* ============================================================
   state
   ============================================================ */
const S = {
  user: null,
  profile: {},
  admin: false,
  courses: [],
  coursesReady: false,
  images: new Map(), // courseId -> data URL | "" (loading/none)
  pay: {},
  offers: [],
  content: {},
  cart: {}, // courseId -> addedAt
  orders: [],
  ordersReady: false,
  enroll: {}, // courseId -> { orderId, since, until, ... }
  member: null,
  invite: null, // pending memberInvites/<emailKey> (gift by email)
  cc: {}, // courseId -> { ready, items, error } full course content (enrolled)
  ccOut: {}, // courseId -> { ready, items, previews } public outline
  progress: {}, // courseId -> { done: { itemId: ts }, last: { id, at } }
  plans: [],
  plansAll: [], // including hidden plans (an existing member keeps their perks)
  plansReady: false,
  rewards: rewardsFrom(null), // refer & earn settings (site/rewards)
  wallet: null, // wallets/<uid> { balance, earned, spent }
  walletTx: [],
  referral: null, // referrals/<uid> — who referred me
  myRefs: [], // referredBy/<uid> — friends I referred
  useCoins: true, // cart toggle "Use E-coins"
  referralReady: false,
  refBusy: false,
  batches: [],
  coupon: null, // { code, coupon, usedCount, usedByMe }
  filters: { q: "", cat: "all", sort: "featured" },
  busy: false
};

const courseById = (id) => S.courses.find((c) => c.id === id) || null;
const planById = (id) => S.plans.find((p) => p.id === id || p.planId === id) || null;
/* cart entries are courses or membership plans ("plan_<id>") */
const itemById = (id) => (isPlanId(id) ? planById(id) : courseById(id));
const cartIds = () => Object.keys(S.cart || {}).sort((a, b) => num(S.cart[a]) - num(S.cart[b]));
const cartItems = () => cartIds().map(itemById).filter((it) => it && (!isPlanItem(it) || it.buyable));
const catalogReady = () => S.coursesReady && S.plansReady;
const memberActive = () => membershipStatus(S.member).key === "active";
const holdsPlan = (p) => Boolean(p && S.member && S.member.planId === p.planId && memberActive());

/* ---- membership perks: members pay less for courses ---- */
const myPlan = () => (memberActive() ? S.plansAll.find((p) => p.planId === S.member.planId) || null : null);
const memberCtx = () => (memberActive() ? { active: true, planId: S.member.planId } : null);
/* the plan whose course prices apply: your plan, or one in the cart (the better one wins) */
function perkPlan(items = cartItems()) {
  const mine = myPlan();
  const inCart = items.find(isPlanItem) || null;
  if (!mine || !inCart) return mine || inCart;
  const gain = (pl) => memberPrices(items.filter((i) => !isPlanItem(i)), pl).memberDiscount;
  return gain(inCart) > gain(mine) ? inCart : mine;
}
const memberPriceFor = (c) => {
  const pl = myPlan();
  return pl ? memberPriceOf(c, pl) : null;
};
/* the cheapest member price on sale (shown to non-members): { price, plan } */
function memberDeal(c) {
  let best = null;
  S.plans
    .filter((p) => p.buyable)
    .forEach((p) => {
      const mp = memberPriceOf(c, p);
      if (mp != null && (!best || mp < best.price)) best = { price: mp, plan: p };
    });
  return best;
}
const perkTop = () => S.plans.filter((p) => p.buyable && p.courseOff > 0).sort((a, b) => b.courseOff - a.courseOff)[0] || null;
/* member-only coupon the current student can't use */
function offerLocked(o) {
  if (!o || !o.members) return false;
  const m = memberCtx();
  if (!m) return true;
  const ids = couponPlanIds(o);
  return Boolean(ids && !ids.includes(m.planId));
}

/* ---- E-coins ---- */
const coinBalance = () => Math.max(0, Math.floor(num(S.wallet && S.wallet.balance)));
const coinsOn = () => S.rewards.enabled || coinBalance() > 0;

/* Price the cart in one place: member prices → coupon → E-coins. */
function cartPricing(items = cartItems()) {
  const plan = perkPlan(items);
  const { prices } = memberPrices(items, plan);
  const check = S.coupon ? checkCoupon({ ...S.coupon, items, prices, member: memberCtx() }) : null;
  const applied = S.coupon && check && check.ok ? { coupon: S.coupon.coupon, check } : null;
  const rw = S.rewards;
  const p = priceCart(items, applied, {
    plan,
    useCoins: rw.enabled && S.useCoins,
    balance: rw.enabled ? coinBalance() : 0,
    maxCoinPct: rw.maxRedeemPct
  });
  return { p, check, applied, plan, prices };
}

function access(id, now = Date.now()) {
  const e = S.enroll[id];
  if (!e) return null;
  const until = num(e.until);
  const active = !until || until > now;
  return {
    ...e,
    active,
    daysLeft: until ? Math.max(0, Math.ceil((until - now) / DAY)) : null,
    progress: until && until > num(e.since) ? Math.min(1, Math.max(0, (now - num(e.since)) / (until - num(e.since)))) : 0
  };
}
const owns = (id) => {
  const a = access(id);
  return Boolean(a && a.active);
};

/* ============================================================
   routes — the single source of truth for navigation
   ============================================================ */
const ROUTES = [
  { id: "home", label: "Home", icon: "i-home", group: "Learn", tab: "Home", view: vHome, deps: ["courses", "enroll", "cart", "orders", "member", "plans", "batches", "content", "wallet", "rewards", "refs"] },
  { id: "my-courses", label: "My courses", icon: "i-book", group: "Learn", tab: "Learn", view: vMyCourses, deps: ["courses", "enroll", "orders", "cart", "cc", "progress"] },
  { id: "store", label: "Course store", icon: "i-bolt", group: "Learn", tab: "Store", view: vStore, deps: ["courses", "enroll", "cart", "offers", "plans", "member"] },
  { id: "live", label: "Live classes", icon: "i-live", group: "Learn", soon: true, blurb: "Join scheduled live dictation and doubt sessions right from the portal." },
  { id: "tests", label: "Test series", icon: "i-test", group: "Learn", soon: true, blurb: "Timed exam-pattern transcription tests with error analysis and rank." },
  { id: "notes", label: "Notes & PDFs", icon: "i-file", group: "Learn", soon: true, blurb: "Outlines, phrase lists and dictation passages, organised by course." },
  { id: "cart", label: "Cart", icon: "i-cart", group: "Purchases", tab: "Cart", badge: "cart", view: vCart, deps: ["courses", "plans", "cart", "enroll", "member", "offers", "pay", "rewards", "wallet"] },
  { id: "orders", label: "Orders & receipts", icon: "i-receipt", group: "Purchases", view: vOrders, deps: ["orders"] },
  { id: "membership", label: "Membership", icon: "i-crown", group: "Purchases", pill: "member", view: vMembership, deps: ["member", "plans", "cart", "offers", "orders"] },
  { id: "rewards", label: "Refer & earn", icon: "i-coin", group: "Purchases", pill: "coins", view: vRewards, deps: ["rewards", "wallet", "refs", "orders", "profile"] },
  { id: "profile", label: "Profile", icon: "i-user", group: "Account", tab: "Profile", view: vProfile, deps: ["wallet", "rewards"] },
  /* detail screens (not in the menu) */
  { id: "course", parent: "store", view: vCourse, deps: ["courses", "enroll", "cart", "offers", "cc", "progress", "plans", "member"] },
  { id: "learn", parent: "my-courses", view: vLearn, deps: ["courses", "enroll", "cart", "cc", "progress", "content"] },
  { id: "success", parent: "orders", view: vSuccess, deps: ["orders"] },
  { id: "receipt", parent: "orders", view: vReceipt, deps: ["orders"] },
  { id: "join", parent: "membership", view: vJoin, deps: ["plans", "member", "cart"] },
  { id: "redeem", parent: "membership", view: vRedeem, deps: ["plans", "member"] },
  { id: "ref", parent: "rewards", view: vRef, deps: ["rewards", "refs", "orders"] }
];
const routeById = (id) => ROUTES.find((r) => r.id === id);

let current = { route: null, arg: "" };

function parseHash() {
  const raw = decodeURIComponent((location.hash || "").replace(/^#\/?/, ""));
  const [id, ...rest] = raw.split("/");
  const route = routeById(id) || routeById("home");
  return { route, arg: rest.join("/") };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function paintNav() {
  const nav = $("#spNav");
  if (!nav) return;
  const groups = [];
  ROUTES.filter((r) => r.label).forEach((r) => {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push((g = { name: r.group, items: [] }));
    g.items.push(r);
  });
  nav.innerHTML = groups
    .map(
      (g) =>
        `<div class="sp-nav-group"><span class="sp-nav-k">${esc(g.name)}</span>` +
        g.items
          .map(
            (r) =>
              `<a class="sp-nav-a${r.soon ? " is-soon" : ""}" href="#${r.id}" data-route="${r.id}">` +
              icon(r.icon) +
              `<span>${esc(r.label)}</span>` +
              (r.soon ? `<em class="sp-soon">Soon</em>` : "") +
              (r.badge ? `<b class="sp-count" data-${r.badge}-count hidden>0</b>` : "") +
              (r.pill ? `<em class="sp-nav-pill" data-${r.pill}-pill hidden></em>` : "") +
              `</a>`
          )
          .join("") +
        `</div>`
    )
    .join("");

  const bar = $("#spTabbar");
  if (bar) {
    bar.innerHTML = ROUTES.filter((r) => r.tab)
      .map(
        (r) =>
          `<a class="sp-tab" href="#${r.id}" data-route="${r.id}">` +
          `<span class="sp-tab-ic">${icon(r.icon)}${r.badge ? `<b class="sp-count" data-${r.badge}-count hidden>0</b>` : ""}</span>` +
          `<span>${esc(r.tab)}</span></a>`
      )
      .join("");
  }
}

function markActive(route) {
  const active = route.parent || route.id;
  $$("[data-route]").forEach((a) => {
    const on = a.dataset.route === active;
    a.classList.toggle("is-active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function paintBadges() {
  const n = cartIds().length;
  $$("[data-cart-count]").forEach((b) => {
    b.textContent = String(n);
    b.hidden = n === 0;
  });
  const bal = coinBalance();
  $$("[data-coins-pill]").forEach((b) => {
    b.hidden = !bal;
    b.textContent = bal.toLocaleString("en-IN");
    b.classList.add("is-coin");
  });
  const chip = $("#spCoinChip");
  if (chip) {
    if (!chip.dataset.coin) {
      const old = chip.querySelector("svg");
      if (old) old.outerHTML = coinFace("sp-coin-face");
      chip.dataset.coin = "1";
    }
    chip.hidden = !coinsOn();
    $("b", chip).textContent = bal.toLocaleString("en-IN");
  }
  const st = membershipStatus(S.member);
  $$("[data-member-pill]").forEach((b) => {
    b.hidden = st.key === "none";
    b.textContent = st.key === "active" ? "Active" : st.label;
    b.classList.toggle("is-off", st.key !== "active");
  });
}

function setTitle(title, crumb) {
  const t = $("#spTitle");
  const k = $("#spCrumbK");
  if (t) t.textContent = title;
  if (k) k.textContent = crumb || "Student portal";
  document.title = `${title} — FenxTek Student Portal`;
}

function render(opts = {}) {
  const { route, arg } = parseHash();
  const changedRoute = current.route !== route || current.arg !== arg;
  current = { route, arg };
  markActive(route);
  closeDrawer();
  const view = $("#spView");
  if (!view) return;
  const out = route.soon ? vSoon(route) : route.view(arg);
  if (!out) return;
  setTitle(out.title, out.crumb || (route.parent ? routeById(route.parent).label : route.group));
  view.innerHTML = `<div class="sp-page sp-page--${route.id}${changedRoute && !opts.quiet ? " is-entering" : ""}">${out.html}</div>`;
  current.out = out;
  if (out.mount) out.mount(view);
  hydrateCovers(view);
  if (changedRoute && !opts.quiet) {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    html.style.scrollBehavior = prev;
    view.focus({ preventScroll: true });
  }
}

/* re-render the current view when data it depends on changes */
let pending = new Set();
let raf = 0;
function changed(key) {
  pending.add(key);
  paintBadges();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const keys = pending;
    pending = new Set();
    const r = current.route;
    if (!r || r.soon) return;
    if ((r.deps || []).some((d) => keys.has(d))) {
      if (current.out && typeof current.out.update === "function" && current.out.update(keys) !== false) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-sp-keep]")) return;
      render({ quiet: true });
    }
  });
}

/* ============================================================
   UI helpers: toast, modal, drawer
   ============================================================ */
function toast(msg, kind = "ok") {
  const el = $("#spToast");
  if (!el) return;
  el.dataset.kind = kind;
  el.innerHTML = icon(kind === "err" ? "i-info" : "i-check") + `<span>${esc(msg)}</span>`;
  el.hidden = false;
  el.classList.remove("is-in");
  void el.offsetWidth;
  el.classList.add("is-in");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => (el.hidden = true), 300);
  }, 3600);
}

let modalClose = null;
function openModal(html, { onMount, wide, locked } = {}) {
  const root = $("#spModal");
  if (!root) return;
  root.innerHTML =
    `<div class="sp-modal-scrim" data-close></div>` +
    `<div class="sp-modal${wide ? " sp-modal--wide" : ""}" role="dialog" aria-modal="true">` +
    `<button class="sp-icon-btn sp-modal-x" type="button" data-close aria-label="Close">${icon("i-x")}</button>` +
    html +
    `</div>`;
  root.hidden = false;
  document.documentElement.classList.add("sp-locked");
  requestAnimationFrame(() => root.classList.add("is-open"));
  const close = () => {
    if (root.dataset.locked === "1") return;
    root.classList.remove("is-open");
    document.documentElement.classList.remove("sp-locked");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      root.hidden = true;
      root.innerHTML = "";
    }, 220);
    modalClose = null;
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  root.dataset.locked = locked ? "1" : "0";
  document.addEventListener("keydown", onKey);
  $$("[data-close]", root).forEach((b) => b.addEventListener("click", close));
  modalClose = close;
  if (onMount) onMount(root.querySelector(".sp-modal"), close);
  return close;
}
function lockModal(on) {
  const root = $("#spModal");
  if (root) root.dataset.locked = on ? "1" : "0";
}
function closeModal() {
  lockModal(false);
  if (modalClose) modalClose();
}

function openDrawer() {
  document.documentElement.classList.add("sp-drawer-open");
  const s = $(".sp-scrim");
  if (s) s.hidden = false;
}
function closeDrawer() {
  document.documentElement.classList.remove("sp-drawer-open");
  const s = $(".sp-scrim");
  if (s) s.hidden = true;
}

async function busy(btn, label, fn) {
  if (btn && btn.disabled) return;
  const html = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="sp-spin" aria-hidden="true"></span><span>${esc(label)}</span>`;
  }
  try {
    return await fn();
  } finally {
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = html;
    }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    try {
      document.execCommand("copy");
    } catch (er) {
      /* ignore */
    }
    t.remove();
  }
  toast("Copied to clipboard");
}

/* ============================================================
   course covers (generative art, or a picture set in the CRM)
   ============================================================ */
function coverSrc(c) {
  if (c.thumb === "link") return safeImageUrl(c.thumbUrl);
  if (c.thumb === "upload") return S.images.get(c.id) || "";
  return "";
}
function cover(c, size) {
  if (isPlanItem(c)) return `<div class="sp-cover">${planMini(c, size)}</div>`;
  return `<div class="sp-cover" data-cover="${esc(c.id)}" data-size="${size || "md"}">${coverHTML(c, coverSrc(c), { size })}</div>`;
}

/* small plan "cover" for cart lines / rails */
function planMini(p, size = "md") {
  return (
    `<div class="sp-pcv sp-pcv--${esc(size)}" data-theme="${esc(p.theme)}">` +
    `<span class="sp-pcv-ic">${icon("i-crown")}</span>` +
    (size === "xs" ? "" : `<b>${esc(p.title)}</b><small>${esc(p.mode)}</small>`) +
    `<i class="sp-pcv-sheen" aria-hidden="true"></i></div>`
  );
}

/* full membership card art — same look as the public Membership page */
function planVisual(p, holder) {
  const yr = String(new Date().getFullYear()).slice(-2);
  const n = String(Math.max(1, S.plans.indexOf(p) + 1)).padStart(2, "0");
  return (
    `<div class="mvis mvis--${esc(p.theme || "ink")}"><div class="mvis-in">` +
    `<div class="mvis-row"><img src="fenxtek-logo.png" alt="" width="30" height="30"><span class="mvis-brand">FenxTek<small>Membership</small></span><span class="mvis-chip" aria-hidden="true"></span></div>` +
    `<div class="mvis-name">${esc(p.title)}</div>` +
    `<div class="mvis-row mvis-foot"><span><small>Valid</small>${esc(p.duration || validityLabel(p.validityDays).replace(" access", ""))}</span>` +
    `<span><small>${holder ? "Member" : "Member no."}</small>${esc(holder || `FX · ${n} · ${yr}`)}</span><span class="mvis-mark" aria-hidden="true">✦</span></div>` +
    `<span class="mvis-sheen" aria-hidden="true"></span></div></div>`
  );
}
function hydrateCovers(root) {
  $$("[data-cover]", root).forEach((el) => {
    const c = courseById(el.dataset.cover);
    if (!c || c.thumb !== "upload" || S.images.has(c.id)) return;
    S.images.set(c.id, "");
    dbGet(`${PATH.courseImages}/${c.id}`)
      .then((snap) => {
        const src = safeDataImage(snap && snap.val ? snap.val() : "");
        S.images.set(c.id, src);
        if (!src) return;
        $$(`[data-cover="${CSS.escape(c.id)}"]`).forEach((n) => {
          n.innerHTML = coverHTML(c, src, { size: n.dataset.size });
        });
      })
      .catch(() => {});
  });
}

/* ============================================================
   reusable fragments
   ============================================================ */
function priceHTML(c, big) {
  const off = offPercent(c.price, c.mrp);
  const mp = memberPriceFor(c);
  if (mp != null) {
    return (
      `<div class="sp-price is-member${big ? " sp-price--big" : ""}">` +
      `<b>${money(mp)}</b><s>${money(Math.max(c.mrp, c.price))}</s><em class="sp-mtag">${icon("i-crown")}Member price</em>` +
      `</div>`
    );
  }
  const deal = big && !memberActive() ? memberDeal(c) : null;
  return (
    `<div class="sp-price${big ? " sp-price--big" : ""}">` +
    `<b>${c.price ? money(c.price) : "Free"}</b>` +
    (off ? `<s>${money(c.mrp)}</s><em>${off}% off</em>` : "") +
    `</div>` +
    (deal
      ? `<a class="sp-mdeal" href="#membership/${esc(deal.plan.planId)}">${icon("i-crown")}<span>Pay <b>${money(deal.price)}</b> with ${esc(deal.plan.title)} membership</span>${icon("i-arr")}</a>`
      : "")
  );
}

/* coupon tile; member-only coupons are locked for everyone else */
function offerTile(o, mode) {
  const tag = o.members ? `<i class="sp-mtag-s">${icon("i-crown")}Members</i>` : "";
  const body = `<span><b>${esc(o.code)}${tag}</b><small>${esc(o.label)}</small></span>`;
  if (offerLocked(o)) {
    return `<a class="sp-coupon-tile is-locked" href="#membership" title="Only for members">${icon("i-lock")}${body}<em>${memberActive() ? "Other plan" : "Join"}</em></a>`;
  }
  return mode === "apply"
    ? `<button type="button" class="sp-coupon-tile${o.members ? " is-member" : ""}" data-apply="${esc(o.code)}">${icon(o.members ? "i-crown" : "i-tag")}${body}<em>Apply</em></button>`
    : `<button type="button" class="sp-coupon-tile${o.members ? " is-member" : ""}" data-copy="${esc(o.code)}">${icon(o.members ? "i-crown" : "i-tag")}${body}${icon("i-copy")}</button>`;
}

function buyButtons(c, compact) {
  const a = access(c.id);
  if (a && a.active) {
    return `<a class="p-btn p-btn--sm sp-btn-owned" href="#learn/${esc(c.id)}">${icon("i-play")}<span>${compact ? "Open" : "Continue learning"}</span></a>`;
  }
  if (S.cart[c.id]) {
    return `<a class="p-btn p-btn--ghost p-btn--sm" href="#cart">${icon("i-check")}<span>In cart</span></a>`;
  }
  return `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-add="${esc(c.id)}">${icon("i-cart")}<span>${a ? "Renew" : "Add to cart"}</span></button>`;
}

/* Premium store card (v3): inset cover with badge + discount sticker,
   kicker, title, a three-cell spec strip, highlights, a price row with a
   quick add-to-cart button and full-width Explore / Buy now actions.
   Owned courses swap the price for remaining access and "Continue". */
function courseCard(c) {
  const a = access(c.id);
  const active = Boolean(a && a.active);
  const expired = Boolean(a && !a.active);
  const inCart = Boolean(S.cart[c.id]);
  const off = offPercent(c.price, c.mrp);
  const acc = accentOf(c.accent);
  const mp = memberPriceFor(c);
  const shown = mp != null ? mp : c.price;
  const strike = mp != null ? Math.max(c.mrp, c.price) : off ? c.mrp : 0;
  const deal = mp == null && !active && !memberActive() ? memberDeal(c) : null;
  const pd = perDay(shown, c.validityDays);
  const feats = (c.features || []).slice(0, 2);
  const href = `#course/${esc(c.id)}`;
  const validity = c.validityDays ? validityLabel(c.validityDays).replace(" access", "") : "Lifetime";
  const specs = [
    ["i-clock", validity, "Validity"],
    c.lessons ? ["i-play", String(c.lessons), "Lessons"] : ["i-book", c.language, "Language"],
    ["i-headphones", c.mode, "Mode"]
  ];
  const left = active && a.until ? Math.max(4, Math.round((1 - a.progress) * 100)) : 100;
  const foot = active
    ? `<div class="sc-prog"><div class="sc-prog-top"><b>${a.until ? `${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left` : "Lifetime access"}</b>` +
      `<small>${a.until ? `till ${esc(formatDate(a.until))}` : "never expires"}</small></div>` +
      `<span class="sc-meter"><i style="width:${left}%"></i></span></div>` +
      `<div class="sc-acts"><a class="sc-btn sc-btn--ghost" href="${href}">Details</a>` +
      `<a class="sc-btn sc-btn--go" href="#learn/${esc(c.id)}">${icon("i-play")}<span>Continue learning</span></a></div>`
    : `<div class="sc-price${mp != null ? " is-member" : ""}"><div class="sc-price-main"><div class="sc-price-row"><b>${shown ? money(shown) : "Free"}</b>${strike > shown ? `<s>${money(strike)}</s>` : ""}</div>` +
      `<small>${mp != null ? `<em class="sc-mem">${icon("i-crown")}Member price</em>` : off ? `<em>Save ${money(c.mrp - c.price)}</em>` : ""}${pd ? `≈ ₹${esc(pd)}/day` : "One-time payment"}</small></div>` +
      (inCart
        ? `<a class="sc-cart is-on" href="#cart" title="In your cart" aria-label="In your cart">${icon("i-check")}</a>`
        : `<button class="sc-cart" type="button" data-add="${esc(c.id)}" title="Add to cart" aria-label="Add ${esc(c.title)} to cart">${icon("i-cart")}<i aria-hidden="true">+</i></button>`) +
      `</div>` +
      (deal
        ? `<a class="sc-mdeal" href="#membership/${esc(deal.plan.planId)}">${icon("i-crown")}<span>Members pay <b>${money(deal.price)}</b></span><em>Save ${money(c.price - deal.price)}</em></a>`
        : "") +
      `<div class="sc-acts"><a class="sc-btn sc-btn--ghost" href="${href}">Explore</a>` +
      (inCart
        ? `<a class="sc-btn sc-btn--buy" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
        : `<button class="sc-btn sc-btn--buy" type="button" data-qbuy="${esc(c.id)}"><span>${expired ? "Renew now" : c.price ? "Buy now" : "Get it free"}</span>${icon("i-arr")}</button>`) +
      `</div>`;
  return (
    `<article class="sc${active ? " is-owned" : ""}${inCart ? " is-incart" : ""}" data-id="${esc(c.id)}" style="--acc:${acc.a};--acc2:${acc.b};--acc-t:${acc.text || acc.b}">` +
    `<a class="sc-media" href="${href}" aria-label="${esc(c.title)}">${cover(c, "md")}` +
    (c.badge || a
      ? `<span class="sc-tags">` +
        (active ? `<span class="sc-owned">${icon("i-check")}Enrolled</span>` : expired ? `<span class="sc-owned is-exp">${icon("i-clock")}Expired</span>` : "") +
        (c.badge ? `<span class="sc-badge">${icon("i-award")}${esc(c.badge)}</span>` : "") +
        `</span>`
      : "") +
    (off && !active ? `<span class="sc-off"><b>${off}%</b><small>off</small></span>` : "") +
    `<span class="sc-shine" aria-hidden="true"></span></a>` +
    `<div class="sc-body">` +
    `<div class="sc-kick"><span>${esc(c.category)}</span><i aria-hidden="true"></i><span>${esc(c.language)}</span></div>` +
    `<a class="sc-title" href="${href}">${esc(c.title)}</a>` +
    (c.subtitle ? `<p class="sc-sub">${esc(c.subtitle)}</p>` : "") +
    `<ul class="sc-specs">${specs.map(([ic, v, l]) => `<li title="${esc(l)}: ${esc(v)}">${icon(ic)}<b>${esc(v)}</b><small>${l}</small></li>`).join("")}</ul>` +
    (feats.length ? `<ul class="sc-feats">${feats.map((f) => `<li>${icon("i-check")}<span>${esc(f)}</span></li>`).join("")}</ul>` : "") +
    `<div class="sc-foot">${foot}</div>` +
    `</div></article>`
  );
}

/* Membership plan card (portal version of the public plan card). */
function planCard(p, focusId) {
  const held = holdsPlan(p);
  const off = offPercent(p.price, p.mrp);
  const pd = perDay(p.price, p.validityDays);
  const inCart = Boolean(S.cart[p.id]);
  const other = memberActive() && !held;
  let cta;
  if (!p.buyable) {
    const phone = String(S.content.phone || "+91 73090 82749").replace(/[^\d]/g, "");
    cta = `<a class="p-btn p-btn--ghost p-btn--block" href="tel:+${phone}">${icon("i-phone")}<span>Call to join</span></a>`;
  } else if (inCart) {
    cta = `<a class="p-btn p-btn--lime p-btn--block" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`;
  } else {
    cta =
      `<div class="sp-plan-cta"><button class="p-btn p-btn--lime p-btn--block" type="button" data-buy="${esc(p.id)}">${icon(held ? "i-refresh" : "i-bolt")}<span>${held ? `Extend · ${esc(p.mode)}` : other ? "Switch to this plan" : esc(p.cta && p.cta !== "Choose plan" ? p.cta : "Buy membership")}</span></button>` +
      `<button class="sp-plan-add" type="button" data-add="${esc(p.id)}" aria-label="Add ${esc(p.title)} to cart" title="Add to cart">${icon("i-cart")}</button></div>`;
  }
  return (
    `<article class="sp-plan${p.highlight ? " is-hot" : ""}${focusId && (focusId === p.planId || focusId === p.id) ? " is-focus" : ""}" data-theme="${esc(p.theme)}" id="plan-${esc(p.planId)}">` +
    `<div class="sp-plan-top"><span class="sp-plan-n">${esc(p.mode)}</span>` +
    (held ? `<span class="sp-plan-flag is-cur">${icon("i-check")}Your plan</span>` : p.highlight ? `<span class="sp-plan-flag">${esc(p.badge || "Most popular")}</span>` : "") +
    `</div>` +
    `<div class="sp-plan-vis">${planVisual(p)}</div>` +
    `<div class="sp-plan-body">` +
    `<h3>${esc(p.title)}</h3>${p.subtitle ? `<p class="sp-plan-tag">${esc(p.subtitle)}</p>` : ""}` +
    `<div class="sp-plan-price"><b>${p.price ? money(p.price) : "Free"}</b><span>/ ${esc(p.mode)}</span></div>` +
    `<div class="sp-plan-sub">${off ? `<s>${money(p.mrp)}</s><em>Save ${off}%</em>` : ""}${pd ? `<span>≈ ₹${esc(pd)} a day</span>` : ""}</div>` +
    (p.courseOff ? `<p class="sp-plan-perk">${icon("i-tag")}<span><b>Extra ${p.courseOff}% off</b> every course in the store</span></p>` : "") +
    cta +
    (other && p.buyable ? `<p class="sp-plan-note">${icon("i-info")}Starts on payment and replaces your current plan.</p>` : "") +
    (held && p.buyable ? `<p class="sp-plan-note">${icon("i-info")}Extends from ${esc(formatDate(S.member.endAt))} — no days lost.</p>` : "") +
    (p.features.length ? `<span class="sp-plan-inc">What’s included</span><ul class="sp-plan-feats">${p.features.map((f) => `<li>${icon("i-check")}<span>${esc(f)}</span></li>`).join("")}</ul>` : "") +
    `</div></article>`
  );
}

/* slim promo used on Home and in the store */
function memberPromo(kind) {
  if (memberActive()) return "";
  const list = S.plans.filter((p) => p.buyable);
  if (!list.length) return "";
  const from = Math.min(...list.map((p) => p.price));
  const best = list.find((p) => p.highlight) || list[0];
  const inCart = Boolean(S.cart[best.id]);
  return (
    `<div class="sp-mpromo sp-mpromo--${kind}">` +
    `<a class="sp-mpromo-card" href="#membership/${esc(best.planId)}" tabindex="-1" aria-hidden="true">${planMini(best, "sm")}</a>` +
    `<a class="sp-mpromo-txt" href="#membership"><span class="sp-k sp-k--light">FenxTek membership</span><b>${kind === "store" ? "One plan. Everything you need to crack steno." : "Go all-in with a membership"}</b>` +
    `<small>${list.length} plan${list.length === 1 ? "" : "s"} · from ${money(from)} · ${perkTop() ? `extra ${perkTop().courseOff}% off all courses` : "instant receipt"}</small></a>` +
    `<span class="sp-mpromo-acts">` +
    (inCart
      ? `<a class="p-btn p-btn--lime p-btn--sm" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
      : `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-qbuy="${esc(best.id)}">${icon("i-cart")}<span>Buy ${esc(best.title)} · ${money(best.price)}</span></button>`) +
    `<a class="p-btn p-btn--ghost p-btn--sm sp-btn-onDark" href="#membership">${icon("i-crown")}<span>View plans</span></a>` +
    `</span></div>`
  );
}

function empty(iconId, title, text, cta) {
  return (
    `<div class="sp-empty"><span class="sp-empty-ic">${icon(iconId)}</span>` +
    `<h3>${esc(title)}</h3><p>${esc(text)}</p>${cta || ""}</div>`
  );
}

function skeletonGrid(n = 3) {
  return `<div class="sp-grid">${Array.from({ length: n }, () => `<div class="sp-card sp-card--skel"><div class="sp-skel sp-skel--media"></div><div class="sp-card-body"><div class="sp-skel"></div><div class="sp-skel sp-skel--short"></div></div></div>`).join("")}</div>`;
}

function bindAdd(root) {
  $$("[data-add]", root).forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      addToCart(b.dataset.add, b);
    })
  );
  /* card "Buy now" / "Renew": add to cart and open checkout */
  $$("[data-qbuy]", root).forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      addToCart(b.dataset.qbuy, b, true);
    })
  );
}

function sectionHead(k, title, link) {
  return `<div class="sp-sec-head"><div><span class="sp-k">${esc(k)}</span><h2>${title}</h2></div>${link || ""}</div>`;
}

/* ============================================================
   cart + coupon actions
   ============================================================ */
async function addToCart(id, btn, thenGo) {
  const c = itemById(id);
  if (!c) return;
  const plan = isPlanItem(c);
  if (plan && !c.buyable) {
    toast("This plan can’t be bought online yet — call the academy to join.", "err");
    return;
  }
  if (!plan && owns(id) && !thenGo) {
    toast("You’re already enrolled in this course.");
    return;
  }
  if (S.cart[id]) {
    if (thenGo) go("#cart");
    return;
  }
  const at = Date.now();
  const prev = S.cart;
  const next = { ...S.cart, [id]: at };
  /* one membership per order — a new plan replaces the one in the cart */
  const swapped = plan ? Object.keys(next).filter((k) => k !== id && isPlanId(k)) : [];
  swapped.forEach((k) => delete next[k]);
  S.cart = next;
  changed("cart");
  try {
    if (swapped.length) {
      const updates = { [`${PATH.carts}/${S.user.uid}/${id}`]: at };
      swapped.forEach((k) => (updates[`${PATH.carts}/${S.user.uid}/${k}`] = null));
      await dbUpdateRoot(updates);
    } else {
      await dbSet(`${PATH.carts}/${S.user.uid}/${id}`, at);
    }
    if (thenGo) go("#cart");
    else toast(swapped.length ? `Swapped your plan for “${c.title}”` : `Added “${c.title}” to your cart`);
  } catch (err) {
    S.cart = prev;
    changed("cart");
    toast(friendlyError(err), "err");
  }
}

async function removeFromCart(id) {
  const prev = S.cart[id];
  const next = { ...S.cart };
  delete next[id];
  S.cart = next;
  changed("cart");
  try {
    await dbSet(`${PATH.carts}/${S.user.uid}/${id}`, null);
  } catch (err) {
    S.cart = { ...S.cart, [id]: prev };
    changed("cart");
    toast(friendlyError(err), "err");
  }
}

async function fetchCoupon(code) {
  const [cs, us, mine] = await Promise.all([
    dbGet(`${PATH.coupons}/${code}`),
    dbGet(`${PATH.couponUsage}/${code}/count`).catch(() => null),
    dbGet(`${PATH.couponUsage}/${code}/users/${S.user.uid}`).catch(() => null)
  ]);
  const coupon = cs && cs.exists && cs.exists() ? cs.val() : null;
  return {
    code,
    coupon,
    usedCount: num(us && us.val ? us.val() : 0),
    usedByMe: Boolean(mine && mine.exists && mine.exists())
  };
}


async function applyCoupon(raw, btn) {
  const code = normalizeCode(raw);
  if (code.length < 3) {
    toast("Enter a valid coupon code.", "err");
    return false;
  }
  return busy(btn, "Checking", async () => {
    try {
      const info = await fetchCoupon(code);
      const prev = S.coupon;
      S.coupon = info;
      const { p: pricing, check } = cartPricing();
      if (!check.ok) {
        S.coupon = prev;
        toast(check.reason, "err");
        return false;
      }
      toast(`Coupon ${code} applied — you save ${money(pricing.couponDiscount)}`);
      /* re-render now: the coupon input still has focus, which would hold back a live refresh */
      if (current.route && current.route.id === "cart") render({ quiet: true });
      else changed("cart");
      return true;
    } catch (err) {
      toast(friendlyError(err), "err");
      return false;
    }
  });
}

/* ============================================================
   checkout
   ============================================================ */
async function placeOrder({ status, method, extra = {}, expect = null }) {
  const items = cartItems();
  if (!items.length) throw new Error("Your cart is empty.");
  const uid = S.user.uid;
  let priced = cartPricing(items);
  if (S.coupon && !(priced.check && priced.check.ok)) {
    S.coupon = null;
    priced = cartPricing(items);
  }
  const { p: pricing, plan: perk } = priced;
  /* the student already sees/pays `expect.total` — never record a different amount
     (Razorpay has already charged, so it is recorded as paid and verified by the admin) */
  if (expect && method !== "razorpay" && pricing.total !== expect.total) {
    changed("cart");
    throw userErr("Your total changed — please review your cart and pay again.");
  }
  const oid = await dbKey(`${PATH.orders}/${uid}`);
  const orderNo = orderNumber();
  const now = Date.now();

  const itemMap = {};
  items.forEach((c) => {
    itemMap[c.id] = isPlanItem(c)
      ? {
          kind: "plan",
          planId: c.planId,
          title: c.title,
          price: c.price,
          mrp: Math.max(c.mrp, c.price),
          validityDays: c.validityDays,
          category: "Membership",
          mode: c.mode
        }
      : {
          title: c.title,
          price: c.price,
          mrp: Math.max(c.mrp, c.price),
          validityDays: c.validityDays,
          category: c.category,
          mode: c.mode,
          language: c.language
        };
  });

  const order = {
    orderNo,
    uid,
    name: S.profile.name || S.user.displayName || "Student",
    email: S.user.email || S.profile.email || "",
    phone: S.profile.phone || "",
    items: itemMap,
    mrpTotal: pricing.mrpTotal,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    total: pricing.total,
    currency: "INR",
    status,
    method,
    verified: false,
    createdAt: now,
    ...extra
  };
  if (status === "paid") order.paidAt = now;
  if (pricing.memberDiscount > 0 && perk) {
    order.memberDiscount = pricing.memberDiscount;
    order.memberPlan = perk.title;
  }
  if (pricing.coins > 0) order.coins = pricing.coins;

  const updates = {};
  updates[`${PATH.carts}/${uid}`] = null;

  if (pricing.coins > 0) {
    /* spend E-coins in the same write as the order (the rules tie them together) */
    const w = snapVal(await dbGet(`${PATH.wallets}/${uid}`)) || {};
    const bal = num(w.balance);
    if (bal < pricing.coins) {
      S.wallet = w;
      changed("wallet");
      throw userErr("Your E-coin balance changed — please review your cart and pay again.");
    }
    const wallet = { balance: bal - pricing.coins, spent: num(w.spent) + pricing.coins, lastSpend: { orderId: oid, coins: pricing.coins, at: now }, updatedAt: now };
    if (w.earned !== undefined) wallet.earned = w.earned;
    updates[`${PATH.wallets}/${uid}`] = wallet;
    updates[`${PATH.walletTx}/${uid}/${oid}`] = { type: "spend", coins: -pricing.coins, orderId: oid, orderNo, at: now, note: countLabel(items).slice(0, 200) };
  }

  if (S.coupon && pricing.couponDiscount > 0) {
    const fresh = await fetchCoupon(S.coupon.code);
    const again = checkCoupon({ ...fresh, items, prices: memberPrices(items, perk).prices, member: memberCtx() });
    if (!again.ok) {
      S.coupon = null;
      changed("cart");
      throw new Error(again.reason + " Your total has been updated — please review and pay again.");
    }
    order.coupon = { code: fresh.code, type: fresh.coupon.type, value: num(fresh.coupon.value), discount: pricing.couponDiscount };
    updates[`${PATH.couponUsage}/${fresh.code}/count`] = fresh.usedCount + 1;
    updates[`${PATH.couponUsage}/${fresh.code}/users/${uid}`] = oid;
  }

  let memberRec = null;
  if (status === "paid") {
    const plan = items.find(isPlanItem);
    if (plan) {
      memberRec = memberRecordFor(plan, { id: oid, orderNo, name: order.name, email: order.email }, S.member, now);
      if (items.length === 1) memberRec.paid = pricing.total;
      updates[`${PATH.members}/${uid}`] = memberRec;
    }
    items.filter((c) => !isPlanItem(c)).forEach((c) => {
      const prev = S.enroll[c.id];
      let until = 0;
      if (prev && num(prev.until) === 0 && prev.orderId) until = 0;
      else if (c.validityDays) {
        const base = prev && num(prev.until) > now ? num(prev.until) : now;
        until = base + c.validityDays * DAY;
      }
      updates[`${PATH.enrollments}/${uid}/${c.id}`] = { orderId: oid, orderNo, since: now, until, title: c.title };
    });
  }

  updates[`${PATH.orders}/${uid}/${oid}`] = order;
  await dbUpdateRoot(updates);

  /* optimistic local state so the success screen renders instantly */
  S.orders = [{ ...order, id: oid }, ...S.orders.filter((o) => o.id !== oid)];
  S.cart = {};
  S.coupon = null;
  if (updates[`${PATH.wallets}/${uid}`]) {
    S.wallet = updates[`${PATH.wallets}/${uid}`];
    changed("wallet");
  }
  if (status === "paid") {
    Object.keys(updates)
      .filter((k) => k.startsWith(`${PATH.enrollments}/`))
      .forEach((k) => (S.enroll[k.split("/").pop()] = updates[k]));
    if (memberRec) {
      S.member = memberRec;
      changed("member");
    }
  }
  changed("cart");
  changed("orders");
  changed("enroll");
  return { id: oid, ...order };
}

function payHeader(pricing) {
  return (
    `<div class="sp-pay-head"><span class="sp-k">Secure checkout</span>` +
    `<h3>Pay ${money(pricing.total)}</h3>` +
    `<p>${esc(countLabel(cartItems()))}${pricing.discount + pricing.coins ? ` · you save ${money(pricing.discount + pricing.coins)}` : ""}${pricing.coins ? ` (incl. ${esc(coinsLabel(pricing.coins))})` : ""}</p></div>`
  );
}

function countLabel(items) {
  const plans = items.filter(isPlanItem).length;
  const courses = items.length - plans;
  const parts = [];
  if (courses) parts.push(`${courses} course${courses === 1 ? "" : "s"}`);
  if (plans) parts.push(courses ? "membership" : "1 membership");
  return parts.join(" + ") || "0 items";
}

function openCheckout() {
  const items = cartItems();
  if (!items.length) return;
  const { p: pricing } = cartPricing(items);
  const pay = S.pay || {};

  if (pricing.total === 0) {
    openModal(
      payHeader(pricing) +
        `<div class="sp-pay-free">${icon("i-gift")}<p>Your coupon covers the full amount. Confirm to unlock it instantly — a receipt is generated for your records.</p></div>` +
        `<button class="p-btn p-btn--lime p-btn--block" type="button" id="spFreeGo">${icon("i-check")}<span>Confirm &amp; enrol</span></button>`,
      {
        onMount: (m) => {
          $("#spFreeGo", m).addEventListener("click", (e) =>
            busy(e.currentTarget, "Enrolling", async () => {
              lockModal(true);
              try {
                const o = await placeOrder({ status: "paid", method: "free", expect: pricing });
                closeModal();
                go(`#success/${o.id}`);
              } catch (err) {
                lockModal(false);
                toast(friendlyError(err), "err");
              }
            })
          );
        }
      }
    );
    return;
  }

  const methods = [];
  if (pay.razorpayEnabled && pay.razorpayKey) methods.push("razorpay");
  if (pay.upiEnabled && pay.upiId) methods.push("upi");

  if (!methods.length) {
    const phone = String(S.content.phone || "+91 73090 82749");
    openModal(
      payHeader(pricing) +
        `<div class="sp-pay-off">${icon("i-info")}<div><b>Online payment isn’t switched on yet</b><p>Pay at the academy or over a call — the team will enrol you and your receipt will appear under Orders.</p></div></div>` +
        `<div class="sp-pay-actions"><a class="p-btn p-btn--lime" href="tel:+${phone.replace(/[^\d]/g, "")}">${icon("i-phone")}<span>Call the academy</span></a>` +
        `<a class="p-btn p-btn--ghost" href="https://t.me/fenxtekshorthand_classes" target="_blank" rel="noopener">${icon("i-send")}<span>Telegram</span></a></div>`
    );
    return;
  }

  openModal(
    payHeader(pricing) +
      `<div class="sp-methods" role="radiogroup" aria-label="Payment method">` +
      methods
        .map(
          (m, i) =>
            `<label class="sp-method"><input type="radio" name="spMethod" value="${m}"${i === 0 ? " checked" : ""}>` +
            (m === "razorpay"
              ? `<span class="sp-method-ic">${icon("i-card")}</span><span><b>Card, UPI, netbanking, wallets</b><small>Instant access · powered by Razorpay</small></span>`
              : `<span class="sp-method-ic">${icon("i-qr")}</span><span><b>Pay by UPI QR / UPI ID</b><small>Unlocked after the academy verifies your payment</small></span>`) +
            `</label>`
        )
        .join("") +
      `</div>` +
      `<button class="p-btn p-btn--lime p-btn--block" type="button" id="spPayGo">${icon("i-shield")}<span>Continue to pay ${money(pricing.total)}</span></button>` +
      `<p class="sp-pay-note">${icon("i-lock")}Prices include all taxes. A receipt is generated as soon as your payment is confirmed.</p>`,
    {
      onMount: (m) => {
        $("#spPayGo", m).addEventListener("click", (e) => {
          const method = ($('input[name="spMethod"]:checked', m) || {}).value;
          if (method === "razorpay") payRazorpay(pricing, e.currentTarget);
          else payUPI(pricing);
        });
      }
    }
  );
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn’t load the payment gateway. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

async function payRazorpay(pricing, btn) {
  await busy(btn, "Opening gateway", async () => {
    try {
      if (!window.Razorpay) await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    } catch (err) {
      toast(err.message, "err");
      return;
    }
    const pay = S.pay || {};
    const rzp = new window.Razorpay({
      key: pay.razorpayKey,
      amount: Math.round(pricing.total * 100),
      currency: "INR",
      name: pay.businessName || "FenxTek Shorthand Classes",
      description: cartItems()
        .map((c) => c.title)
        .join(", ")
        .slice(0, 250),
      image: new URL("fenxtek-logo.png", location.href).href,
      prefill: { name: S.profile.name || "", email: S.user.email || "", contact: S.profile.phone || "" },
      notes: { uid: S.user.uid, coupon: S.coupon ? S.coupon.code : "", coins: String(pricing.coins || 0) },
      theme: { color: "#5A4BFF" },
      handler: async (resp) => {
        openModal(`<div class="sp-processing"><span class="sp-spin sp-spin--lg"></span><h3>Confirming your payment…</h3><p>Please don’t close this window.</p></div>`, { locked: true });
        try {
          const o = await placeOrder({ status: "paid", method: "razorpay", extra: { paymentId: String(resp.razorpay_payment_id || "") }, expect: pricing });
          closeModal();
          go(`#success/${o.id}`);
        } catch (err) {
          lockModal(false);
          closeModal();
          toast("Payment received but we couldn’t record it: " + friendlyError(err) + " Please contact the academy with payment ID " + resp.razorpay_payment_id, "err");
        }
      },
      modal: { ondismiss: () => toast("Payment cancelled — your cart is saved.", "err") }
    });
    rzp.on("payment.failed", (r) => toast((r && r.error && r.error.description) || "Payment failed. Please try again.", "err"));
    closeModal();
    rzp.open();
  });
}

async function payUPI(pricing) {
  const pay = S.pay || {};
  const note = "FenxTek " + cartItems().map((c) => c.title).join(", ");
  const link = upiLink({ upiId: pay.upiId, payee: pay.payeeName || pay.businessName, amount: pricing.total, note });
  openModal(
    `<div class="sp-pay-head"><span class="sp-k">Step 1 · Pay</span><h3>Scan &amp; pay ${money(pricing.total)}</h3><p>Use any UPI app — GPay, PhonePe, Paytm or your bank.</p></div>` +
      `<div class="sp-upi">` +
      `<div class="sp-qr" id="spQr"><span class="sp-spin"></span></div>` +
      `<div class="sp-upi-side">` +
      `<span class="p-label">Pay to</span><b class="sp-upi-name">${esc(pay.payeeName || pay.businessName || "FenxTek Shorthand Classes")}</b>` +
      `<button type="button" class="sp-upi-id" id="spUpiCopy">${esc(pay.upiId)}${icon("i-copy")}</button>` +
      `<span class="p-label">Amount</span><b class="sp-upi-amt">${money(pricing.total)}</b>` +
      `<a class="p-btn p-btn--ghost p-btn--sm sp-upi-app" href="${esc(link)}">${icon("i-arr-ur")}<span>Open UPI app</span></a>` +
      `</div></div>` +
      `<form class="sp-utr" id="spUtrForm" novalidate>` +
      `<span class="sp-k">Step 2 · Confirm</span>` +
      `<label class="p-field"><span class="p-label">UPI transaction / UTR number</span>` +
      `<input class="p-input" name="utr" inputmode="numeric" autocomplete="off" placeholder="12-digit UTR from your UPI app" maxlength="30" required></label>` +
      `<button class="p-btn p-btn--lime p-btn--block" type="submit">${icon("i-check")}<span>I’ve paid — submit for verification</span></button>` +
      `<p class="sp-pay-note">${icon("i-info")}The academy matches your UTR with the payment and unlocks the course — usually within a few hours.</p>` +
      `</form>`,
    {
      onMount: (m) => {
        $("#spUpiCopy", m).addEventListener("click", () => copyText(pay.upiId));
        renderQR($("#spQr", m), link);
        $("#spUtrForm", m).addEventListener("submit", (e) => {
          e.preventDefault();
          const utr = String(e.currentTarget.utr.value || "").replace(/\s+/g, "");
          if (!/^[A-Za-z0-9]{6,30}$/.test(utr)) {
            toast("Enter the UTR / transaction ID shown in your UPI app.", "err");
            return;
          }
          busy(e.currentTarget.querySelector("button"), "Submitting", async () => {
            lockModal(true);
            try {
              const o = await placeOrder({ status: "pending", method: "upi", extra: { utr }, expect: pricing });
              closeModal();
              go(`#success/${o.id}`);
            } catch (err) {
              lockModal(false);
              toast(friendlyError(err), "err");
            }
          });
        });
      },
      wide: true
    }
  );
}

async function renderQR(box, text) {
  if (!box) return;
  try {
    if (!window.qrcode) await loadQR();
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    box.insertAdjacentHTML("beforeend", `<img class="sp-qr-logo" src="fenxtek-logo.png" alt="">`);
  } catch (e) {
    box.innerHTML = `<div class="sp-qr-fallback">${icon("i-qr")}<span>QR unavailable — pay to the UPI ID</span></div>`;
  }
}

function receiptSettings() {
  return {
    ...S.pay,
    supportPhone: S.pay.supportPhone || S.content.phone || "+91 73090 82749",
    supportEmail: S.content.email || "fenxtekshorthandclasses20@gmail.com"
  };
}

/* ============================================================
   views
   ============================================================ */
function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function vHome() {
  const first = String(S.profile.name || S.user.displayName || "there").split(/\s+/)[0];
  const ownedList = S.courses.filter((c) => access(c.id));
  const activeOwned = ownedList.filter((c) => owns(c.id));
  const recs = S.courses.filter((c) => !access(c.id)).slice(0, 3);
  const paid = S.orders.filter((o) => o.status === "paid");
  const saved = paid.reduce((s, o) => s + Math.max(0, num(o.mrpTotal) - num(o.total)), 0);
  const pendingOrders = S.orders.filter((o) => o.status === "pending").length;
  const st = membershipStatus(S.member);
  const ann = S.content.announcement;

  const html =
    `<section class="sp-hero">` +
    `<div class="sp-hero-txt"><span class="sp-k sp-k--light">${esc(greeting())}</span>` +
    `<h2>Hello, <em>${esc(first)}</em>.</h2>` +
    `<p>${activeOwned.length ? "Pick up where you left off — consistency beats intensity." : "Start your steno journey with an exam-focused course built by FenxTek."}</p>` +
    `<div class="sp-hero-chips">` +
    `<span class="sp-chip sp-chip--lime">${icon("i-award")}${esc(S.profile.exam ? S.profile.exam : "Set your target exam")}</span>` +
    (S.profile.speed ? `<span class="sp-chip">${icon("i-zap")}${esc(S.profile.speed)} WPM goal</span>` : "") +
    (st.key === "active" ? `<span class="sp-chip">${icon("i-crown")}${esc((S.member && S.member.planName) || "Member")}</span>` : "") +
    (S.admin ? `<span class="sp-chip">${icon("i-shield")}Admin</span>` : "") +
    `</div>` +
    `<div class="sp-hero-cta"><a class="p-btn p-btn--lime" href="${activeOwned.length ? "#my-courses" : "#store"}">${icon(activeOwned.length ? "i-play" : "i-bolt")}<span>${activeOwned.length ? "Continue learning" : "Explore courses"}</span></a>` +
    `<a class="p-btn p-btn--ghost sp-btn-onDark" href="#orders">${icon("i-receipt")}<span>Orders &amp; receipts</span></a></div>` +
    `</div>` +
    `<div class="sp-hero-art" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--h:${(0.25 + Math.abs(Math.sin(i * 1.6)) * 0.75).toFixed(2)};--d:${(-i * 0.08).toFixed(2)}s"></i>`).join("")}</div>` +
    `</section>` +
    `<div class="sp-stats">` +
    stat("i-book", activeOwned.length, "Active courses", "#my-courses") +
    stat("i-cart", cartIds().length, "In your cart", "#cart") +
    stat("i-receipt", S.orders.length, pendingOrders ? `Orders · ${pendingOrders} pending` : "Orders", "#orders") +
    stat("i-tag", money(saved), "Total saved", "#orders") +
    `</div>` +
    walletCard() +
    memberPromo("home") +
    inviteBanner() +
    (ann ? `<section class="sp-announce">${icon("i-bolt")}<div><span class="sp-k">From the academy</span><p>${esc(ann)}</p></div></section>` : "") +
    `<section class="sp-sec">` +
    sectionHead("Continue", "My courses", activeOwned.length ? `<a class="sp-link" href="#my-courses">View all ${icon("i-arr")}</a>` : "") +
    (activeOwned.length
      ? `<div class="sp-lc-grid">${activeOwned.slice(0, 3).map(ownedCard).join("")}</div>`
      : empty("i-book", "No courses yet", "Courses you buy appear here with their validity and class links.", `<a class="p-btn p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse the store</span></a>`)) +
    `</section>` +
    (S.coursesReady && recs.length
      ? `<section class="sp-sec">${sectionHead("Recommended", "Courses for you", `<a class="sp-link" href="#store">Open store ${icon("i-arr")}</a>`)}<div class="sp-grid">${recs.map(courseCard).join("")}</div></section>`
      : !S.coursesReady
      ? `<section class="sp-sec">${sectionHead("Recommended", "Courses for you")}${skeletonGrid(3)}</section>`
      : "") +
    `<div class="sp-split">` +
    `<section class="sp-panel">${sectionHead("Academy", "Active batches")}` +
    (S.batches.length
      ? `<ul class="sp-list">${S.batches.map((b) => `<li><span>${esc(b.title || b.name || "Batch")}</span><em>${esc(b.tag || b.mode || "")}</em></li>`).join("")}</ul>`
      : `<p class="sp-muted">No batches are published right now.</p>`) +
    `</section>` +
    `<section class="sp-panel sp-panel--soon">${sectionHead("Coming soon", "More in your portal")}` +
    `<div class="sp-soon-list">${ROUTES.filter((r) => r.soon)
      .map((r) => `<a href="#${r.id}" class="sp-soon-item">${icon(r.icon)}<span><b>${esc(r.label)}</b><small>${esc(r.blurb)}</small></span></a>`)
      .join("")}</div></section>` +
    `</div>`;
  return {
    title: "Home",
    crumb: "Student portal",
    html,
    mount(root) {
      bindAdd(root);
      bindGift(root);
      countUpCoins(root);
    }
  };
}

function stat(ic, value, label, href) {
  return `<a class="sp-stat" href="${href}"><span class="sp-stat-ic">${icon(ic)}</span><b>${esc(value)}</b><span>${esc(label)}</span></a>`;
}

/* Learn tile (My courses + Home): cover with status pill and play button,
   a ring showing how much access is left, and Continue / Renew / Receipt. */
function lcProgress(c, a) {
  if (!a.active) return "";
  const cc = S.cc[c.id];
  if (!cc || !cc.ready || cc.error) return "";
  const list = visibleList(itemsList(cc.items));
  const leaves = list.filter((i) => i.type !== "folder");
  if (!leaves.length) return "";
  const done = (S.progress[c.id] && S.progress[c.id].done) || {};
  const n = leaves.filter((i) => done[i.id]).length;
  const pct = Math.round((n / leaves.length) * 100);
  return `<div class="lc-prog"><span class="cc-bar"><i style="width:${pct}%"></i></span><small><b>${pct}%</b> complete · ${n}/${leaves.length} lessons</small></div>`;
}

function ownedCard(c) {
  const a = access(c.id) || { active: false, until: 0, daysLeft: 0, progress: 1 };
  const acc = accentOf(c.accent);
  const life = a.active && !a.until;
  const total = a.until ? Math.max(1, Math.round((num(a.until) - num(a.since)) / DAY)) : 0;
  const frac = life ? 1 : a.active ? Math.max(0.03, 1 - a.progress) : 0;
  const state = !a.active ? "expired" : life ? "life" : a.daysLeft <= 7 ? "ending" : "active";
  const label = { expired: "Expired", life: "Lifetime", ending: `Ends in ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}`, active: "Active" }[state];
  const R = 19;
  const L = +(2 * Math.PI * R).toFixed(2);
  const learn = `#learn/${esc(c.id)}`;
  const hasOrder = a.orderId && S.orders.some((o) => o.id === a.orderId);
  return (
    `<article class="lc lc--${state}" style="--acc:${acc.a};--acc2:${acc.b};--acc-t:${acc.text || acc.b}">` +
    `<a class="lc-media" href="${learn}" aria-label="${esc(a.active ? "Open" : "Renew")} ${esc(c.title)}">${cover(c, "md")}` +
    `<span class="lc-status"><i aria-hidden="true"></i>${esc(label)}</span>` +
    `<span class="lc-play" aria-hidden="true">${icon(a.active ? "i-play" : "i-lock")}</span>` +
    `<span class="sc-shine" aria-hidden="true"></span></a>` +
    `<div class="lc-body">` +
    `<div class="sc-kick"><span>${esc(c.category)}</span><i aria-hidden="true"></i><span>${esc(c.language)}</span></div>` +
    `<a class="lc-title" href="${learn}">${esc(c.title)}</a>` +
    `<div class="lc-meter">` +
    `<span class="lc-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="lc-ring-bg" cx="22" cy="22" r="${R}"/>` +
    `<circle class="lc-ring-fg" cx="22" cy="22" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${(L * (1 - frac)).toFixed(2)}"/></svg>` +
    (a.active ? `<b>${life ? "∞" : a.daysLeft}</b>` : icon("i-clock")) + `</span>` +
    `<div class="lc-meter-txt"><b>${life ? "Lifetime access" : a.active ? `${a.daysLeft} of ${total} days left` : "Access ended"}</b>` +
    `<small>${life ? "Never expires" : a.active ? `Valid till ${esc(formatDate(a.until))}` : `Expired on ${esc(formatDate(a.until))}`}</small></div>` +
    `</div>` +
    lcProgress(c, a) +
    `<div class="lc-acts">` +
    (a.active
      ? `<a class="sc-btn sc-btn--go" href="${learn}">${icon("i-play")}<span>Continue learning</span></a>`
      : S.cart[c.id]
      ? `<a class="sc-btn sc-btn--buy" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
      : courseById(c.id)
      ? `<button class="sc-btn sc-btn--buy" type="button" data-qbuy="${esc(c.id)}">${icon("i-refresh")}<span>Renew course</span></button>`
      : `<a class="sc-btn sc-btn--ghost" href="contact.html">${icon("i-phone")}<span>Ask the academy</span></a>`) +
    (hasOrder ? `<a class="sc-ico" href="#receipt/${esc(a.orderId)}" title="Receipt" aria-label="Receipt">${icon("i-receipt")}</a>` : "") +
    (courseById(c.id) ? `<a class="sc-ico" href="#course/${esc(c.id)}" title="Course details" aria-label="Course details">${icon("i-info")}</a>` : "") +
    `</div></div></article>`
  );
}

function vMyCourses() {
  const owned = S.courses.filter((c) => access(c.id));
  /* courses that were unpublished/removed but still owned */
  Object.keys(S.enroll).forEach((id) => {
    if (!owned.find((c) => c.id === id)) {
      const e = S.enroll[id];
      owned.push({ ...coursesFrom({ [id]: { title: e.title || "Course", price: 0, validityDays: 0 } }, { all: true })[0] });
    }
  });
  const active = owned.filter((c) => owns(c.id));
  const expired = owned.filter((c) => !owns(c.id));
  const html =
    (owned.length
      ? `<section class="sp-sec">${sectionHead("Enrolled", `Active <span class="sp-pill-n">${active.length}</span>`)}` +
        (active.length ? `<div class="sp-lc-grid">${active.map(ownedCard).join("")}</div>` : `<p class="sp-muted">No active courses — renew one below.</p>`) +
        `</section>` +
        (expired.length
          ? `<section class="sp-sec">${sectionHead("History", `Expired <span class="sp-pill-n">${expired.length}</span>`)}<div class="sp-lc-grid">${expired.map(ownedCard).join("")}</div></section>`
          : "")
      : empty("i-book", "You haven’t enrolled in a course yet", "Browse the store, add a course to your cart and apply a coupon if you have one.", `<a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-bolt")}<span>Explore courses</span></a>`));
  return {
    title: "My courses",
    html,
    mount(root) {
      bindAdd(root);
      active.forEach((c) => ensureContent(c.id));
    }
  };
}

function vStore() {
  const f = S.filters;
  const cats = Array.from(new Set(S.courses.map((c) => c.category)));
  const offer = S.offers.find((o) => !offerLocked(o)) || null;
  const html =
    (offer
      ? `<div class="sp-offer${offer.members ? " is-member" : ""}">${icon(offer.members ? "i-crown" : "i-gift")}<span>${offer.members ? "Members: use" : "Use"} code <b>${esc(offer.code)}</b> — ${esc(offer.label)}</span><button type="button" class="sp-offer-copy" data-copy="${esc(offer.code)}">${icon("i-copy")}Copy</button></div>`
      : "") +
    memberPromo("store") +
    `<div class="sp-toolbar" data-sp-keep>` +
    `<label class="sp-search">${icon("i-search")}<input type="search" id="spQ" placeholder="Search courses, exams, speeds…" value="${esc(f.q)}" autocomplete="off"></label>` +
    `<label class="sp-sort">${icon("i-filter")}<select id="spSort" aria-label="Sort">` +
    [["featured", "Featured"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["off", "Biggest discount"], ["new", "Newest"]]
      .map(([v, l]) => `<option value="${v}"${f.sort === v ? " selected" : ""}>${l}</option>`)
      .join("") +
    `</select></label></div>` +
    (cats.length > 1
      ? `<div class="sp-chips" role="tablist">${["all", ...cats]
          .map((c) => `<button type="button" class="sp-fchip${f.cat === c ? " is-on" : ""}" data-cat="${esc(c)}">${esc(c === "all" ? "All courses" : c)}</button>`)
          .join("")}</div>`
      : "") +
    `<div id="spStoreGrid"></div>`;
  return {
    title: "Course store",
    crumb: "Learn",
    html,
    mount(root) {
      const promo = $(".sp-mpromo", root);
      if (promo) bindAdd(promo);
      const paint = () => {
        const grid = $("#spStoreGrid", root);
        if (!S.coursesReady) {
          grid.innerHTML = skeletonGrid(6);
          return;
        }
        const q = f.q.trim().toLowerCase();
        let list = S.courses.filter(
          (c) =>
            (f.cat === "all" || c.category === f.cat) &&
            (!q || [c.title, c.subtitle, c.category, c.mode, c.language, c.description, ...(c.features || [])].join(" ").toLowerCase().includes(q))
        );
        if (f.sort === "price-asc") list = list.slice().sort((a, b) => a.price - b.price);
        else if (f.sort === "price-desc") list = list.slice().sort((a, b) => b.price - a.price);
        else if (f.sort === "off") list = list.slice().sort((a, b) => offPercent(b.price, b.mrp) - offPercent(a.price, a.mrp));
        else if (f.sort === "new") list = list.slice().sort((a, b) => b.createdAt - a.createdAt);
        grid.innerHTML = !S.courses.length
          ? empty("i-book", "Courses are on their way", "The academy is setting up the online store. Meanwhile, book a free demo or call us to enrol.", `<a class="p-btn p-btn--sm" href="contact.html">${icon("i-phone")}<span>Talk to the academy</span></a>`)
          : list.length
          ? `<p class="sp-count-line">${list.length} course${list.length === 1 ? "" : "s"}</p><div class="sp-grid">${list.map(courseCard).join("")}</div>`
          : empty("i-search", "No matches", "Try a different word or clear the filters.", `<button class="p-btn p-btn--ghost p-btn--sm" type="button" id="spClear">${icon("i-refresh")}<span>Clear filters</span></button>`);
        bindAdd(grid);
        hydrateCovers(grid);
        const clr = $("#spClear", grid);
        if (clr)
          clr.addEventListener("click", () => {
            f.q = "";
            f.cat = "all";
            render({ quiet: true });
          });
      };
      paint();
      const q = $("#spQ", root);
      q.addEventListener("input", () => {
        f.q = q.value;
        paint();
      });
      $("#spSort", root).addEventListener("change", (e) => {
        f.sort = e.target.value;
        paint();
      });
      $$("[data-cat]", root).forEach((b) =>
        b.addEventListener("click", () => {
          f.cat = b.dataset.cat;
          $$("[data-cat]", root).forEach((x) => x.classList.toggle("is-on", x === b));
          paint();
        })
      );
      $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
    }
  };
}

function offersFor(c) {
  return S.offers.filter((o) => {
    const ids = couponScopeIds(o);
    return !ids || ids.includes(c.id);
  });
}

function vCourse(id) {
  if (!S.coursesReady) return { title: "Course", html: skeletonGrid(1) };
  const c = courseById(id);
  if (!c) {
    return {
      title: "Course not found",
      html: empty("i-search", "This course isn’t available", "It may have been unpublished. Browse the store for current courses.", `<a class="p-btn p-btn--sm" href="#store">${icon("i-arr")}<span>Back to store</span></a>`)
    };
  }
  const a = access(c.id);
  const off = offPercent(c.price, c.mrp);
  const offers = offersFor(c);
  const desc = String(c.description || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const buyBox =
    `<aside class="sp-buy">` +
    `<div class="sp-buy-card">` +
    (a && a.active
      ? `<div class="sp-buy-owned">${icon("i-check")}<div><b>You’re enrolled</b><span>${a.until ? `Access till ${formatDate(a.until)} · ${a.daysLeft} days left` : "Lifetime access"}</span></div></div>` +
        `<a class="p-btn p-btn--lime p-btn--block" href="#learn/${esc(c.id)}">${icon("i-play")}<span>Continue learning</span></a>` +
        (a.until ? `<button class="p-btn p-btn--ghost p-btn--block" type="button" data-renew="${esc(c.id)}">${icon("i-refresh")}<span>Extend validity</span></button>` : "")
      : priceHTML(c, true) +
        (memberPriceFor(c) != null
          ? `<p class="sp-buy-save">${icon("i-crown")}You save ${money(Math.max(c.mrp, c.price) - memberPriceFor(c))} as a ${esc(myPlan().title)} member</p>`
          : off
          ? `<p class="sp-buy-save">You save ${money(c.mrp - c.price)} on MRP</p>`
          : "") +
        `<ul class="sp-buy-facts"><li>${icon("i-clock")}${esc(validityLabel(c.validityDays))}</li><li>${icon("i-headphones")}${esc(c.mode)} · ${esc(c.language)}</li><li>${icon("i-receipt")}Instant receipt (PNG)</li></ul>` +
        (S.cart[c.id]
          ? `<a class="p-btn p-btn--lime p-btn--block" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
          : `<button class="p-btn p-btn--lime p-btn--block" type="button" data-buy="${esc(c.id)}">${icon("i-bolt")}<span>Buy now</span></button>` +
            `<button class="p-btn p-btn--ghost p-btn--block" type="button" data-add="${esc(c.id)}">${icon("i-cart")}<span>Add to cart</span></button>`)) +
    (offers.length && !(a && a.active)
      ? `<div class="sp-buy-offers"><span class="p-label">Offers for this course</span>${offers
          .map((o) => offerTile(o, "copy"))
          .join("")}</div>`
      : "") +
    `<p class="sp-buy-trust">${icon("i-shield")}Secure payment · Prices include all taxes</p>` +
    `</div></aside>`;

  const html =
    `<a class="sp-back" href="#store">${icon("i-chev-l")}All courses</a>` +
    `<div class="sp-detail">` +
    `<div class="sp-detail-main">` +
    `<div class="sp-detail-cover">${cover(c, "lg")}</div>` +
    `<div class="sp-detail-head"><div class="sp-tags"><span class="sp-tag">${esc(c.category)}</span>${c.badge ? `<span class="sp-tag sp-tag--lime">${esc(c.badge)}</span>` : ""}${off ? `<span class="sp-tag sp-tag--ok">${off}% off</span>` : ""}</div>` +
    `<h2>${esc(c.title)}</h2>${c.subtitle ? `<p class="sp-detail-sub">${esc(c.subtitle)}</p>` : ""}</div>` +
    `<div class="sp-facts">` +
    fact("i-clock", "Validity", validityLabel(c.validityDays).replace(" access", "")) +
    fact("i-headphones", "Mode", c.mode) +
    fact("i-keyboard", "Language", c.language) +
    fact("i-file", c.lessons ? "Lessons" : "Category", c.lessons ? String(c.lessons) : c.category) +
    `</div>` +
    (c.features.length
      ? `<section class="sp-panel"><span class="sp-k">What you get</span><h3>Inside this course</h3><ul class="sp-checks">${c.features.map((x) => `<li>${icon("i-check")}<span>${esc(x)}</span></li>`).join("")}</ul></section>`
      : "") +
    ccCurriculum(c) +
    (desc ? `<section class="sp-panel sp-prose"><span class="sp-k">About</span><h3>Course overview</h3>${desc}</section>` : "") +
    `<section class="sp-panel sp-howto"><span class="sp-k">How it works</span><h3>Enrol in three steps</h3><ol>` +
    `<li><b>Add to cart</b><span>Apply a coupon code if you have one.</span></li>` +
    `<li><b>Pay securely</b><span>Card, UPI or netbanking — receipt is instant.</span></li>` +
    `<li><b>Start learning</b><span>Lectures, notes and class links unlock under My courses.</span></li></ol></section>` +
    `</div>` +
    buyBox +
    `</div>`;
  return {
    title: c.title,
    crumb: "Course store",
    html,
    mount(root) {
      bindAdd(root);
      $$("[data-buy]", root).forEach((b) => b.addEventListener("click", () => addToCart(b.dataset.buy, b, true)));
      $$("[data-cc-buy]", root).forEach((b) => b.addEventListener("click", () => addToCart(b.dataset.ccBuy, b, true)));
      $$("[data-renew]", root).forEach((b) =>
        b.addEventListener("click", () => {
          const next = { ...S.cart, [c.id]: Date.now() };
          S.cart = next;
          dbSet(`${PATH.carts}/${S.user.uid}/${c.id}`, next[c.id]).catch((err) => toast(friendlyError(err), "err"));
          go("#cart");
        })
      );
      $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
    }
  };
}

function fact(ic, k, v) {
  return `<div class="sp-fact">${icon(ic)}<span>${esc(k)}</span><b>${esc(v)}</b></div>`;
}

function vCart() {
  const items = cartItems();
  /* drop stale entries (course deleted / unpublished) */
  if (catalogReady()) {
    cartIds()
      .filter((id) => {
        const it = itemById(id);
        return !it || (isPlanItem(it) && !it.buyable);
      })
      .forEach((id) => dbSet(`${PATH.carts}/${S.user.uid}/${id}`, null).catch(() => {}));
  }
  if (!items.length) {
    return {
      title: "Cart",
      crumb: "Purchases",
      html: empty("i-cart", "Your cart is empty", "Add courses or a membership plan — you can apply a coupon at checkout.", `<div class="sp-empty-acts"><a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse courses</span></a><a class="p-btn p-btn--ghost p-btn--sm" href="#membership">${icon("i-crown")}<span>Membership plans</span></a></div>`)
    };
  }
  let priced = cartPricing(items);
  if (S.coupon && priced.check && !priced.check.ok) {
    /* cart (or membership) changed so the coupon no longer applies */
    const why = priced.check.reason;
    setTimeout(() => toast(why + " Coupon removed.", "err"), 0);
    S.coupon = null;
    priced = cartPricing(items);
  }
  const { p, applied, plan: perk } = priced;
  const offers = S.offers
    .filter((o) => {
      const ids = couponScopeIds(o);
      return !ids || items.some((c) => ids.includes(c.id));
    })
    .sort((a, b) => Number(offerLocked(a)) - Number(offerLocked(b)));
  const rw = S.rewards;
  const bal = coinBalance();
  /* membership upsell: what the best plan would save on this cart */
  const courseItems = items.filter((c) => !isPlanItem(c));
  let upsell = null;
  if (!perk && courseItems.length) {
    S.plans
      .filter((pl) => pl.buyable)
      .forEach((pl) => {
        const save = memberPrices(courseItems, pl).memberDiscount;
        if (save > 0 && (!upsell || save > upsell.save)) upsell = { plan: pl, save };
      });
  }
  const linePrice = (c) => {
    const lp = p.prices[c.id] != null ? p.prices[c.id] : c.price;
    if (isPlanItem(c) || lp >= c.price) return priceHTML(c);
    return `<div class="sp-price is-member"><b>${money(lp)}</b><s>${money(Math.max(c.mrp, c.price))}</s><em class="sp-mtag">${icon("i-crown")}Member</em></div>`;
  };
  const phoneOk = /\d{10}/.test(String(S.profile.phone || "").replace(/\D/g, ""));

  const html =
    `<div class="sp-cart">` +
    `<div class="sp-cart-main">` +
    `<section class="sp-panel sp-panel--flush"><div class="sp-cart-head"><h3>${esc(countLabel(items))} in cart</h3><a class="sp-link" href="#store">${icon("i-plus")}Add more</a></div>` +
    `<ul class="sp-lines">` +
    items
      .map((c) => {
        const disc = applied && applied.check.eligibleIds.includes(c.id);
        const plan = isPlanItem(c);
        const href = plan ? `#membership/${esc(c.planId)}` : `#course/${esc(c.id)}`;
        const note = plan ? (holdsPlan(c) ? ` · <em>extension</em>` : memberActive() ? ` · <em>replaces current plan</em>` : "") : owns(c.id) ? ` · <em>renewal</em>` : "";
        return (
          `<li class="sp-line${plan ? " is-plan" : ""}">` +
          `<a class="sp-line-cover" href="${href}">${cover(c, "xs")}</a>` +
          `<div class="sp-line-body"><a href="${href}" class="sp-line-title">${plan ? `<span class="sp-line-kind">${icon("i-crown")}Membership</span>` : ""}${esc(c.title)}</a>` +
          `<span class="sp-line-meta">${esc(validityLabel(c.validityDays))}${plan ? "" : ` · ${esc(c.mode)}`}${note}</span>` +
          (disc ? `<span class="sp-line-coupon">${icon("i-tag")}Coupon applied</span>` : "") +
          `</div>` +
          `<div class="sp-line-price">${linePrice(c)}<button type="button" class="sp-line-rm" data-rm="${esc(c.id)}" aria-label="Remove ${esc(c.title)}">${icon("i-trash")}<span>Remove</span></button></div>` +
          `</li>`
        );
      })
      .join("") +
    `</ul></section>` +
    (upsell
      ? `<section class="sp-upsell">${planMini(upsell.plan, "xs")}<div><span class="sp-k sp-k--light">Member price</span><b>Save ${money(upsell.save)} more on this cart</b>` +
        `<small>${esc(upsell.plan.title)} members get ${upsell.plan.courseOff ? `extra ${upsell.plan.courseOff}% off every course` : "special course prices"} · ${money(upsell.plan.price)} / ${esc(upsell.plan.mode)}</small></div>` +
        `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-add="${esc(upsell.plan.id)}">${icon("i-crown")}<span>Add membership</span></button></section>`
      : "") +
    `<section class="sp-panel"><span class="sp-k">Billing details</span><h3>Receipt will be issued to</h3>` +
    `<form class="sp-bill" id="spBill" data-sp-keep novalidate><div class="p-row">` +
    `<label class="p-field"><span class="p-label">Full name</span><input class="p-input" name="name" autocomplete="name" value="${esc(S.profile.name || S.user.displayName || "")}" required></label>` +
    `<label class="p-field"><span class="p-label">Mobile number</span><input class="p-input" name="phone" type="tel" autocomplete="tel" placeholder="10-digit mobile" value="${esc(S.profile.phone || "")}" required></label>` +
    `</div><p class="sp-muted sp-small">Email · ${esc(S.user.email || "—")}</p></form></section>` +
    `</div>` +
    `<aside class="sp-cart-side">` +
    `<section class="sp-panel">` +
    `<span class="sp-k">Coupon</span>` +
    (applied
      ? `<div class="sp-applied${S.coupon.coupon && S.coupon.coupon.members ? " is-member" : ""}">${icon(S.coupon.coupon && S.coupon.coupon.members ? "i-crown" : "i-tag")}<div><b>${esc(S.coupon.code)}</b><span>${esc(couponLabel(S.coupon.coupon))}${S.coupon.coupon && S.coupon.coupon.members ? " · members" : ""} · saving ${money(p.couponDiscount)}</span></div><button type="button" class="sp-icon-btn" id="spCouponRm" aria-label="Remove coupon">${icon("i-x")}</button></div>`
      : `<form class="sp-coupon" id="spCoupon" data-sp-keep novalidate><input class="p-input" name="code" placeholder="Enter coupon code" autocomplete="off" autocapitalize="characters" maxlength="24"><button class="p-btn p-btn--sm" type="submit"><span>Apply</span></button></form>` +
        (offers.length
          ? `<div class="sp-offers">${offers
              .slice(0, 4)
              .map((o) => offerTile(o, "apply"))
              .join("")}</div>`
          : "")) +
    `</section>` +
    (rw.enabled && bal > 0
      ? `<section class="sp-panel sp-coins${S.useCoins && p.coins ? " is-on" : ""}">` +
        `<label class="sp-coins-row"><span class="sp-coins-ic">${icon("i-coin")}</span>` +
        `<span class="sp-coins-txt"><b>${p.coinsMax ? `Use ${esc(coinsLabel(p.coinsMax))}` : "E-coins"}</b>` +
        `<small>${p.coinsMax ? `Save ${money(p.coinsMax)} · balance ${esc(coinsLabel(bal))}` : `Balance ${esc(coinsLabel(bal))} · can’t be used on this order`}</small></span>` +
        `<input type="checkbox" class="sp-switch" id="spUseCoins"${S.useCoins && p.coinsMax ? " checked" : ""}${p.coinsMax ? "" : " disabled"} aria-label="Use E-coins"></label>` +
        `<p class="sp-coins-note">1 E-coin = ₹1 · up to ${rw.maxRedeemPct}% of an order</p></section>`
      : rw.enabled
      ? `<a class="sp-coins-promo" href="#rewards">${icon("i-coin")}<span><b>Refer friends, earn E-coins</b><small>Get ${esc(coinsLabel(rw.referrerCoins))} for every friend who joins</small></span>${icon("i-arr")}</a>`
      : "") +
    `<section class="sp-panel sp-summary"><span class="sp-k">Order summary</span>` +
    `<dl>` +
    `<div><dt>MRP total</dt><dd>${money(p.mrpTotal)}</dd></div>` +
    (p.courseSavings ? `<div class="is-save"><dt>Discount on MRP</dt><dd>− ${money(p.courseSavings)}</dd></div>` : "") +
    (p.memberDiscount ? `<div class="is-save is-member"><dt>${icon("i-crown")}Member price${perk ? ` (${esc(perk.title)})` : ""}</dt><dd>− ${money(p.memberDiscount)}</dd></div>` : "") +
    (p.couponDiscount ? `<div class="is-save"><dt>Coupon (${esc(S.coupon.code)})</dt><dd>− ${money(p.couponDiscount)}</dd></div>` : "") +
    (p.coins ? `<div class="is-save is-coins"><dt>${icon("i-coin")}E-coins</dt><dd>− ${money(p.coins)}</dd></div>` : "") +
    `<div class="is-total"><dt>To pay</dt><dd>${money(p.total)}</dd></div>` +
    `</dl>` +
    (p.savings ? `<p class="sp-savebar">${icon("i-gift")}You’re saving ${money(p.savings)} on this order</p>` : "") +
    `<button class="p-btn p-btn--lime p-btn--block sp-paybtn" type="button" id="spCheckout">${icon("i-shield")}<span>${p.total ? `Proceed to pay ${money(p.total)}` : "Get it free"}</span></button>` +
    `<p class="sp-pay-note">${icon("i-lock")}Inclusive of all taxes · Receipt generated instantly</p>` +
    `</section></aside></div>` +
    `<div class="sp-mpay"><div><span>To pay</span><b>${money(p.total)}</b>${p.savings ? `<small>Saving ${money(p.savings)}</small>` : ""}</div>` +
    `<button class="p-btn p-btn--lime" type="button" id="spMPay">${icon("i-shield")}<span>${p.total ? "Pay now" : "Get it free"}</span></button></div>`;

  return {
    title: "Cart",
    crumb: "Purchases",
    html,
    mount(root) {
      $$("[data-rm]", root).forEach((b) => b.addEventListener("click", () => removeFromCart(b.dataset.rm)));
      const cf = $("#spCoupon", root);
      if (cf)
        cf.addEventListener("submit", (e) => {
          e.preventDefault();
          applyCoupon(cf.code.value, cf.querySelector("button"));
        });
      $$("[data-apply]", root).forEach((b) => b.addEventListener("click", () => applyCoupon(b.dataset.apply, b)));
      const uc = $("#spUseCoins", root);
      if (uc)
        uc.addEventListener("change", () => {
          S.useCoins = uc.checked;
          render({ quiet: true });
        });
      const up = $(".sp-upsell", root);
      if (up) bindAdd(up);
      const rm = $("#spCouponRm", root);
      if (rm)
        rm.addEventListener("click", () => {
          S.coupon = null;
          render({ quiet: true });
          toast("Coupon removed");
        });
      $("#spCheckout", root).addEventListener("click", async (e) => {
        const f = $("#spBill", root);
        const name = String(f.name.value || "").trim();
        const phone = String(f.phone.value || "").trim();
        if (name.length < 2) {
          f.name.focus();
          toast("Enter your full name for the receipt.", "err");
          return;
        }
        if (!/^\+?[\d\s-]{10,16}$/.test(phone) || phone.replace(/\D/g, "").length < 10) {
          f.phone.focus();
          toast("Enter a valid 10-digit mobile number.", "err");
          return;
        }
        if (name !== S.profile.name || phone !== S.profile.phone) {
          await busy(e.currentTarget, "Saving", async () => {
            S.profile.name = name;
            S.profile.phone = phone;
            await dbUpdate(`users/${S.user.uid}`, { name, phone, updatedAt: Date.now() }).catch(() => {});
            paintUser();
          });
        }
        openCheckout();
      });
      const mp = $("#spMPay", root);
      if (mp) mp.addEventListener("click", () => $("#spCheckout", root).click());
      if (!phoneOk) {
        /* nudge, without stealing focus */
        const ph = $('#spBill input[name="phone"]', root);
        if (ph) ph.classList.add("is-need");
      }
    }
  };
}

function orderItems(o) {
  const items = o.items || {};
  return Array.isArray(items) ? items.filter(Boolean) : Object.keys(items).map((id) => ({ id, ...items[id] }));
}

function orderSaveNote(o) {
  const b = orderBreakdown(o);
  const bits = [];
  if (b.member) bits.push(`Member −${money(b.member)}`);
  if (b.coupon) bits.push(`${o.coupon && o.coupon.code ? `Coupon ${esc(o.coupon.code)}` : "Discount"} −${money(b.coupon)}`);
  if (b.coins) bits.push(`E-coins −${money(b.coins)}`);
  return bits.length ? `<small>${bits.join(" · ")}</small>` : "";
}

function statusPill(o) {
  const s = statusOf(o.status);
  return `<span class="sp-status sp-status--${s.tone}">${esc(s.label)}</span>`;
}

function vOrders() {
  if (!S.ordersReady) return { title: "Orders & receipts", crumb: "Purchases", html: skeletonGrid(2) };
  if (!S.orders.length) {
    return {
      title: "Orders & receipts",
      crumb: "Purchases",
      html: empty("i-receipt", "No orders yet", "When you buy a course, your order and a downloadable receipt appear here.", `<a class="p-btn p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse courses</span></a>`)
    };
  }
  const html =
    `<div class="sp-orders">` +
    S.orders
      .map((o) => {
        const items = orderItems(o);
        const canReceipt = o.status === "paid" || o.status === "refunded";
        return (
          `<article class="sp-order">` +
          `<div class="sp-order-top"><div><span class="sp-k">${esc(o.orderNo)}</span><b>${esc(items.map((i) => i.title).join(", ") || "Order")}</b>` +
          `<small>${esc(formatDate(o.createdAt, true))} · ${esc(methodLabel(o.method))}</small></div>${statusPill(o)}</div>` +
          `<div class="sp-order-foot"><div class="sp-order-amt"><b>${money(o.total)}</b>${orderSaveNote(o)}</div>` +
          `<div class="sp-order-acts">` +
          (canReceipt
            ? `<a class="p-btn p-btn--ghost p-btn--sm" href="#receipt/${esc(o.id)}">${icon("i-eye")}<span>View</span></a><button class="p-btn p-btn--sm" type="button" data-dl="${esc(o.id)}">${icon("i-download")}<span>Receipt</span></button>`
            : o.status === "pending"
            ? `<span class="sp-muted sp-small">${icon("i-clock")}Verifying UTR ${esc(o.utr || "")}</span>`
            : o.rejectReason
            ? `<span class="sp-muted sp-small">${esc(o.rejectReason)}</span>`
            : "") +
          `</div></div></article>`
        );
      })
      .join("") +
    `</div>`;
  return {
    title: "Orders & receipts",
    crumb: "Purchases",
    html,
    mount(root) {
      $$("[data-dl]", root).forEach((b) =>
        b.addEventListener("click", () => {
          const o = S.orders.find((x) => x.id === b.dataset.dl);
          if (o) busy(b, "Preparing", () => downloadReceipt({ ...o, items: orderItems(o) }, receiptSettings()).then(() => toast("Receipt downloaded")));
        })
      );
    }
  };
}

function vSuccess(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) {
    if (!S.ordersReady) return { title: "Order", html: skeletonGrid(1) };
    return { title: "Order", html: empty("i-receipt", "Order not found", "Check Orders & receipts for your purchases.", `<a class="p-btn p-btn--sm" href="#orders">${icon("i-arr")}<span>Open orders</span></a>`) };
  }
  const items = orderItems(o);
  const paid = o.status === "paid";
  const planIt = items.find(isPlanItem);
  const onlyPlan = planIt && items.length === 1;
  const mem = planIt && S.member && S.member.orderId === o.id ? S.member : null;
  const head = paid ? (onlyPlan ? `Welcome to ${planIt.title}!` : "You’re enrolled!") : "We’re verifying your payment";
  const lead = paid
    ? onlyPlan
      ? `Your membership is active${mem && num(mem.endAt) ? ` till <b>${esc(formatDate(mem.endAt))}</b>` : ""}. Your premium receipt is ready to download.`
      : planIt
      ? "Your courses are unlocked and your membership is active. Your premium receipt is ready to download."
      : "Your course is unlocked under My courses. Your premium receipt is ready to download."
    : `The academy will match UTR <b>${esc(o.utr || "")}</b> with the payment and ${onlyPlan ? "activate your membership" : "unlock your purchase"} — usually within a few hours.`;
  const html =
    `<section class="sp-success${paid ? "" : " is-pending"}">` +
    `<div class="sp-success-burst" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * (360 / 14)}deg;--d:${(i % 4) * 0.05}s"></i>`).join("")}</div>` +
    `<span class="sp-success-ic">${icon(paid ? "i-check" : "i-clock")}</span>` +
    `<span class="sp-k">${paid ? "Payment successful" : "Payment submitted"}</span>` +
    `<h2>${esc(head)}</h2>` +
    `<p>${lead}</p>` +
    `<div class="sp-success-card"><div><span>Order</span><b>${esc(o.orderNo)}</b></div><div><span>Amount</span><b>${money(o.total)}</b></div><div><span>${planIt ? "Items" : "Courses"}</span><b>${items.length}</b></div>${num(o.discount) || num(o.coins) ? `<div><span>Saved</span><b>${money(Math.max(0, num(o.mrpTotal) - num(o.total)))}</b></div>` : ""}</div>` +
    `<div class="sp-success-cta">` +
    (paid
      ? `<button class="p-btn p-btn--lime" type="button" id="spDl">${icon("i-download")}<span>Download receipt (PNG)</span></button>` +
        (onlyPlan ? `<a class="p-btn" href="#membership">${icon("i-crown")}<span>View membership</span></a>` : `<a class="p-btn" href="#my-courses">${icon("i-play")}<span>Start learning</span></a>`)
      : `<a class="p-btn p-btn--lime" href="#orders">${icon("i-receipt")}<span>Track order</span></a><a class="p-btn p-btn--ghost" href="#store">${icon("i-bolt")}<span>Keep browsing</span></a>`) +
    `</div></section>`;
  return {
    title: paid ? "Order confirmed" : "Order submitted",
    crumb: "Orders",
    html,
    mount(root) {
      const dl = $("#spDl", root);
      if (dl) dl.addEventListener("click", () => busy(dl, "Preparing", () => downloadReceipt({ ...o, items }, receiptSettings()).then(() => toast("Receipt downloaded"))));
    }
  };
}

function vReceipt(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return { title: "Receipt", html: S.ordersReady ? empty("i-receipt", "Receipt not found", "It may belong to another account.") : skeletonGrid(1) };
  const items = orderItems(o);
  const html =
    `<a class="sp-back" href="#orders">${icon("i-chev-l")}All orders</a>` +
    `<div class="sp-receipt-bar"><div><span class="sp-k">${esc(o.orderNo)}</span><b>${money(o.total)} · ${esc(formatDate(o.paidAt || o.createdAt))}</b></div>` +
    `<button class="p-btn p-btn--lime p-btn--sm" type="button" id="spDl">${icon("i-download")}<span>Download PNG</span></button></div>` +
    `<div class="sp-receipt-frame" id="spRcpt"><div class="sp-receipt-loading"><span class="sp-spin sp-spin--lg"></span><span>Rendering receipt…</span></div></div>`;
  return {
    title: "Receipt",
    crumb: "Orders",
    html,
    mount(root) {
      const order = { ...o, items };
      receiptDataURL(order, receiptSettings())
        .then((url) => {
          const box = $("#spRcpt", root);
          if (box) box.innerHTML = `<img src="${url}" alt="Payment receipt ${esc(o.orderNo)}">`;
        })
        .catch((err) => {
          const box = $("#spRcpt", root);
          if (box) box.innerHTML = `<p class="sp-muted">Couldn’t render the receipt: ${esc(err.message)}</p>`;
        });
      const dl = $("#spDl", root);
      dl.addEventListener("click", () => busy(dl, "Preparing", () => downloadReceipt(order, receiptSettings()).then(() => toast("Receipt downloaded"))));
    }
  };
}

/* ============================================================
   classroom — course content (folders + link items)
   #learn/<courseId>            folder browser (course root)
   #learn/<courseId>/f/<folder> a folder
   #learn/<courseId>/i/<item>   in-app viewer
   Enrolled students (and admins) read courseContent/<id>; everyone
   else sees the public outline with locks + free previews.
   ============================================================ */
const CCUI = { cid: "", q: "", type: "all" };

function ensureContent(cid) {
  const cur = S.cc[cid];
  if (cur && (cur.ready || cur.loading)) return;
  S.cc[cid] = { loading: true, ready: false, items: {} };
  dbGet(`${CC_PATH.content}/${cid}`)
    .then((snap) => {
      S.cc[cid] = { ready: true, items: snapVal(snap) || {} };
      changed("cc");
      dbWatch(`${CC_PATH.content}/${cid}`, (v) => {
        S.cc[cid] = { ready: true, items: v || {} };
        changed("cc");
      });
    })
    .catch((err) => {
      S.cc[cid] = { ready: true, items: {}, error: friendlyError(err) };
      changed("cc");
    });
}

function ensureOutline(cid) {
  const cur = S.ccOut[cid];
  if (cur && (cur.ready || cur.loading)) return;
  S.ccOut[cid] = { loading: true, ready: false, items: {}, previews: {} };
  Promise.all([dbGet(`${CC_PATH.outline}/${cid}`), dbGet(`${CC_PATH.preview}/${cid}`).catch(() => null)])
    .then(([o, p]) => {
      S.ccOut[cid] = { ready: true, items: snapVal(o) || {}, previews: snapVal(p) || {} };
      changed("cc");
    })
    .catch(() => {
      S.ccOut[cid] = { ready: true, items: {}, previews: {} };
      changed("cc");
    });
}

/* everything a classroom view needs for one course */
function classroom(cid) {
  const a = access(cid);
  const enrolled = Boolean(a && a.active);
  const full = enrolled || S.admin;
  if (full) ensureContent(cid);
  else ensureOutline(cid);
  const src = full ? S.cc[cid] : S.ccOut[cid];
  const ready = Boolean(src && src.ready);
  const list = ready ? visibleList(itemsList(src.items)) : [];
  const p = S.progress[cid] || {};
  return { a, enrolled, full, ready, list, previews: full ? {} : (src && src.previews) || {}, error: src && src.error, done: p.done || {}, last: p.last || null };
}
const ccUrl = (m, it) => (m.full ? safeLink(it.url) : safeLink(m.previews[it.id]));

/* leaves in reading order: depth-first, folders before loose items */
function ccFlat(list, parent = "") {
  const out = [];
  childrenOf(list, parent).forEach((i) => {
    if (i.type === "folder") out.push(...ccFlat(list, i.id));
    else out.push(i);
  });
  return out;
}
function ccStats(m, scope) {
  const leaves = scope ? leavesUnder(m.list, scope) : m.list.filter((i) => i.type !== "folder");
  const done = leaves.filter((i) => m.done[i.id]).length;
  return { total: leaves.length, done, pct: leaves.length ? Math.round((done / leaves.length) * 100) : 0 };
}
function ccMeta(m, it) {
  const bits = [ccType(it.type).label];
  if (it.type === "live" && it.liveAt) bits.push(liveLabel(it.liveAt));
  if (it.mins) bits.push(minsLabel(it.mins));
  if (m.full && it.url) bits.push(sourceLabel(it.url));
  return bits.filter(Boolean).join(" · ");
}
const ccHref = (cid, kind, id) => `#learn/${encodeURIComponent(cid)}${kind ? `/${kind}/${encodeURIComponent(id)}` : ""}`;

function ccRing(pct, size = 64) {
  const R = 26;
  const L = +(2 * Math.PI * R).toFixed(2);
  return `<span class="cc-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 60 60" aria-hidden="true"><circle class="cc-ring-bg" cx="30" cy="30" r="${R}"/><circle class="cc-ring-fg" cx="30" cy="30" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${(L * (1 - pct / 100)).toFixed(2)}"/></svg><b>${pct}%</b></span>`;
}

function ccItemRow(c, m, it, { path, compact, current } = {}) {
  const url = ccUrl(m, it);
  const locked = !url;
  const done = Boolean(m.done[it.id]);
  const t = ccType(it.type);
  const meta = (path ? path + " · " : "") + ccMeta(m, it);
  const end = locked
    ? `<span class="cc-end cc-end--lock" title="Enrol to unlock">${CC_ICONS.lock}</span>`
    : !m.full && it.free
    ? `<em class="cc-free">Free</em>`
    : `<span class="cc-end${done ? " is-done" : ""}" title="${done ? "Completed" : "Not done yet"}">${done ? CC_ICONS.done : CC_ICONS.todo}</span>`;
  return (
    `<a class="cc-item${compact ? " cc-item--compact" : ""}${done ? " is-done" : ""}${locked ? " is-locked" : ""}${current ? " is-current" : ""}" href="${ccHref(c.id, "i", it.id)}" data-cc-item="${esc(it.id)}"${current ? ' aria-current="true"' : ""}>` +
    `<span class="cc-tile cc-tone--${t.tone}">${ccIcon(it.type)}</span>` +
    `<span class="cc-item-body"><b>${esc(it.title)}</b><small>${esc(meta)}${isNew(it) ? ` <i class="cc-new">New</i>` : ""}</small></span>` +
    end +
    `</a>`
  );
}

function ccFolderCard(c, m, f) {
  const leaves = leavesUnder(m.list, f.id);
  const subs = descendantsOf(m.list, f.id).filter((d) => d.type === "folder").length;
  const st = ccStats(m, f.id);
  const free = !m.full ? leaves.filter((i) => i.free && m.previews[i.id]).length : 0;
  return (
    `<a class="cc-folder" href="${ccHref(c.id, "f", f.id)}">` +
    `<span class="cc-tile cc-tone--folder">${CC_ICONS.folder}</span>` +
    `<span class="cc-folder-body"><b>${esc(f.title)}</b><small>${esc([subs ? `${subs} folder${subs === 1 ? "" : "s"}` : "", leaves.length ? countsLabel(leaves) : "Empty"].filter(Boolean).join(" · "))}</small></span>` +
    (m.full && st.total
      ? `<span class="cc-folder-prog"><span class="cc-bar"><i style="width:${st.pct}%"></i></span><em>${st.done}/${st.total}</em></span>`
      : !m.full
      ? free
        ? `<em class="cc-free">${free} free</em>`
        : `<span class="cc-end cc-end--lock">${CC_ICONS.lock}</span>`
      : "") +
    `<span class="cc-chev">${icon("i-chev-r")}</span>` +
    `</a>`
  );
}

function ccListHTML(c, m, folderId) {
  const q = CCUI.q.trim().toLowerCase();
  const scope = folderId ? descendantsOf(m.list, folderId) : m.list;
  if (q || CCUI.type !== "all") {
    const order = ccFlat(m.list);
    const hits = order.filter((i) => scope.includes(i) && (CCUI.type === "all" || i.type === CCUI.type) && (!q || String(i.title).toLowerCase().includes(q)));
    if (!hits.length) return `<div class="cc-empty">${CC_ICONS.web}<b>Nothing found</b><span>${q ? `No ${CCUI.type === "all" ? "content" : typeWord(CCUI.type, 2)} matches “${esc(CCUI.q.trim())}”.` : `No ${typeWord(CCUI.type, 2)} here yet.`}</span></div>`;
    return (
      `<p class="cc-list-k">${hits.length} ${hits.length === 1 ? "result" : "results"}</p><div class="cc-items">` +
      hits
        .map((i) => {
          const p = pathTo(m.list, i.id).slice(0, -1).map((x) => x.title);
          return ccItemRow(c, m, i, { path: p.length ? p.join(" › ") : "" });
        })
        .join("") +
      `</div>`
    );
  }
  const kids = childrenOf(m.list, folderId);
  const folders = kids.filter((i) => i.type === "folder");
  const items = kids.filter((i) => i.type !== "folder");
  if (!kids.length) return `<div class="cc-empty">${CC_ICONS.folder}<b>This folder is empty</b><span>The academy hasn’t added anything here yet.</span></div>`;
  return (
    (folders.length ? `<div class="cc-folders">${folders.map((f) => ccFolderCard(c, m, f)).join("")}</div>` : "") +
    (items.length ? `${folders.length ? `<p class="cc-list-k">Lessons &amp; files</p>` : ""}<div class="cc-items">${items.map((i) => ccItemRow(c, m, i)).join("")}</div>` : "")
  );
}

function ccChipsHTML(m, folderId) {
  const scope = (folderId ? descendantsOf(m.list, folderId) : m.list).filter((i) => i.type !== "folder");
  const counts = countByType(scope);
  const types = ["video", "pdf", "audio", "doc", "live", "web", "image", "file"].filter((t) => counts[t]);
  if (types.length < 2) return "";
  return (
    `<div class="cc-chips" role="tablist">` +
    [`<button type="button" class="cc-chip${CCUI.type === "all" ? " is-on" : ""}" data-cc-type="all">All <i>${scope.length}</i></button>`]
      .concat(types.map((t) => `<button type="button" class="cc-chip cc-tone--${ccType(t).tone}${CCUI.type === t ? " is-on" : ""}" data-cc-type="${t}">${ccIcon(t)}${esc(ccType(t).plural)} <i>${counts[t]}</i></button>`))
      .join("") +
    `</div>`
  );
}

function learnCourse(cid) {
  return courseById(cid) || (S.enroll[cid] ? coursesFrom({ [cid]: { title: S.enroll[cid].title || "Course", price: 0, validityDays: 0 } }, { all: true })[0] : null);
}

function vLearn(arg) {
  const [rawId, mode, sub] = String(arg || "").split("/");
  const cid = rawId || "";
  const c = learnCourse(cid);
  if (!c) {
    if (!S.coursesReady) return { title: "Course", crumb: "My courses", html: skeletonGrid(1) };
    return { title: "Course", html: empty("i-search", "This course isn’t available", "It may have been removed. Browse the store for current courses.", `<a class="p-btn p-btn--sm" href="#store">${icon("i-arr")}<span>Back to store</span></a>`) };
  }
  if (CCUI.cid !== cid) Object.assign(CCUI, { cid, q: "", type: "all" });
  const m = classroom(cid);
  if (mode === "i" && sub) return vViewer(c, m, sub);
  return vClassroom(c, m, mode === "f" ? sub || "" : "");
}

function vClassroom(c, m, folderId) {
  const a = m.a;
  const folder = folderId ? m.list.find((i) => i.id === folderId && i.type === "folder") : null;
  if (folderId && m.ready && !folder) {
    setTimeout(() => location.replace(ccHref(c.id)), 0);
    return { title: c.title, crumb: "My courses", html: "" };
  }
  const leaves = m.list.filter((i) => i.type !== "folder");
  const st = ccStats(m, folderId || "");
  const order = folderId ? ccFlat(m.list, folderId) : ccFlat(m.list);
  const last = m.last && order.find((i) => i.id === m.last.id);
  const next = m.full ? last || order.find((i) => !m.done[i.id]) || order[0] : order.find((i) => i.free && m.previews[i.id]);
  const counts = countByType(m.list);
  const statBits = [];
  if (counts.folder) statBits.push([CC_ICONS.folder, `${counts.folder} folder${counts.folder === 1 ? "" : "s"}`]);
  ["video", "pdf", "audio", "doc", "live", "web", "image", "file"].forEach((t) => counts[t] && statBits.push([ccIcon(t), `${counts[t]} ${typeWord(t, counts[t])}`]));
  const freeN = !m.full ? leaves.filter((i) => i.free && m.previews[i.id]).length : 0;

  const accessLine = m.enrolled
    ? a.until
      ? `Access till ${formatDate(a.until)} · ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left`
      : "Lifetime access"
    : a && !a.active
    ? `Your access ended on ${formatDate(a.until)}`
    : S.admin
    ? "Admin preview — students see this once enrolled"
    : `${validityLabel(c.validityDays)} · ${money(c.price)}`;

  const side = m.full
    ? `<div class="cc-hero-prog">${ccRing(st.pct)}<div><b>${st.done} of ${st.total} done</b><small>${st.total ? (st.done === st.total ? (folder ? "Folder completed — great work!" : "Course completed — great work!") : folder ? "in this folder" : "Keep the streak going") : "Content coming soon"}</small></div></div>` +
      (next ? `<a class="p-btn p-btn--lime p-btn--sm" href="${ccHref(c.id, "i", next.id)}">${icon("i-play")}<span>${last ? "Continue" : "Start learning"}</span></a>` : "")
    : (a && !a.active
        ? `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-add="${esc(c.id)}">${icon("i-refresh")}<span>Renew course</span></button>`
        : S.cart[c.id]
        ? `<a class="p-btn p-btn--lime p-btn--sm" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
        : courseById(c.id)
        ? `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-cc-buy="${esc(c.id)}">${icon("i-bolt")}<span>Enrol · ${money(c.price)}</span></button>`
        : "") + (next ? `<a class="p-btn p-btn--ghost sp-btn-onDark p-btn--sm" href="${ccHref(c.id, "i", next.id)}">${icon("i-play")}<span>Watch free preview</span></a>` : "");

  const crumbs = pathTo(m.list, folderId);
  const html =
    `<a class="sp-back" href="${folder ? ccHref(c.id, folder.parent ? "f" : "", folder.parent || "") : m.enrolled ? "#my-courses" : `#course/${esc(c.id)}`}">${icon("i-chev-l")}${folder ? esc(folder.parent ? (m.list.find((i) => i.id === folder.parent) || {}).title || "Back" : "All content") : m.enrolled ? "My courses" : "Course details"}</a>` +
    `<section class="cc-hero${folder ? " cc-hero--folder" : ""}">` +
    `<div class="cc-hero-cover">${cover(c, "sm")}</div>` +
    `<div class="cc-hero-body"><span class="sp-k sp-k--light">${m.enrolled ? "Enrolled" : a && !a.active ? "Expired" : S.admin ? "Admin preview" : "Course preview"}</span>` +
    `<h2>${esc(folder ? folder.title : c.title)}</h2>` +
    `<p>${folder ? esc(folder.desc || `In ${c.title}`) : esc(accessLine)}</p>` +
    (statBits.length && !folder ? `<div class="cc-hero-stats">${statBits.slice(0, 5).map(([ic, t]) => `<span>${ic}${esc(t)}</span>`).join("")}${freeN ? `<span class="is-free">${CC_ICONS.eye}${freeN} free preview${freeN === 1 ? "" : "s"}</span>` : ""}</div>` : "") +
    `</div>` +
    `<div class="cc-hero-side">${side}</div>` +
    `</section>` +
    (m.full && !folderId ? `<section class="cc-notice" id="ccNotice" hidden></section>` : "") +
    (!m.ready
      ? `<div class="cc-skel">${[0, 1, 2, 3].map(() => `<div class="sp-skel"></div>`).join("")}</div>`
      : m.error
      ? empty("i-info", "Couldn’t load the course content", m.error, `<button class="p-btn p-btn--sm" type="button" data-cc-retry>${icon("i-refresh")}<span>Try again</span></button>`)
      : !m.list.length
      ? empty("i-book", m.full ? "Your classroom is being set up" : "Course content is on its way", m.full ? "The academy is adding lectures, notes and files. Check back soon — new content appears here automatically." : "The syllabus will appear here once the academy publishes it.", "")
      : `<div class="cc-toolbar" data-sp-keep>` +
        `<nav class="cc-crumbs" aria-label="Folder path"><a href="${ccHref(c.id)}"${crumbs.length ? "" : ' aria-current="page"'}>${CC_ICONS.folder}<span>All content</span></a>${crumbs
          .map((f, i) => `<span class="cc-sep">›</span><a href="${ccHref(c.id, "f", f.id)}"${i === crumbs.length - 1 ? ' aria-current="page"' : ""}>${esc(f.title)}</a>`)
          .join("")}</nav>` +
        `<label class="cc-search">${icon("i-search")}<input type="search" id="ccQ" placeholder="Search ${folder ? "this folder" : "lectures, notes, files"}" value="${esc(CCUI.q)}" autocomplete="off"></label>` +
        `</div>` +
        `<div id="ccChips">${ccChipsHTML(m, folderId)}</div>` +
        `<div class="cc-list" id="ccList">${ccListHTML(c, m, folderId)}</div>`);

  return {
    title: folder ? folder.title : c.title,
    crumb: folder ? c.title : m.enrolled ? "My courses" : "Course store",
    html,
    mount(root) {
      bindAdd(root);
      $$("[data-cc-buy]", root).forEach((b) => b.addEventListener("click", () => addToCart(b.dataset.ccBuy, b, true)));
      const retry = $("[data-cc-retry]", root);
      if (retry)
        retry.addEventListener("click", () => {
          delete S.cc[c.id];
          render({ quiet: true });
        });
      const q = $("#ccQ", root);
      const repaint = () => {
        const list = $("#ccList", root);
        if (list) list.innerHTML = ccListHTML(c, classroom(c.id), folderId);
        const chips = $("#ccChips", root);
        if (chips) chips.innerHTML = ccChipsHTML(classroom(c.id), folderId);
      };
      if (q) q.addEventListener("input", () => {
        CCUI.q = q.value;
        repaint();
      });
      root.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-cc-type]");
        if (!chip) return;
        CCUI.type = chip.dataset.ccType;
        repaint();
      });
      const notice = $("#ccNotice", root);
      if (notice && (m.enrolled || S.admin))
        dbGet(`${PATH.courseAccess}/${c.id}`)
          .then((snap) => {
            const v = snapVal(snap) || {};
            const links = (Array.isArray(v.links) ? v.links : Object.values(v.links || {})).filter((l) => l && safeImageUrl(l.url));
            if (!v.message && !links.length) return;
            notice.hidden = false;
            notice.innerHTML =
              `<span class="cc-notice-ic">${icon("i-bolt")}</span><div class="cc-notice-body"><span class="sp-k">Notice board</span>` +
              (v.message ? `<p>${esc(v.message)}</p>` : "") +
              (links.length
                ? `<div class="cc-notice-links">${links
                    .map((l) => {
                      const url = safeImageUrl(l.url);
                      const t = detectType(url);
                      return `<a href="${esc(url)}" target="_blank" rel="noopener"><span class="cc-tile cc-tile--sm cc-tone--${ccType(t).tone}">${ccIcon(t)}</span><span>${esc(l.label || "Open link")}</span>${icon("i-arr-ur")}</a>`;
                    })
                    .join("")}</div>`
                : "") +
              `</div>`;
          })
          .catch(() => {});
    }
  };
}

function ccPlayer(c, m, it, url) {
  if (!url) {
    return (
      `<div class="cc-player cc-player--locked"><span class="cc-lock-ic">${CC_ICONS.lock}</span><b>Enrol to unlock this ${esc(typeWord(it.type, 1))}</b>` +
      `<p>Get every lecture, note and file in ${esc(c.title)}${c.validityDays ? ` for ${esc(validityLabel(c.validityDays).replace(" access", ""))}` : ""}.</p>` +
      (courseById(c.id) ? (S.cart[c.id] ? `<a class="p-btn p-btn--lime p-btn--sm" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>` : `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-cc-buy="${esc(c.id)}">${icon("i-bolt")}<span>Enrol · ${money(c.price)}</span></button>`) : "") +
      `</div>`
    );
  }
  const e = embedFor(url, it.type);
  const t = ccType(it.type);
  if (it.type === "live") {
    const start = num(it.liveAt);
    const endAt = start + Math.max(30, num(it.mins) || 90) * 60000;
    const now = Date.now();
    const state = !start ? "" : now < start - 15 * 60000 ? "soon" : now <= endAt ? "live" : "ended";
    if (e.mode !== "iframe" || state !== "ended")
      return (
        `<div class="cc-player cc-player--card cc-player--live"><span class="cc-tile cc-tile--lg cc-tone--live">${CC_ICONS.live}</span>` +
        `<span class="cc-live-state cc-live-state--${state || "open"}">${state === "live" ? "● Live now" : state === "soon" ? "Upcoming" : state === "ended" ? "Ended" : "Live class"}</span>` +
        `<b>${start ? esc(liveLabel(start)) : esc(it.title)}</b><p>${esc(sourceLabel(url))} · opens in a new tab</p>` +
        `<a class="p-btn p-btn--lime" href="${esc(url)}" target="_blank" rel="noopener" data-cc-open>${icon("i-live")}<span>${state === "ended" ? "Open link" : "Join live class"}</span></a></div>`
      );
  }
  if (e.mode === "iframe")
    return (
      `<div class="cc-player cc-player--${e.ratio === "16/9" ? "wide" : "doc"}"><iframe src="${esc(e.src)}" title="${esc(it.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"${
        e.web ? ' sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-downloads"' : ""
      }></iframe></div>`
    );
  if (e.mode === "video") return `<div class="cc-player cc-player--wide"><video src="${esc(e.src)}" controls playsinline preload="metadata" controlslist="nodownload" data-cc-media></video></div>`;
  if (e.mode === "audio")
    return `<div class="cc-player cc-player--audio"><span class="cc-tile cc-tile--lg cc-tone--audio">${CC_ICONS.audio}</span><div class="cc-audio-body"><b>${esc(it.title)}</b><small>${esc(ccMeta(m, it))}</small><audio src="${esc(e.src)}" controls preload="metadata" controlslist="nodownload" data-cc-media></audio></div></div>`;
  if (e.mode === "image") return `<div class="cc-player cc-player--img"><img src="${esc(e.src)}" alt="${esc(it.title)}"></div>`;
  return (
    `<div class="cc-player cc-player--card"><span class="cc-tile cc-tile--lg cc-tone--${t.tone}">${ccIcon(it.type)}</span><b>${esc(it.title)}</b>` +
    `<p>${esc(sourceLabel(url))} · opens in a new tab</p>` +
    `<a class="p-btn p-btn--lime" href="${esc(url)}" target="_blank" rel="noopener" data-cc-open>${CC_ICONS.ext}<span>${esc(t.open)} ${esc(t.label.toLowerCase())}</span></a></div>`
  );
}

function ccSideHTML(c, m, it) {
  const sibs = childrenOf(m.list, it.parent).filter((i) => i.type !== "folder");
  const parent = it.parent ? m.list.find((i) => i.id === it.parent) : null;
  const st = ccStats(m, it.parent || "");
  const doneHere = sibs.filter((i) => m.done[i.id]).length;
  return (
    `<div class="cc-side-head"><span class="sp-k">${parent ? "In this folder" : "Course content"}</span><b>${esc(parent ? parent.title : c.title)}</b>` +
    (m.full ? `<small>${doneHere} of ${sibs.length} done${parent ? ` · course ${st.pct}%` : ""}</small>` : `<small>${sibs.length} item${sibs.length === 1 ? "" : "s"}</small>`) +
    `</div><div class="cc-side-list">${sibs.map((i) => ccItemRow(c, m, i, { compact: true, current: i.id === it.id })).join("")}</div>` +
    `<a class="cc-side-all" href="${ccHref(c.id, parent ? "f" : "", parent ? parent.id : "")}">${CC_ICONS.folder}<span>${parent ? "Open folder" : "All content"}</span>${icon("i-chev-r")}</a>`
  );
}

function ccDoneBtn(m, it) {
  const done = Boolean(m.done[it.id]);
  return `<button class="p-btn p-btn--sm cc-done-btn${done ? " is-done" : ""}" type="button" data-cc-done>${done ? CC_ICONS.done : CC_ICONS.todo}<span>${done ? "Completed" : "Mark as complete"}</span></button>`;
}

function ccSetDone(cid, iid, on) {
  const p = (S.progress[cid] = { ...(S.progress[cid] || {}) });
  p.done = { ...(p.done || {}) };
  if (on) p.done[iid] = Date.now();
  else delete p.done[iid];
  changed("progress");
  dbSet(`${CC_PATH.progress}/${S.user.uid}/${cid}/done/${iid}`, on ? Date.now() : null).catch((err) => toast(friendlyError(err), "err"));
}

function vViewer(c, m, iid) {
  const base = { title: c.title, crumb: m.enrolled ? "My courses" : "Course store" };
  if (!m.ready) return { ...base, html: `<div class="cc-view"><div class="cc-view-main"><div class="cc-player cc-player--wide sp-skel"></div></div></div>` };
  const it = m.list.find((i) => i.id === iid);
  if (!it)
    return {
      ...base,
      html: empty("i-search", "This item isn’t available", "It may have been moved or removed by the academy.", `<a class="p-btn p-btn--sm" href="${ccHref(c.id)}">${CC_ICONS.folder}<span>All content</span></a>`)
    };
  if (it.type === "folder") {
    setTimeout(() => location.replace(ccHref(c.id, "f", it.id)), 0);
    return { ...base, html: "" };
  }
  const url = ccUrl(m, it);
  const order = ccFlat(m.list);
  const idx = order.findIndex((i) => i.id === it.id);
  const prev = idx > 0 ? order[idx - 1] : null;
  const nxt = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const parent = it.parent ? m.list.find((i) => i.id === it.parent) : null;
  const t = ccType(it.type);
  const e = url ? embedFor(url, it.type) : { mode: "" };
  const desc = String(it.desc || "").trim();
  const html =
    `<a class="sp-back" href="${ccHref(c.id, parent ? "f" : "", parent ? parent.id : "")}">${icon("i-chev-l")}${esc(parent ? parent.title : c.title)}</a>` +
    `<div class="cc-view">` +
    `<div class="cc-view-main">` +
    ccPlayer(c, m, it, url) +
    (e.web ? `<p class="cc-embed-note">${icon("i-info")}Page not loading? Some websites block being shown inside apps — <a href="${esc(url)}" target="_blank" rel="noopener">open it in a new tab</a>.</p>` : "") +
    (e.alt ? `<p class="cc-embed-note">${icon("i-info")}PDF not showing? <a href="${esc(e.alt)}" target="_blank" rel="noopener">Open the original file</a>.</p>` : "") +
    `<div class="cc-vhead">` +
    `<div class="cc-vtags"><span class="cc-vtag cc-tone--${t.tone}">${ccIcon(it.type)}${esc(t.label)}</span>${!m.full && it.free ? `<span class="cc-free">Free preview</span>` : ""}${isNew(it) ? `<span class="cc-new">New</span>` : ""}</div>` +
    `<h2>${esc(it.title)}</h2>` +
    `<p class="cc-vmeta">${esc([pathTo(m.list, it.id).slice(0, -1).map((x) => x.title).join(" › ") || c.title, it.mins ? minsLabel(it.mins) : "", it.createdAt ? "Added " + formatDate(num(it.createdAt)) : ""].filter(Boolean).join(" · "))}</p>` +
    `</div>` +
    `<div class="cc-vacts">` +
    (url ? `<span data-cc-done-slot>${ccDoneBtn(m, it)}</span>` : "") +
    (url ? `<a class="p-btn p-btn--ghost p-btn--sm" href="${esc(e.alt || url)}" target="_blank" rel="noopener">${CC_ICONS.ext}<span>Open in new tab</span></a>` : "") +
    `<span class="cc-vacts-sp"></span>` +
    (prev ? `<a class="p-btn p-btn--ghost p-btn--sm" href="${ccHref(c.id, "i", prev.id)}" title="${esc(prev.title)}">${icon("i-chev-l")}<span>Previous</span></a>` : "") +
    (nxt ? `<a class="p-btn p-btn--sm" href="${ccHref(c.id, "i", nxt.id)}" title="${esc(nxt.title)}"><span>Next</span>${icon("i-chev-r")}</a>` : "") +
    `</div>` +
    (desc ? `<section class="cc-desc">${desc.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</section>` : "") +
    `</div>` +
    `<aside class="cc-side" data-cc-side>${ccSideHTML(c, m, it)}</aside>` +
    `</div>`;

  let root = null;
  const patch = () => {
    const m2 = classroom(c.id);
    const it2 = m2.list.find((i) => i.id === iid);
    if (!root || !root.isConnected || !it2) return false;
    const slot = $("[data-cc-done-slot]", root);
    if (slot) slot.innerHTML = ccDoneBtn(m2, it2);
    const side = $("[data-cc-side]", root);
    if (side) {
      const scroll = ($(".cc-side-list", side) || {}).scrollTop || 0;
      side.innerHTML = ccSideHTML(c, m2, it2);
      const l = $(".cc-side-list", side);
      if (l) l.scrollTop = scroll;
    }
    return true;
  };
  return {
    title: it.title,
    crumb: c.title,
    html,
    /* progress / live content changes patch the page instead of re-rendering,
       so a playing video is never reloaded */
    update(keys) {
      const m2 = classroom(c.id);
      if (m2.full !== m.full || m2.ready !== m.ready) return false;
      const it2 = m2.list.find((i) => i.id === iid);
      if (!it2 || ccUrl(m2, it2) !== url || it2.type !== it.type || it2.title !== it.title || String(it2.desc || "") !== String(it.desc || "")) return false;
      if (keys.has("cc") && ccFlat(m2.list).map((i) => i.id).join() !== order.map((i) => i.id).join()) return false;
      return patch();
    },
    mount(r) {
      root = r;
      bindAdd(r);
      $$("[data-cc-buy]", r).forEach((b) => b.addEventListener("click", () => addToCart(b.dataset.ccBuy, b, true)));
      if (!url) return;
      const p = S.progress[c.id] || {};
      if (!p.last || p.last.id !== iid) {
        S.progress[c.id] = { ...p, last: { id: iid, at: Date.now() } };
        dbSet(`${CC_PATH.progress}/${S.user.uid}/${c.id}/last`, { id: iid, at: Date.now() }).catch(() => {});
      }
      /* notes, links and files count as done once opened; videos/audio when finished or ticked */
      const media = ["video", "audio", "live"].includes(it.type);
      if (!media && !m.done[iid]) setTimeout(() => ccSetDone(c.id, iid, true), 1500);
      r.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-cc-done]")) ccSetDone(c.id, iid, !classroom(c.id).done[iid]);
        if (ev.target.closest("[data-cc-open]") && it.type === "live" && !classroom(c.id).done[iid]) ccSetDone(c.id, iid, true);
      });
      const el = $("[data-cc-media]", r);
      if (el)
        el.addEventListener("ended", () => {
          if (!classroom(c.id).done[iid]) {
            ccSetDone(c.id, iid, true);
            toast(nxt ? `Completed — up next: ${nxt.title}` : "Completed — that’s the last item in this course!");
          }
        });
    }
  };
}

/* curriculum block for the course details page (public outline) */
function ccCurriculum(c) {
  const m = classroom(c.id);
  if (!m.ready || !m.list.length) return m.ready ? "" : `<section class="sp-panel cc-curr"><div class="sp-skel"></div><div class="sp-skel sp-skel--short"></div></section>`;
  const leaves = m.list.filter((i) => i.type !== "folder");
  const counts = countByType(m.list);
  const free = ccFlat(m.list).filter((i) => ccUrl(m, i) && (!m.full || i.free)).filter((i) => i.free);
  const top = childrenOf(m.list, "");
  const mins = leaves.reduce((s, i) => s + num(i.mins), 0);
  const bits = [counts.folder ? `${counts.folder} folder${counts.folder === 1 ? "" : "s"}` : "", countsLabel(leaves, { max: 4 }), mins ? minsLabel(mins) + " of video & audio" : ""].filter(Boolean);
  return (
    `<section class="sp-panel cc-curr">` +
    `<div class="cc-curr-head"><div><span class="sp-k">Curriculum</span><h3>Course content</h3><p class="sp-muted sp-small">${esc(bits.join(" · "))}</p></div>` +
    `<a class="p-btn p-btn--ghost p-btn--sm" href="${ccHref(c.id)}">${CC_ICONS.folder}<span>${m.full ? "Open classroom" : "Browse content"}</span></a></div>` +
    (free.length && !m.full
      ? `<div class="cc-demo"><span class="p-label">Free previews</span><div class="cc-demo-row">${free
          .slice(0, 6)
          .map((i) => `<a class="cc-demo-a" href="${ccHref(c.id, "i", i.id)}"><span class="cc-tile cc-tile--sm cc-tone--${ccType(i.type).tone}">${ccIcon(i.type)}</span><span><b>${esc(i.title)}</b><small>${esc(ccMeta(m, i))}</small></span>${icon("i-play")}</a>`)
          .join("")}</div></div>`
      : "") +
    `<div class="cc-curr-list">${top
      .slice(0, 8)
      .map((i) => (i.type === "folder" ? ccFolderCard(c, m, i) : ccItemRow(c, m, i)))
      .join("")}</div>` +
    (top.length > 8 ? `<a class="cc-side-all" href="${ccHref(c.id)}">${CC_ICONS.folder}<span>See all ${top.length} sections</span>${icon("i-chev-r")}</a>` : "") +
    `</section>`
  );
}

function vMembership(focus) {
  const rec = S.member;
  const st = membershipStatus(rec);
  const plans = S.plans;
  const current = rec ? planById(rec.planId) : null;
  const holder = String(S.profile.name || S.user.displayName || "").trim() || "Member";
  const planOffers = S.offers.filter((o) => {
    const ids = couponScopeIds(o);
    return !ids || ids.some(isPlanId);
  });

  /* ---- hero: the student's membership, or the pitch ---- */
  let hero;
  if (st.key !== "none") {
    const left = daysLeft(rec);
    const start = num(rec.startAt);
    const end = num(rec.endAt);
    const pct = end > start ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
    const visPlan = current || { title: rec.planName || "Membership", theme: "ink", duration: "", validityDays: end && start ? Math.round((end - start) / DAY) : 0 };
    const canExtend = current && current.buyable;
    const tone = st.key === "active" ? "ok" : st.key === "expired" || st.key === "cancelled" ? "err" : "muted";
    hero =
      `<section class="sp-mhero">` +
      `<div class="sp-mhero-vis">${planVisual(visPlan, holder)}</div>` +
      `<div class="sp-mhero-body">` +
      `<div class="sp-mhero-top"><span class="sp-k sp-k--light">Your membership</span><span class="sp-status sp-status--${tone}">${esc(st.label)}</span></div>` +
      `<h2>${esc(rec.planName || visPlan.title)}</h2>` +
      `<div class="sp-member-dates"><div><span>Started</span><b>${esc(formatDate(start))}</b></div><div><span>Valid till</span><b>${end ? esc(formatDate(end)) : "Open-ended"}</b></div><div><span>Days left</span><b>${left == null ? "∞" : left}</b></div></div>` +
      (end ? `<div class="sp-mhero-bar"><span class="sp-bar sp-bar--light"><i style="width:${(100 - pct).toFixed(1)}%"></i></span><small>${st.key === "active" ? `${left} of ${Math.max(1, Math.round((end - start) / DAY))} days remaining` : st.key === "expired" ? "Your plan has ended — renew to continue" : esc(st.label)}</small></div>` : "") +
      `<div class="sp-mhero-cta">` +
      (canExtend
        ? S.cart[current.id]
          ? `<a class="p-btn p-btn--lime p-btn--sm" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
          : `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-buy="${esc(current.id)}">${icon("i-refresh")}<span>${st.key === "active" ? "Extend plan" : "Renew plan"}</span></button>`
        : "") +
      (plans.length > (current ? 1 : 0) ? `<a class="p-btn p-btn--ghost sp-btn-onDark p-btn--sm" href="#spPlans" data-jump>${icon("i-crown")}<span>${st.key === "active" ? "Compare plans" : "See all plans"}</span></a>` : "") +
      (rec.orderId && S.orders.some((o) => o.id === rec.orderId) ? `<a class="p-btn p-btn--ghost sp-btn-onDark p-btn--sm" href="#receipt/${esc(rec.orderId)}">${icon("i-receipt")}<span>Receipt</span></a>` : "") +
      `</div></div></section>`;
  } else {
    const lead = plans.find((p) => p.highlight) || plans[0];
    hero =
      `<section class="sp-mhero sp-mhero--pitch">` +
      `<div class="sp-mhero-body">` +
      `<span class="sp-k sp-k--light">FenxTek membership</span>` +
      `<h2>One plan for your <em>whole</em> steno prep.</h2>` +
      `<p>Pick a plan, pay securely and it’s active right away — with a premium receipt, coupon support and renewals that never lose a day.</p>` +
      `<ul class="sp-mhero-perks"><li>${icon("i-zap")}Instant activation</li><li>${icon("i-tag")}Coupons accepted</li><li>${icon("i-receipt")}PNG receipt</li><li>${icon("i-refresh")}Renew anytime</li></ul>` +
      (plans.length ? `<a class="p-btn p-btn--lime p-btn--sm" href="#spPlans" data-jump>${icon("i-crown")}<span>Choose a plan</span></a>` : "") +
      `</div>` +
      (lead ? `<div class="sp-mhero-vis sp-mhero-vis--stack">${plans.slice(0, 3).reverse().map((p, i, arr) => `<div class="sp-mstack" style="--i:${arr.length - 1 - i}">${planVisual(p)}</div>`).join("")}</div>` : "") +
      `</section>`;
  }

  /* ---- plans ---- */
  let plansHtml;
  if (!S.plansReady) plansHtml = skeletonGrid(3);
  else if (!plans.length)
    plansHtml = empty("i-crown", "Plans are coming soon", "The academy hasn’t published membership plans yet. Call us to join a batch today.", `<a class="p-btn p-btn--sm" href="contact.html">${icon("i-phone")}<span>Talk to the academy</span></a>`);
  else plansHtml = `<div class="sp-plans" data-n="${Math.min(plans.length, 4)}">${plans.map((p) => planCard(p, focus)).join("")}</div>`;

  const html =
    hero +
    inviteBanner() +
    redeemForm(false) +
    `<section class="sp-sec" id="spPlans">` +
    sectionHead("Plans", st.key === "active" ? "Extend or switch your plan" : "Choose your plan", planOffers.length ? `<span class="sp-muted sp-small">${icon("i-tag")} ${planOffers.length} offer${planOffers.length === 1 ? "" : "s"} available</span>` : "") +
    (planOffers.length
      ? `<div class="sp-offers sp-offers--row">${planOffers
          .slice(0, 3)
          .map((o) => `<button type="button" class="sp-coupon-tile" data-copy="${esc(o.code)}">${icon("i-tag")}<span><b>${esc(o.code)}</b><small>${esc(o.label)}</small></span>${icon("i-copy")}</button>`)
          .join("")}</div>`
      : "") +
    plansHtml +
    `</section>` +
    `<section class="sp-panel sp-howto"><span class="sp-k">How it works</span><h3>Membership in three steps</h3><ol>` +
    `<li><b>Pick a plan</b><span>Add it to your cart — courses can go in the same order.</span></li>` +
    `<li><b>Apply a coupon &amp; pay</b><span>Card, UPI or netbanking. UPI payments are verified by the academy.</span></li>` +
    `<li><b>You’re a member</b><span>Validity shows here; renewing extends from your end date.</span></li></ol></section>`;

  return {
    title: "Membership",
    crumb: "Purchases",
    html,
    mount(root) {
      bindAdd(root);
      bindGift(root);
      bindRedeemForm(root);
      $$("[data-buy]", root).forEach((b) => b.addEventListener("click", () => addToCart(b.dataset.buy, b, true)));
      $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
      $$("[data-jump]", root).forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const t = $("#spPlans", root);
          if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      );
      const f = focus && $(`#plan-${CSS.escape(focus)}`, root);
      if (f) setTimeout(() => f.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  };
}

/* #join/<planId> — deep link from the public Membership page:
   puts the plan in the cart and opens checkout. */
let joinHandled = "";
function vJoin(planId) {
  if (!S.plansReady) return { title: "Membership", crumb: "Purchases", html: skeletonGrid(1) };
  const p = planById(planId);
  return {
    title: "Membership",
    crumb: "Purchases",
    html: `<div class="sp-boot-card" style="padding:60px 0"><span class="sp-spin sp-spin--lg"></span><b>Preparing your plan…</b></div>`,
    mount() {
      if (joinHandled === planId) return;
      joinHandled = planId;
      setTimeout(() => {
        if (p && p.buyable) addToCart(p.id, null, true);
        else {
          if (p) toast("This plan can’t be bought online yet — call the academy to join.", "err");
          location.replace(`#membership${p ? "/" + encodeURIComponent(p.planId) : ""}`);
        }
      }, 0);
    }
  };
}

/* ============================================================
   gifted memberships — email invites (memberInvites/<emailKey>)
   and QR join codes (memberCodes/<CODE>, #redeem/<CODE>)
   ============================================================ */
const MP = { invites: "memberInvites", codes: "memberCodes", usage: "memberCodeUsage" };
const JOIN_CODE_RE = /^[A-Z0-9-]{4,24}$/;
const myEmailKey = () => String((S.user && S.user.email) || "").trim().toLowerCase().replace(/\./g, ",");
const cleanJoinCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
const userErr = (message) => Object.assign(new Error(message), { userFacing: true });
const snapVal = (s) => (s && s.exists && s.exists() ? s.val() : null);

/* members/<uid> record for a granted plan. If the same plan is still
   running the new days are added on top of the current end date. */
function grantRecord(cur, grant, now, extra) {
  const live = Boolean(cur && cur.planId === grant.planId && cur.status === "active" && num(cur.endAt) > now);
  const startAt = live && num(cur.startAt) ? num(cur.startAt) : now;
  const days = Math.max(0, Math.round(num(grant.days)));
  const rec = {
    planId: grant.planId,
    planName: grant.planName || "Membership",
    startAt,
    status: "active",
    name: String(S.profile.name || S.user.displayName || "").trim(),
    email: S.user.email || "",
    updatedAt: now,
    ...extra
  };
  if (days > 0) rec.endAt = (live ? num(cur.endAt) : startAt) + days * DAY;
  return rec;
}
/* already on this plan with no end date — nothing to add */
const holdsForever = (cur, planId) => Boolean(cur && cur.planId === planId && cur.status === "active" && !num(cur.endAt));

let inviteBusy = false;
async function checkInvite({ recheck = false } = {}) {
  const key = myEmailKey();
  if (!key || inviteBusy) return;
  inviteBusy = true;
  let inv = null;
  try {
    inv = snapVal(await dbGet(`${MP.invites}/${key}`).catch(() => null));
    if (!inv || !inv.planId) {
      if (S.invite) {
        S.invite = null;
        changed("member");
      }
      return;
    }
    /* the rules only release an invite to a verified email address */
    if (!S.user.emailVerified || recheck) {
      try {
        await S.user.reload();
        await S.user.getIdToken(true);
      } catch (e) {
        /* offline — keep the banner */
      }
    }
    if (!S.user.emailVerified) {
      S.invite = { ...inv, needsVerify: true };
      changed("member");
      if (recheck) toast("Your email isn’t verified yet — open the link we emailed you, then tap “I’ve verified”.", "err");
      return;
    }
    const cur = snapVal(await dbGet(`members/${S.user.uid}`).catch(() => null)) || S.member;
    if (holdsForever(cur, inv.planId)) {
      S.invite = null;
      changed("member");
      return;
    }
    const rec = grantRecord(cur, inv, Date.now(), { source: "invite", ...(inv.paid ? { paid: inv.paid } : {}) });
    await dbUpdateRoot({ [`members/${S.user.uid}`]: rec, [`${MP.invites}/${key}`]: null });
    S.invite = null;
    S.member = rec;
    changed("member");
    toast(`You’ve been given ${rec.planName} — it’s active now.`);
  } catch (err) {
    console.warn("[portal] invite claim failed", err);
    if (inv) {
      S.invite = { ...inv, needsVerify: !S.user.emailVerified, error: friendlyError(err) };
      changed("member");
    }
    if (recheck) toast(friendlyError(err), "err");
  } finally {
    inviteBusy = false;
  }
}

function inviteBanner() {
  const inv = S.invite;
  if (!inv) return "";
  return (
    `<section class="sp-gift">${icon("i-gift")}<div class="sp-gift-txt"><span class="sp-k">A gift from the academy</span>` +
    `<p><b>${esc(inv.planName || "A membership")}</b> is waiting for you. ${
      inv.needsVerify ? `Verify <b>${esc(S.user.email || "your email")}</b> to activate it.` : "Tap below to activate it."
    }</p>` +
    `<div class="sp-gift-cta">` +
    (inv.needsVerify ? `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-gift-send>${icon("i-mail")}<span>Send verification email</span></button>` : "") +
    `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-gift-check>${icon(inv.needsVerify ? "i-refresh" : "i-check")}<span>${inv.needsVerify ? "I’ve verified" : "Activate now"}</span></button>` +
    `</div></div></section>`
  );
}

function bindGift(root) {
  const send = $("[data-gift-send]", root);
  if (send)
    send.addEventListener("click", () =>
      busy(send, "Sending", async () => {
        try {
          await sendVerification();
          toast("Verification email sent — check your inbox (and spam), then tap “I’ve verified”.");
        } catch (err) {
          toast(friendlyError(err), "err");
        }
      })
    );
  const chk = $("[data-gift-check]", root);
  if (chk) chk.addEventListener("click", () => busy(chk, "Checking", () => checkInvite({ recheck: true })));
}

function redeemForm(big) {
  return (
    `<form class="sp-redeem${big ? " sp-redeem--big" : ""}" data-redeem-form data-sp-keep novalidate>` +
    `<span class="sp-redeem-ic">${icon("i-qr")}</span>` +
    `<div class="sp-redeem-txt"><b>Have a membership code?</b><span>Scanned a QR or got a code from the academy? Enter it to activate your plan — no payment needed.</span></div>` +
    `<div class="sp-redeem-in"><input class="p-input" name="code" placeholder="e.g. GOLD-7KQ2XM" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" aria-label="Membership code">` +
    `<button class="p-btn p-btn--sm" type="submit"><span>Apply code</span>${icon("i-arr")}</button></div></form>`
  );
}

function bindRedeemForm(root) {
  $$("[data-redeem-form]", root).forEach((form) => {
    const input = form.elements.code;
    input.addEventListener("input", () => {
      const v = cleanJoinCode(input.value);
      if (v !== input.value) input.value = v;
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = cleanJoinCode(input.value);
      if (!JOIN_CODE_RE.test(code)) {
        toast("Enter the code exactly as shown — 4 to 24 letters and numbers.", "err");
        input.focus();
        return;
      }
      input.blur();
      redeemCache.delete(code);
      go(`#redeem/${code}`);
    });
  });
}

const redeemCache = new Map(); // CODE -> { state, c, count, usedAt, error }
function loadRedeem(code) {
  if (redeemCache.has(code)) return;
  redeemCache.set(code, { state: "loading" });
  const uid = S.user.uid;
  Promise.all([
    dbGet(`${MP.codes}/${code}`),
    dbGet(`${MP.usage}/${code}/count`).catch(() => null),
    dbGet(`${MP.usage}/${code}/users/${uid}`).catch(() => null)
  ])
    .then(([c, n, u]) => {
      const val = snapVal(c);
      redeemCache.set(code, val ? { state: "ok", c: val, count: num(snapVal(n)), usedAt: num(snapVal(u)) } : { state: "missing" });
    })
    .catch((err) => redeemCache.set(code, { state: "error", error: friendlyError(err) }))
    .finally(() => {
      if (current.route && current.route.id === "redeem" && cleanJoinCode(current.arg) === code) render({ quiet: true });
    });
}

function codeProblem(code, r, cur) {
  const c = r.c;
  if (r.usedAt || (cur && cur.source === "code" && cur.code === code)) return ["Already redeemed", "You’ve already used this code on your account. Each code works once per student."];
  if (c.active === false) return ["Code paused", "The academy has paused this code for now. Ask them to switch it back on, or for a new QR."];
  if (num(c.expiresAt) && num(c.expiresAt) <= Date.now()) return ["Code expired", `This code stopped working on ${formatDate(num(c.expiresAt))}. Ask the academy for a fresh one.`];
  if (num(c.maxUses) && r.count >= num(c.maxUses)) return ["All places taken", "This code has reached its student limit. Ask the academy for a new code."];
  if (holdsForever(cur, c.planId)) return ["You already have this plan", "Your membership on this plan never expires, so there’s nothing to add."];
  return null;
}

function vRedeem(arg) {
  const code = cleanJoinCode(arg);
  const base = { title: "Redeem code", crumb: "Membership" };
  const back = `<a class="p-btn p-btn--ghost p-btn--sm" href="#membership">${icon("i-chev-l")}<span>Membership</span></a>`;
  if (!code)
    return {
      ...base,
      html: `<section class="sp-redeem-solo">${redeemForm(true)}</section>`,
      mount: bindRedeemForm
    };
  if (code !== arg) {
    setTimeout(() => location.replace(`#redeem/${code}`), 0);
    return { ...base, html: "" };
  }
  if (!JOIN_CODE_RE.test(code))
    return { ...base, html: empty("i-qr", "That doesn’t look like a code", "Membership codes are 4–24 letters and numbers.", "") + `<section class="sp-redeem-solo">${redeemForm(true)}</section>`, mount: bindRedeemForm };

  loadRedeem(code);
  const r = redeemCache.get(code);
  if (r.state === "loading")
    return { ...base, html: `<div class="sp-boot-card" style="padding:60px 0"><span class="sp-spin sp-spin--lg"></span><b>Checking code ${esc(code)}…</b></div>` };
  if (r.state === "missing")
    return {
      ...base,
      html: empty("i-qr", "Code not found", `We couldn’t find “${code}”. Check the letters, or ask the academy for a new QR.`, back) + `<section class="sp-redeem-solo">${redeemForm(true)}</section>`,
      mount: bindRedeemForm
    };
  if (r.state === "error")
    return {
      ...base,
      html: empty("i-info", "Couldn’t check the code", r.error || "Please try again.", `<button class="p-btn p-btn--sm" type="button" data-redeem-retry>${icon("i-refresh")}<span>Try again</span></button>`),
      mount(root) {
        const b = $("[data-redeem-retry]", root);
        if (b)
          b.addEventListener("click", () => {
            redeemCache.delete(code);
            render({ quiet: true });
          });
      }
    };

  const c = r.c;
  const days = Math.max(0, Math.round(num(c.days)));
  const plan = planById(c.planId);
  const holder = String(S.profile.name || S.user.displayName || "").trim() || "Member";
  const vis = { ...(plan || { theme: "violet" }), title: c.planName || (plan && plan.title) || "Membership", duration: validityLabel(days).replace(" access", "") };
  const cur = S.member;
  const problem = codeProblem(code, r, cur);
  const curActive = membershipStatus(cur).key === "active";
  let effect = "";
  if (!problem && curActive && cur.planId === c.planId && num(cur.endAt) > Date.now())
    effect = `${icon("i-refresh")}<span>Adds <b>${days} days</b> to your current plan — new end date <b>${esc(formatDate(num(cur.endAt) + days * DAY))}</b>.</span>`;
  else if (!problem && curActive && cur.planId !== c.planId)
    effect = `${icon("i-info")}<span>This replaces your current <b>${esc(cur.planName || "membership")}</b>.</span>`;
  const features = (plan && Array.isArray(plan.features) ? plan.features : []).slice(0, 4);

  const html =
    `<section class="sp-redeem-card">` +
    `<div class="sp-redeem-vis">${planVisual(vis, holder)}</div>` +
    `<div class="sp-redeem-body">` +
    `<span class="sp-k">Membership code · <code class="sp-redeem-code">${esc(code)}</code></span>` +
    `<h2>${esc(vis.title)}</h2>` +
    `<ul class="sp-redeem-facts">` +
    `<li>${icon("i-clock")}<span>Validity</span><b>${days ? `${days} days` : "Open-ended"}</b></li>` +
    `<li>${icon("i-zap")}<span>Activates</span><b>Right away</b></li>` +
    `<li>${icon("i-tag")}<span>Price</span><b>Free with code</b></li>` +
    `</ul>` +
    (features.length ? `<ul class="sp-redeem-feat">${features.map((f) => `<li>${icon("i-check")}${esc(f)}</li>`).join("")}</ul>` : "") +
    (effect ? `<p class="sp-redeem-note">${effect}</p>` : "") +
    (problem
      ? `<div class="sp-redeem-block">${icon("i-info")}<div><b>${esc(problem[0])}</b><span>${esc(problem[1])}</span></div></div><div class="sp-redeem-cta">${back}</div>`
      : `<div class="sp-redeem-cta"><button class="p-btn p-btn--lime" type="button" data-redeem-go>${icon("i-check")}<span>Activate membership</span></button>${back}</div>`) +
    `<p class="sp-muted sp-small">Signed in as ${esc(S.user.email || "")}. The plan is added to this account.</p>` +
    `</div></section>`;
  return {
    ...base,
    html,
    mount(root) {
      const b = $("[data-redeem-go]", root);
      if (b) b.addEventListener("click", () => redeemCode(code, b));
    }
  };
}

async function redeemCode(code, btn) {
  const uid = S.user.uid;
  await busy(btn, "Activating", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const [cs, ns, us, ms] = await Promise.all([
          dbGet(`${MP.codes}/${code}`),
          dbGet(`${MP.usage}/${code}/count`),
          dbGet(`${MP.usage}/${code}/users/${uid}`),
          dbGet(`members/${uid}`)
        ]);
        const c = snapVal(cs);
        if (!c) throw userErr("This code no longer exists.");
        const r = { c, count: num(snapVal(ns)), usedAt: num(snapVal(us)) };
        const cur = snapVal(ms);
        const problem = codeProblem(code, r, cur);
        if (problem) throw userErr(problem[0] + " — " + problem[1]);
        const now = Date.now();
        const rec = grantRecord(cur, c, now, { source: "code", code });
        await dbUpdateRoot({
          [`members/${uid}`]: rec,
          [`${MP.usage}/${code}/count`]: r.count + 1,
          [`${MP.usage}/${code}/users/${uid}`]: now
        });
        S.member = rec;
        redeemCache.delete(code);
        changed("member");
        toast(`${rec.planName} is active — welcome aboard!`);
        go("#membership");
        return;
      } catch (err) {
        if (err && err.userFacing) {
          toast(err.message, "err");
          redeemCache.delete(code);
          render({ quiet: true });
          return;
        }
        /* someone else joined at the same instant — re-read the count once */
        if (attempt === 0 && /permission|denied/i.test(String((err && (err.code || err.message)) || ""))) continue;
        toast(friendlyError(err), "err");
        return;
      }
    }
  });
}

function vProfile() {
  const p = S.profile;
  const provider = (S.user.providerData && S.user.providerData[0] && S.user.providerData[0].providerId) || "";
  const exams = ["SSC Stenographer", "UPSSSC Stenographer", "AHC Stenographer", "AHC APS", "UPPCL APS", "UPPSC APS", "Parliamentary Reporter", "Other"];
  const html =
    `<div class="sp-profile">` +
    `<section class="sp-panel">` +
    `<div class="sp-profile-id"><span class="sp-avatar sp-avatar--lg">${esc(initials(p.name, S.user.email))}</span><div><h2>${esc(p.name || "Student")}</h2><p>${esc(S.user.email || "")}</p>` +
    `<span class="sp-muted sp-small">${p.createdAt ? `Member since ${esc(new Date(num(p.createdAt)).toLocaleDateString("en-IN", { month: "long", year: "numeric" }))}` : "FenxTek student"}</span></div></div>` +
    `<form class="dash-form" id="profileForm" data-sp-keep novalidate>` +
    `<div class="p-row"><label class="p-field"><span class="p-label">Full name</span><input class="p-input" name="name" autocomplete="name" value="${esc(p.name || "")}" required></label>` +
    `<label class="p-field"><span class="p-label">Mobile</span><input class="p-input" type="tel" name="phone" autocomplete="tel" placeholder="+91 …" value="${esc(p.phone || "")}"></label></div>` +
    `<div class="p-row"><label class="p-field"><span class="p-label">Target exam</span><select class="p-select" name="exam"><option value="">Choose an exam</option>${exams
      .map((x) => `<option${p.exam === x ? " selected" : ""}>${esc(x)}</option>`)
      .join("")}</select></label>` +
    `<label class="p-field"><span class="p-label">Target speed (WPM)</span><input class="p-input" type="number" name="speed" min="30" max="200" step="5" placeholder="100" value="${esc(p.speed || "")}"></label></div>` +
    `<button class="p-btn" type="submit">${icon("i-check")}<span>Save profile</span></button>` +
    `</form></section>` +
    `<aside class="sp-profile-side">` +
    `<section class="sp-panel"><span class="sp-k">Account</span><h3>Security</h3><p class="sp-muted">${provider === "google.com" ? "Signed in with your Google account via Firebase Authentication." : "Signed in with email and password via Firebase Authentication."}</p>` +
    `<a class="sp-row-link" href="forgot.html">${icon("i-lock")}<span>Reset password</span>${icon("i-chev-r")}</a>` +
    `<a class="sp-row-link" href="#orders">${icon("i-receipt")}<span>Orders &amp; receipts</span>${icon("i-chev-r")}</a>` +
    `<a class="sp-row-link" href="#membership">${icon("i-crown")}<span>Membership</span>${icon("i-chev-r")}</a>` +
    (S.admin ? `<a class="sp-row-link" href="admin.html">${icon("i-grid")}<span>Admin CRM</span>${icon("i-chev-r")}</a>` : "") +
    `<button class="p-btn p-btn--danger p-btn--block p-btn--sm" type="button" id="signOutBtn2">${icon("i-logout")}<span>Sign out</span></button></section>` +
    profileWallet() +
    `<section class="sp-panel sp-danger"><span class="sp-k">Danger zone</span><h3>Delete account</h3>` +
    `<p class="sp-muted">Permanently delete your FenxTek account, profile and learning progress. This can’t be undone.</p>` +
    `<button class="p-btn p-btn--block p-btn--sm sp-danger-btn" type="button" id="spDeleteAcc">${icon("i-trash")}<span>Delete my account</span></button></section>` +
    `</aside></div>`;
  return {
    title: "Profile",
    crumb: "Account",
    html,
    mount(root) {
      $("#signOutBtn2", root).addEventListener("click", signOut);
      $("#spDeleteAcc", root).addEventListener("click", openDeleteAccount);
      const form = $("#profileForm", root);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = new FormData(form);
        const name = String(d.get("name") || "").trim();
        const phone = String(d.get("phone") || "").trim();
        const exam = String(d.get("exam") || "").trim();
        const speedRaw = String(d.get("speed") || "").trim();
        if (name.length < 2) {
          toast("Please enter your full name.", "err");
          return;
        }
        busy(form.querySelector('button[type="submit"]'), "Saving", async () => {
          try {
            await dbUpdate(`users/${S.user.uid}`, { name, phone, exam, speed: speedRaw ? Number(speedRaw) : null, updatedAt: Date.now() });
            Object.assign(S.profile, { name, phone, exam, speed: speedRaw ? Number(speedRaw) : null });
            paintUser();
            toast("Profile saved");
          } catch (err) {
            toast(friendlyError(err), "err");
          }
        });
      });
    }
  };
}

/* Profile: compact E-coin wallet */
function profileWallet() {
  if (!coinsOn()) return "";
  const bal = coinBalance();
  const w = S.wallet || {};
  const fmt = (n) => Math.round(num(n)).toLocaleString("en-IN");
  return (
    `<a class="sp-panel sp-pwallet" href="#rewards">` +
    `<span class="sp-pwallet-coin">${coin3d("sm")}</span>` +
    `<span class="sp-pwallet-txt"><span class="sp-k">E-coin wallet</span><b>${fmt(bal)} <small>${bal === 1 ? "coin" : "coins"}</small></b>` +
    `<small>Worth ${money(bal)} · earned ${fmt(Math.max(num(w.earned), bal))} in total</small></span>` +
    `${icon("i-chev-r")}</a>`
  );
}

/* ============================================================
   Delete account
   The student removes what they own (profile, cart, progress),
   leaves a short record for the academy (accountDeletions/<uid>)
   and then their Firebase sign-in is deleted. Orders and receipts
   stay with the academy for its accounts.
   ============================================================ */
const DELETE_REASONS = [
  ["done", "I’ve finished my exam preparation"],
  ["other-academy", "I’m studying somewhere else"],
  ["price", "Courses are too expensive for me"],
  ["not-useful", "The portal wasn’t useful for me"],
  ["privacy", "Privacy — I don’t want an account"],
  ["other", "Something else"]
];

function signInProvider() {
  const ids = ((S.user && S.user.providerData) || []).map((p) => p.providerId);
  return ids.includes("password") ? "password" : ids.includes("google.com") ? "google.com" : ids[0] || "password";
}

function openDeleteAccount() {
  const email = String(S.user.email || "").trim();
  const provider = signInProvider();
  const bal = coinBalance();
  const activeCourses = S.courses.filter((c) => owns(c.id)).length || Object.keys(S.enroll || {}).filter((id) => owns(id)).length;
  const member = memberActive();
  const paidOrders = S.orders.filter((o) => o.status === "paid").length;

  const loses = [
    activeCourses ? `<li>${icon("i-book")}<span>Access to <b>${activeCourses} active course${activeCourses === 1 ? "" : "s"}</b></span></li>` : "",
    member ? `<li>${icon("i-crown")}<span>Your <b>${esc((myPlan() && myPlan().title) || "membership")}</b> membership</span></li>` : "",
    bal ? `<li class="is-coin">${coinFace("sp-del-coin")}<span><b>${bal.toLocaleString("en-IN")} E-coins</b> (worth ${money(bal)}) — they can’t be refunded or moved</span></li>` : "",
    `<li>${icon("i-user")}<span>Your profile, cart and learning progress</span></li>`,
    S.profile.refCode ? `<li>${icon("i-gift")}<span>Your referral code <b>${esc(S.profile.refCode)}</b> stops earning</span></li>` : ""
  ].join("");

  openModal(
    `<div class="sp-del">` +
    `<span class="sp-del-ic">${icon("i-trash")}</span>` +
    `<div><span class="sp-k sp-del-k">Danger zone</span><h3 class="sp-del-title">Delete your account?</h3>` +
    `<p class="sp-muted">This permanently deletes the FenxTek account for <b>${esc(email)}</b>. You can’t undo it.</p></div>` +
    `<div class="sp-del-box"><span class="sp-del-h">You will lose</span><ul class="sp-del-list">${loses}</ul></div>` +
    `<p class="sp-del-keep">${icon("i-receipt")}<span>${paidOrders ? `Your ${paidOrders} order${paidOrders === 1 ? "" : "s"} and payment records are kept by the academy for its accounts. <a href="#orders" data-close>Download your receipts</a> first if you need them.` : "Any order and payment records are kept by the academy for its accounts."}</span></p>` +
    `<form class="sp-del-form" id="spDelForm" novalidate>` +
    `<label class="p-field"><span class="p-label">Why are you leaving? <em>(optional)</em></span><select class="p-select" name="reason"><option value="">Choose a reason</option>${DELETE_REASONS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></label>` +
    `<label class="p-field"><span class="p-label">Type your email to confirm</span><input class="p-input" name="confirm" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(email)}"></label>` +
    (provider === "password"
      ? `<label class="p-field"><span class="p-label">Password</span><input class="p-input" name="password" type="password" autocomplete="current-password" placeholder="Your current password"></label>`
      : `<p class="sp-del-note">${icon("i-shield")}<span>For your security, Google will ask you to confirm it’s you.</span></p>`) +
    `<p class="sp-del-err" id="spDelErr" role="alert" hidden></p>` +
    `<div class="sp-del-actions"><button class="p-btn p-btn--ghost p-btn--sm" type="button" data-close>Keep my account</button>` +
    `<button class="p-btn p-btn--sm sp-danger-btn is-solid" type="submit" id="spDelGo" disabled>${icon("i-trash")}<span>Delete permanently</span></button></div>` +
    `</form></div>`,
    {
      onMount(m) {
        const f = $("#spDelForm", m);
        const go = $("#spDelGo", m);
        const err = $("#spDelErr", m);
        const ok = () => {
          const typed = String(f.confirm.value || "").trim().toLowerCase() === email.toLowerCase();
          const pw = provider !== "password" || String(f.password.value || "").length >= 6;
          go.disabled = !(typed && pw);
        };
        f.addEventListener("input", ok);
        setTimeout(() => f.confirm.focus(), 60);
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          if (go.disabled) return;
          err.hidden = true;
          busy(go, "Deleting", async () => {
            lockModal(true);
            try {
              await deleteAccount({ reason: f.reason.value, password: f.password ? f.password.value : "", provider });
            } catch (ex) {
              lockModal(false);
              err.textContent = ex && ex.userFacing ? ex.message : deleteErrorText(ex);
              err.hidden = false;
            }
          });
        });
      }
    }
  );
}

function deleteErrorText(err) {
  const code = String((err && err.code) || "");
  if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return "That password isn’t right. Please try again.";
  if (code === "auth/user-mismatch") return "That Google account doesn’t match this student account. Choose " + (S.user.email || "the same account") + ".";
  if (code === "auth/requires-recent-login") return "For your security, please sign out, sign in again and then delete your account.";
  if (code === "PERMISSION_DENIED" || /permission/i.test(String((err && err.message) || ""))) return "We couldn’t remove your data right now. Please try again, or contact the academy.";
  return friendlyError(err);
}

async function deleteAccount({ reason, password, provider }) {
  await initFirebase();
  const f = fb;
  const user = f.auth && f.auth.currentUser;
  if (!user || user.uid !== S.user.uid) throw userErr("Your session has ended. Please sign in again.");

  /* 1 — prove it's really them (Firebase only deletes recently signed-in accounts) */
  if (provider === "password") {
    const cred = f.a.EmailAuthProvider.credential(user.email, password);
    await f.a.reauthenticateWithCredential(user, cred);
  } else if (provider === "google.com") {
    const gp = new f.a.GoogleAuthProvider();
    gp.setCustomParameters({ prompt: "select_account", login_hint: user.email || "" });
    await f.a.reauthenticateWithPopup(user, gp);
  }

  /* 2 — remove what the student owns and leave a note for the academy, in one atomic write */
  const uid = user.uid;
  const now = Date.now();
  const note = {
    email: String(user.email || S.profile.email || "").toLowerCase().slice(0, 120),
    name: String(S.profile.name || user.displayName || "").slice(0, 80),
    phone: String(S.profile.phone || "").slice(0, 20),
    provider: String(provider || "").slice(0, 40),
    coins: coinBalance(),
    orders: S.orders.length,
    at: now
  };
  if (reason) note.reason = reason;
  const code = cleanRefCode(S.profile.refCode);
  if (code) note.refCode = code;
  await dbUpdateRoot({
    [`users/${uid}`]: null,
    [`${PATH.carts}/${uid}`]: null,
    [`${CC_PATH.progress}/${uid}`]: null,
    [`accountDeletions/${uid}`]: note
  });

  /* 3 — delete the sign-in itself */
  await f.a.deleteUser(user);
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  location.replace("auth.html?deleted=1");
}

function vSoon(route) {
  return {
    title: route.label,
    crumb: "Coming soon",
    html:
      `<section class="sp-soon-page"><span class="sp-soon-ic">${icon(route.icon)}</span><span class="sp-k">Coming soon</span><h2>${esc(route.label)}</h2><p>${esc(route.blurb)}</p>` +
      `<div class="sp-soon-cta"><a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse courses</span></a><a class="p-btn p-btn--ghost p-btn--sm" href="#home">${icon("i-home")}<span>Home</span></a></div></section>`
  };
}

/* ============================================================
   chrome: user card, sign out
   ============================================================ */
/* ============================================================
   E-coin — polished 3D coin (SVG face + stacked CSS edge)
   ============================================================ */
let coinSeq = 0;
/* the coin face: reeded gold rim, embossed F monogram and FENXTEK · E-COIN lettering.
   Every instance gets its own gradient ids (gradients inside hidden SVGs don't paint). */
function coinFace(cls = "", back = false) {
  const n = ++coinSeq;
  const id = (k) => `ec${n}${k}`;
  return (
    `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">` +
    `<defs>` +
    `<linearGradient id="${id("r")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF0A8"/><stop offset=".28" stop-color="#F7C531"/><stop offset=".55" stop-color="#B97F00"/><stop offset=".78" stop-color="#F4C02A"/><stop offset="1" stop-color="#7A4E00"/></linearGradient>` +
    `<radialGradient id="${id("f")}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#FFF6C9"/><stop offset=".3" stop-color="#FFD95A"/><stop offset=".68" stop-color="#F0B000"/><stop offset="1" stop-color="#B07800"/></radialGradient>` +
    `<linearGradient id="${id("m")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#D79A00"/></linearGradient>` +
    `<linearGradient id="${id("g")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<path id="${id("t")}" d="M60 60 m-37 0 a37 37 0 1 1 74 0 a37 37 0 1 1 -74 0"/>` +
    `<clipPath id="${id("c")}"><circle cx="60" cy="60" r="50"/></clipPath>` +
    `</defs>` +
    `<circle cx="60" cy="60" r="59" fill="url(#${id("r")})"/>` +
    `<circle cx="60" cy="60" r="56.6" fill="none" stroke="#6B4400" stroke-opacity=".38" stroke-width="3.2" stroke-dasharray="1.1 2.05"/>` +
    `<circle cx="60" cy="60" r="51.6" fill="#8A5A00" fill-opacity=".55"/>` +
    `<circle cx="60" cy="60" r="50" fill="url(#${id("f")})"/>` +
    `<circle cx="60" cy="60" r="49.3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>` +
    `<circle cx="60" cy="60" r="44" fill="none" stroke="#8A5A00" stroke-opacity=".42" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.01 3.46"/>` +
    `<text font-family="JetBrains Mono, ui-monospace, monospace" font-size="7.2" font-weight="700" letter-spacing="2.6" fill="#7A4E00" fill-opacity=".72"><textPath href="#${id("t")}" startOffset="${back ? "4%" : "13.5%"}">${back ? "1 E-COIN · ₹1 · FENXTEK REWARDS ·" : "FENXTEK · E-COIN"}</textPath></text>` +
    (back
      ? `<text x="60" y="73" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="40" fill="#7A4E00" fill-opacity=".5" dx="1.2" dy="1.6">₹1</text>` +
        `<text x="60" y="73" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="40" fill="#FFF3B8" dx="-.8" dy="-.8">₹1</text>` +
        `<text x="60" y="73" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="40" fill="url(#${id("m")})">₹1</text>`
      : `<text x="60" y="77" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-weight="800" font-size="46" letter-spacing="-2" fill="#7A4E00" fill-opacity=".55" dx="1.4" dy="1.8">F</text>` +
        `<text x="60" y="77" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-weight="800" font-size="46" letter-spacing="-2" fill="#FFF5C4" dx="-1" dy="-1">F</text>` +
        `<text x="60" y="77" text-anchor="middle" font-family="Inter Tight, system-ui, sans-serif" font-weight="800" font-size="46" letter-spacing="-2" fill="url(#${id("m")})">F</text>`) +
    `<g clip-path="url(#${id("c")})"><path d="M0 0H120L0 92Z" fill="url(#${id("g")})" opacity=".55"/></g>` +
    `</svg>`
  );
}

/* 3D coin: front + back faces with a stacked edge so it has real thickness when it turns */
function coin3d(size = "md") {
  const edge = Array.from({ length: 12 }, (_, k) => `<i style="--k:${k}"></i>`).join("");
  return (
    `<span class="ec ec--${size}" aria-hidden="true">` +
    `<span class="ec-spark"><i></i><i></i><i></i></span>` +
    `<span class="ec-float"><span class="ec-body">` +
    `<span class="ec-edge">${edge}</span>` +
    `<span class="ec-face ec-back">${coinFace("", true)}</span>` +
    `<span class="ec-face ec-front">${coinFace()}<span class="ec-gloss"></span></span>` +
    `</span></span>` +
    `<span class="ec-shadow"></span>` +
    `</span>`
  );
}

/* Home: the student's E-coin wallet, front and centre */
function walletCard() {
  if (!coinsOn()) return "";
  const rw = S.rewards;
  const bal = coinBalance();
  const w = S.wallet || {};
  const fmt = (n) => Math.round(num(n)).toLocaleString("en-IN");
  const friends = S.myRefs.filter((r) => r.status === "rewarded").length;
  const lastIn = S.walletTx.find((t) => num(t.coins) > 0);
  const earned = Math.max(num(w.earned), bal);
  return (
    `<section class="sp-ecoin${bal ? "" : " is-empty"}">` +
    `<div class="sp-ecoin-art">${coin3d("lg")}</div>` +
    `<div class="sp-ecoin-body">` +
    `<span class="sp-ecoin-k">${icon("i-coin")}FenxTek E-coins</span>` +
    `<div class="sp-ecoin-bal"><b data-coin-count="${bal}">${fmt(bal)}</b><span>${bal === 1 ? "coin" : "coins"}</span></div>` +
    `<p>${bal ? `Worth <b>${money(bal)}</b> off your next course · 1 E-coin = ₹1` : rw.enabled ? `Invite a friend and earn <b>${esc(coinsLabel(rw.referrerCoins))}</b> when they join · 1 E-coin = ₹1` : "1 E-coin = ₹1 off courses and memberships"}</p>` +
    `<div class="sp-ecoin-stats">` +
    `<div><small>Earned</small><b>${fmt(earned)}</b></div>` +
    `<div><small>Used</small><b>${fmt(w.spent)}</b></div>` +
    `<div><small>Friends</small><b>${friends}</b></div>` +
    `</div>` +
    (lastIn ? `<p class="sp-ecoin-last">${icon("i-arr-u")}<span>+${fmt(lastIn.coins)} · ${esc(TX_LABEL[lastIn.type] || "E-coins")} · ${esc(formatDate(lastIn.at))}</span></p>` : "") +
    `</div>` +
    `<div class="sp-ecoin-cta">` +
    (bal ? `<a class="p-btn p-btn--sm sp-ecoin-btn" href="#store">${icon("i-cart")}<span>Spend at checkout</span></a>` : "") +
    (rw.enabled ? `<a class="p-btn p-btn--sm p-btn--ghost sp-btn-onDark" href="#rewards">${icon("i-gift")}<span>Earn more</span></a>` : `<a class="p-btn p-btn--sm p-btn--ghost sp-btn-onDark" href="#rewards">${icon("i-coin")}<span>Coin history</span></a>`) +
    `</div>` +
    `</section>`
  );
}

/* count the balance up from 0 the first time it is shown */
let coinsCounted = -1;
function countUpCoins(root) {
  const el = $("[data-coin-count]", root);
  if (!el) return;
  const to = Math.round(num(el.dataset.coinCount));
  if (to === coinsCounted || !to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    coinsCounted = to;
    return;
  }
  const from = coinsCounted > 0 && coinsCounted < to ? coinsCounted : 0;
  coinsCounted = to;
  const t0 = performance.now();
  const dur = 1100;
  const step = (t) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString("en-IN");
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ============================================================
   Refer & earn — E-coins wallet (1 E-coin = ₹1 off courses)
   ============================================================ */
function refLink(code) {
  const u = new URL("auth.html", location.href);
  u.search = `?mode=signup&next=${encodeURIComponent(`dashboard.html#ref/${code}`)}`;
  u.hash = "";
  return u.href;
}
function shareText(code, withLink = true) {
  const rw = S.rewards;
  return (
    `I’m learning shorthand with FenxTek Shorthand Classes. Join with my code ${code}` +
    (rw.refereeCoins ? ` and get ${coinsLabel(rw.refereeCoins)} (₹${rw.refereeCoins} off) on your first course` : "") +
    (withLink ? `: ${refLink(code)}` : ".")
  );
}

/* every student gets one personal code: refCodes/<CODE> = uid (+ users/<uid>/refCode) */
let refChecked = false;
async function ensureRefCode() {
  if (S.refBusy || !S.rewards.enabled || !S.user) return;
  const have = cleanRefCode(S.profile.refCode);
  if (have && refChecked) return;
  S.refBusy = true;
  try {
    if (have) {
      const owner = snapVal(await dbGet(`${PATH.refCodes}/${have}`).catch(() => null));
      if (owner === S.user.uid) return void (refChecked = true);
      if (!owner) {
        const ok = await dbSet(`${PATH.refCodes}/${have}`, S.user.uid).then(() => true, () => false);
        if (ok) return void (refChecked = true);
      }
    }
    for (let i = 0; i < 4; i++) {
      const code = makeRefCode(S.profile.name || S.user.displayName || S.user.email);
      try {
        await dbUpdateRoot({ [`${PATH.refCodes}/${code}`]: S.user.uid, [`users/${S.user.uid}/refCode`]: code });
        S.profile.refCode = code;
        refChecked = true;
        changed("profile");
        return;
      } catch (err) {
        if (i === 3) throw err;
      }
    }
  } catch (err) {
    console.warn("[rewards] referral code", err);
  } finally {
    S.refBusy = false;
  }
}

async function applyReferral(raw, btn) {
  const code = cleanRefCode(raw);
  if (code.length < 4) {
    toast("Enter your friend’s referral code.", "err");
    return false;
  }
  return busy(btn, "Applying", async () => {
    try {
      const rw = S.rewards;
      if (!rw.enabled) throw userErr("Referral rewards are paused right now.");
      if (S.referral) throw userErr("You’ve already used a referral code.");
      if (S.orders.length) throw userErr("Referral codes are for new students, before their first purchase.");
      const by = snapVal(await dbGet(`${PATH.refCodes}/${code}`));
      if (!by) throw userErr("That referral code doesn’t exist — check the spelling with your friend.");
      if (by === S.user.uid) throw userErr("That’s your own code — share it with friends instead.");
      const now = Date.now();
      const name = String(S.profile.name || S.user.displayName || "Friend").trim().slice(0, 60) || "Friend";
      await dbUpdateRoot({
        [`${PATH.referrals}/${S.user.uid}`]: { by, code, status: "pending", at: now, name },
        [`${PATH.referredBy}/${by}/${S.user.uid}`]: { name, at: now, status: "pending" }
      });
      S.referral = { by, code, status: "pending", at: now, name };
      changed("refs");
      toast(rw.refereeCoins ? `Invite accepted — ${coinsLabel(rw.refereeCoins)} will be added after your first purchase.` : "Invite accepted.");
      return true;
    } catch (err) {
      toast(err.userFacing ? err.message : friendlyError(err), "err");
      return false;
    }
  });
}

function vRewards() {
  const rw = S.rewards;
  const bal = coinBalance();
  const w = S.wallet || {};
  const code = cleanRefCode(S.profile.refCode);
  const refs = S.myRefs;
  const won = refs.filter((r) => r.status === "rewarded");
  const wonCoins = won.reduce((t, r) => t + (num(r.coins) || rw.referrerCoins), 0);
  const fmt = (n) => Math.round(num(n)).toLocaleString("en-IN");
  if (!rw.enabled && !bal && !S.walletTx.length) {
    return {
      title: "Refer & earn",
      crumb: "Purchases",
      html: empty("i-coin", "Refer & earn is coming soon", "Invite friends to FenxTek and earn E-coins you can spend on courses — like cash at checkout.", `<a class="p-btn p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse courses</span></a>`)
    };
  }

  const hero =
    `<section class="rw-hero${rw.enabled ? "" : " is-solo"}">` +
    `<div class="rw-wallet">` +
    `<span class="rw-k">${icon("i-coin")}FenxTek E-coins</span>` +
    `<div class="rw-bal"><b data-rw-bal>${fmt(bal)}</b><span>coins</span></div>` +
    `<p>Worth ${money(bal)} on courses · 1 E-coin = ₹1</p>` +
    `<div class="rw-wstats"><div><small>Earned</small><b>${fmt(w.earned)}</b></div><div><small>Used</small><b>${fmt(w.spent)}</b></div><div><small>Friends</small><b>${won.length}</b></div></div>` +
    `<a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-cart")}<span>Shop with E-coins</span></a>` +
    `<span class="rw-art">${coin3d("md")}</span>` +
    `</div>` +
    (rw.enabled
      ? `<div class="rw-refer"><span class="sp-k">Refer &amp; earn</span>` +
        `<h2>Invite friends, earn <em>${esc(coinsLabel(rw.referrerCoins))}</em> each</h2>` +
        `<p>${rw.refereeCoins ? `Your friend gets ${esc(coinsLabel(rw.refereeCoins))} too. ` : ""}Coins are added when they buy their first course${rw.minOrder ? ` of ${money(rw.minOrder)} or more` : ""}.</p>` +
        (code
          ? `<div class="rw-code"><div><small>Your referral code</small><b>${esc(code)}</b></div><button type="button" class="p-btn p-btn--ghost p-btn--sm" data-copy="${esc(code)}">${icon("i-copy")}<span>Copy</span></button></div>` +
            `<div class="rw-share">` +
            `<a class="rw-sh rw-sh--wa" href="https://wa.me/?text=${encodeURIComponent(shareText(code))}" target="_blank" rel="noopener">${icon("i-wa")}<span>WhatsApp</span></a>` +
            `<a class="rw-sh rw-sh--tg" href="https://t.me/share/url?url=${encodeURIComponent(refLink(code))}&amp;text=${encodeURIComponent(shareText(code, false))}" target="_blank" rel="noopener">${icon("i-send")}<span>Telegram</span></a>` +
            `<button type="button" class="rw-sh" data-copy-link>${icon("i-link")}<span>Copy link</span></button>` +
            `<button type="button" class="rw-sh" data-share hidden>${icon("i-share")}<span>More</span></button>` +
            `</div>`
          : `<div class="rw-code is-loading"><span class="sp-spin"></span><span>Creating your personal code…</span></div>`) +
        `</div>`
      : "") +
    `</section>`;

  const mine = S.referral;
  const joined = mine
    ? `<div class="rw-joined is-${esc(mine.status || "pending")}">${icon(mine.status === "rewarded" ? "i-check" : mine.status === "void" ? "i-info" : "i-gift")}<div>` +
      (mine.status === "rewarded"
        ? `<b>Welcome bonus received</b><span>${esc(coinsLabel(num(mine.refereeCoins)))} were added to your wallet.</span>`
        : mine.status === "void"
        ? `<b>Referral not eligible</b><span>The academy marked this referral as not eligible.</span>`
        : `<b>You joined with a friend’s code</b><span>${rw.refereeCoins ? `Buy your first course and you’ll get ${esc(coinsLabel(rw.refereeCoins))}.` : "Thanks for joining!"}</span>`) +
      `</div><code>${esc(mine.code || "")}</code></div>`
    : "";

  const canEnter = rw.enabled && !mine && S.referralReady && S.ordersReady && !S.orders.length;
  const enter = canEnter
    ? `<form class="sp-panel rw-enter" id="rwEnter" data-sp-keep novalidate>` +
      `<div><span class="sp-k">Have a referral code?</span><b>${rw.refereeCoins ? `Get ${esc(coinsLabel(rw.refereeCoins))} on your first course` : "Join a friend on FenxTek"}</b></div>` +
      `<div class="rw-enter-row"><input class="p-input" name="code" placeholder="Friend’s code" maxlength="12" autocapitalize="characters" autocomplete="off"><button class="p-btn p-btn--sm" type="submit"><span>Apply</span></button></div></form>`
    : "";

  const steps = rw.enabled
    ? `<section class="sp-panel rw-steps"><span class="sp-k">How it works</span><ol>` +
      [
        ["i-share", "Share your code", "Send your link or code to friends on WhatsApp or Telegram."],
        ["i-user", "Friend joins", "They sign up with your link — or enter your code — before their first purchase."],
        ["i-coin", "You both earn", `You get ${coinsLabel(rw.referrerCoins)}${rw.refereeCoins ? `, they get ${coinsLabel(rw.refereeCoins)}` : ""} once their first payment is confirmed.`],
        ["i-cart", "Spend like cash", `Use E-coins at checkout — up to ${rw.maxRedeemPct}% of any order.`]
      ]
        .map(([ic, t, d], i) => `<li><span class="rw-step-ic">${icon(ic)}<i>${i + 1}</i></span><b>${t}</b><small>${esc(d)}</small></li>`)
        .join("") +
      `</ol></section>`
    : "";

  const refList = rw.enabled || refs.length
    ? `<section class="sp-panel rw-box"><div class="rw-head"><div><span class="sp-k">Your referrals</span><h3>${refs.length ? `${refs.length} friend${refs.length === 1 ? "" : "s"} joined` : "No referrals yet"}</h3></div>${wonCoins ? `<em class="rw-earn">+${fmt(wonCoins)}</em>` : ""}</div>` +
      (refs.length
        ? `<ul class="rw-list">${refs
            .map(
              (r) =>
                `<li><span class="rw-av">${esc(initials(r.name || "Friend", ""))}</span><div><b>${esc(r.name || "Friend")}</b><small>Joined ${esc(formatDate(r.at))}</small></div>` +
                (r.status === "rewarded"
                  ? `<em class="rw-st is-ok">+${fmt(num(r.coins) || rw.referrerCoins)}</em>`
                  : r.status === "void"
                  ? `<em class="rw-st is-off">Not eligible</em>`
                  : `<em class="rw-st">Awaiting purchase</em>`) +
                `</li>`
            )
            .join("")}</ul>`
        : `<p class="rw-emptyline">${icon("i-users")}<span>Share your code — friends who join will show up here.</span></p>`) +
      `</section>`
    : "";

  const tx = S.walletTx;
  const hist =
    `<section class="sp-panel rw-box"><div class="rw-head"><div><span class="sp-k">Coin history</span><h3>${tx.length ? "Recent activity" : "No activity yet"}</h3></div></div>` +
    (tx.length
      ? `<ul class="rw-tx">${tx
          .slice(0, 40)
          .map((t) => {
            const c = num(t.coins);
            const ic = c < 0 ? "i-cart" : t.type === "referral" ? "i-users" : t.type === "welcome" ? "i-gift" : t.type === "refund" ? "i-refresh" : "i-coin";
            const sub = [t.note || t.orderNo || "", formatDate(t.at)].filter(Boolean).join(" · ");
            return `<li><span class="rw-tx-ic${c < 0 ? " is-out" : ""}">${icon(ic)}</span><div><b>${esc(TX_LABEL[t.type] || "E-coins")}</b><small>${esc(sub)}</small></div><em class="${c < 0 ? "is-out" : "is-in"}">${c < 0 ? "−" : "+"}${fmt(Math.abs(c))}</em></li>`;
          })
          .join("")}</ul>`
      : `<p class="rw-emptyline">${icon("i-coin")}<span>Coins you earn and spend will appear here.</span></p>`) +
    `</section>`;

  const html =
    hero +
    joined +
    enter +
    steps +
    `<div class="rw-grid">${refList}${hist}</div>` +
    `<p class="rw-terms">${icon("i-info")}<span>E-coins have no cash value, can’t be transferred and can only be used on FenxTek courses and memberships. Referral rewards are added after the academy confirms the payment; refunded orders don’t qualify.${rw.note ? ` ${esc(rw.note)}` : ""}</span></p>`;

  return {
    title: "Refer & earn",
    crumb: "Purchases",
    html,
    mount(root) {
      if (rw.enabled) ensureRefCode();
      $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
      const cl = $("[data-copy-link]", root);
      if (cl) cl.addEventListener("click", () => copyText(refLink(code)));
      const sh = $("[data-share]", root);
      if (sh && navigator.share) {
        sh.hidden = false;
        sh.addEventListener("click", () => navigator.share({ title: "Join me on FenxTek", text: shareText(code, false), url: refLink(code) }).catch(() => {}));
      }
      const f = $("#rwEnter", root);
      if (f)
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          applyReferral(f.code.value, f.querySelector("button"));
        });
    }
  };
}

/* #ref/<CODE> — landing for a friend's invite link */
function vRef(arg) {
  const code = cleanRefCode(arg);
  const rw = S.rewards;
  const card = (ic, title, text, cta) => ({
    title: "Invitation",
    crumb: "Refer & earn",
    html: `<div class="rw-invite"><div class="rw-inv-card is-plain"><span class="rw-inv-coin">${icon(ic)}</span><h2>${title}</h2><p>${text}</p>${cta}</div></div>`
  });
  const toStore = `<a class="p-btn p-btn--lime" href="#store">${icon("i-bolt")}<span>Browse courses</span></a>`;
  const toRewards = `<a class="p-btn p-btn--lime" href="#rewards">${icon("i-coin")}<span>Refer &amp; earn</span></a>`;
  if (!S.ordersReady || !S.referralReady) return { title: "Invitation", crumb: "Refer & earn", html: skeletonGrid(1) };
  if (!rw.enabled) return card("i-coin", "Referral rewards are paused", "You can still explore courses and memberships — welcome to FenxTek!", toStore);
  if (code.length < 4) return card("i-info", "This invite link looks incomplete", "Ask your friend for their referral code and enter it under Refer &amp; earn.", toRewards);
  if (S.referral) return card("i-check", "You’ve already joined with a referral code", `Code <b>${esc(S.referral.code || "")}</b> is linked to your account.`, toRewards);
  if (code === cleanRefCode(S.profile.refCode)) return card("i-share", "That’s your own invite link", "Share it with friends — you earn E-coins when they buy their first course.", toRewards);
  if (S.orders.length) return card("i-info", "Invites are for new students", "Referral codes apply before the first purchase. Invite your own friends and earn E-coins instead.", toRewards);
  return {
    title: "Invitation",
    crumb: "Refer & earn",
    html:
      `<div class="rw-invite"><div class="rw-inv-card">` +
      `<span class="rw-inv-coin">${icon("i-coin")}</span><span class="sp-k">You’re invited</span>` +
      `<h2>A friend invited you to FenxTek</h2>` +
      `<p>${rw.refereeCoins ? `Accept to get <b>${esc(coinsLabel(rw.refereeCoins))}</b> — that’s ${money(rw.refereeCoins)} off your first course.` : "Accept the invite to join your friend on FenxTek."}</p>` +
      `<div class="rw-code rw-code--center"><div><small>Invite code</small><b>${esc(code)}</b></div></div>` +
      `<button class="p-btn p-btn--lime p-btn--block" type="button" id="rwAccept">${icon("i-gift")}<span>Accept invite</span></button>` +
      `<a class="sp-link" href="#store">Skip for now</a>` +
      `</div></div>`,
    mount(root) {
      $("#rwAccept", root).addEventListener("click", async (e) => {
        if (await applyReferral(code, e.currentTarget)) go("#store");
      });
    }
  };
}

function initials(name, email) {
  const source = String(name || email || "").trim();
  if (!source) return "FX";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "FX";
}

function paintUser() {
  const name = S.profile.name || S.user.displayName || "Student";
  const ini = initials(name, S.user.email);
  const n = $("#dashName");
  const e = $("#dashEmail");
  if (n) n.textContent = name;
  if (e) e.textContent = S.user.email || "—";
  ["#dashAvatar", "#spTopAvatar"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = ini;
  });
}

async function signOut() {
  try {
    await signOutUser();
  } finally {
    location.replace("index.html");
  }
}

function showDenied(message) {
  const loading = $("#dashLoading");
  const body = $("#dashBody");
  const denied = $("#dashDenied");
  if (loading) loading.hidden = true;
  if (body) body.hidden = true;
  if (denied) denied.hidden = false;
  const t = $("#dashDeniedText");
  if (t && message) t.textContent = message;
}

/* ============================================================
   boot
   ============================================================ */
async function init() {
  if (!configured) {
    showDenied("Firebase is not configured yet. Add your project keys to assets/js/firebase-config.js, deploy the database rules, and serve the site over HTTP.");
    return;
  }
  const user = await waitForUser();
  if (!user) {
    location.replace("auth.html?next=" + encodeURIComponent("dashboard.html" + (location.hash || "")));
    return;
  }
  S.user = user;

  let snap = null;
  try {
    snap = await dbGet(`users/${user.uid}`);
  } catch (err) {
    console.warn("[portal] profile read failed", err);
  }
  const existed = Boolean(snap && snap.exists && snap.exists());
  const profile = existed ? snap.val() || {} : {};
  profile.name = profile.name || user.displayName || "";
  profile.email = profile.email || user.email || "";
  S.profile = profile;
  if (!existed) {
    profile.createdAt = Date.now();
    dbSet(`users/${user.uid}`, { name: profile.name, email: profile.email, phone: "", exam: "", createdAt: profile.createdAt, lastLogin: Date.now() }).catch((err) =>
      console.warn("[portal] profile create failed", err)
    );
  } else {
    dbUpdate(`users/${user.uid}`, { lastLogin: Date.now() }).catch(() => {});
  }

  paintNav();
  paintUser();
  paintBadges();

  $("#dashLoading").hidden = true;
  $("#dashDenied").hidden = true;
  $("#dashBody").hidden = false;
  document.documentElement.classList.add("sp-ready");

  $$("[data-sp-drawer]").forEach((b) => b.addEventListener("click", () => (b.dataset.spDrawer === "open" ? openDrawer() : closeDrawer())));
  $("#signOutBtn").addEventListener("click", signOut);
  window.addEventListener("hashchange", () => render());
  render();
  checkInvite();

  /* live data */
  dbWatch(PATH.courses, (v) => {
    S.courses = coursesFrom(v);
    S.coursesReady = true;
    changed("courses");
  });
  dbWatch(PATH.payments, (v) => {
    S.pay = v || {};
    changed("pay");
  });
  dbWatch(PATH.offers, (v) => {
    S.offers = Object.keys(v || {})
      .map((k) => ({ ...v[k], code: k }))
      .filter((o) => o.label && (!num(o.expiresAt) || num(o.expiresAt) > Date.now()));
    changed("offers");
  });
  dbWatch(`${PATH.carts}/${user.uid}`, (v) => {
    S.cart = v && typeof v === "object" ? v : {};
    changed("cart");
  });
  dbWatch(`${PATH.orders}/${user.uid}`, (v) => {
    S.orders = ordersOf(v);
    S.ordersReady = true;
    changed("orders");
  });
  dbWatch(`${PATH.enrollments}/${user.uid}`, (v) => {
    S.enroll = v && typeof v === "object" ? v : {};
    changed("enroll");
  });
  dbWatch(PATH.plans, (v) => {
    S.plans = plansFrom(v);
    S.plansAll = plansFrom(v, { all: true });
    S.plansReady = true;
    changed("plans");
    changed("cart");
  });
  dbWatch(`${CC_PATH.progress}/${user.uid}`, (v) => {
    S.progress = v && typeof v === "object" ? v : {};
    changed("progress");
  });
  dbWatch(PATH.rewards, (v) => {
    S.rewards = rewardsFrom(v);
    changed("rewards");
    changed("cart");
  });
  dbWatch(`${PATH.wallets}/${user.uid}`, (v) => {
    S.wallet = v && typeof v === "object" ? v : null;
    changed("wallet");
  });
  dbWatch(`${PATH.walletTx}/${user.uid}`, (v) => {
    S.walletTx = Object.keys(v || {})
      .map((k) => ({ id: k, ...(v[k] || {}) }))
      .sort((a, b) => num(b.at) - num(a.at));
    changed("wallet");
  });
  dbWatch(`${PATH.referrals}/${user.uid}`, (v) => {
    S.referral = v && typeof v === "object" ? v : null;
    S.referralReady = true;
    changed("refs");
  });
  /* if the rules aren't published yet the watch never answers — don't wait forever */
  setTimeout(() => {
    if (S.referralReady) return;
    S.referralReady = true;
    changed("refs");
  }, 4000);
  dbWatch(`${PATH.referredBy}/${user.uid}`, (v) => {
    S.myRefs = Object.keys(v || {})
      .map((k) => ({ uid: k, ...(v[k] || {}) }))
      .sort((a, b) => num(b.at) - num(a.at));
    changed("refs");
  });
  dbWatch(`members/${user.uid}`, (v) => {
    S.member = v;
    changed("member");
  });
  dbWatch("site/batches", (v) => {
    S.batches = Object.keys(v || {})
      .map((k) => ({ id: k, ...(v[k] || {}) }))
      .sort((a, b) => num(a.order) - num(b.order));
    changed("batches");
  });
  dbWatch("site/content", (v) => {
    S.content = v || {};
    if (S.content.phone) $$("[data-sp-tel]").forEach((a) => a.setAttribute("href", "tel:+" + String(S.content.phone).replace(/[^\d]/g, "")));
    changed("content");
  });

  isAdmin(user)
    .then((admin) => {
      if (!admin) return;
      S.admin = true;
      const link = $("#adminLink");
      if (link) link.hidden = false;
      changed("content");
    })
    .catch(() => {});
}

init().catch((err) => {
  console.error("[portal]", err);
  showDenied("We couldn’t open your portal. Refresh the page or sign in again.");
});
