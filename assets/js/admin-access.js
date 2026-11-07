/* ============================================================
   FENXTEK — admin-access.html
   Super admins add / remove admins, promote super admins, invite
   people who haven't signed up yet, create a brand-new login
   (email + password) for a new admin, and see the audit log.
   Not linked publicly; the CRM sidebar links here for super admins.
   ============================================================ */
import { configured, waitForUser, signOutUser, dbGet, dbWatch, dbKey, dbUpdateRoot, isAdminEmail, sendVerification, friendlyError, ADMIN_EMAILS, initFirebase } from "./firebase.js?v=5";
import { firebaseConfig } from "./firebase-config.js?v=3";
import { ROLE_LABEL, emailKey, claimAdminInvite, ensureOwnerSeat, isSuperAdmin, isBuiltinSuper, BUILTIN_SUPERS } from "./admin-claim.js?v=2";

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const OWNERS = (ADMIN_EMAILS || []).map((e) => String(e).toLowerCase());
const when = (ms) => (ms ? new Date(Number(ms)).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const X = { user: null, admins: {}, supers: {}, meta: {}, invites: {}, log: [], users: {}, usersLoaded: false };

function gate(title, text, primary, href) {
  $("#aaGate").innerHTML =
    `<div class="crm-card aa-gate-card"><span class="aa-k">${icon("i-lock")}Admin access</span><h1>${esc(title)}</h1><p>${text}</p>` +
    `<div class="aa-gate-acts"><a class="p-btn p-btn--lime" href="${esc(href)}"><span>${esc(primary)}</span>${icon("i-arr")}</a><a class="p-btn p-btn--ghost" href="index.html"><span>Back to site</span></a></div></div>`;
  $("#aaGate").hidden = false;
  $("#aaApp").hidden = true;
}

function alert(kind, msg) {
  const el = $("#aaAlert");
  el.hidden = false;
  el.className = `p-alert p-alert--${kind === "err" ? "err" : "ok"}`;
  el.dataset.kind = kind === "err" ? "err" : "ok";
  el.textContent = msg;
  clearTimeout(alert.t);
  alert.t = setTimeout(() => (el.hidden = true), 7000);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function busy(btn, label, fn) {
  const old = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = label;
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}

async function init() {
  document.body.classList.add("loaded");
  if (!configured) return gate("Firebase not configured", "Add your keys to assets/js/firebase-config.js first.", "Open sign in", "auth.html");
  const user = await waitForUser();
  if (!user) {
    location.replace("auth.html?next=" + encodeURIComponent("admin-access.html"));
    return;
  }
  X.user = user;
  $("#aaOut").hidden = false;
  $("#aaOut").addEventListener("click", async () => {
    try {
      await signOutUser();
    } finally {
      location.replace("index.html");
    }
  });

  const inv = isBuiltinSuper(user) ? null : await claimAdminInvite(user).catch(() => null);
  if (inv && inv.needsVerify) {
    const sent = await sendVerification().then(() => true).catch(() => false);
    return gate("Verify your email", `You’ve been invited as an admin. Verify ${esc(user.email)} ${sent ? "(we just sent a link)" : ""} and reload this page.`, "Reload", "admin-access.html");
  }
  if (isAdminEmail(user) && !user.emailVerified) {
    const sent = await sendVerification().then(() => true).catch(() => false);
    return gate("Verify the owner email", `${esc(user.email)} owns this academy but isn’t verified yet. ${sent ? "We just sent a verification link — " : ""}open it, then reload. Or sign in with Google using the same Gmail.`, "Reload", "admin-access.html");
  }
  await ensureOwnerSeat(user).catch((err) => console.warn("[access] owner seat", err));
  const sup = await isSuperAdmin(user);
  if (!sup) {
    return gate(
      "Super admins only",
      `You’re signed in as <b>${esc(user.email || "this account")}</b>. Only a super admin can manage who has admin access. Ask the academy owner to promote you.`,
      "Open the CRM",
      "admin.html"
    );
  }

  $("#aaGate").hidden = true;
  $("#aaApp").hidden = false;
  $("#aaMe").hidden = false;
  $("#aaAv").textContent = String(user.displayName || user.email || "A").trim().charAt(0).toUpperCase();
  $("#aaMeName").textContent = user.displayName || user.email;
  $("#aaMeRole").textContent = OWNERS.includes(String(user.email).toLowerCase()) ? "Owner" : "Super admin";

  const watch = (path, key) =>
    dbWatch(path, (v) => {
      X[key] = v && typeof v === "object" ? v : {};
      paint();
    });
  watch("admins", "admins");
  watch("superadmins", "supers");
  watch("adminMeta", "meta");
  watch("adminInvites", "invites");
  dbWatch("adminLog", (v) => {
    X.log = Object.entries(v || {})
      .map(([id, l]) => ({ ...l, id }))
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
      .slice(0, 60);
    paintLog();
  });
  loadUsers();

  $("#aaForm").addEventListener("submit", onAdd);
  $("#aaCreate").addEventListener("submit", onCreate);
  bindCreateForm();
  $("#aaTeam").addEventListener("click", onTeam);
  $("#aaInvites").addEventListener("click", onInvite);
}

async function loadUsers(force) {
  if (X.usersLoaded && !force) return;
  try {
    const snap = await dbGet("users");
    X.users = (snap && snap.val && snap.val()) || {};
    X.usersLoaded = true;
    $("#aaUsers").innerHTML = Object.values(X.users)
      .filter((u) => u && u.email)
      .slice(0, 500)
      .map((u) => `<option value="${esc(String(u.email).toLowerCase())}">${esc(u.name || "")}</option>`)
      .join("");
    paint();
  } catch (err) {
    console.warn("[access] users", err);
  }
}

function personOf(uid) {
  const m = X.meta[uid] || {};
  const u = X.users[uid] || {};
  const email = String(m.email || u.email || "").toLowerCase();
  const owner = m.role === "owner" || OWNERS.includes(email);
  const sup = X.supers[uid] === true;
  const fixed = owner || BUILTIN_SUPERS.includes(email);
  return { uid, email, name: m.name || u.name || "", role: owner ? "owner" : sup || fixed ? "super" : "admin", sup: sup || fixed, owner, fixed, addedBy: m.addedBy || "", at: m.at || 0, me: uid === X.user.uid };
}

function paint() {
  const team = Object.keys(X.admins)
    .filter((uid) => X.admins[uid] === true)
    .map(personOf)
    .sort((a, b) => ({ owner: 0, super: 1, admin: 2 }[a.role] - { owner: 0, super: 1, admin: 2 }[b.role]) || String(a.email).localeCompare(String(b.email)));
  const invites = Object.entries(X.invites).map(([key, v]) => ({ key, ...v }));
  $("#aaStats").innerHTML =
    `<div><b>${team.length}</b><span>Admins</span></div>` + `<div><b>${team.filter((p) => p.sup || p.owner).length}</b><span>Super admins</span></div>` + `<div><b>${invites.length}</b><span>Pending invites</span></div>`;

  $("#aaTeam").innerHTML = team.length
    ? team
        .map((p) => {
          const label = ROLE_LABEL[p.role];
          const acts = [];
          if (!p.fixed && !p.me) {
            acts.push(
              p.sup
                ? `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-aa-demote="${esc(p.uid)}">${icon("i-arr-d")}<span>Make admin</span></button>`
                : `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-aa-promote="${esc(p.uid)}">${icon("i-arr-u")}<span>Make super admin</span></button>`
            );
            acts.push(`<button class="as-icon as-icon--danger" type="button" data-aa-remove="${esc(p.uid)}" title="Remove admin access">${icon("i-trash")}</button>`);
          }
          return (
            `<div class="aa-row">` +
            `<span class="aa-av aa-av--${p.role}">${esc((p.name || p.email || "?").trim().charAt(0).toUpperCase())}</span>` +
            `<div class="aa-row-main"><b>${esc(p.name || p.email || p.uid)}${p.me ? ` <em class="aa-you">You</em>` : ""}</b><small>${esc(p.email || `uid ${p.uid}`)}${p.addedBy && !p.owner ? ` · added by ${esc(p.addedBy)}` : ""}${p.at ? ` · ${esc(when(p.at))}` : ""}</small></div>` +
            `<span class="aa-pill aa-pill--${p.role}">${p.owner ? icon("i-crown") : p.sup ? icon("i-key") : icon("i-shield")}${esc(label)}</span>` +
            `<div class="aa-row-acts">${acts.join("") || (p.fixed ? `<span class="aa-lock" title="${p.owner ? "The owner" : "A built-in super admin"} can’t be removed">${icon("i-lock")}</span>` : "")}</div>` +
            `</div>`
          );
        })
        .join("")
    : `<p class="crm-table-empty">No admins yet.</p>`;

  $("#aaInvites").innerHTML = invites.length
    ? invites
        .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
        .map(
          (i) =>
            `<div class="aa-row"><span class="aa-av aa-av--invite">${icon("i-mail")}</span>` +
            `<div class="aa-row-main"><b>${esc(i.email)}</b><small>Invited as ${esc(ROLE_LABEL[i.role] || "Admin")}${i.by ? ` by ${esc(i.by)}` : ""} · ${esc(when(i.at))}</small></div>` +
            `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-aa-copy="${esc(i.email)}">${icon("i-copy")}<span>Copy link</span></button>` +
            `<button class="as-icon as-icon--danger" type="button" data-aa-revoke="${esc(i.key)}" title="Cancel invite">${icon("i-x")}</button></div>`
        )
        .join("")
    : `<p class="crm-table-empty">No pending invites.</p>`;
}

const LOG_TEXT = {
  created: (l) => `created a login for <b>${esc(l.target)}</b> with ${esc(ROLE_LABEL[l.role] || "Admin")} access`,
  added: (l) => `gave <b>${esc(l.target)}</b> ${esc(ROLE_LABEL[l.role] || "Admin")} access`,
  invited: (l) => `invited <b>${esc(l.target)}</b> as ${esc(ROLE_LABEL[l.role] || "Admin")}`,
  removed: (l) => `removed <b>${esc(l.target)}</b>`,
  revoked: (l) => `cancelled the invite for <b>${esc(l.target)}</b>`,
  promoted: (l) => `made <b>${esc(l.target)}</b> a super admin`,
  demoted: (l) => `changed <b>${esc(l.target)}</b> to admin`,
  joined: () => `accepted the invite and joined`
};
function paintLog() {
  const box = $("#aaLog");
  box.innerHTML = X.log.length
    ? X.log.map((l) => `<div class="aa-log-row"><i class="aa-dot aa-dot--${esc(l.action)}"></i><p><b>${esc(l.by)}</b> ${(LOG_TEXT[l.action] || (() => esc(l.action)))(l)}</p><small>${esc(when(l.at))}</small></div>`).join("")
    : `<p class="crm-table-empty">Nothing yet — changes you make here are recorded.</p>`;
}

async function logEntry(action, target, role) {
  const id = await dbKey("adminLog");
  const rec = { at: Date.now(), by: String(X.user.email || "").toLowerCase(), action, target: String(target || "").slice(0, 200) };
  if (role) rec.role = role;
  return { [`adminLog/${id}`]: rec };
}

async function onAdd(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = String(form.email.value || "").trim().toLowerCase();
  const role = (form.querySelector('input[name="role"]:checked') || {}).value === "super" ? "super" : "admin";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("err", "Enter a valid email address.");
  await busy(form.querySelector("button[type=submit]"), "Saving…", async () => {
    try {
      await loadUsers(true);
      const uid = Object.keys(X.users).find((k) => X.users[k] && String(X.users[k].email || "").toLowerCase() === email);
      const now = Date.now();
      const me = String(X.user.email || "").toLowerCase();
      if (uid) {
        const p = personOf(uid);
        if (X.admins[uid] === true && (p.sup || p.owner) === (role === "super")) return alert("ok", `${email} is already ${role === "super" ? "a super admin" : "an admin"}.`);
        const updates = {
          [`admins/${uid}`]: true,
          [`adminMeta/${uid}`]: { email, name: String((X.users[uid] && X.users[uid].name) || "").slice(0, 100), role, addedBy: me, at: (X.meta[uid] && X.meta[uid].at) || now }
        };
        if (uid === X.user.uid) return alert("err", "You can’t change your own role.");
        updates[`superadmins/${uid}`] = role === "super" ? true : null;
        Object.assign(updates, await logEntry(X.admins[uid] === true ? (role === "super" ? "promoted" : "demoted") : "added", email, role));
        await dbUpdateRoot(updates);
        alert("ok", `${email} now has ${role === "super" ? "super admin" : "admin"} access. They’ll see the CRM next time they open admin.html.`);
      } else {
        const key = emailKey(email);
        const updates = { [`adminInvites/${key}`]: { email, role, by: me, at: now } };
        Object.assign(updates, await logEntry("invited", email, role));
        await dbUpdateRoot(updates);
        alert("ok", `Invite saved. Ask ${email} to sign up at ${location.origin}/auth.html with this email — admin access switches on automatically.`);
      }
      form.email.value = "";
    } catch (err) {
      alert("err", friendlyError(err));
    }
  });
}

async function onTeam(e) {
  const pro = e.target.closest("[data-aa-promote]");
  const dem = e.target.closest("[data-aa-demote]");
  const rem = e.target.closest("[data-aa-remove]");
  const btn = pro || dem || rem;
  if (!btn) return;
  const uid = btn.dataset.aaPromote || btn.dataset.aaDemote || btn.dataset.aaRemove;
  const p = personOf(uid);
  if (p.me || p.fixed) return;
  const who = p.email || p.uid;
  try {
    if (rem) {
      if (!window.confirm(`Remove admin access for ${who}? They’ll keep their student account.`)) return;
      const updates = { [`admins/${uid}`]: null, [`superadmins/${uid}`]: null, [`adminMeta/${uid}`]: null };
      Object.assign(updates, await logEntry("removed", who));
      await busy(btn, "…", () => dbUpdateRoot(updates));
      alert("ok", `${who} no longer has admin access.`);
    } else {
      const up = Boolean(pro);
      if (up && !window.confirm(`Make ${who} a super admin? They’ll be able to add and remove admins.`)) return;
      const updates = { [`superadmins/${uid}`]: up ? true : null };
      updates[`adminMeta/${uid}`] = { email: p.email, name: String(p.name || "").slice(0, 100), role: up ? "super" : "admin", addedBy: p.addedBy || String(X.user.email || "").toLowerCase(), at: p.at || Date.now() };
      Object.assign(updates, await logEntry(up ? "promoted" : "demoted", who, up ? "super" : "admin"));
      await busy(btn, "…", () => dbUpdateRoot(updates));
      alert("ok", up ? `${who} is now a super admin.` : `${who} is now an admin.`);
    }
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

async function onInvite(e) {
  const copy = e.target.closest("[data-aa-copy]");
  if (copy) {
    const text = `You’ve been invited to the FenxTek admin team. Sign in with ${copy.dataset.aaCopy} here: ${location.origin}/auth.html?next=admin.html`;
    try {
      await navigator.clipboard.writeText(text);
      alert("ok", "Invite message copied — paste it on WhatsApp or email.");
    } catch (err) {
      window.prompt("Copy this invite message:", text);
    }
    return;
  }
  const rev = e.target.closest("[data-aa-revoke]");
  if (!rev) return;
  const inv = X.invites[rev.dataset.aaRevoke];
  if (!inv || !window.confirm(`Cancel the invite for ${inv.email}?`)) return;
  try {
    const updates = { [`adminInvites/${rev.dataset.aaRevoke}`]: null };
    Object.assign(updates, await logEntry("revoked", inv.email));
    await dbUpdateRoot(updates);
    alert("ok", "Invite cancelled.");
  } catch (err) {
    alert("err", friendlyError(err));
  }
}

/* ============================================================
   Create a new login for an admin
   The account is created on a short-lived second Firebase app
   (in-memory auth), so the super admin's own session is untouched.
   The new account writes its own users/<uid> profile; the super
   admin then grants admins/<uid> (+ superadmins) in one update.
   ============================================================ */
const SDK = "https://www.gstatic.com/firebasejs/10.12.5";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setMode(mode) {
  document.querySelectorAll("[data-aa-mode]").forEach((b) => {
    const on = b.dataset.aaMode === mode;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("#aaCreate").hidden = mode !== "create";
  $("#aaForm").hidden = mode !== "grant";
  $("#aaCreds").hidden = true;
}

function pwScore(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) n++;
  return pw.length < 8 ? Math.min(n, 1) : n;
}
const PW_TEXT = ["Use 8+ characters with letters and numbers", "Too weak", "Okay", "Strong", "Very strong"];

function makePassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!?"];
  const all = sets.join("");
  const rnd = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const out = sets.map((set) => set[rnd(set.length)]);
  while (out.length < 12) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

function paintMeter() {
  const pw = $("#aaCreate").password.value;
  const lvl = pw ? Math.max(1, pwScore(pw)) : 0;
  const m = $("#aaMeter");
  m.dataset.lvl = String(lvl);
  m.querySelector("small").textContent = PW_TEXT[lvl];
}

function bindCreateForm() {
  document.querySelectorAll("[data-aa-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.aaMode)));
  const form = $("#aaCreate");
  form.password.addEventListener("input", paintMeter);
  form.querySelector("[data-aa-eye]").addEventListener("click", (e) => {
    const show = form.password.type === "password";
    form.password.type = show ? "text" : "password";
    e.currentTarget.innerHTML = icon(show ? "i-x" : "i-eye");
    e.currentTarget.title = show ? "Hide password" : "Show password";
  });
  form.querySelector("[data-aa-gen]").addEventListener("click", () => {
    form.password.value = makePassword();
    form.password.type = "text";
    form.querySelector("[data-aa-eye]").innerHTML = icon("i-x");
    paintMeter();
  });
  $("#aaCreds").addEventListener("click", onCreds);
}

const CREATE_ERR = {
  "auth/email-already-in-use": "This email already has a FenxTek account. Use “Existing account” to give it admin access.",
  "auth/invalid-email": "That email address doesn’t look right.",
  "auth/weak-password": "Choose a stronger password (at least 8 characters with letters and numbers).",
  "auth/operation-not-allowed": "Email/password sign-in is turned off. Enable it in Firebase Console → Authentication → Sign-in method.",
  "auth/too-many-requests": "Too many attempts from this device. Wait a few minutes and try again.",
  "auth/network-request-failed": "Network error — check your connection and try again."
};

async function createAccount(email, password, name) {
  const f = await initFirebase();
  const appMod = await import(`${SDK}/firebase-app.js`);
  const app2 = appMod.initializeApp(firebaseConfig, `fx-create-${Date.now().toString(36)}`);
  try {
    const auth2 = f.a.getAuth(app2);
    await f.a.setPersistence(auth2, f.a.inMemoryPersistence).catch(() => {});
    const cred = await f.a.createUserWithEmailAndPassword(auth2, email, password);
    const nu = cred.user;
    if (name) await f.a.updateProfile(nu, { displayName: name }).catch(() => {});
    /* the new account writes its own profile (users/<uid> is owner-only) */
    let profiled = true;
    try {
      await f.d.set(f.d.ref(f.d.getDatabase(app2), `users/${nu.uid}`), { email, name, createdAt: Date.now() });
    } catch (err) {
      profiled = false;
      console.warn("[access] new admin profile", err);
    }
    await f.a.signOut(auth2).catch(() => {});
    return { uid: nu.uid, profiled };
  } finally {
    if (appMod.deleteApp) appMod.deleteApp(app2).catch(() => {});
  }
}

async function onCreate(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const name = String(form.name.value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const email = String(form.email.value || "").trim().toLowerCase();
  const password = String(form.password.value || "");
  const role = (form.querySelector('input[name="crole"]:checked') || {}).value === "super" ? "super" : "admin";
  if (name.length < 2) return alert("err", "Enter the admin’s full name."), form.name.focus();
  if (!EMAIL_RE.test(email)) return alert("err", "Enter a valid login email."), form.email.focus();
  if (password.length < 8 || pwScore(password) < 2) return alert("err", "Use at least 8 characters with letters and numbers — or tap Generate."), form.password.focus();
  if (role === "super" && !window.confirm(`Create ${email} as a SUPER admin? They’ll be able to add and remove admins.`)) return;

  await busy(form.querySelector("button[type=submit]"), "Creating login…", async () => {
    let acc;
    try {
      acc = await createAccount(email, password, name);
    } catch (err) {
      const code = String((err && err.code) || "");
      alert("err", CREATE_ERR[code] || friendlyError(err));
      if (code === "auth/email-already-in-use") {
        setMode("grant");
        $("#aaForm").email.value = email;
      }
      return;
    }
    const now = Date.now();
    const me = String(X.user.email || "").toLowerCase();
    const updates = {
      [`admins/${acc.uid}`]: true,
      [`adminMeta/${acc.uid}`]: { email, name, role, addedBy: me, at: now }
    };
    if (role === "super") updates[`superadmins/${acc.uid}`] = true;
    Object.assign(updates, await logEntry("created", email, role));
    try {
      await dbUpdateRoot(updates);
    } catch (err) {
      alert("err", `The login for ${email} was created, but admin access couldn’t be saved (${friendlyError(err)}). Switch to “Existing account” and grant access to this email.`);
      setMode("grant");
      $("#aaForm").email.value = email;
      loadUsers(true);
      return;
    }
    let mailed = false;
    if (form.mailLink.checked) {
      try {
        const f = await initFirebase();
        await f.a.sendPasswordResetEmail(f.auth, email);
        mailed = true;
      } catch (err) {
        console.warn("[access] set-password mail", err);
      }
    }
    form.reset();
    paintMeter();
    form.password.type = "password";
    form.querySelector("[data-aa-eye]").innerHTML = icon("i-eye");
    showCreds({ name, email, password, role, mailed });
    loadUsers(true);
  });
}

function credsText(c) {
  return (
    `Hi ${c.name.split(" ")[0]}, your FenxTek ${c.role === "super" ? "super admin" : "admin"} login is ready.\n\n` +
    `Sign in: ${location.origin}/auth.html?next=admin.html\n` +
    `Email: ${c.email}\n` +
    `Password: ${c.password}\n\n` +
    `Please change your password after your first sign-in (Forgot password on the sign-in page).`
  );
}

function showCreds(c) {
  X.creds = c;
  const box = $("#aaCreds");
  $("#aaCreate").hidden = true;
  box.hidden = false;
  box.innerHTML =
    `<div class="aa-creds-head"><span class="aa-creds-ok">${icon("i-check")}</span><div><b>Login created</b><small>${esc(c.name)} is now ${c.role === "super" ? "a super admin" : "an admin"}${c.mailed ? " · set-password email sent" : ""}</small></div></div>` +
    `<dl class="aa-creds-list">` +
    `<div><dt>Sign-in page</dt><dd>${esc(location.host)}/auth.html</dd></div>` +
    `<div><dt>Email</dt><dd>${esc(c.email)}</dd></div>` +
    `<div><dt>Password</dt><dd><code id="aaCredPw" data-shown="0">••••••••••••</code><button type="button" class="aa-mini" data-aa-cred="show">${icon("i-eye")}<span>Show</span></button></dd></div>` +
    `</dl>` +
    `<p class="aa-creds-warn">${icon("i-lock")}This password is shown only now. Share it privately — they can change it after signing in.</p>` +
    `<div class="aa-creds-acts">` +
    `<button type="button" class="p-btn p-btn--lime" data-aa-cred="copy">${icon("i-copy")}<span>Copy login details</span></button>` +
    `<button type="button" class="p-btn p-btn--ghost" data-aa-cred="wa">${icon("i-wa")}<span>Share on WhatsApp</span></button>` +
    `<button type="button" class="p-btn p-btn--ghost" data-aa-cred="done">${icon("i-plus")}<span>Create another</span></button>` +
    `</div>`;
  alert("ok", `Login created for ${c.email} with ${c.role === "super" ? "super admin" : "admin"} access.`);
}

async function onCreds(e) {
  const b = e.target.closest("[data-aa-cred]");
  if (!b || !X.creds) return;
  const c = X.creds;
  const act = b.dataset.aaCred;
  if (act === "show") {
    const code = $("#aaCredPw");
    const shown = code.dataset.shown === "1";
    code.textContent = shown ? "••••••••••••" : c.password;
    code.dataset.shown = shown ? "0" : "1";
    b.innerHTML = `${icon(shown ? "i-eye" : "i-x")}<span>${shown ? "Show" : "Hide"}</span>`;
  } else if (act === "copy") {
    try {
      await navigator.clipboard.writeText(credsText(c));
      alert("ok", "Login details copied — paste them in a private chat.");
    } catch (err) {
      window.prompt("Copy these login details:", credsText(c));
    }
  } else if (act === "wa") {
    window.open(`https://wa.me/?text=${encodeURIComponent(credsText(c))}`, "_blank", "noopener");
  } else if (act === "done") {
    X.creds = null;
    $("#aaCreds").hidden = true;
    $("#aaCreds").innerHTML = "";
    $("#aaCreate").hidden = false;
    $("#aaCreate").name.focus();
  }
}

init().catch((err) => {
  console.error("[access]", err);
  gate("Couldn’t open admin access", esc((err && (err.code || err.message)) || "Check your connection and the database rules."), "Reload", "admin-access.html");
});
