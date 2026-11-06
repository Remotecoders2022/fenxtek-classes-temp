/* ============================================================
   FENXTEK — student dashboard
   Auth guard, profile editing, announcements and batch list.
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
  toList,
  friendlyError
} from "./firebase.js?v=3";
import { membershipStatus, daysLeft, formatDate } from "./media.js?v=1";

const $ = (sel) => document.querySelector(sel);
const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const loading = $("#dashLoading");
const denied = $("#dashDenied");
const deniedText = $("#dashDeniedText");
const body = $("#dashBody");

function showDenied(message) {
  if (loading) loading.hidden = true;
  if (body) body.hidden = true;
  if (denied) denied.hidden = false;
  if (deniedText && message) deniedText.textContent = message;
}

function initials(name, email) {
  const source = String(name || email || "").trim();
  if (!source) return "FX";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "FX";
}

function formatMonth(value) {
  const date = new Date(Number(value) || Date.now());
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function paintProfile(profile, user) {
  const name = profile.name || user.displayName || "Student";
  const first = name.split(/\s+/)[0] || "there";
  const email = profile.email || user.email || "—";

  const firstName = $("#dashFirstName");
  if (firstName) firstName.textContent = first;
  const nameEl = $("#dashName");
  if (nameEl) nameEl.textContent = name;
  const emailEl = $("#dashEmail");
  if (emailEl) emailEl.textContent = email;
  const avatar = $("#dashAvatar");
  if (avatar) avatar.textContent = initials(name, email);

  const examBadge = $("#dashExamBadge");
  if (examBadge) examBadge.textContent = profile.exam ? `Target exam · ${profile.exam}` : "Target exam · not set";

  const memberBadge = $("#dashMemberBadge");
  if (memberBadge) {
    const month = formatMonth(profile.createdAt);
    memberBadge.textContent = month ? `Member since ${month}` : "FenxTek member";
  }

  const form = $("#profileForm");
  if (form) {
    const fields = form.elements;
    if (fields.name) fields.name.value = profile.name || user.displayName || "";
    if (fields.phone) fields.phone.value = profile.phone || "";
    if (fields.exam) fields.exam.value = profile.exam || "";
    if (fields.speed) fields.speed.value = profile.speed || "";
  }

  const session = $("#dashSessionNote");
  if (session) {
    const provider = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || "";
    session.textContent =
      provider === "google.com"
        ? "Signed in securely with your Google account via Firebase Authentication."
        : "Signed in securely with email and password via Firebase Authentication.";
  }
}

function renderBatches(value) {
  const list = $("#dashBatches");
  if (!list) return;
  const batches = toList(value);
  if (!batches.length) {
    list.innerHTML = '<li><span>No batches are published yet.</span><span>Soon</span></li>';
    return;
  }
  list.innerHTML = batches
    .map(
      (b) =>
        `<li><span>${esc(b.title || b.name || "Batch")}</span>` +
        `<span>${esc(b.tag || b.mode || "")}</span></li>`
    )
    .join("");
}

function paintMembership(rec) {
  const st = membershipStatus(rec);
  const title = $("#dashMemberTitle");
  const text = $("#dashMemberText");
  const info = $("#dashMemberInfo");
  const status = $("#dashMemberStatus");
  const bar = $("#dashMemberBar");
  const link = $("#dashMemberLink");
  const badge = $("#dashMemberBadge");
  if (st.key === "none") {
    if (title) title.textContent = "No membership yet";
    if (info) info.hidden = true;
    return;
  }
  const left = daysLeft(rec);
  if (title) title.textContent = rec.planName || "Membership";
  if (text) {
    const from = formatDate(Number(rec.startAt));
    const till = rec.endAt ? formatDate(Number(rec.endAt)) : "";
    text.textContent = till ? `Valid ${from} – ${till}` + (st.key === "active" && left != null ? ` · ${left} day${left === 1 ? "" : "s"} left` : "") : `Started ${from} · open-ended`;
  }
  if (info) info.hidden = false;
  if (status) {
    status.textContent = st.label;
    status.className = "p-badge" + (st.key === "active" ? " p-badge--ok" : "");
  }
  if (bar) {
    const start = Number(rec.startAt) || 0;
    const end = Number(rec.endAt) || 0;
    const pct = end > start ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
    bar.style.width = pct.toFixed(1) + "%";
  }
  if (link) {
    const label = link.querySelector("span");
    if (label) label.textContent = st.key === "active" ? "Compare plans" : "Renew membership";
  }
  if (badge && st.key === "active") badge.textContent = `${rec.planName || "Member"} · active`;
}

function showProfileAlert(kind, message) {
  const box = $("#profileAlert");
  if (!box) return;
  box.dataset.kind = kind;
  box.textContent = message;
  box.hidden = false;
  clearTimeout(showProfileAlert._t);
  showProfileAlert._t = setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

async function init() {
  if (!configured) {
    showDenied(
      "Firebase is not configured yet. Add your project keys to assets/js/firebase-config.js, deploy the database rules, and serve the site over HTTP."
    );
    return;
  }

  const user = await waitForUser();
  if (!user) {
    location.replace("auth.html?next=" + encodeURIComponent("dashboard.html"));
    return;
  }

  let snap = null;
  try {
    snap = await dbGet(`users/${user.uid}`);
  } catch (err) {
    console.warn("[dashboard] profile read failed", err);
  }

  const existed = Boolean(snap && snap.exists && snap.exists());
  const profile = existed ? snap.val() || {} : {};
  profile.name = profile.name || user.displayName || "";
  profile.email = profile.email || user.email || "";

  if (!existed) {
    profile.createdAt = Date.now();
    dbSet(`users/${user.uid}`, {
      name: profile.name,
      email: profile.email,
      phone: "",
      exam: "",
      createdAt: profile.createdAt,
      lastLogin: Date.now()
    }).catch((err) => console.warn("[dashboard] profile create failed", err));
  } else {
    dbUpdate(`users/${user.uid}`, { lastLogin: Date.now() }).catch(() => {});
  }

  paintProfile(profile, user);

  if (loading) loading.hidden = true;
  if (denied) denied.hidden = true;
  if (body) body.hidden = false;

  const portal = document.getElementById("portalLink");
  if (portal) {
    portal.setAttribute("href", "dashboard.html");
    const label = portal.querySelector("span");
    if (label) label.textContent = "Dashboard";
  }
  const menuLink = document.querySelector('.menu-list a[href="auth.html"]');
  if (menuLink) {
    menuLink.setAttribute("href", "dashboard.html");
    const label = menuLink.querySelector("span");
    if (label) label.textContent = "My dashboard";
  }

  /* announcements */
  dbWatch("site/content", (value) => {
    if (!value || !value.announcement) return;
    const card = $("#dashAnnounce");
    const text = $("#dashAnnounceText");
    if (text) text.textContent = value.announcement;
    if (card) card.hidden = false;
    if (value.phone) document.querySelectorAll('.dash-links a[href^="tel:"]').forEach((a) => {
      a.setAttribute("href", "tel:+" + String(value.phone).replace(/[^\d]/g, ""));
    });
    if (value.email) {
      document.querySelectorAll('.dash-links a[href^="mailto:"]').forEach((a) => {
        a.setAttribute("href", "mailto:" + value.email);
      });
    }
  });

  /* membership (members/{uid} is written by the admin CRM) */
  dbWatch(`members/${user.uid}`, (rec) => paintMembership(rec));

  /* batches */
  dbWatch("site/batches", (value, snapshot) => {
    if (snapshot && snapshot.exists && snapshot.exists()) renderBatches(value);
  });

  /* admin badge */
  isAdmin(user)
    .then((admin) => {
      if (!admin) return;
      const badge = $("#dashAdminBadge");
      const link = $("#adminLink");
      if (badge) badge.hidden = false;
      if (link) link.hidden = false;
    })
    .catch(() => {});

  /* profile save */
  const form = $("#profileForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const exam = String(data.get("exam") || "").trim();
      const speedRaw = String(data.get("speed") || "").trim();

      if (name.length < 2) {
        showProfileAlert("err", "Please enter your full name.");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.dataset.label = btn.innerHTML;
        btn.textContent = "Saving…";
      }

      try {
        await dbUpdate(`users/${user.uid}`, {
          name,
          phone,
          exam,
          speed: speedRaw ? Number(speedRaw) : null,
          updatedAt: Date.now()
        });
        profile.name = name;
        profile.phone = phone;
        profile.exam = exam;
        profile.speed = speedRaw ? Number(speedRaw) : null;
        paintProfile(profile, user);
        showProfileAlert("ok", "Profile saved. The academy can now see your current details.");
      } catch (err) {
        showProfileAlert("err", friendlyError(err));
      } finally {
        if (btn) {
          btn.disabled = false;
          if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
        }
      }
    });
  }

  /* sign out */
  const out = async () => {
    try {
      await signOutUser();
    } finally {
      location.replace("index.html");
    }
  };
  const b1 = $("#signOutBtn");
  const b2 = $("#signOutBtn2");
  if (b1) b1.addEventListener("click", out);
  if (b2) b2.addEventListener("click", out);
}

init().catch((err) => {
  console.error("[dashboard]", err);
  showDenied("We couldn’t open your dashboard. Refresh the page or sign in again.");
});
