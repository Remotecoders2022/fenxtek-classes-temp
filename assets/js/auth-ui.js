/* ============================================================
   FENXTEK — header auth state
   Keeps the "Portal" link in sync with the signed-in user.
   Safe to load on every page, even without Firebase keys.
   ============================================================ */

import { configured, onAuthChange, isAdmin } from "./firebase.js?v=5";

const page = document.body.getAttribute("data-page") || "";

if (configured && page !== "auth" && page !== "dashboard" && page !== "admin") {
  const portal = document.getElementById("portalLink");
  const menuPortal = document.querySelector('.menu-list a[href="auth.html"]');

  const paint = (user, admin) => {
    document.body.classList.toggle("signed-in", Boolean(user));
    if (portal) {
      const label = portal.querySelector("span");
      if (label) label.textContent = admin ? "CRM" : user ? "Dashboard" : "Portal";
      portal.setAttribute("href", user ? (admin ? "admin.html" : "dashboard.html") : "auth.html");
      portal.setAttribute("aria-label", user ? "Open your dashboard" : "Student portal");
      portal.classList.toggle("is-admin", Boolean(admin));
    }
    if (menuPortal) {
      const label = menuPortal.querySelector("span");
      if (label) label.textContent = user ? (admin ? "Admin CRM" : "My dashboard") : "Student portal";
      menuPortal.setAttribute("href", user ? (admin ? "admin.html" : "dashboard.html") : "auth.html");
    }
    paintAuthLinks(user, admin);
  };

  onAuthChange(async (user) => {
    if (!user) return paint(null, false);
    paint(user, false);
    const admin = await isAdmin(user).catch(() => false);
    paint(user, admin);
  });
}

/* Links that change once a student is signed in, e.g. the home hero:
   <a href="auth.html?next=…" data-auth-href="dashboard.html#store"
      data-auth-label="…" data-admin-href="admin.html" data-admin-label="…">
   Signed out they keep their original href/label (the login page, which
   brings the student back to data-auth-href after signing in). */
function paintAuthLinks(user, admin) {
  document.querySelectorAll("[data-auth-href]").forEach((a) => {
    const label = a.querySelector("span");
    if (!a.dataset.guestHref) a.dataset.guestHref = a.getAttribute("href") || "";
    if (label && !a.dataset.guestLabel) a.dataset.guestLabel = label.textContent;
    const useAdmin = admin && a.dataset.adminHref;
    a.setAttribute("href", !user ? a.dataset.guestHref : useAdmin ? a.dataset.adminHref : a.dataset.authHref);
    if (label) {
      const text = !user ? a.dataset.guestLabel : (useAdmin && a.dataset.adminLabel) || a.dataset.authLabel || a.dataset.guestLabel;
      label.textContent = text;
    }
    a.classList.toggle("is-signed-in", Boolean(user));
  });

  const hello = document.querySelector("[data-hero-hello]");
  if (hello) {
    const name = user ? String(user.displayName || (user.email || "").split("@")[0] || "student").trim() : "";
    hello.hidden = !user;
    const nameEl = hello.querySelector("[data-hero-name]");
    if (nameEl) nameEl.textContent = name.split(/\s+/)[0] || "student";
    const ini = hello.querySelector("[data-hero-initials]");
    if (ini) ini.textContent = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "FT";
  }
  document.querySelectorAll("[data-hero-guest]").forEach((el) => { el.hidden = Boolean(user); });
  document.querySelectorAll("[data-hero-hello-sep]").forEach((el) => { el.hidden = !user; });
}
