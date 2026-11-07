/* ============================================================
   FENXTEK — admin-access.html
   Super admins add / remove admins, promote super admins, invite
   people who haven't signed up yet and see the audit log.
   Not linked publicly; the CRM sidebar links here for super admins.
   ============================================================ */
import { configured, waitForUser, signOutUser, dbGet, dbWatch, dbKey, dbUpdateRoot, isAdminEmail, sendVerification, friendlyError, ADMIN_EMAILS } from "./firebase.js?v=5";
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

init().catch((err) => {
  console.error("[access]", err);
  gate("Couldn’t open admin access", esc((err && (err.code || err.message)) || "Check your connection and the database rules."), "Reload", "admin-access.html");
});
