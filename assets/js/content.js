/* ============================================================
   FENXTEK — live content
   Every public page declares (via <body data-page>) which RTDB
   nodes it needs; PAGE_MAP below wires each page to exactly those
   nodes so no page downloads data it does not show. Whenever a node
   is missing (or Firebase is not set up) the static HTML stays.
   ============================================================ */

import { configured, dbWatch, dbGet, dbPush, onAuthChange, toList } from "./firebase.js?v=5";
import {
  esc,
  pad,
  rupees,
  toLines,
  formatDate,
  safeImageUrl,
  membershipStatus,
  daysLeft,
  achievementSource,
  createAchievementImageLoader,
  hydrateAchievementImages,
  dataUrlToObjectUrl,
  imageExtension
} from "./media.js?v=2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const page = document.body.getAttribute("data-page") || "home";
const handle = (v) => String(v || "").trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/+$/, "");
const loadAchImage = createAchievementImageLoader(dbGet);

/* ---------------- page -> RTDB map ----------------
   Keep in sync with the README "Page map" table. */
export const PAGE_MAP = {
  home: ["content", "testimonials", "achievementsPreview"],
  courses: ["content", "batches", "fees"],
  exams: ["content"],
  method: ["content"],
  about: ["content", "testimonials"],
  membership: ["content", "memberships", "faqs", "myMembership"],
  achievements: ["content", "achievements"],
  contact: ["content", "planEnquiry"],
  auth: ["content"],
  forgot: ["content"],
  dashboard: ["content"],
  admin: [],
  "404": ["content"]
};

/* ---------------- scalars ---------------- */

function setText(key, value) {
  if (value == null || value === "") return;
  document.querySelectorAll(`[data-cms="${key}"]`).forEach((el) => {
    el.textContent = String(value);
  });
}

function setCount(key, value) {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!isFinite(n) || n <= 0) return;
  document.querySelectorAll(`[data-cms-count="${key}"]`).forEach((el) => {
    el.dataset.count = String(n);
    el.textContent = Math.round(n).toLocaleString("en-IN");
  });
}

function setLink(selector, href) {
  document.querySelectorAll(selector).forEach((a) => a.setAttribute("href", href));
}

export function applyContent(data) {
  if (!data || typeof data !== "object") return;

  setText("heroLead", data.heroLead);
  setText("price", data.price);
  setCount("price", data.price);
  setText("directorName", data.directorName);
  setText("directorMessage", data.directorMessage);

  setCount("students", data.students);
  setCount("dictations", data.dictations);
  setCount("patterns", data.patterns);

  if (data.phone) {
    setText("phone", data.phone);
    const tel = "tel:+" + String(data.phone).replace(/[^\d]/g, "");
    setLink('[data-cms-link="phone"]', tel);
    document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.setAttribute("href", tel));
  }

  if (data.email) {
    setText("email", data.email);
    const mail = "mailto:" + String(data.email).trim();
    setLink('[data-cms-link="email"]', mail);
    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => a.setAttribute("href", mail));
  }

  if (data.telegram) {
    const h = handle(data.telegram);
    setText("telegram", "@" + h);
    setText("telegramHandle", "@" + h);
    const url = "https://t.me/" + h;
    setLink('[data-cms-link="telegram"]', url);
    document.querySelectorAll('a[href*="t.me/"]').forEach((a) => a.setAttribute("href", url));
  }

  if (data.instagram) {
    const h = handle(data.instagram);
    setText("instagram", "@" + h);
    setText("instagramHandle", "@" + h);
    const url = "https://www.instagram.com/" + h + "/";
    setLink('[data-cms-link="instagram"]', url);
    document.querySelectorAll('a[href*="instagram.com/"]').forEach((a) => a.setAttribute("href", url));
  }
}

/* ---------------- collections ---------------- */

export function renderBatches(value) {
  const wrap = document.querySelector("[data-batch-grid]") || document.querySelector(".batch-list");
  if (!wrap) return;
  const list = toList(value);
  setText("batchCount", pad(list.length));
  if (!list.length) {
    wrap.innerHTML = '<p class="cms-empty">New batches are being finalised — check back soon.</p>';
    return;
  }
  wrap.innerHTML = list
    .map((b, i) => {
      const name = b.title || b.name || "Batch";
      const tag = b.tag || b.mode || "";
      const banner = safeImageUrl(b.banner || b.bannerUrl || "");
      const thumb = banner
        ? `<span class="bcard-img"><img src="${esc(banner)}" alt="${esc(name)} banner" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>`
        : "";
      return (
        `<a class="bcard cms-fade${banner ? " has-banner" : ""}" href="contact.html" data-tag="${esc(tag)}" style="--d:${((i % 8) * 0.04).toFixed(2)}s">` +
        thumb +
        `<span class="bcard-top"><span class="bcard-n">${pad(i + 1)}</span>${tag ? `<span class="bcard-tag">${esc(tag)}</span>` : ""}</span>` +
        `<b class="bcard-name">${esc(name)}</b>` +
        `<span class="bcard-cta">Enquire <svg><use href="#i-arr-ur"/></svg></span></a>`
      );
    })
    .join("");
}

