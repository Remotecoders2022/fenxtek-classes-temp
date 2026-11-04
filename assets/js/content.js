/* ============================================================
   FENXTEK — live content
   Reads site/content and the collection lists from RTDB and
   reflects them on the public pages. Falls back to the static
   HTML whenever a node is missing (or Firebase is not set up).
   ============================================================ */

import { configured, dbWatch, dbPush, toList } from "./firebase.js?v=3";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pad = (n) => String(n).padStart(2, "0");
const handle = (v) => String(v || "").trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/+$/, "");

/* Only http(s), protocol-relative or plain relative image paths are allowed. */
const safeImageUrl = (value) => {
  const url = String(value == null ? "" : value).trim();
  if (!url || url.length > 1200) return "";
  if (/^(javascript|vbscript|data|file|blob):/i.test(url)) return "";
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^\/\/[^\s]+$/.test(url)) return url;
  if (/^[a-z0-9][a-z0-9._~\-/]*$/i.test(url)) return url;
  return "";
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
    document.querySelectorAll('[data-cms="phone"]').forEach((el) => {
      const a = el.closest("a");
      if (a) a.setAttribute("href", tel);
    });
    document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.setAttribute("href", tel));
  }

  if (data.email) {
    setText("email", data.email);
    const mail = "mailto:" + String(data.email).trim();
    setLink('[data-cms-link="email"]', mail);
    document.querySelectorAll('[data-cms="email"]').forEach((el) => {
      const a = el.closest("a");
      if (a) a.setAttribute("href", mail);
    });
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
  const wrap = document.querySelector(".batch-list");
  if (!wrap) return;
  const list = toList(value);
  if (!list.length) {
    wrap.innerHTML = '<p class="cms-empty">New batches are being finalised — check back soon.</p>';
    return;
  }
  wrap.innerHTML = list
    .map((b, i) => {
      const banner = safeImageUrl(b.banner || b.bannerUrl || "");
      const thumb = banner
        ? `<span class="b-thumb"><img src="${esc(banner)}" alt="${esc(b.title || b.name || "Course")} banner" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>`
        : "";
      return (
        `<a class="batch-row${banner ? " has-banner" : ""}" href="contact.html">` +
        `<span class="b-i">${pad(i + 1)}</span>${thumb}` +
        `<span class="b-n">${esc(b.title || b.name || "Batch")}</span>` +
        `<span class="b-t">${esc(b.tag || b.mode || "")}</span>` +
        `<span class="b-a"><svg><use href="#i-arr-ur"/></svg></span></a>`
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
  wrap.innerHTML = list
    .map((f) => {
      const price = f.price == null || f.price === "" ? "" : "₹" + esc(String(f.price).replace(/^₹/, ""));
      const was = f.was ? `<s>₹${esc(String(f.was).replace(/^₹/, ""))}</s>` : "";
      return (
        `<div class="fee"><b>${esc(f.label || f.name || "Plan")}</b>` +
        `<small>${esc(f.note || f.tag || "")}</small>` +
        `<span class="pr">${price}${was}</span></div>`
      );
    })
    .join("");
}

export function renderFaqs(value) {
  const wrap = document.querySelector(".faq-list");
  if (!wrap) return;
  const list = toList(value);
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

    dbPush("site/leads", {
      email,
      source: location.pathname.replace(/^\//, "") || "index.html",
      at: Date.now()
    }).catch((err) => console.warn("[content] lead not saved", err));
  },
  true
);

/* ---------------- boot ---------------- */

if (configured) {
  dbWatch("site/content", applyContent);

  const bind = (path, render) => {
    dbWatch(path, (value, snap) => {
      if (snap && snap.exists && snap.exists()) render(value);
    });
  };

  bind("site/batches", renderBatches);
  bind("site/fees", renderFees);
  bind("site/faqs", renderFaqs);
  bind("site/testimonials", renderTestimonials);
}
