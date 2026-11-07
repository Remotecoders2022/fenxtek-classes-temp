/* ============================================================
   FENXTEK — auth page
   Email/password + Google sign-in, account creation and reset.
   ============================================================ */

import {
  configured,
  signInEmail,
  signUpEmail,
  signInGoogle,
  sendReset,
  isAdmin,
  isAdminEmail,
  dbGet,
  dbSet,
  dbUpdate,
  setPersistenceMode,
  friendlyError,
  onAuthChange
} from "./firebase.js?v=5";
import { claimAdminInvite } from "./admin-claim.js?v=1";

const $ = (sel) => document.querySelector(sel);
const alertBox = $("#authAlert");
const configNotice = $("#configNotice");
const signinForm = $("#signinForm");
const signupForm = $("#signupForm");
const tabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
const googleBtn = $("#googleBtn");
const forgotBtn = $("#forgotBtn");
const altBtn = $("#altBtn");
const altPrompt = $("#altPrompt");

let currentTab = "signin";

/* ---------------- UI helpers ---------------- */

function showAlert(kind, message) {
  if (!alertBox) return;
  alertBox.dataset.kind = kind;
  alertBox.textContent = message;
  alertBox.hidden = false;
  alertBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearAlert() {
  if (!alertBox) return;
  alertBox.hidden = true;
  alertBox.textContent = "";
}

function busy(button, on, label) {
  if (!button) return;
  if (on) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.textContent = label || "Please wait…";
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

function setTab(name) {
  currentTab = name;
  const signedIn = name === "signin";
  tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.authTab === name)));
  if (signinForm) signinForm.hidden = !signedIn;
  if (signupForm) signupForm.hidden = signedIn;
  if (altPrompt) altPrompt.textContent = signedIn ? "New to FenxTek?" : "Already have an account?";
  if (altBtn) altBtn.textContent = signedIn ? "Create a free account" : "Sign in instead";
  clearAlert();
}

tabs.forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.authTab)));
if (altBtn) {
  altBtn.addEventListener("click", () => setTab(currentTab === "signin" ? "signup" : "signin"));
}