export function renderFees(value) {
  const wrap = document.querySelector(".fees-grid");
  if (!wrap) return;
  const list = toList(value);
  if (!list.length) {
    wrap.innerHTML = '<p class="cms-empty cms-empty--dark">Fee plans are being updated.</p>';
    return;
  }
  const clean = (v) => String(v == null ? "" : v).replace(/^₹\s*/, "").trim();
  const prices = [];
  wrap.innerHTML = list
    .map((f, i) => {
      const price = clean(f.price);
      const was = clean(f.was);
      const p = num(price);
      const w = num(was);
      if (isFinite(p) && p > 0) prices.push(p);
      const save = isFinite(p) && isFinite(w) && w > p && p > 0 ? Math.round((1 - p / w) * 100) : 0;
      return (
        `<article class="fcard cms-fade" style="--d:${((i % 8) * 0.04).toFixed(2)}s">` +
        `<span class="fcard-tag">${esc(f.note || f.tag || "Course")}</span>` +
        `<b class="fcard-name">${esc(f.label || f.name || "Plan")}</b>` +
        `<span class="fcard-price">${price ? `<small>₹</small>${esc(rupees(price))}` : "On request"}${was ? `<s>₹${esc(rupees(was))}</s>` : ""}</span>` +
        (save ? `<em class="fcard-save">Save ${save}%</em>` : "") +
        `<a class="fcard-cta" href="contact.html">Enquire <svg><use href="#i-arr"/></svg></a></article>`
      );
    })
    .join("");
  if (prices.length) setText("feeFrom", rupees(String(Math.min.apply(null, prices))));
}

export function renderFaqs(value) {
  const wrap = document.querySelector(".faq-list");
  if (!wrap) return;
  const list = toList(value);
  setText("faqCount", pad(list.length));
  if (!list.length) {
    wrap.innerHTML = '<p class="cms-empty">No questions yet.</p>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (f, i) =>
        `<div class="faq cms-fade" data-dynamic="1">` +
        `<button class="faq-btn" aria-expanded="false">` +
        `<span class="faq-n">${pad(i + 1)}</span>` +
        `<span class="faq-q">${esc(f.q || f.question || "")}</span>` +
        `<span class="faq-plus"><svg><use href="#i-plus"/></svg></span>` +
        `</button>` +
        `<div class="faq-a"><div><p>${esc(f.a || f.answer || "")}</p></div></div></div>`
    )
    .join("");
}

export function renderTestimonials(value) {
  const wrap = document.querySelector(".voices-grid");
  if (!wrap) return;
  const list = toList(value);
  if (!list.length) {
    wrap.innerHTML = '<p class="cms-empty cms-empty--dark">Student stories are being collected — check back soon.</p>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (v, i) =>
        `<figure class="voice cms-fade" style="--d:${(i * 0.08).toFixed(2)}s">` +
        `<span class="voice-mark" aria-hidden="true">&ldquo;</span>` +
        `<blockquote>${esc(v.quote || v.text || "")}</blockquote>` +
        `<footer><span><b>${esc(v.name || "Student")}</b><small>${esc(v.exam || v.result || "")}</small></span>` +
        `<span class="v-ok">${esc(v.badge || "Cleared")}</span></footer></figure>`
    )
    .join("");
}

/* ---------------- memberships ---------------- */

const activePlans = (value) => toList(value).filter((p) => p && p.active !== false && (p.name || p.title));
const num = (v) => Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""));
export const PLAN_THEMES = ["ink", "violet", "gold", "pearl"];

/* Explicit theme from the CRM, otherwise: highlighted plan = midnight,
   the rest cycle through violet / gold / pearl. */
function planThemes(plans) {
  let k = 0;
  const cycle = ["violet", "gold", "pearl"];
  return plans.map((p) => {
    if (PLAN_THEMES.includes(p.theme)) return p.theme;
    if (p.highlight) return "ink";
    return cycle[k++ % cycle.length];
  });
}

