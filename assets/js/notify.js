/* ============================================================
   FENXTEK — student notification centre (the bell in the portal)
   - personal:  notifications/{uid}   (payment verified, rejected, EMI…)
   - academy:   broadcasts            (filtered by audience + expiry)
   - reminders: EMI dues computed on the device (ctx.extra())
   - unread = newer than users/{uid}/notifSeen; opening the panel marks read
   - optional browser alerts (Notification API) while the portal is open
   ============================================================ */
import { dbWatch, dbUpdate, dbRemove } from "./firebase.js?v=5";
import { NOTIF_PATH, BROADCAST_PATH, NOTIF_KINDS, NOTIF_KIND_ICON, cleanLink, timeAgo } from "./notices.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/* filter tabs: one per kind of notification, in the order they matter to a student */
const KIND_LABEL = { all: "All", info: "Updates", order: "Payments", emi: "Instalments", offer: "Offers", class: "Classes", alert: "Alerts" };
const KIND_EMPTY_ICON = { order: "i-receipt", emi: "i-clock", offer: "i-gift", class: "i-live", alert: "i-bolt", info: "i-info" };
const kindOf = (n) => (NOTIF_KIND_ICON[n && n.kind] ? n.kind : "info");
const startOfDay = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/* Today / Yesterday / Earlier this week / Older */
function bucketOf(ms, now) {
  const days = Math.round((startOfDay(now) - startOfDay(Number(ms) || 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  return "Older";
}

const LS_PUSH = "fx:nt-push";
const LS_ALERTED = "fx:nt-alerted";
const LS_HIDDEN = "fx:nt-hidden";

const N = {
  ctx: null,
  personal: [],
  broadcasts: [],
  seen: 0,
  openSeen: 0, // "new" highlight while the panel is open
  open: false,
  filter: "all", // which tab the student is looking at (all | info | order | …)
  ready: { p: false, b: false },
  alerted: new Set(),
  hidden: new Set(),
  booted: false
};

const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* private mode */
  }
};

export function initNotify(ctx) {
  if (N.booted || !ctx || !ctx.uid) return;
  N.booted = true;
  N.ctx = ctx;
  N.seen = Number(ctx.seen) || 0;
  N.alerted = new Set(lsGet(LS_ALERTED, []));
  N.hidden = new Set(lsGet(LS_HIDDEN, []));
  mountUI();
  dbWatch(`${NOTIF_PATH}/${ctx.uid}`, (v) => {
    N.personal = Object.entries(v || {})
      .filter(([, n]) => n && typeof n === "object")
      .map(([id, n]) => ({ ...n, id, personal: true }));
    N.ready.p = true;
    refresh();
  });
  dbWatch(BROADCAST_PATH, (v) => {
    N.broadcasts = Object.entries(v || {})
      .filter(([, n]) => n && typeof n === "object")
      .map(([id, n]) => ({ ...n, id, broadcast: true }));
    N.ready.b = true;
    refresh();
  });
  /* EMI reminders depend on the clock */
  setInterval(refresh, 5 * 60000);
}

/* called by the portal whenever orders / courses / membership change */
let tm = 0;
export function refreshNotify() {
  if (!N.booted) return;
  clearTimeout(tm);
  tm = setTimeout(refresh, 120);
}

function audienceOk(b) {
  const a = String(b.audience || "all");
  if (a === "all") return true;
  const me = (N.ctx.audience && N.ctx.audience()) || {};
  if (a === "members") return Boolean(me.member);
  if (a === "buyers") return Boolean(me.buyer);
  if (a.startsWith("course:")) return Boolean(me.courses && me.courses.has(a.slice(7)));
  if (a.startsWith("student:")) return a.slice(8) === N.ctx.uid;
  return false;
}

function items() {
  const now = Date.now();
  const extra = (N.ctx.extra && N.ctx.extra()) || [];
  return [
    ...N.personal,
    ...N.broadcasts.filter((b) => audienceOk(b) && (!Number(b.expiresAt) || Number(b.expiresAt) > now) && Number(b.at) <= now + 60000 && !N.hidden.has(b.id)),
    ...extra
  ]
    .filter((n) => n && n.title)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, 60);
}