/* invite links (?mode=signup, or a referral next=dashboard.html#ref/CODE) open on "Create account" */
if (signupForm && (new URLSearchParams(location.search).get("mode") === "signup" || /#ref\//i.test(safeNext()))) setTab("signup");

/* ---------------- invite codes (Refer & earn) ----------------
   A friend's link looks like auth.html?mode=signup&ref=CODE&next=dashboard.html#ref/CODE/<course>.
   The code is remembered in localStorage ("fx:invite") so it survives Google
   sign-in or a detour, and the student portal applies it once the new
   account is ready. Students can also type a code in the sign-up form. */
const INVITE_KEY = "fx:invite";
const cleanCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
const inviteFromUrl = (() => {
  const q = new URLSearchParams(location.search);
  const m = safeNext().match(/#ref\/([A-Za-z0-9]{4,12})(?:\/([A-Za-z0-9_-]{1,80}))?/);
  const code = cleanCode(q.get("ref") || (m && m[1]) || "");
  return code.length >= 4 ? { code, course: (m && m[2]) || "" } : null;
})();
function rememberInvite(code, course) {
  const c = cleanCode(code);
  if (c.length < 4) return;
  try {
    localStorage.setItem(INVITE_KEY, JSON.stringify({ code: c, course: course || "", at: Date.now() }));
  } catch (e) {
    /* private mode — the #ref link still works */
  }
}
const inviteInput = $("#inviteInput");
const inviteBox = $("#inviteBox");
if (inviteFromUrl) {
  rememberInvite(inviteFromUrl.code, inviteFromUrl.course);
  if (inviteInput) inviteInput.value = inviteFromUrl.code;
  if (inviteBox) inviteBox.open = true;
  const chip = $("#inviteChip");
  if (chip) {
    chip.textContent = inviteFromUrl.code;
    chip.hidden = false;
  }
}
if (inviteInput) inviteInput.addEventListener("input", () => (inviteInput.value = cleanCode(inviteInput.value)));
/* the typed code wins over the link's code */
const inviteTyped = () => cleanCode(inviteInput && inviteInput.value);
function keepTypedInvite() {
  const typed = inviteTyped();
  if (typed.length >= 4) rememberInvite(typed, typed === (inviteFromUrl && inviteFromUrl.code) ? inviteFromUrl.course : "");
}

/* Arriving from "Explore courses" (next=dashboard.html#store / #course/… / #cart):
   explain why we ask for a login and offer a one-tap switch to sign-up. */
(() => {
  const box = document.getElementById("authContext");
  const next = safeNext();
  /* just deleted their account from the student portal */
  if (box && new URLSearchParams(location.search).get("deleted") === "1") {
    box.innerHTML =
      '<span class="auth-context-ic"><svg><use href="#i-check"/></svg></span>' +
      '<span class="auth-context-txt"><b>Your account has been deleted</b>' +
      "Your FenxTek profile and sign-in were removed. You’re always welcome back — create a new account any time.</span>";
    box.classList.add("auth-context--done");
    box.hidden = false;
    try { history.replaceState(null, "", "auth.html"); } catch (e) { /* ignore */ }
    return;
  }
  if (box && inviteFromUrl) {
    box.innerHTML =
      '<span class="auth-context-ic auth-context-ic--coin"><svg><use href="#i-gift"/></svg></span>' +
      '<span class="auth-context-txt"><b>You’ve been invited to FenxTek</b>' +
      '<span id="inviteCtxText">Create your free account — your friend’s invite code <code>' + inviteFromUrl.code + "</code> is already added.</span></span>";
    box.classList.add("auth-context--invite");
    box.hidden = false;
    /* show the real welcome bonus (site/rewards is public) */
    dbGet("site/rewards")
      .then((snap) => {
        const r = (snap && snap.val && snap.val()) || {};
        const coins = Math.round(Number(r.refereeCoins));
        const t = document.getElementById("inviteCtxText");
        if (t && r.enabled === true && coins > 0) {
          t.innerHTML = "Create your free account and get <b>" + coins.toLocaleString("en-IN") + " E-coins</b> (₹" + coins.toLocaleString("en-IN") + " off) on your first course. Code <code>" + inviteFromUrl.code + "</code> is already added.";
          const note = document.getElementById("inviteNote");
          if (note) note.textContent = "You get " + coins.toLocaleString("en-IN") + " E-coins with your first course, and your friend earns too.";
        }
      })
      .catch(() => {});
    return;
  }
  if (!box || !/^dashboard\.html#(store|course\/|cart)/i.test(next)) return;
  box.innerHTML =
    '<span class="auth-context-ic"><svg><use href="#i-book"/></svg></span>' +
    '<span class="auth-context-txt"><b>Sign in to explore courses</b>' +
    "Browse every course with prices and offers, and enroll right from your student portal." +
    '<button type="button" data-ctx-signup>New here? Create a free account</button></span>';
  box.hidden = false;
  const btn = box.querySelector("[data-ctx-signup]");
  btn.addEventListener("click", () => setTab("signup"));
  const sync = () => { btn.hidden = currentTab === "signup"; };
  tabs.forEach((t) => t.addEventListener("click", sync));
  if (altBtn) altBtn.addEventListener("click", sync);
  btn.addEventListener("click", sync);
  sync();
})();

/* ---------------- profile ---------------- */

async function ensureProfile(user, extra) {
  if (!user) return;
  const path = `users/${user.uid}`;
  const snap = await dbGet(path).catch(() => null);
  const base = {
    name: (extra && extra.name) || user.displayName || "",
    email: user.email || "",
    lastLogin: Date.now()
  };

  if (!snap || !snap.exists()) {
    await dbSet(path, {
      ...base,
      phone: (extra && extra.phone) || "",
      exam: (extra && extra.exam) || "",
      createdAt: Date.now()
    });
    return;
  }

  const patch = { lastLogin: Date.now() };
  if (!snap.val().name && base.name) patch.name = base.name;
  if (extra && extra.phone) patch.phone = extra.phone;
  if (extra && extra.exam) patch.exam = extra.exam;
  await dbUpdate(path, patch).catch(() => {});
}

function safeNext() {
  const raw = new URLSearchParams(location.search).get("next") || "";
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("//") || raw.startsWith("javascript:")) return "";
  return raw;
}

/* Admins (including the ADMIN_EMAILS account) always land in the CRM;
   a ?next= link is kept only when it already points inside admin.html. */
async function destinationFor(user) {
  const next = safeNext();
  /* someone invited from admin-access.html becomes an admin on first sign-in */
  const invite = await claimAdminInvite(user).catch(() => null);
  if (invite && invite.needsVerify) return "admin.html";
  const admin = isAdminEmail(user) || (await isAdmin(user).catch(() => false));
  if (admin) return /^admin(-access)?\.html/i.test(next) ? next : "admin.html";
  return next || "dashboard.html";
}

async function routeAfterLogin(user) {
  location.replace(await destinationFor(user));
}

/* ---------------- validation ---------------- */

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/* ---------------- sign in ---------------- */

if (signinForm) {
  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const btn = signinForm.querySelector('button[type="submit"]');
    const data = new FormData(signinForm);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    if (!validEmail(email)) {
      showAlert("err", "Enter a valid email address.");
      signinForm.email.focus();
      return;
    }
    if (!password) {
      showAlert("err", "Enter your password.");
      signinForm.password.focus();
      return;
    }
    if (!configured) {
      showAlert("err", "Firebase is not configured yet. Add your keys to assets/js/firebase-config.js.");
      return;
    }

    busy(btn, true, "Signing in…");
    try {
      const remember = String(data.get("remember") || "") !== "";
      await setPersistenceMode(remember);
      const cred = await signInEmail(email, password);
      await ensureProfile(cred.user);
      showAlert("ok", "Signed in. Opening your dashboard…");
      await routeAfterLogin(cred.user);
    } catch (err) {
      showAlert("err", friendlyError(err));
      busy(btn, false);
    }
  });
}

/* ---------------- create account ---------------- */

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert();
    const btn = signupForm.querySelector('button[type="submit"]');
    const data = new FormData(signupForm);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const exam = String(data.get("exam") || "").trim();
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirm") || "");

    if (name.length < 2) {
      showAlert("err", "Please enter your full name.");
      return;
    }
    if (!validEmail(email)) {
      showAlert("err", "Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      showAlert("err", "Use at least 8 characters for your password — the strength meter above shows what to add.");
      if (pwInput) pwInput.focus();
      return;
    }
    if (password !== confirm) {
      showAlert("err", "The two passwords don’t match.");
      if (confirmInput) confirmInput.focus();
      return;
    }
    if (!configured) {
      showAlert("err", "Firebase is not configured yet. Add your keys to assets/js/firebase-config.js.");
      return;
    }

    const typedInvite = inviteTyped();
    if (typedInvite && typedInvite.length < 4) {
      showAlert("err", "That invite code looks too short — check it with your friend, or leave it blank.");
      if (inviteInput) inviteInput.focus();
      return;
    }
    keepTypedInvite();

    busy(btn, true, "Creating account…");
    try {
      const cred = await signUpEmail(name, email, password);
      await ensureProfile(cred.user, { name, phone, exam });
      showAlert("ok", "Account created. Opening your dashboard…");
      await routeAfterLogin(cred.user);
    } catch (err) {
      showAlert("err", friendlyError(err));
      busy(btn, false);
    }
  });
}

