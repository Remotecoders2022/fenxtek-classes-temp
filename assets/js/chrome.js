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
    '<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></symbol>' +
    '<symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></symbol>' +
    '<symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>' +
    '<symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></symbol>' +
    '<symbol id="i-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/></symbol>' +
    '<symbol id="i-cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></symbol>' +
    '<symbol id="i-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/></symbol>' +
    '<symbol id="i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/></symbol>' +
    '<symbol id="i-receipt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.3z" transform="translate(0 0)"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/></symbol>' +
    '<symbol id="i-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.8 6.8a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.4"/></symbol>' +
    '<symbol id="i-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></symbol>' +
    '<symbol id="i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></symbol>' +
    '<symbol id="i-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12M10 11v5.5M14 11v5.5"/></symbol>' +
    '<symbol id="i-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m10.2 8.8 5 3.2-5 3.2z" fill="currentColor"/></symbol>' +
    '<symbol id="i-crown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 8 12l4-6.5 4 6.5 4-3.5-1.6 9.5H5.6z"/><path d="M6 20.5h12"/></symbol>' +
    '<symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.9-7 9-4.1-1.1-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></symbol>' +
    '<symbol id="i-qr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM18.5 14H20M14 19.5h2.5M18.5 17.5V20H20"/></symbol>' +
    '<symbol id="i-filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>' +
    '<symbol id="i-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/></symbol>' +
    '<symbol id="i-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>' +
    '<symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></symbol>' +
    '<symbol id="i-gift" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.2C6 4.8 7 8 12 8zm0 0s1.5-4.5 4-3.8c2 .6 1 3.8-4 3.8z"/></symbol>' +
    '<symbol id="i-coin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M9.2 8.4h5.6M9.2 11h5.6M10.2 8.4c2.9 0 3 4.6 0 4.6h-1l4.3 3.8"/></symbol>' +
    '<symbol id="i-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19.2c.6-3.3 2.9-5.2 5.8-5.2s5.2 1.9 5.8 5.2M15.6 5.4a3.2 3.2 0 0 1 0 6.2M17.6 14.3c1.7.7 2.8 2.3 3.2 4.9"/></symbol>' +
    '<symbol id="i-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.8 10.7l6.4-3.9M8.8 13.3l6.4 3.9"/></symbol>' +
    '<symbol id="i-wa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.8 20.2l1.3-4A8.3 8.3 0 1 1 8 19z"/><path d="M9 8.3c.1 3.4 2.9 6.3 6.6 6.7l1-1.4-1.9-1-.9.8a5 5 0 0 1-2.3-2.3l.8-.9-1-1.9z"/></symbol>' +
    '<symbol id="i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></symbol>' +
    '<symbol id="i-megaphone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4a1 1 0 0 0 1 1h3l7 4V5L8 9H5a1 1 0 0 0-1 1z"/><path d="M18.5 9a4 4 0 0 1 0 6"/><path d="M8 15l1.2 4.5"/></symbol>' +
    '<symbol id="i-key" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/></symbol>' +
    '<symbol id="i-live" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></symbol>' +
    '<symbol id="i-test" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="m8.5 9 1.5 1.5L13 7.5M8.5 15l1.5 1.5 3-3M15 9.5h1M15 15.5h1"/></symbol>' +
    '<symbol id="i-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/></symbol>' +
    '<symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/></symbol>' +
    '<symbol id="i-bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></symbol>' +
    "</svg>";

  /* ---------- loading screen ----------
     Full intro once per browser session on public pages; Home always gets
     a short version on repeat visits. Never on portal / admin pages. */
  var PORTAL = { admin: 1, auth: 1, dashboard: 1, forgot: 1 };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var introSeen = false;
  try { introSeen = sessionStorage.getItem("fx:intro") === "1"; } catch (e) {}
  var showIntro = !PORTAL[page] && !reduceMotion && (!introSeen || isHome);
  var preloader = "";
  if (showIntro) {
    var letters = "FenxTek".split("").map(function (ch, i) {
      return '<span style="--i:' + i + '">' + ch + "</span>";
    }).join("");
    var bars = "";
    for (var b = 0; b < 28; b++) {
      var h = (0.25 + Math.abs(Math.sin(b * 1.7)) * 0.55 + (b % 3) * 0.07).toFixed(2);
      bars += '<i style="--h:' + h + ";--d:" + (-(b * 0.09)).toFixed(2) + 's"></i>';
    }
    preloader =
      '<div class="preloader' + (introSeen ? " preloader--quick" : "") + '" id="preloader" role="status" aria-label="Loading FenxTek Shorthand Classes"' + (introSeen ? ' data-quick="1"' : "") + ">" +
      '<div class="pl-panel pl-panel--t"></div><div class="pl-panel pl-panel--b"></div>' +
      '<div class="pl-stage">' +
      '<div class="pl-glow" aria-hidden="true"></div>' +
      '<div class="pl-corner pl-corner--tl"><i></i>FenxTek · Kanpur, IN</div>' +
      '<div class="pl-corner pl-corner--tr">Loading <b id="plPct">00</b>%</div>' +
      '<div class="pl-corner pl-corner--bl">Your success, our priority.</div>' +
      '<div class="pl-corner pl-corner--br">Tap to skip</div>' +
      '<div class="pl-center">' +
      '<div class="pl-mark"><svg class="pl-ring" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><linearGradient id="plGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5A4BFF"/><stop offset="1" stop-color="#D9FF57"/></linearGradient></defs>' +
      '<circle class="pl-ring-bg" cx="60" cy="60" r="54"/><circle class="pl-ring-fg" id="plRing" cx="60" cy="60" r="54"/></svg>' +
      '<img src="fenxtek-logo.png" alt="" width="62" height="62"></div>' +
      '<div class="pl-name" aria-hidden="true">' + letters + "</div>" +
      '<div class="pl-sub">Shorthand Classes</div>' +
      '<div class="pl-meter" aria-hidden="true"><div class="pl-wave">' + bars + "</div>" +
      '<div class="pl-speed"><b id="plSpeed">000</b><span>wpm</span></div></div>' +
      '<div class="pl-words" aria-hidden="true"><span data-at="0.02">Skills</span><i></i><span data-at="0.4">Practice</span><i></i><span data-at="0.78">Success</span></div>' +
      "</div>" +
      '<div class="pl-line" aria-hidden="true"><i id="plBar"></i></div>' +
      "</div></div>";
    document.documentElement.classList.add("is-loading");
  }

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

  var yearNow = new Date().getFullYear();
  var arr = ' <svg class="fx-go"><use href="#i-arr-ur"/></svg>';
  function flink(href, label) { return '<a href="' + href + '"><span>' + label + "</span>" + arr + "</a>"; }
  function tile(key, href, icon, label, value, ext) {
    return '<a class="fx-tile" data-cms-link="' + key + '" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" +
      '<span class="fx-ic"><svg><use href="#' + icon + '"/></svg></span>' +
      '<span class="fx-k">' + label + "</span>" +
      '<span class="fx-v">' + value + "</span>" +
      '<svg class="fx-arr"><use href="#i-arr-ur"/></svg></a>';
  }

  /* 3D keyboard: one keycap per letter of F-E-N-X-T-E-K (cream caps + lime accent caps) */
  function keyboard(id) {
    var KEYS = [["F", 0], ["E", 0], ["N", 0], ["X", 0], ["T", 1], ["E", 1], ["K", 1]];
    var caps = KEYS.map(function (k, i) {
      return '<span class="kk' + (k[1] ? " kk--lime" : "") + '" data-k="' + k[0].toLowerCase() + '" style="--i:' + i + '">' +
        '<span class="kk-cap"><span class="kk-top"><b>' + k[0] + "</b><small>0" + (i + 1) + "</small></span></span></span>";
    }).join("");
    return '<div class="kb"' + (id ? ' id="' + id + '"' : "") + ' role="img" aria-label="FenxTek">' +
      '<div class="kb-plate"><div class="kb-bar" aria-hidden="true">' +
      '<span class="kb-brand"><i class="kb-led"></i>FenxTek<em>MK—07</em></span>' +
      '<span class="kb-out"><span class="kb-txt"></span><i class="kb-caret"></i></span>' +
      '<span class="kb-hint">Hover to type</span></div>' +
      '<div class="kb-keys" aria-hidden="true">' + caps + "</div></div></div>";
  }

  var footer =
    '<footer class="footer fx on-dark"><div class="wrap">' +
    /* 1 — reach us (the contact page has its own, richer version) */
    (page === "contact" ? "" : '<div class="fx-top">' +
    '<div class="fx-intro">' +
    '<span class="fx-status"><i></i>Admissions open · ' + yearNow + "</span>" +
    '<h2 class="fx-title">Let’s get you to <em>exam speed.</em></h2>' +
    '<p class="fx-lead">Questions about batches, fees or your exam? Message us — the academy usually replies the same day.</p>' +
    '<div class="fx-clock"><span class="fx-clock-dot"></span><span>Kanpur</span><b id="fxTime">--:--</b><span>IST</span></div>' +
    "</div>" +
    '<div class="fx-reach">' +
    tile("phone", "tel:+917309082749", "i-phone", "Call", '<span data-cms="phone">+91 73090 82749</span>') +
    tile("email", "mailto:fenxtekshorthandclasses20@gmail.com", "i-mail", "Email", '<span data-cms="email">fenxtekshorthandclasses20@gmail.com</span>') +
    tile("telegram", "https://t.me/fenxtekshorthand_classes", "i-send", "Telegram", '<span data-cms="telegramHandle">@fenxtekshorthand_classes</span>', true) +
    tile("instagram", "https://www.instagram.com/fenxtek_shorthand_classes/", "i-ig", "Instagram", '<span data-cms="instagramHandle">@fenxtek_shorthand_classes</span>', true) +
    "</div></div>") +
    /* 2 — brand + links */
    '<div class="fx-mid">' +
    '<div class="fx-brand"><a class="brand" href="index.html"><img src="fenxtek-logo.png" alt="FenxTek logo" width="52" height="52">' +
    '<span class="brand-txt"><b>FenxTek</b><span>Shorthand Classes</span></span></a>' +
    "<p>A focused academy for Hindi and English shorthand, typing and government exam preparation — from Kanpur, for aspirants across India.</p>" +
    '<div class="fx-chips"><span>SSC Steno</span><span>UPSSSC</span><span>AHC APS</span><span>50–160 WPM</span></div></div>' +
    '<nav class="fx-col" aria-label="Explore"><h4>Explore</h4>' +
    flink("index.html", "Home") + flink("courses.html", "Courses &amp; fees") + flink("method.html", "Method") +
    flink("about.html", "About") + flink("achievements.html", "Achievements") + flink("contact.html", "Contact") + "</nav>" +
    '<nav class="fx-col" aria-label="Exams"><h4>Exams</h4>' +
    flink("exams.html#cat-3", "Central Government") + flink("exams.html#cat-4", "State recruitments") +
    flink("exams.html#cat-2", "High Court &amp; Judicial") + flink("exams.html#cat-1", "Parliamentary Reporter") +
    flink("exams.html#cat-6", "Shorthand &amp; Typing") + "</nav>" +
    '<nav class="fx-col" aria-label="Students"><h4>Students</h4>' +
    flink("auth.html", "Student portal") + flink("dashboard.html", "My dashboard") + flink("membership.html", "Membership plans") +
    flink("contact.html", "Book a free demo") + flink("index.html#practice", "Practice dictation") + "</nav>" +
    "</div>" +
    /* 3 — wordmark: FenxTek typed out on 3D keycaps */
    '<div class="f-index" aria-hidden="true"><span><i>(01)</i>Better skills</span><span><i>(02)</i>Higher confidence</span>' +
    '<span><i>(03)</i>Brighter future</span><span class="f-index-geo">26.45° N — 80.33° E</span></div>' +
    keyboard("fKb") +
    /* 4 — legal */
    '<div class="fx-bottom"><span>© <span id="year">' + yearNow + "</span> FenxTek Shorthand Classes · Kanpur, Uttar Pradesh</span>" +
    "<span>Designed by Tanmay and Aditya</span>" +
    '<button class="fx-up" type="button" data-to-top><span>Back to top</span><i><svg><use href="#i-arr-u"/></svg></i></button></div>' +
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
  /* extra live keyboards (used by the design-system page) */
  Array.prototype.forEach.call(document.querySelectorAll("[data-kb-mount]"), function (m) { m.innerHTML = keyboard(""); });

  /* footer: live Kanpur time + back-to-top button */
  var fxTime = document.getElementById("fxTime") || document.getElementById("ctTime");
  function tick() {
    try {
      fxTime.textContent = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      fxTime.parentNode.style.display = "none";
    }
  }
  if (fxTime) { tick(); setInterval(tick, 20000); }
  /* hide the floating back-to-top button while the footer (which has its own) is on screen */
  var fxEl = document.querySelector(".fx-bottom");
  if (fxEl && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      document.documentElement.classList.toggle("fx-in-view", en[0].isIntersecting);
    }).observe(fxEl);
  }
  var up = document.querySelector("[data-to-top]");
  if (up) up.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
})();