function planMaths(p) {
  const price = num(p.price);
  const was = num(p.was);
  const days = Number(p.durationDays) || 0;
  const save = was > price && price > 0 ? Math.round(((was - price) / was) * 100) : 0;
  let perDay = "";
  if (price > 0 && days > 0) {
    const d = price / days;
    perDay = d >= 10 ? String(Math.round(d)) : d.toFixed(1).replace(/\.0$/, "");
  }
  return { price, was, save, perDay };
}

function planVisual(p, i, theme) {
  const name = p.name || p.title || "Membership";
  const dur = p.duration || (p.durationDays ? p.durationDays + " days" : "Flexible");
  const yr = String(new Date().getFullYear()).slice(-2);
  return (
    `<div class="mvis mvis--${theme}"><div class="mvis-in">` +
    `<div class="mvis-row"><img src="fenxtek-logo.png" alt="" width="30" height="30"><span class="mvis-brand">FenxTek<small>Membership</small></span><span class="mvis-chip" aria-hidden="true"></span></div>` +
    `<div class="mvis-name">${esc(name)}</div>` +
    `<div class="mvis-row mvis-foot"><span><small>Valid</small>${esc(dur)}</span><span><small>Member no.</small>FX · ${pad(i + 1)} · ${yr}</span><span class="mvis-mark" aria-hidden="true">✦</span></div>` +
    `<span class="mvis-sheen" aria-hidden="true"></span></div></div>`
  );
}

function planCard(p, i, theme) {
  const name = p.name || p.title || "Membership";
  const m = planMaths(p);
  const feats = toLines(p.features)
    .map((f) => `<li><svg><use href="#i-check"/></svg><span>${esc(f)}</span></li>`)
    .join("");
  const dur = p.duration || (p.durationDays ? p.durationDays + " days" : "");
  const sub = [
    m.was > m.price ? `<s>₹${esc(rupees(m.was))}</s>` : "",
    m.save ? `<span class="mcard-save">Save ${m.save}%</span>` : "",
    m.perDay ? `<span class="mcard-day">≈ ₹${esc(m.perDay)} a day</span>` : ""
  ].join("");
  return (
    `<article class="mcard${p.highlight ? " mcard--hot" : ""} cms-fade" style="--d:${(i * 0.07).toFixed(2)}s" data-plan="${esc(p.id || "")}" data-theme="${theme}">` +
    `<div class="mcard-top"><span class="mcard-n">Tier ${pad(i + 1)}</span>${p.highlight ? `<span class="mcard-flag">${esc(p.badge || "Most popular")}</span>` : ""}</div>` +
    `<div class="mcard-vis" data-tilt>${planVisual(p, i, theme)}</div>` +
    `<div class="mcard-body">` +
    `<h3 class="mcard-name">${esc(name)}</h3>` +
    (p.tagline ? `<p class="mcard-tag">${esc(p.tagline)}</p>` : "") +
    `<div class="mcard-price">${m.price ? `<span class="mcard-cur">₹</span><b>${esc(rupees(m.price))}</b>` : "<b>Free</b>"}${dur ? `<span class="mcard-per">/ ${esc(dur)}</span>` : ""}</div>` +
    (sub ? `<div class="mcard-sub">${sub}</div>` : "") +
    `<a class="mcard-cta" href="contact.html?plan=${encodeURIComponent(p.id || "")}"><span>${esc(p.cta || "Choose plan")}</span><svg><use href="#i-arr"/></svg></a>` +
    (feats ? `<span class="mcard-inc">What’s included</span><ul class="mcard-feats">${feats}</ul>` : "") +
    `</div></article>`
  );
}

/* Hero: fan out up to three plan cards, highlighted plan in front. */
function renderPlanStack(plans, themes) {
  const stack = document.querySelector("[data-plan-stack]");
  if (!stack || !plans.length) return;
  const idx = plans.map((p, i) => i);
  const hot = idx.find((i) => plans[i].highlight);
  const order = (hot == null ? idx : [hot].concat(idx.filter((i) => i !== hot))).slice(0, 3);
  stack.innerHTML = order
    .map((pi, k) => `<div class="mstack-card" style="--i:${k}"${k === 0 ? " data-tilt" : ""}>${planVisual(plans[pi], pi, themes[pi])}</div>`)
    .reverse()
    .join("");
  stack.dataset.cols = String(order.length);
  bindTilt(stack);
}