/* ---------------- Google ---------------- */

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    clearAlert();
    if (!configured) {
      showAlert("err", "Firebase is not configured yet. Add your keys to assets/js/firebase-config.js.");
      return;
    }
    if (currentTab === "signup") keepTypedInvite();
    busy(googleBtn, true, "Opening Google…");
    try {
      const cred = await signInGoogle();
      await ensureProfile(cred.user);
      await routeAfterLogin(cred.user);
    } catch (err) {
      showAlert("err", friendlyError(err));
      busy(googleBtn, false);
    }
  });
}

/* ---------------- password strength (sign-up) ---------------- */

const pwInput = $("#signupPassword");
const pwMeter = $("#pwMeter");
const pwLabel = $("#pwLabel");
const pwRules = $("#pwRules");
const pwMatch = $("#pwMatch");
const confirmInput = $("#signupConfirm");

const STRENGTH = [
  { label: "Too short", hint: "Use at least 8 characters" },
  { label: "Weak", hint: "Add a number or symbol" },
  { label: "Fair", hint: "Mix upper and lowercase" },
  { label: "Good", hint: "Almost there" },
  { label: "Strong", hint: "Excellent — ready to go" }
];

function scorePassword(value) {
  const pw = String(value || "");
  if (!pw) return -1;
  const checks = {
    len: pw.length >= 8,
    case: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  let score = 0;
  if (pw.length >= 8) score = 1;
  if (pw.length >= 12 && passed >= 2) score = 2;
  if (pw.length >= 8 && passed >= 3) score = 3;
  if (pw.length >= 10 && passed >= 4) score = 4;
  if (pw.length >= 6 && score === 0) score = 1;
  return { score, checks, passed, length: pw.length };
}

function paintStrength() {
  if (!pwInput || !pwMeter) return;
  const result = scorePassword(pwInput.value);
  const empty = result === -1;
  const score = empty ? 0 : result.score;

  pwMeter.dataset.score = String(empty ? 0 : score + 1);
  pwMeter.classList.toggle("is-empty", empty);
  if (pwLabel) {
    pwLabel.textContent = empty
      ? "Strength · start typing"
      : `${STRENGTH[score].label} · ${STRENGTH[score].hint}`;
  }

  if (pwRules && !empty) {
    pwRules.querySelectorAll("[data-rule]").forEach((li) => {
      li.classList.toggle("ok", Boolean(result.checks[li.dataset.rule]));
    });
  } else if (pwRules) {
    pwRules.querySelectorAll("[data-rule]").forEach((li) => li.classList.remove("ok"));
  }

  paintMatch();
}

function paintMatch() {
  if (!pwMatch || !pwInput || !confirmInput) return;
  const confirm = confirmInput.value;
  if (!confirm) {
    pwMatch.hidden = true;
    pwMatch.textContent = "";
    return;
  }
  const same = confirm === pwInput.value;
  pwMatch.hidden = false;
  pwMatch.dataset.kind = same ? "ok" : "err";
  pwMatch.textContent = same ? "Passwords match" : "Passwords don’t match yet";
}

if (pwInput) {
  pwInput.addEventListener("input", paintStrength);
  paintStrength();
}
if (confirmInput) confirmInput.addEventListener("input", paintMatch);

/* ---------------- reset password ---------------- */

if (forgotBtn) {
  forgotBtn.addEventListener("click", () => {
    const emailInput = signinForm && signinForm.elements.email;
    const email = String(emailInput && emailInput.value ? emailInput.value : "").trim();
    if (validEmail(email)) {
      forgotBtn.setAttribute("href", "forgot.html?email=" + encodeURIComponent(email));
    }
  });
}

/* ---------------- config / session state ---------------- */

if (!configured) {
  if (configNotice) configNotice.hidden = false;
} else {
  onAuthChange(async (user) => {
    if (!user) return;
    const next = safeNext();
    if (next || !location.search.includes("stay=1")) {
      const dest = await destinationFor(user);
      if (!next) {
        showAlert("info", `You’re already signed in as ${user.email || "your account"}. Redirecting…`);
      }
      setTimeout(() => location.replace(dest), 900);
    }
  });
}
