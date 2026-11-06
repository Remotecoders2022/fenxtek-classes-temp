/* ============================================================
   FENXTEK — student portal (app shell)
   Hash-routed single page: Home, My courses, Course store,
   course detail, Cart + coupons, checkout (Razorpay / UPI / free),
   order success, Orders & receipts, Membership and Profile.

   Adding a section later = add one entry to ROUTES (+ a view fn).
   ============================================================ */

import {
  configured,
  waitForUser,
  signOutUser,
  isAdmin,
  dbGet,
  dbSet,
  dbUpdate,
  dbWatch,
  dbUpdateRoot,
  dbKey,
  friendlyError
} from "./firebase.js?v=4";
import { membershipStatus, daysLeft, safeImageUrl, safeDataImage } from "./media.js?v=2";
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
  upiLink
} from "./commerce.js?v=1";
import { downloadReceipt, receiptDataURL } from "./receipt.js?v=1";

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
  batches: [],
  coupon: null, // { code, coupon, usedCount, usedByMe }
  filters: { q: "", cat: "all", sort: "featured" },
  busy: false
};

const courseById = (id) => S.courses.find((c) => c.id === id) || null;
const cartIds = () => Object.keys(S.cart || {}).sort((a, b) => num(S.cart[a]) - num(S.cart[b]));
const cartItems = () => cartIds().map(courseById).filter(Boolean);

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
  { id: "home", label: "Home", icon: "i-home", group: "Learn", tab: "Home", view: vHome, deps: ["courses", "enroll", "cart", "orders", "member", "batches", "content"] },
  { id: "my-courses", label: "My courses", icon: "i-book", group: "Learn", tab: "Learn", view: vMyCourses, deps: ["courses", "enroll"] },
  { id: "store", label: "Course store", icon: "i-bolt", group: "Learn", tab: "Store", view: vStore, deps: ["courses", "enroll", "cart", "offers"] },
  { id: "live", label: "Live classes", icon: "i-live", group: "Learn", soon: true, blurb: "Join scheduled live dictation and doubt sessions right from the portal." },
  { id: "tests", label: "Test series", icon: "i-test", group: "Learn", soon: true, blurb: "Timed exam-pattern transcription tests with error analysis and rank." },
  { id: "notes", label: "Notes & PDFs", icon: "i-file", group: "Learn", soon: true, blurb: "Outlines, phrase lists and dictation passages, organised by course." },
  { id: "cart", label: "Cart", icon: "i-cart", group: "Purchases", tab: "Cart", badge: "cart", view: vCart, deps: ["courses", "cart", "enroll", "offers", "pay"] },
  { id: "orders", label: "Orders & receipts", icon: "i-receipt", group: "Purchases", view: vOrders, deps: ["orders"] },
  { id: "membership", label: "Membership", icon: "i-crown", group: "Purchases", view: vMembership, deps: ["member"] },
  { id: "profile", label: "Profile", icon: "i-user", group: "Account", tab: "Profile", view: vProfile, deps: [] },
  /* detail screens (not in the menu) */
  { id: "course", parent: "store", view: vCourse, deps: ["courses", "enroll", "cart", "offers"] },
  { id: "learn", parent: "my-courses", view: vLearn, deps: ["courses", "enroll"] },
  { id: "success", parent: "orders", view: vSuccess, deps: ["orders"] },
  { id: "receipt", parent: "orders", view: vReceipt, deps: ["orders"] }
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
  return `<div class="sp-cover" data-cover="${esc(c.id)}" data-size="${size || "md"}">${coverHTML(c, coverSrc(c), { size })}</div>`;
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
  return (
    `<div class="sp-price${big ? " sp-price--big" : ""}">` +
    `<b>${c.price ? money(c.price) : "Free"}</b>` +
    (off ? `<s>${money(c.mrp)}</s><em>${off}% off</em>` : "") +
    `</div>`
  );
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