export function renderMemberships(value) {
  const wrap = document.querySelector("[data-plan-grid]");
  if (!wrap) return;
  const plans = activePlans(value);
  setText("planCount", pad(plans.length));
  if (!plans.length) {
    wrap.innerHTML = '<p class="cms-empty">New membership plans are on the way — contact the academy for current offers.</p>';
    wrap.dataset.cols = "0";
    return;
  }
  const themes = planThemes(plans);
  wrap.dataset.cols = String(Math.min(plans.length, 4));
  wrap.innerHTML = plans.map((p, i) => planCard(p, i, themes[i])).join("");
  bindTilt(wrap);
  renderPlanStack(plans, themes);

  /* The membership hero shows the lowest active plan price. */
  const prices = plans.map((p) => num(p.price)).filter((n) => isFinite(n) && n > 0);
  if (prices.length) {
    const min = String(Math.min.apply(null, prices));
    document.querySelectorAll('[data-cms="planFrom"]').forEach((el) => (el.textContent = rupees(min)));
  }
}

/* Pointer tilt + moving sheen on the membership card visuals. */
const canTilt = window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function bindTilt(root) {
  if (!canTilt) return;
  (root || document).querySelectorAll("[data-tilt]").forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = "1";
    const host = el.closest(".mcard") || el;
    host.addEventListener(
      "pointermove",
      (e) => {
        const r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        el.style.setProperty("--ry", ((x - 0.5) * 14).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y) * 10).toFixed(2) + "deg");
        el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        el.classList.add("is-tilting");
      },
      { passive: true }
    );
    host.addEventListener("pointerleave", () => {
      el.classList.remove("is-tilting");
      ["--rx", "--ry", "--mx", "--my"].forEach((k) => el.style.removeProperty(k));
    });
  });
}

function bindMyMembership() {
  const box = document.querySelector("[data-my-membership]");
  if (!box) return;
  let stop = () => {};
  onAuthChange((user) => {
    stop();
    if (!user) {
      box.hidden = true;
      return;
    }
    dbWatch(`members/${user.uid}`, (rec) => {
      const st = membershipStatus(rec);
      if (st.key === "none") {
        box.hidden = false;
        box.dataset.state = "none";
        box.innerHTML =
          `<span class="mm-dot"></span><span class="mm-txt"><b>You are signed in</b>` +
          `<span>No membership on your account yet — pick a plan below and the academy will activate it.</span></span>` +
          `<a class="mm-link" href="dashboard.html">My dashboard <svg><use href="#i-arr-ur"/></svg></a>`;
        return;
      }
      const left = daysLeft(rec);
      box.hidden = false;
      box.dataset.state = st.key;
      box.innerHTML =
        `<span class="mm-dot"></span><span class="mm-txt"><b>${esc(rec.planName || "Membership")} · ${esc(st.label)}</b>` +
        `<span>${rec.endAt ? `Valid till ${esc(formatDate(Number(rec.endAt)))}` : "Open-ended"}${
          st.key === "active" && left != null ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""
        }</span></span>` +
        `<a class="mm-link" href="dashboard.html">My dashboard <svg><use href="#i-arr-ur"/></svg></a>`;
    }).then((off) => {
      stop = off || (() => {});
    });
  });
}

/* Contact page: ?plan=<id> pre-selects a membership enquiry. */
let enquiryPlan = "";
async function bindPlanEnquiry() {
  const id = new URLSearchParams(location.search).get("plan");
  const chip = document.querySelector("[data-plan-enquiry]");
  if (!id || !chip || !/^[\w-]{1,64}$/.test(id)) return;
  let name = "";
  try {
    const snap = await dbGet(`site/memberships/${id}`);
    const p = snap && snap.val ? snap.val() : null;
    if (p) name = p.name || p.title || "";
    if (p && p.price) name += ` · ₹${rupees(p.price)}`;
  } catch (err) {
    console.warn("[content] plan lookup", err);
  }
  if (!name) return;
  enquiryPlan = name;
  chip.hidden = false;
  chip.innerHTML = `<svg><use href="#i-award"/></svg><span>Enquiring about <b>${esc(name)}</b></span><a href="membership.html#plans">Change</a>`;
}

/* ---------------- achievements ---------------- */

const publishedAchievements = (value) =>
  toList(value).filter((a) => a && a.published !== false && (a.caption || a.title));

const achWhen = (a) => {
  const d = a && a.date ? new Date(String(a.date) + (/^\d{4}-\d{2}-\d{2}$/.test(String(a.date)) ? "T00:00:00" : "")).getTime() : NaN;
  return isFinite(d) ? d : Number(a && (a.createdAt || a.updatedAt)) || 0;
};

/* <img> for a post. Width/height (stored by the CRM) reserve the right
   shape before the picture arrives, so the wall never jumps around. */
