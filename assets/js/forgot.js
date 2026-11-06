/* ============================================================
   FENXTEK — forgot password
   Sends a Firebase password reset link and shows a clear
   "check your inbox" state with a resend option.
   ============================================================ */

import { configured, sendReset, friendlyError, onAuthChange } from "./firebase.js?v=5";

const $ = (sel) => document.querySelector(sel);

const form = $("#resetForm");
const emailInput = form ? form.elements.email : null;
const alertBox = $("#resetAlert");
const sent = $("#resetSent");
const sentEmail = $("#resetEmail");
const resendBtn = $("#resendBtn");
const configNotice = $("#configNotice");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let lastEmail = "";

function showAlert(kind, message) {
  if (!alertBox) return;
  alertBox.dataset.kind = kind;
  alertBox.textContent = message;
  alertBox.hidden = false;
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

function showSent(email) {
  lastEmail = email;
  if (sentEmail) sentEmail.textContent = email;
  if (form) form.hidden = true;
  if (sent) sent.hidden = false;
  clearAlert();
  const heading = sent && sent.querySelector("h3");
  if (heading) heading.focus?.();
  sent?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function requestReset(email, button) {
  if (!configured) {
    showAlert("err", "Firebase is not configured yet. Add your keys to assets/js/firebase-config.js.");
    return;
  }
  busy(button, true, "Sending…");
  try {
    await sendReset(email);
    showSent(email);
  } catch (err) {
    showAlert("err", friendlyError(err));
    busy(button, false);
  }
}

/* ---------------- prefill from ?email= ---------------- */

const prefill = new URLSearchParams(location.search).get("email") || "";
if (emailInput && prefill) {
  emailInput.value = prefill;
  lastEmail = prefill.trim();
}

/* ---------------- submit ---------------- */

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAlert();
    const email = String(emailInput && emailInput.value ? emailInput.value : "").trim();
    if (!EMAIL_RE.test(email)) {
      showAlert("err", "Enter the email address you signed up with.");
      if (emailInput) emailInput.focus();
      return;
    }
    requestReset(email, form.querySelector('button[type="submit"]'));
  });
}

if (resendBtn) {
  resendBtn.addEventListener("click", () => {
    if (!lastEmail) {
      if (form) form.hidden = false;
      if (sent) sent.hidden = true;
      if (emailInput) emailInput.focus();
      return;
    }
    requestReset(lastEmail, resendBtn);
  });
}

/* ---------------- config / session ---------------- */

if (!configured) {
  if (configNotice) configNotice.hidden = false;
} else {
  onAuthChange((user) => {
    if (!user) return;
    showAlert("info", `You are already signed in as ${user.email || "your account"}. A reset link is only needed after signing out.`);
  });
}