function courseCard(c) {
  const a = access(c.id);
  return (
    `<article class="sp-card" data-id="${esc(c.id)}">` +
    `<a class="sp-card-media" href="#course/${esc(c.id)}" aria-label="${esc(c.title)}">${cover(c, "md")}` +
    (a && a.active ? `<span class="sp-owned-tag">${icon("i-check")}Enrolled</span>` : "") +
    `</a>` +
    `<div class="sp-card-body">` +
    `<a class="sp-card-title" href="#course/${esc(c.id)}">${esc(c.title)}</a>` +
    (c.subtitle ? `<p class="sp-card-sub">${esc(c.subtitle)}</p>` : "") +
    `<ul class="sp-meta"><li>${icon("i-clock")}${esc(validityLabel(c.validityDays))}</li><li>${icon("i-headphones")}${esc(c.mode)}</li></ul>` +
    `<div class="sp-card-foot">${priceHTML(c)}<div class="sp-card-cta">${buyButtons(c, true)}</div></div>` +
    `</div></article>`
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
}

function sectionHead(k, title, link) {
  return `<div class="sp-sec-head"><div><span class="sp-k">${esc(k)}</span><h2>${title}</h2></div>${link || ""}</div>`;
}

/* ============================================================
   cart + coupon actions
   ============================================================ */
async function addToCart(id, btn, thenGo) {
  const c = courseById(id);
  if (!c) return;
  if (owns(id) && !thenGo) {
    toast("You’re already enrolled in this course.");
    return;
  }
  if (S.cart[id]) {
    if (thenGo) go("#cart");
    return;
  }
  const at = Date.now();
  S.cart = { ...S.cart, [id]: at };
  changed("cart");
  try {
    await dbSet(`${PATH.carts}/${S.user.uid}/${id}`, at);
    if (thenGo) go("#cart");
    else toast(`Added “${c.title}” to your cart`);
  } catch (err) {
    const next = { ...S.cart };
    delete next[id];
    S.cart = next;
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

function couponCheck() {
  if (!S.coupon) return null;
  return checkCoupon({ ...S.coupon, items: cartItems() });
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
      const check = checkCoupon({ ...info, items: cartItems() });
      if (!check.ok) {
        toast(check.reason, "err");
        return false;
      }
      S.coupon = info;
      const pricing = priceCart(cartItems(), { coupon: info.coupon, check });
      toast(`Coupon ${code} applied — you save ${money(pricing.discount)}`);
      changed("cart");
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
async function placeOrder({ status, method, extra = {} }) {
  const items = cartItems();
  if (!items.length) throw new Error("Your cart is empty.");
  const uid = S.user.uid;
  let check = couponCheck();
  if (S.coupon && !(check && check.ok)) {
    S.coupon = null;
    check = null;
  }
  const pricing = priceCart(items, S.coupon ? { coupon: S.coupon.coupon, check } : null);
  const oid = await dbKey(`${PATH.orders}/${uid}`);
  const orderNo = orderNumber();
  const now = Date.now();

  const itemMap = {};
  items.forEach((c) => {
    itemMap[c.id] = {
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

  const updates = {};
  updates[`${PATH.carts}/${uid}`] = null;

  if (S.coupon && pricing.discount > 0) {
    const fresh = await fetchCoupon(S.coupon.code);
    const again = checkCoupon({ ...fresh, items });
    if (!again.ok) {
      S.coupon = null;
      changed("cart");
      throw new Error(again.reason + " Your total has been updated — please review and pay again.");
    }
    order.coupon = { code: fresh.code, type: fresh.coupon.type, value: num(fresh.coupon.value), discount: pricing.discount };
    updates[`${PATH.couponUsage}/${fresh.code}/count`] = fresh.usedCount + 1;
    updates[`${PATH.couponUsage}/${fresh.code}/users/${uid}`] = oid;
  }

  if (status === "paid") {
    items.forEach((c) => {
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
  if (status === "paid") {
    Object.keys(updates)
      .filter((k) => k.startsWith(`${PATH.enrollments}/`))
      .forEach((k) => (S.enroll[k.split("/").pop()] = updates[k]));
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
    `<p>${pricing.count} course${pricing.count === 1 ? "" : "s"}${pricing.discount ? ` · coupon saves ${money(pricing.discount)}` : ""}</p></div>`
  );
}

function openCheckout() {
  const items = cartItems();
  if (!items.length) return;
  const check = couponCheck();
  const pricing = priceCart(items, S.coupon && check && check.ok ? { coupon: S.coupon.coupon, check } : null);
  const pay = S.pay || {};

  if (pricing.total === 0) {
    openModal(
      payHeader(pricing) +
        `<div class="sp-pay-free">${icon("i-gift")}<p>Your coupon covers the full amount. Confirm to enrol instantly — a receipt is generated for your records.</p></div>` +
        `<button class="p-btn p-btn--lime p-btn--block" type="button" id="spFreeGo">${icon("i-check")}<span>Confirm &amp; enrol</span></button>`,
      {
        onMount: (m) => {
          $("#spFreeGo", m).addEventListener("click", (e) =>
            busy(e.currentTarget, "Enrolling", async () => {
              lockModal(true);
              try {
                const o = await placeOrder({ status: "paid", method: "free" });
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
              ? `<span class="sp-method-ic">${icon("i-card")}</span><span><b>Card, UPI, netbanking, wallets</b><small>Instant enrolment · powered by Razorpay</small></span>`
              : `<span class="sp-method-ic">${icon("i-qr")}</span><span><b>Pay by UPI QR / UPI ID</b><small>Enrolled after the academy verifies your payment</small></span>`) +
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
      notes: { uid: S.user.uid, coupon: S.coupon ? S.coupon.code : "" },
      theme: { color: "#5A4BFF" },
      handler: async (resp) => {
        openModal(`<div class="sp-processing"><span class="sp-spin sp-spin--lg"></span><h3>Confirming your payment…</h3><p>Please don’t close this window.</p></div>`, { locked: true });
        try {
          const o = await placeOrder({ status: "paid", method: "razorpay", extra: { paymentId: String(resp.razorpay_payment_id || "") } });
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
              const o = await placeOrder({ status: "pending", method: "upi", extra: { utr } });
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
    if (!window.qrcode) await loadScript("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js");
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
    (ann ? `<section class="sp-announce">${icon("i-bolt")}<div><span class="sp-k">From the academy</span><p>${esc(ann)}</p></div></section>` : "") +
    `<section class="sp-sec">` +
    sectionHead("Continue", "My courses", activeOwned.length ? `<a class="sp-link" href="#my-courses">View all ${icon("i-arr")}</a>` : "") +
    (activeOwned.length
      ? `<div class="sp-rail">${activeOwned.slice(0, 4).map(ownedCard).join("")}</div>`
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
  return { title: "Home", crumb: "Student portal", html, mount: bindAdd };
}

function stat(ic, value, label, href) {
  return `<a class="sp-stat" href="${href}"><span class="sp-stat-ic">${icon(ic)}</span><b>${esc(value)}</b><span>${esc(label)}</span></a>`;
}

function ownedCard(c) {
  const a = access(c.id);
  const pct = a && a.until ? Math.round((1 - a.progress) * 100) : 100;
  return (
    `<a class="sp-owned${a && a.active ? "" : " is-expired"}" href="#learn/${esc(c.id)}">` +
    `${cover(c, "sm")}` +
    `<div class="sp-owned-body"><b>${esc(c.title)}</b>` +
    `<span class="sp-owned-meta">${a && a.active ? (a.until ? `${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left · till ${formatDate(a.until)}` : "Lifetime access") : `Expired on ${formatDate(a && a.until)}`}</span>` +
    `<span class="sp-bar"><i style="width:${pct}%"></i></span></div>` +
    `<span class="sp-owned-go">${icon(a && a.active ? "i-play" : "i-refresh")}</span></a>`
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
        (active.length ? `<div class="sp-owned-grid">${active.map(ownedCard).join("")}</div>` : `<p class="sp-muted">No active courses — renew one below.</p>`) +
        `</section>` +
        (expired.length
          ? `<section class="sp-sec">${sectionHead("History", `Expired <span class="sp-pill-n">${expired.length}</span>`)}<div class="sp-owned-grid">${expired.map(ownedCard).join("")}</div></section>`
          : "")
      : empty("i-book", "You haven’t enrolled in a course yet", "Browse the store, add a course to your cart and apply a coupon if you have one.", `<a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-bolt")}<span>Explore courses</span></a>`));
  return { title: "My courses", html };
}

function vStore() {
  const f = S.filters;
  const cats = Array.from(new Set(S.courses.map((c) => c.category)));
  const offer = S.offers[0];
  const html =
    (offer
      ? `<div class="sp-offer">${icon("i-gift")}<span>Use code <b>${esc(offer.code)}</b> — ${esc(offer.label)}</span><button type="button" class="sp-offer-copy" data-copy="${esc(offer.code)}">${icon("i-copy")}Copy</button></div>`
      : "") +
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
        (off ? `<p class="sp-buy-save">You save ${money(c.mrp - c.price)} on MRP</p>` : "") +
        `<ul class="sp-buy-facts"><li>${icon("i-clock")}${esc(validityLabel(c.validityDays))}</li><li>${icon("i-headphones")}${esc(c.mode)} · ${esc(c.language)}</li><li>${icon("i-receipt")}Instant receipt (PNG)</li></ul>` +
        (S.cart[c.id]
          ? `<a class="p-btn p-btn--lime p-btn--block" href="#cart">${icon("i-cart")}<span>Go to cart</span></a>`
          : `<button class="p-btn p-btn--lime p-btn--block" type="button" data-buy="${esc(c.id)}">${icon("i-bolt")}<span>Buy now</span></button>` +
            `<button class="p-btn p-btn--ghost p-btn--block" type="button" data-add="${esc(c.id)}">${icon("i-cart")}<span>Add to cart</span></button>`)) +
    (offers.length && !(a && a.active)
      ? `<div class="sp-buy-offers"><span class="p-label">Offers for this course</span>${offers
          .map((o) => `<button type="button" class="sp-coupon-tile" data-copy="${esc(o.code)}">${icon("i-tag")}<span><b>${esc(o.code)}</b><small>${esc(o.label)}</small></span>${icon("i-copy")}</button>`)
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
    (desc ? `<section class="sp-panel sp-prose"><span class="sp-k">About</span><h3>Course overview</h3>${desc}</section>` : "") +
    `<section class="sp-panel sp-howto"><span class="sp-k">How it works</span><h3>Enrol in three steps</h3><ol>` +
    `<li><b>Add to cart</b><span>Apply a coupon code if you have one.</span></li>` +
    `<li><b>Pay securely</b><span>Card, UPI or netbanking — receipt is instant.</span></li>` +
    `<li><b>Start learning</b><span>Class links unlock under My courses.</span></li></ol></section>` +
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
  if (S.coursesReady) {
    cartIds()
      .filter((id) => !courseById(id))
      .forEach((id) => dbSet(`${PATH.carts}/${S.user.uid}/${id}`, null).catch(() => {}));
  }
  if (!items.length) {
    return {
      title: "Cart",
      crumb: "Purchases",
      html: empty("i-cart", "Your cart is empty", "Add courses from the store — you can apply a coupon at checkout.", `<a class="p-btn p-btn--lime p-btn--sm" href="#store">${icon("i-bolt")}<span>Browse courses</span></a>`)
    };
  }
  const check = couponCheck();
  if (S.coupon && check && !check.ok) {
    /* cart changed so the coupon no longer applies */
    setTimeout(() => toast(check.reason + " Coupon removed.", "err"), 0);
    S.coupon = null;
  }
  const applied = S.coupon && check && check.ok ? { coupon: S.coupon.coupon, check } : null;
  const p = priceCart(items, applied);
  const offers = S.offers.filter((o) => {
    const ids = couponScopeIds(o);
    return !ids || items.some((c) => ids.includes(c.id));
  });
  const phoneOk = /\d{10}/.test(String(S.profile.phone || "").replace(/\D/g, ""));

  const html =
    `<div class="sp-cart">` +
    `<div class="sp-cart-main">` +
    `<section class="sp-panel sp-panel--flush"><div class="sp-cart-head"><h3>${items.length} course${items.length === 1 ? "" : "s"} in cart</h3><a class="sp-link" href="#store">${icon("i-plus")}Add more</a></div>` +
    `<ul class="sp-lines">` +
    items
      .map((c) => {
        const disc = applied && applied.check.eligibleIds.includes(c.id);
        return (
          `<li class="sp-line">` +
          `<a class="sp-line-cover" href="#course/${esc(c.id)}">${cover(c, "xs")}</a>` +
          `<div class="sp-line-body"><a href="#course/${esc(c.id)}" class="sp-line-title">${esc(c.title)}</a>` +
          `<span class="sp-line-meta">${esc(validityLabel(c.validityDays))} · ${esc(c.mode)}${owns(c.id) ? ` · <em>renewal</em>` : ""}</span>` +
          (disc ? `<span class="sp-line-coupon">${icon("i-tag")}Coupon applied</span>` : "") +
          `</div>` +
          `<div class="sp-line-price">${priceHTML(c)}<button type="button" class="sp-line-rm" data-rm="${esc(c.id)}" aria-label="Remove ${esc(c.title)}">${icon("i-trash")}<span>Remove</span></button></div>` +
          `</li>`
        );
      })
      .join("") +
    `</ul></section>` +
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
      ? `<div class="sp-applied">${icon("i-tag")}<div><b>${esc(S.coupon.code)}</b><span>${esc(couponLabel(S.coupon.coupon))} · saving ${money(p.discount)}</span></div><button type="button" class="sp-icon-btn" id="spCouponRm" aria-label="Remove coupon">${icon("i-x")}</button></div>`
      : `<form class="sp-coupon" id="spCoupon" data-sp-keep novalidate><input class="p-input" name="code" placeholder="Enter coupon code" autocomplete="off" autocapitalize="characters" maxlength="24"><button class="p-btn p-btn--sm" type="submit"><span>Apply</span></button></form>` +
        (offers.length
          ? `<div class="sp-offers">${offers
              .slice(0, 4)
              .map((o) => `<button type="button" class="sp-coupon-tile" data-apply="${esc(o.code)}">${icon("i-tag")}<span><b>${esc(o.code)}</b><small>${esc(o.label)}</small></span><em>Apply</em></button>`)
              .join("")}</div>`
          : "")) +
    `</section>` +
    `<section class="sp-panel sp-summary"><span class="sp-k">Order summary</span>` +
    `<dl>` +
    `<div><dt>MRP total</dt><dd>${money(p.mrpTotal)}</dd></div>` +
    (p.courseSavings ? `<div class="is-save"><dt>Course discount</dt><dd>− ${money(p.courseSavings)}</dd></div>` : "") +
    (p.discount ? `<div class="is-save"><dt>Coupon (${esc(S.coupon.code)})</dt><dd>− ${money(p.discount)}</dd></div>` : "") +
    `<div class="is-total"><dt>To pay</dt><dd>${money(p.total)}</dd></div>` +
    `</dl>` +
    (p.savings ? `<p class="sp-savebar">${icon("i-gift")}You’re saving ${money(p.savings)} on this order</p>` : "") +
    `<button class="p-btn p-btn--lime p-btn--block sp-paybtn" type="button" id="spCheckout">${icon("i-shield")}<span>${p.total ? `Proceed to pay ${money(p.total)}` : "Enrol for free"}</span></button>` +
    `<p class="sp-pay-note">${icon("i-lock")}Inclusive of all taxes · Receipt generated instantly</p>` +
    `</section></aside></div>` +
    `<div class="sp-mpay"><div><span>To pay</span><b>${money(p.total)}</b>${p.savings ? `<small>Saving ${money(p.savings)}</small>` : ""}</div>` +
    `<button class="p-btn p-btn--lime" type="button" id="spMPay">${icon("i-shield")}<span>${p.total ? "Pay now" : "Enrol free"}</span></button></div>`;

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
          `<div class="sp-order-foot"><div class="sp-order-amt"><b>${money(o.total)}</b>${num(o.discount) ? `<small>Coupon ${esc((o.coupon && o.coupon.code) || "")} · −${money(o.discount)}</small>` : ""}</div>` +
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
  const html =
    `<section class="sp-success${paid ? "" : " is-pending"}">` +
    `<div class="sp-success-burst" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * (360 / 14)}deg;--d:${(i % 4) * 0.05}s"></i>`).join("")}</div>` +
    `<span class="sp-success-ic">${icon(paid ? "i-check" : "i-clock")}</span>` +
    `<span class="sp-k">${paid ? "Payment successful" : "Payment submitted"}</span>` +
    `<h2>${paid ? "You’re enrolled!" : "We’re verifying your payment"}</h2>` +
    `<p>${paid ? "Your course is unlocked under My courses. Your premium receipt is ready to download." : `The academy will match UTR <b>${esc(o.utr || "")}</b> with the payment and unlock your course — you’ll see it under My courses.`}</p>` +
    `<div class="sp-success-card"><div><span>Order</span><b>${esc(o.orderNo)}</b></div><div><span>Amount</span><b>${money(o.total)}</b></div><div><span>Courses</span><b>${items.length}</b></div>${num(o.discount) ? `<div><span>Saved</span><b>${money(Math.max(0, num(o.mrpTotal) - num(o.total)))}</b></div>` : ""}</div>` +
    `<div class="sp-success-cta">` +
    (paid
      ? `<button class="p-btn p-btn--lime" type="button" id="spDl">${icon("i-download")}<span>Download receipt (PNG)</span></button><a class="p-btn" href="#my-courses">${icon("i-play")}<span>Start learning</span></a>`
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

function vLearn(id) {
  const c = courseById(id) || (S.enroll[id] ? coursesFrom({ [id]: { title: S.enroll[id].title || "Course", price: 0, validityDays: 0 } }, { all: true })[0] : null);
  const a = access(id);
  if (!c || !a) {
    return { title: "Course", html: empty("i-lock", "You’re not enrolled in this course", "Buy it from the store to unlock the classes.", `<a class="p-btn p-btn--sm" href="#course/${esc(id)}">${icon("i-bolt")}<span>View course</span></a>`) };
  }
  const html =
    `<a class="sp-back" href="#my-courses">${icon("i-chev-l")}My courses</a>` +
    `<section class="sp-learn-head">${cover(c, "sm")}<div><span class="sp-k">${a.active ? "Enrolled" : "Expired"}</span><h2>${esc(c.title)}</h2>` +
    `<p>${a.until ? (a.active ? `Access till ${formatDate(a.until)} · ${a.daysLeft} days left` : `Expired on ${formatDate(a.until)}`) : "Lifetime access"}</p>` +
    `<span class="sp-bar sp-bar--wide"><i style="width:${a.until ? Math.round((1 - a.progress) * 100) : 100}%"></i></span></div></section>` +
    (a.active
      ? `<section class="sp-panel" id="spAccess"><div class="sp-skel"></div><div class="sp-skel sp-skel--short"></div></section>`
      : `<section class="sp-panel">${empty("i-refresh", "Your access has ended", "Renew to unlock the classes again — any coupon offers apply.", `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-add="${esc(c.id)}">${icon("i-cart")}<span>Renew course</span></button>`)}</section>`);
  return {
    title: c.title,
    crumb: "My courses",
    html,
    mount(root) {
      bindAdd(root);
      if (!a.active) return;
      dbGet(`${PATH.courseAccess}/${id}`)
        .then((snap) => {
          const v = (snap && snap.val && snap.val()) || {};
          const links = Array.isArray(v.links) ? v.links.filter(Boolean) : Object.values(v.links || {});
          const box = $("#spAccess", root);
          if (!box) return;
          box.innerHTML =
            `<span class="sp-k">Classroom</span><h3>Your class links</h3>` +
            (v.message ? `<p class="sp-learn-msg">${esc(v.message)}</p>` : "") +
            (links.length
              ? `<div class="sp-res">${links
                  .map((l) => {
                    const url = safeImageUrl(l.url);
                    if (!url) return "";
                    const kind = /t\.me|telegram/i.test(url) ? "i-send" : /youtu/i.test(url) ? "i-play" : /zoom|meet\.google/i.test(url) ? "i-live" : /drive|docs\.google|\.pdf/i.test(url) ? "i-file" : "i-link";
                    return `<a class="sp-res-a" href="${esc(url)}" target="_blank" rel="noopener">${icon(kind)}<span><b>${esc(l.label || "Open link")}</b><small>${esc(url.replace(/^https?:\/\//, "").slice(0, 48))}</small></span>${icon("i-arr-ur")}</a>`;
                  })
                  .join("")}</div>`
              : !v.message
              ? `<p class="sp-muted">Your classroom is being set up. The academy will add class links, recordings and PDFs here — check back soon or message us on Telegram.</p>`
              : "");
        })
        .catch(() => {
          const box = $("#spAccess", root);
          if (box) box.innerHTML = `<p class="sp-muted">Class links will appear here once the academy publishes them.</p>`;
        });
    }
  };
}

function vMembership() {
  const rec = S.member;
  const st = membershipStatus(rec);
  let body;
  if (st.key === "none") {
    body = empty("i-crown", "No membership yet", "Pick a plan on the Membership page — once the academy confirms your payment, your plan and validity show up here.", `<a class="p-btn p-btn--sm" href="membership.html#plans">${icon("i-arr-ur")}<span>See membership plans</span></a>`);
  } else {
    const left = daysLeft(rec);
    const start = num(rec.startAt);
    const end = num(rec.endAt);
    const pct = end > start ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
    body =
      `<section class="sp-member">` +
      `<div class="sp-member-top"><span class="sp-member-ic">${icon("i-crown")}</span><div><span class="sp-k sp-k--light">Membership</span><h2>${esc(rec.planName || "Membership")}</h2></div>` +
      `<span class="sp-status sp-status--${st.key === "active" ? "ok" : "muted"}">${esc(st.label)}</span></div>` +
      `<div class="sp-member-dates"><div><span>Started</span><b>${esc(formatDate(start))}</b></div><div><span>Valid till</span><b>${end ? esc(formatDate(end)) : "Open-ended"}</b></div><div><span>Days left</span><b>${left == null ? "∞" : left}</b></div></div>` +
      (end ? `<span class="sp-bar sp-bar--light"><i style="width:${(100 - pct).toFixed(1)}%"></i></span>` : "") +
      `<a class="p-btn p-btn--lime p-btn--sm" href="membership.html#plans">${icon("i-arr-ur")}<span>${st.key === "active" ? "Compare plans" : "Renew membership"}</span></a>` +
      `</section>`;
  }
  return { title: "Membership", crumb: "Purchases", html: body };
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
    `<form class="dash-form" id="profileForm" novalidate>` +
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
    `</aside></div>`;
  return {
    title: "Profile",
    crumb: "Account",
    html,
    mount(root) {
      $("#signOutBtn2", root).addEventListener("click", signOut);
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
