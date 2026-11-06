/* ============================================================
   FENXTEK — header auth state
   Keeps the "Portal" link in sync with the signed-in user.
   Safe to load on every page, even without Firebase keys.
   ============================================================ */

import { configured, onAuthChange, isAdmin } from "./firebase.js?v=4";

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
  };

  onAuthChange(async (user) => {
    if (!user) return paint(null, false);
    paint(user, false);
    const admin = await isAdmin(user).catch(() => false);
    paint(user, admin);
  });
}
