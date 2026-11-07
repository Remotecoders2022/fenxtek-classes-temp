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
  const admin = isAdminEmail(user) || (await isAdmin(user).catch(() => false));
  if (admin) return /^admin\.html/i.test(next) ? next : "admin.html";
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