const unreadOf = (list) => list.filter((n) => Number(n.at || 0) > N.seen).length;

function refresh() {
  const list = items();
  paintBadge(unreadOf(list));
  if (N.open) paintPanel(list);
  if (N.ready.p && N.ready.b) alertNew(list);
}

/* ---------------- UI ---------------- */
function mountUI() {
  const tools = $(".sp-top-tools");
  if (tools && !$("#ntBell")) {
    const cart = tools.querySelector(".sp-cart-btn");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ntBell";
    btn.className = "sp-icon-btn nt-bell";
    btn.setAttribute("aria-label", "Notifications");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `${icon("i-bell")}<i class="nt-ping" aria-hidden="true"></i><b class="sp-count nt-count" hidden>0</b>`;
    tools.insertBefore(btn, cart || null);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      N.open ? close() : open();
    });
  }
  if (!$("#ntPanel")) {
    const p = document.createElement("div");
    p.id = "ntPanel";
    p.className = "nt-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Notifications");
    p.hidden = true;
    document.body.appendChild(p);
    p.addEventListener("click", onPanelClick);
  }
  document.addEventListener("click", (e) => {
    if (!N.open) return;
    /* re-rendering the list detaches the clicked row mid-dispatch — that is
       still an inside click, so don't let it count as "clicked outside" */
    if (!document.body.contains(e.target)) return;
    if (e.target.closest("#ntPanel") || e.target.closest("#ntBell")) return;
    close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && N.open) close();
  });
  window.addEventListener("hashchange", () => N.open && close());
}

function paintBadge(n) {
  const b = $("#ntBell .nt-count");
  if (!b) return;
  const was = b.hidden ? 0 : b.textContent;
  b.hidden = !n;
  b.textContent = n > 9 ? "9+" : String(n);
  if (String(was) !== b.textContent) {
    b.classList.remove("is-bump");
    void b.offsetWidth;
    b.classList.add("is-bump");
  }
  $("#ntBell").classList.toggle("has-new", n > 0);
  document.title = document.title.replace(/^\(\d+\+?\) /, "");
  if (n) document.title = `(${n > 9 ? "9+" : n}) ${document.title}`;
}

function open() {
  N.open = true;
  N.openSeen = N.seen;
  const p = $("#ntPanel");
  p.hidden = false;
  requestAnimationFrame(() => p.classList.add("is-open"));
  $("#ntBell").setAttribute("aria-expanded", "true");
  const list = items();
  paintPanel(list);
  markRead();
}

function close() {
  N.open = false;
  const p = $("#ntPanel");
  p.classList.remove("is-open");
  setTimeout(() => !N.open && (p.hidden = true), 180);
  const b = $("#ntBell");
  if (b) b.setAttribute("aria-expanded", "false");
}

function markRead() {
  const now = Date.now();
  if (N.seen >= now - 1000) return;
  N.seen = now;
  paintBadge(0);
  dbUpdate(`users/${N.ctx.uid}`, { notifSeen: now }).catch((err) => console.warn("[notify] seen", err));
}

function pushState() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && lsGet(LS_PUSH, false) ? "on" : "off";
}