function achievementImg(a, src, alt) {
  const w = Number(a.width) || 0;
  const h = Number(a.height) || 0;
  const dims = w && h ? ` width="${w}" height="${h}" style="aspect-ratio:${w}/${h}"` : "";
  if (src.kind === "link") return `<img src="${esc(src.url)}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ach-link${dims}>`;
  if (src.kind === "upload") return `<img data-ach-img="${esc(src.id)}" alt="${alt}" decoding="async"${dims}>`;
  return "";
}

function achievementCard(a, i, opts = {}) {
  const src = achievementSource(a);
  const alt = esc(a.title || a.caption || "FenxTek achievement");
  const w = Number(a.width) || 0;
  const h = Number(a.height) || 0;
  const tall = w && h && h / w > 1.45;
  const date = formatDate(a.date);
  const long = String(a.caption || "").length > 170 || String(a.caption || "").split("\n").length > 4;
  const state = src.kind === "none" ? " is-broken" : " is-loading";
  return (
    `<figure class="ach-card cms-fade${state}${tall ? " is-tall" : ""}" data-ach-card data-idx="${i}" style="--d:${((i % 6) * 0.05).toFixed(2)}s">` +
    /* Badges sit above the photo, never on it, so nothing hides the result. */
    `<div class="ach-top">${a.tag ? `<span class="ach-tag">${esc(a.tag)}</span>` : "<span></span>"}<span class="ach-no" aria-hidden="true">No. ${pad(i + 1)}</span></div>` +
    `<button class="ach-media" type="button" aria-label="Open full screen: ${alt}"${opts.noLightbox ? ' tabindex="-1"' : ""}>` +
    `<span class="ach-mat">${achievementImg(a, src, alt)}</span>` +
    `<span class="ach-ph" aria-hidden="true"><svg><use href="#i-image"/></svg><em>Photo unavailable</em></span>` +
    `<span class="ach-open" aria-hidden="true"><svg><use href="#i-zoom"/></svg><span>${opts.noLightbox ? "View" : tall ? "Open to read in full" : "Tap to read"}</span></span>` +
    `</button>` +
    `<figcaption>` +
    (date ? `<span class="ach-meta"><i></i>${esc(date)}</span>` : "") +
    (a.title ? `<b class="ach-title">${esc(a.title)}</b>` : "") +
    (a.caption ? `<p class="ach-cap${long ? " is-long" : ""}">${esc(a.caption)}</p>` : "") +
    (long && !opts.noLightbox ? `<button class="ach-more" type="button">Read full post <svg><use href="#i-arr"/></svg></button>` : "") +
    `</figcaption></figure>`
  );
}

let achList = [];
let achFilter = "all";
const achVisible = () => (achFilter === "all" ? achList : achList.filter((a) => (a.tag || "") === achFilter));

function paintAchievementGrid() {
  const grid = document.querySelector("[data-ach-grid]");
  if (!grid) return;
  const list = achVisible();
  const showing = document.querySelector("[data-ach-showing]");
  if (showing) showing.textContent = list.length ? `Showing ${pad(list.length)} of ${pad(achList.length)}` : "";
  if (!list.length) {
    grid.innerHTML = `<p class="cms-empty">${achList.length ? "No posts under this filter yet." : "Our students’ results will be posted here soon — check back after the next exam."}</p>`;
    return;
  }
  grid.innerHTML = list.map((a) => achievementCard(a, achList.indexOf(a))).join("");
  hydrateAchievementImages(grid, loadAchImage);
}

function paintAchievementFilters() {
  const bar = document.querySelector("[data-ach-filters]");
  if (!bar) return;
  const counts = {};
  achList.forEach((a) => a.tag && (counts[a.tag] = (counts[a.tag] || 0) + 1));
  const tags = Object.keys(counts);
  if (tags.length < 2) {
    bar.hidden = true;
    achFilter = "all";
    return;
  }
  if (achFilter !== "all" && !tags.includes(achFilter)) achFilter = "all";
  bar.hidden = false;
  bar.innerHTML = ["all"]
    .concat(tags)
    .map(
      (t) =>
        `<button type="button" class="ach-chip" data-ach-filter="${esc(t)}" aria-pressed="${String(t === achFilter)}">` +
        `${esc(t === "all" ? "All posts" : t)}<em>${pad(t === "all" ? achList.length : counts[t])}</em></button>`
    )
    .join("");
}

/* Hero spotlight: the newest post as a framed print. If its picture
   cannot load, the next post (up to 4) takes its place. */
