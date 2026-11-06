/* ============================================================
   FENXTEK — shared chrome
   Injects the icon sprite, header, menu, footer and page effects.
   Loaded before assets/js/site.js on every page.
   ============================================================ */
(function () {
  "use strict";
  var page = document.body.getAttribute("data-page") || "home";
  var isHome = page === "home";

  var NAV = [
    ["index.html", "Home", "home"],
    ["courses.html", "Courses", "courses"],
    ["exams.html", "Exams", "exams"],
    ["method.html", "Method", "method"],
    ["about.html", "About", "about"],
    ["achievements.html", "Achievements", "achievements"],
    ["membership.html", "Membership", "membership"],
    ["contact.html", "Contact", "contact"]
  ];

  var navHTML = NAV.map(function (n) {
    return '<a href="' + n[0] + '"' + (n[2] === page ? ' class="active" aria-current="page"' : "") + ">" + n[1] + "</a>";
  }).join("");

  var menuHTML = NAV.concat([["auth.html", "Student portal", "portal"]]).map(function (n, i) {
    return '<a href="' + n[0] + '"><span>' + n[1] + '</span><span>' + String(i + 1).padStart(2, "0") + "</span></a>";
  }).join("");

  var sprite =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
    '<symbol id="i-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>' +
    '<symbol id="i-arr-ur" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></symbol>' +
    '<symbol id="i-arr-d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></symbol>' +
    '<symbol id="i-arr-u" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>' +
    '<symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></symbol>' +
    '<symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></symbol>' +
    '<symbol id="i-headphones" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"/></symbol>' +
    '<symbol id="i-keyboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></symbol>' +
    '<symbol id="i-award" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1 7 4.5-2.5 4.5 2.5-1-7"/></symbol>' +
    '<symbol id="i-court" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 21V10M20 21V10M3 10h18L12 3zM8 21v-7M12 21v-7M16 21v-7"/></symbol>' +
    '<symbol id="i-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13l2 2 4-4"/></symbol>' +
    '<symbol id="i-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>' +
    '<symbol id="i-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3h-2A1.5 1.5 0 0 0 3 4.6C3 14 10 21 19.4 21a1.5 1.5 0 0 0 1.6-1.5v-2l-4.5-1.5-1.8 2A14 14 0 0 1 7 9.3l2-1.8z"/></symbol>' +
    '<symbol id="i-mail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/></symbol>' +
    '<symbol id="i-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l7 3 3 7z"/><path d="m10 13.5 4.5-4.5"/></symbol>' +
    '<symbol id="i-ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></symbol>' +
    '<symbol id="i-zap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></symbol>' +
    '<symbol id="i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></symbol>' +
    '<symbol id="i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></symbol>' +
    '<symbol id="i-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></symbol>' +
    '<symbol id="i-image" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></symbol>' +
    '<symbol id="i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></symbol>' +
    '<symbol id="i-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></symbol>' +
    '<symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>' +
    '<symbol id="i-chev-l" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></symbol>' +
    '<symbol id="i-chev-r" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></symbol>' +
    '<symbol id="i-zoom" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6M10.5 7.8v5.4M7.8 10.5h5.4"/></symbol>' +
    '<symbol id="i-zoom-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6M7.8 10.5h5.4"/></symbol>' +
    '<symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></symbol>' +
    '<symbol id="i-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/></symbol>' +
    "</svg>";

  var preloader = isHome
    ? '<div class="preloader" id="preloader"><div class="pl-inner"><div class="pl-top"><span>FenxTek</span><span>Shorthand Classes</span></div><div class="pl-brand">Skills · Practice · Success</div><div class="pl-count"><span id="plNum">0</span>%</div><div class="pl-track"><i id="plBar"></i></div><div class="pl-words"><span>Your success,</span><span>our priority.</span></div></div></div>'
    : "";

  var header =
    '<header class="hdr" id="hdr"><div class="wrap hdr-in">' +
    '<a class="brand" href="index.html" aria-label="FenxTek Shorthand Classes — home">' +
    '<img src="fenxtek-logo.png" alt="FenxTek logo" width="44" height="44">' +
    '<span class="brand-txt"><b>FenxTek</b><span>Shorthand Classes</span></span></a>' +
    '<nav class="nav" aria-label="Primary">' + navHTML + "</nav>" +
    '<div class="hdr-cta">' +
    '<a class="btn btn--sm" href="contact.html"><span>Join now</span> <svg><use href="#i-arr"/></svg></a>' +
    '<a class="hdr-portal" id="portalLink" href="auth.html" aria-label="Student portal"><svg><use href="#i-user"/></svg><span>Portal</span></a>' +
    '<button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="menu"><i></i></button>' +
    "</div></div></header>";

  var menu =
    '<div class="menu" id="menu" aria-hidden="true"><nav class="menu-list" aria-label="Mobile">' + menuHTML + '</nav>' +
    '<div class="menu-foot"><a href="tel:+917309082749">+91 73090 82749</a>' +
    '<a href="mailto:fenxtekshorthandclasses20@gmail.com">fenxtekshorthandclasses20@gmail.com</a>' +
    '<a href="https://t.me/fenxtekshorthand_classes">Telegram</a>' +
    '<a href="https://www.instagram.com/fenxtek_shorthand_classes/">Instagram</a></div></div>';

  var footer =
    '<footer class="footer on-dark"><div class="wrap">' +
    '<div class="f-top">' +
    '<div class="f-brand"><a class="brand" href="index.html"><img src="fenxtek-logo.png" alt="FenxTek logo" width="56" height="56">' +
    '<span class="brand-txt"><b>FenxTek</b><span>Shorthand Classes</span></span></a>' +
    '<p>A focused platform for Hindi and English shorthand, typing and government exam preparation across India.</p>' +
    '<div class="f-chips"><span>SSC Steno</span><span>UPSSSC</span><span>AHC APS</span><span>50–160 WPM</span></div></div>' +
    '<div class="f-col"><h4>Explore</h4>' +
    '<a href="index.html#practice">Practice <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="courses.html">Courses &amp; fees <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="method.html">Method <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="about.html">About <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="achievements.html">Achievements <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="membership.html">Membership plans <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="auth.html">Student portal <svg><use href="#i-arr-ur"/></svg></a></div>' +
    '<div class="f-col"><h4>Exams</h4>' +
    '<a href="exams.html">SSC Stenographer <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="exams.html">UPSSSC Steno <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="exams.html">AHC APS Steno <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="exams.html">Parliamentary Reporter <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a href="exams.html">High Court Steno <svg><use href="#i-arr-ur"/></svg></a></div>' +
    '<div class="f-col f-col--contact"><h4>Contact</h4>' +
    '<a data-cms-link="phone" href="tel:+917309082749"><span data-cms="phone">+91 73090 82749</span> <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a data-cms-link="email" href="mailto:fenxtekshorthandclasses20@gmail.com"><span data-cms="email">fenxtekshorthandclasses20@gmail.com</span> <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a data-cms-link="telegram" href="https://t.me/fenxtekshorthand_classes" target="_blank" rel="noopener"><span>Telegram · <span data-cms="telegramHandle">@fenxtekshorthand_classes</span></span> <svg><use href="#i-arr-ur"/></svg></a>' +
    '<a data-cms-link="instagram" href="https://www.instagram.com/fenxtek_shorthand_classes/" target="_blank" rel="noopener"><span>Instagram · <span data-cms="instagramHandle">@fenxtek_shorthand_classes</span></span> <svg><use href="#i-arr-ur"/></svg></a></div>' +
    "</div>" +
    '<div class="f-tagline"><span>Better Skills</span><i></i><span>Higher Confidence</span><i></i><span>Brighter Future</span></div>' +
    '<div class="f-word" id="fWord" aria-hidden="true" data-reveal="fade"><div class="fw-scale"><div class="fw-in">' +
    '<span class="fw-base">FenxTek</span><span class="fw-fill">FenxTek</span><span class="fw-sheen">FenxTek</span>' +
    "</div></div></div>" +
    '<div class="f-bottom"><span>© <span id="year">2026</span> FenxTek Shorthand Classes · Kanpur, Uttar Pradesh</span>' +
    '<span>Designed by Tanmay and Aditya</span><a class="up" href="index.html">Back to top <svg><use href="#i-arr-u"/></svg></a></div>' +
    "</div></footer>" +
    '<button class="to-top" id="toTop" aria-label="Back to top"><svg><use href="#i-arr-u"/></svg></button>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>';

  document.body.insertAdjacentHTML(
    "afterbegin",
    sprite + preloader + '<div class="grain" aria-hidden="true"></div>' +
      '<div class="progress" aria-hidden="true"><i id="progressBar"></i></div>' +
      '<div class="cursor cur-ring" id="curRing" aria-hidden="true"></div>' +
      '<div class="cursor cur-dot" id="curDot" aria-hidden="true"></div>' +
      header + menu
  );
  document.body.insertAdjacentHTML("beforeend", footer);
})();