function paintPanel(list) {
  const p = $("#ntPanel");
  if (!p) return;
  const newCount = list.filter((n) => Number(n.at || 0) > N.openSeen).length;
  const ps = pushState();
  /* tab counts — only the kinds this student actually has */
  const counts = { all: list.length };
  list.forEach((n) => {
    const k = kindOf(n);
    counts[k] = (counts[k] || 0) + 1;
  });
  /* keep the open tab visible even once it is empty, so dismissing the
     last row in it shows "no X yet" instead of jumping back to All */
  if (!NOTIF_KINDS.includes(N.filter)) N.filter = "all";
  const tabs = ["all", ...NOTIF_KINDS.filter((k) => counts[k] || k === N.filter)];
  const shown = N.filter === "all" ? list : list.filter((n) => kindOf(n) === N.filter);
  p.innerHTML =
    `<header class="nt-head">` +
    `<span class="nt-glow" aria-hidden="true"></span>` +
    `<div class="nt-head-t"><span class="nt-k">Notification centre</span>` +
    `<b>${newCount ? `${newCount} new` : list.length ? "You’re all caught up" : "Nothing yet"}</b></div>` +
    (newCount ? `<span class="nt-newpill">${newCount} unread</span>` : "") +
    `<button class="nt-x" type="button" data-nt-close aria-label="Close">${icon("i-x")}</button>` +
    `</header>` +
    (list.length && tabs.length > 2
      ? `<div class="nt-tabs" role="tablist" aria-label="Filter notifications">${tabs
          .map(
            (k) =>
              `<button type="button" class="nt-tab${N.filter === k ? " is-on" : ""}" data-nt-filter="${esc(k)}" role="tab" aria-selected="${N.filter === k}">` +
              `${esc(KIND_LABEL[k] || k)}<i>${counts[k]}</i></button>`
          )
          .join("")}</div>`
      : "") +
    listHTML(shown) +
    `<div class="nt-foot">` +
    `<span class="nt-foot-note">${icon("i-bell")}${list.length} notification${list.length === 1 ? "" : "s"}</span>` +
    (ps === "unsupported"
      ? `<span class="nt-foot-note is-quiet">${icon("i-info")}This browser can’t show alerts</span>`
      : ps === "blocked"
      ? `<span class="nt-foot-note is-quiet">${icon("i-info")}Alerts are blocked in browser settings</span>`
      : `<button type="button" class="nt-push${ps === "on" ? " is-on" : ""}" data-nt-push><span class="nt-switch" aria-hidden="true"></span>Alerts on this device</button>`) +
    `</div>`;
}

/* grouped by when it landed — sticky labels inside the scrolling list */
function listHTML(shown) {
  if (!shown.length) {
    const f = N.filter;
    const only = f !== "all";
    return (
      `<div class="nt-empty">${icon(only ? KIND_EMPTY_ICON[f] || "i-bell" : "i-bell")}` +
      `<b>${only ? `No ${esc((KIND_LABEL[f] || "notification").toLowerCase())} yet` : "No notifications yet"}</b>` +
      `<p>${only ? "Nothing here right now — new ones will land in this tab." : "Payment updates, instalment reminders and news from the academy will show up here."}</p></div>`
    );
  }
  const now = Date.now();
  let out = "";
  let last = "";
  shown.forEach((n) => {
    const g = bucketOf(Number(n.at || 0), now);
    if (g !== last) {
      last = g;
      const fresh = shown.filter((x) => bucketOf(Number(x.at || 0), now) === g && Number(x.at || 0) > N.openSeen).length;
      out += `<p class="nt-group"><span>${g}</span>${fresh ? `<i>${fresh} new</i>` : ""}</p>`;
    }
    out += itemHTML(n);
  });
  return `<div class="nt-list">${out}</div>`;
}