function paintAchievementSpotlight(k = 0) {
  const spot = document.querySelector("[data-ach-spot]");
  if (!spot || !achList.length) return;
  const pool = achList.filter((x) => achievementSource(x).kind !== "none").slice(0, 4);
  const a = pool[k] || achList[0];
  const i = achList.indexOf(a);
  const src = achievementSource(a);
  const alt = esc(a.title || a.caption || "FenxTek achievement");
  const date = formatDate(a.date);
  spot.innerHTML =
    `<span class="aspot-back aspot-back--1" aria-hidden="true"></span><span class="aspot-back aspot-back--2" aria-hidden="true"></span>` +
    `<figure class="aspot-card is-loading" data-ach-card data-idx="${i}">` +
    `<button class="aspot-media" type="button" data-ach-open="${i}" aria-label="Open full screen: ${alt}">${achievementImg(a, src, alt)}` +
    `<span class="ach-ph" aria-hidden="true"><svg><use href="#i-image"/></svg><em>Photo unavailable</em></span></button>` +
    `<figcaption><span class="aspot-k"><i></i>Latest result${date ? " · " + esc(date) : ""}</span>` +
    `<b>${esc(a.title || a.tag || "FenxTek achiever")}</b>` +
    (a.caption ? `<p>${esc(a.caption)}</p>` : "") +
    `<button class="aspot-btn" type="button" data-ach-open="${i}">Open post <svg><use href="#i-arr"/></svg></button></figcaption></figure>`;
  const card = spot.querySelector(".aspot-card");
  if (pool[k + 1]) card.addEventListener("ach:broken", () => paintAchievementSpotlight(k + 1), { once: true });
  hydrateAchievementImages(spot, loadAchImage);
}

/* Ticker of the latest post titles (falls back to the static list). */
function paintAchievementTicker() {
  const t = document.querySelector("[data-ach-ticker]");
  if (!t) return;
  const words = achList.map((a) => a.title || a.tag).filter(Boolean).slice(0, 10);
  if (words.length < 2) return;
  const row = `<div class="mq">${words.map((w) => `<span>${esc(w)}</span><i>✦</i>`).join("")}</div>`;
  t.innerHTML = row + row;
}

export function renderAchievements(value) {
  achList = publishedAchievements(value);
  setText("achCount", pad(achList.length));
  const tags = new Set(achList.map((a) => a.tag).filter(Boolean));
  setText("achTags", pad(tags.size));
  const latest = achList.reduce((m, a) => Math.max(m, achWhen(a)), 0);
  if (latest) setText("achLatest", formatDate(latest, { day: "2-digit", month: "short" }));
  paintAchievementFilters();
  paintAchievementGrid();
  paintAchievementSpotlight();
  paintAchievementTicker();
}

export function renderAchievementsPreview(value) {
  const section = document.querySelector("[data-ach-preview]");
  if (!section) return;
  const list = publishedAchievements(value).slice(0, 3);
  const grid = section.querySelector("[data-ach-preview-grid]");
  if (!list.length || !grid) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  grid.innerHTML = list.map((a, i) => achievementCard(a, i, { noLightbox: true })).join("");
  grid.querySelectorAll(".ach-media").forEach((b) => b.addEventListener("click", () => (location.href = "achievements.html")));
  hydrateAchievementImages(grid, loadAchImage);
}