function itemHTML(n) {
  const link = cleanLink(n.link);
  const kind = kindOf(n);
  const isNew = Number(n.at || 0) > N.openSeen;
  const src = n.virtual ? "Reminder" : n.broadcast ? "FenxTek academy" : "For you";
  const ext = link.startsWith("http");
  return (
    /* stretched link instead of a button inside an anchor — valid, and the whole row stays clickable */
    `<article class="nt-item nt-item--${kind}${isNew ? " is-new" : ""}${link ? " is-link" : ""}" data-nt-id="${esc(n.id)}">` +
    (link ? `<a class="nt-go" href="${esc(link)}"${ext ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(n.title)}"></a>` : "") +
    `<span class="nt-ic">${icon(NOTIF_KIND_ICON[kind])}</span>` +
    `<span class="nt-body"><b>${esc(n.title)}</b>${n.body ? `<span class="nt-text">${esc(n.body)}</span>` : ""}` +
    `<span class="nt-meta"><em class="nt-src">${esc(src)}</em><i aria-hidden="true"></i><small>${esc(timeAgo(n.at))}</small></span></span>` +
    (n.virtual
      ? ""
      : `<span class="nt-acts"><button class="nt-del" type="button" data-nt-del="${esc(n.id)}" data-nt-kind="${n.personal ? "p" : "b"}" aria-label="Dismiss">${icon("i-x")}</button></span>`) +
    `<span class="nt-bar" aria-hidden="true"></span>` +
    `</article>`
  );
}

function onPanelClick(e) {
  if (e.target.closest("[data-nt-close]")) return close();
  const tab = e.target.closest("[data-nt-filter]");
  if (tab) {
    e.stopPropagation();
    N.filter = tab.dataset.ntFilter;
    paintPanel(items());
    return;
  }
  const del = e.target.closest("[data-nt-del]");
  if (del) {
    e.preventDefault();
    e.stopPropagation();
    const id = del.dataset.ntDel;
    if (del.dataset.ntKind === "p") {
      N.personal = N.personal.filter((n) => n.id !== id);
      dbRemove(`${NOTIF_PATH}/${N.ctx.uid}/${id}`).catch((err) => console.warn("[notify] delete", err));
    } else {
      N.hidden.add(id);
      lsSet(LS_HIDDEN, [...N.hidden].slice(-200));
    }
    refresh();
    return;
  }
  const push = e.target.closest("[data-nt-push]");
  if (push) return togglePush();
  const go = e.target.closest(".nt-go");
  if (go && go.getAttribute("href").startsWith("#")) setTimeout(close, 30);
}

async function togglePush() {
  if (!("Notification" in window)) return;
  if (pushState() === "on") {
    lsSet(LS_PUSH, false);
  } else {
    const res = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
    lsSet(LS_PUSH, res === "granted");
    if (res === "granted") {
      try {
        new Notification("Alerts are on", { body: "We’ll ping you here about payments, instalments and academy news while the portal is open.", icon: "fenxtek-logo.png", tag: "fx-welcome" });
      } catch (e) {
        /* some mobiles only allow alerts from a service worker */
      }
    }
  }
  paintPanel(items());
}

/* toast / browser alert for things that arrive while the portal is open */
let first = true;
function alertNew(list) {
  const fresh = list.filter((n) => !N.alerted.has(n.id));
  fresh.forEach((n) => N.alerted.add(n.id));
  if (fresh.length) lsSet(LS_ALERTED, [...N.alerted].slice(-300));
  if (first) {
    /* first load: only surface reminders and items newer than the last visit */
    first = false;
    const late = fresh.filter((n) => Number(n.at || 0) > N.seen && (n.virtual || Date.now() - Number(n.at || 0) < 3 * 86400000));
    if (late.length && N.ctx.toast) N.ctx.toast(late.length === 1 ? late[0].title : `${late.length} new notifications — tap the bell`);
    return;
  }
  fresh
    .filter((n) => Number(n.at || 0) > N.seen)
    .slice(0, 3)
    .forEach((n) => {
      if (N.ctx.toast && !document.hidden) N.ctx.toast(n.title);
      if (pushState() === "on" && (document.hidden || !document.hasFocus())) {
        try {
          const note = new Notification(n.title, { body: n.body || "", icon: "fenxtek-logo.png", tag: n.id });
          note.onclick = () => {
            window.focus();
            const l = cleanLink(n.link);
            if (l && l.startsWith("#")) location.hash = l;
            note.close();
          };
        } catch (e) {
          /* ignore */
        }
      }
    });
}