/* ---------- Lightbox: fit / zoom / pan / swipe / download ---------- */
function bindLightbox() {
  const box = document.getElementById("achBox");
  if (!box) return;
  const stage = box.querySelector("[data-lb-stage]");
  const img = box.querySelector(".lb-img");
  const err = box.querySelector(".lb-err");
  const cap = box.querySelector(".lb-cap");
  const meta = box.querySelector(".lb-meta");
  const count = box.querySelector(".lb-count");
  const zoomBtn = box.querySelector('[data-lb="zoom"]');
  const dlBtn = box.querySelector('[data-lb="download"]');
  const openBtn = box.querySelector('[data-lb="open"]');
  let list = [];
  let idx = -1;
  let token = 0;
  let current = "";
  let zoomed = false;
  let lastFocus = null;

  const setZoom = (on, cx, cy) => {
    if (on && !current) return;
    const r = stage.getBoundingClientRect();
    /* Remember which point of the picture was clicked (0..1). */
    const ir = img.getBoundingClientRect();
    const px = cx != null && ir.width ? Math.min(1, Math.max(0, (cx - ir.left) / ir.width)) : 0.5;
    const py = cy != null && ir.height ? Math.min(1, Math.max(0, (cy - ir.top) / ir.height)) : 0;
    zoomed = on;
    if (on) {
      const nw = img.naturalWidth || r.width;
      const fitW = ir.width || r.width;
      /* Readable size: natural pixels, at least the stage width, at most 3x. */
      let zw = Math.max(r.width, Math.min(nw, r.width * 3));
      if (zw < fitW * 1.4) zw = Math.min(fitW * 2.2, Math.max(nw * 2, fitW * 1.6));
      img.style.width = Math.round(zw) + "px";
    } else img.style.width = "";
    stage.classList.toggle("is-zoom", on);
    zoomBtn.setAttribute("aria-pressed", String(on));
    zoomBtn.querySelector("span").textContent = on ? "Fit to screen" : "Zoom in";
    zoomBtn.querySelector("use").setAttribute("href", on ? "#i-zoom-out" : "#i-zoom");
    if (on) {
      requestAnimationFrame(() => {
        stage.scrollLeft = img.offsetWidth * px - stage.clientWidth / 2;
        stage.scrollTop = img.offsetHeight * py - (cy != null ? stage.clientHeight / 2 : 0);
      });
    } else {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
  };

  const setActions = (url, a) => {
    current = url;
    const ok = Boolean(url);
    zoomBtn.disabled = !ok;
    openBtn.disabled = !ok;
    dlBtn.classList.toggle("is-off", !ok);
    if (!ok) {
      dlBtn.removeAttribute("href");
      return;
    }
    const slug = String(a.title || a.tag || "achievement").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "achievement";
    dlBtn.href = url;
    dlBtn.setAttribute("download", `fenxtek-${slug}.${imageExtension(url)}`);
    /* Cross-origin links ignore "download": open them in a new tab instead. */
    if (/^https?:/i.test(url)) dlBtn.setAttribute("target", "_blank");
    else dlBtn.removeAttribute("target");
  };

  const show = (i) => {
    if (!list.length) return;
    idx = (i + list.length) % list.length;
    const a = list[idx];
    const src = achievementSource(a);
    const my = ++token;
    setZoom(false);
    setActions("", a);
    img.removeAttribute("src");
    img.hidden = true;
    err.hidden = true;
    img.alt = a.title || a.caption || "Achievement";
    box.classList.add("is-loading");
    const fail = () => {
      if (my !== token) return;
      box.classList.remove("is-loading");
      img.hidden = true;
      err.hidden = false;
      setActions("", a);
    };
    const done = (url) => {
      if (my !== token) return; /* a newer slide was opened meanwhile */
      if (!url) return fail();
      img.onload = () => {
        if (my !== token) return;
        box.classList.remove("is-loading");
        img.hidden = false;
        setActions(url, a);
      };
      img.onerror = fail;
      img.src = url;
    };
    if (src.kind === "link") done(src.url);
    else if (src.kind === "upload") loadAchImage(src.id).then(done);
    else fail();
    meta.textContent = [a.tag, formatDate(a.date)].filter(Boolean).join(" · ");
    cap.innerHTML = (a.title ? `<b>${esc(a.title)}</b>` : "") + (a.caption ? `<span>${esc(a.caption)}</span>` : "");
    cap.scrollTop = 0;
    count.textContent = `${pad(idx + 1)} / ${pad(list.length)}`;
    box.classList.toggle("is-single", list.length < 2);
  };

  const open = (a) => {
    list = achVisible();
    let i = list.indexOf(a);
    if (i < 0) {
      list = achList;
      i = list.indexOf(a);
    }
    if (i < 0) return;
    lastFocus = document.activeElement;
    show(i);
    box.hidden = false;
    document.body.classList.add("locked");
    requestAnimationFrame(() => box.classList.add("open"));
    box.querySelector(".lb-close").focus();
  };
  const close = () => {
    token++;
    box.classList.remove("open");
    document.body.classList.remove("locked");
    setTimeout(() => {
      box.hidden = true;
      setZoom(false);
    }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-ach-grid] .ach-media, [data-ach-grid] .ach-more, [data-ach-open]");
    if (!trigger) return;
    const card = trigger.closest("[data-ach-card]");
    const a = achList[Number(trigger.dataset.achOpen != null ? trigger.dataset.achOpen : card && card.dataset.idx)];
    if (a) open(a);
  });

  box.addEventListener("click", (e) => {
    if (e.target === box || e.target === stage || e.target.closest(".lb-close")) return close();
    if (e.target.closest(".lb-prev")) show(idx - 1);
    if (e.target.closest(".lb-next")) show(idx + 1);
    if (e.target.closest('[data-lb="zoom"]')) setZoom(!zoomed);
    if (e.target.closest('[data-lb="open"]') && current) {
      const url = /^data:/i.test(current) ? dataUrlToObjectUrl(current) : current;
      if (url) window.open(url, "_blank", "noopener");
    }
  });

  /* Click the photo to zoom at that point; drag to pan while zoomed. */
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target !== img || e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
    e.preventDefault();
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (zoomed && drag.moved) {
      stage.scrollLeft = drag.sl - dx;
      stage.scrollTop = drag.st - dy;
      stage.classList.add("is-drag");
    }
  });
  addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove("is-drag");
    if (!d.moved) setZoom(!zoomed, e.clientX, e.clientY);
  });

  /* Touch: double-tap zooms, horizontal swipe browses (when not zoomed). */
  let touch = null;
  let lastTap = 0;
  stage.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return (touch = null);
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    },
    { passive: true }
  );
  stage.addEventListener("touchend", (e) => {
    if (!touch) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touch.x;
    const dy = p.clientY - touch.y;
    const now = Date.now();
    if (!zoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && list.length > 1) {
      show(dx < 0 ? idx + 1 : idx - 1);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && e.target === img) {
      if (now - lastTap < 320) {
        e.preventDefault();
        setZoom(!zoomed, p.clientX, p.clientY);
        lastTap = 0;
      } else lastTap = now;
    }
    touch = null;
  });

  addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") return zoomed ? setZoom(false) : close();
    if (e.key === "ArrowLeft" && !zoomed) show(idx - 1);
    if (e.key === "ArrowRight" && !zoomed) show(idx + 1);
    if ((e.key === "+" || e.key === "=" || e.key === "z") && !zoomed) setZoom(true);
    if ((e.key === "-" || e.key === "0") && zoomed) setZoom(false);
    if (e.key === "Tab") {
      /* keep focus inside the dialog */
      const f = Array.from(box.querySelectorAll("button:not([disabled]),a[href]")).filter((el) => el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });

  const bar = document.querySelector("[data-ach-filters]");
  if (bar) {
    bar.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-ach-filter]");
      if (!chip) return;
      achFilter = chip.dataset.achFilter;
      bar.querySelectorAll("[data-ach-filter]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      paintAchievementGrid();
    });
  }
}

/* Dynamic FAQ items are added after site.js binds its handlers. */
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest(".faq-btn");
  if (!btn) return;
  const item = btn.closest(".faq");
  if (!item || !item.hasAttribute("data-dynamic")) return;
  const open = item.classList.toggle("open");
  btn.setAttribute("aria-expanded", String(open));
});

/* ---------------- lead capture ---------------- */

document.addEventListener(
  "submit",
  (e) => {
    const form = e.target;
    if (!form || form.id !== "joinForm") return;
    const input = form.querySelector("#joinEmail");
    const email = (input && input.value ? input.value : "").trim();
    if (!EMAIL_RE.test(email) || !configured) return;

    const lead = {
      email,
      source: location.pathname.replace(/^\//, "") || "index.html",
      at: Date.now()
    };
    if (enquiryPlan) lead.plan = enquiryPlan;
    dbPush("site/leads", lead).catch((err) => console.warn("[content] lead not saved", err));
  },
  true
);

/* ---------------- boot ---------------- */

const BINDINGS = {
  content: () => dbWatch("site/content", applyContent),
  batches: () => watchExisting("site/batches", renderBatches),
  fees: () => watchExisting("site/fees", renderFees),
  faqs: () => watchExisting("site/faqs", renderFaqs),
  testimonials: () => watchExisting("site/testimonials", renderTestimonials),
  memberships: () => watchExisting("site/memberships", renderMemberships),
  myMembership: bindMyMembership,
  planEnquiry: bindPlanEnquiry,
  achievements: () => {
    bindLightbox();
    let painted = false;
    /* If the SDK cannot load (offline, blocked CDN) replace the skeleton. */
    setTimeout(() => {
      if (!painted) renderAchievements(null);
    }, 12000);
    return dbWatch("site/achievements", (value) => {
      painted = true;
      renderAchievements(value);
    });
  },
  achievementsPreview: () => dbWatch("site/achievements", renderAchievementsPreview)
};

function watchExisting(path, render) {
  return dbWatch(path, (value, snap) => {
    if (snap && snap.exists && snap.exists()) render(value);
  });
}

if (configured) {
  (PAGE_MAP[page] || ["content"]).forEach((key) => {
    const bind = BINDINGS[key];
    if (bind) Promise.resolve(bind()).catch((err) => console.warn("[content] " + key, err));
  });
} else if (page === "achievements") {
  renderAchievements(null);
}

/* Static fallback cards get the tilt too (runs even without Firebase). */
if (page === "membership") bindTilt(document);
