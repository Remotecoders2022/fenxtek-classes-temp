/* ============================================================
   FENXTEK — admin roles (shared by admin.html, admin-access.html, auth)
   admins/{uid}: true          can open the CRM (rules check this)
   superadmins/{uid}: true     can add / remove admins (admin-access.html)
   adminMeta/{uid}             { email, name, role, addedBy, at }
   adminInvites/{emailKey}     { email, role, by, at } — not signed up yet
   adminLog/{id}               audit trail
   The owner (ADMIN_EMAILS) always gets the super-admin seat.
   BUILTIN_SUPERS are permanent super admins too. Their seat doesn't
   need a verified email (database.rules.json allows exactly these
   addresses to claim their own seat), so only list accounts that
   already exist in Firebase Authentication.
   ============================================================ */
import { dbGet, dbKey, dbUpdateRoot, isAdminEmail } from "./firebase.js?v=5";

export const ROLE_LABEL = { owner: "Owner", super: "Super admin", admin: "Admin" };
export const emailKey = (email) => String(email || "").trim().toLowerCase().replace(/\./g, ",");
export const BUILTIN_SUPERS = ["admin@example.com"];
export const isBuiltinSuper = (user) => Boolean(user && user.email && BUILTIN_SUPERS.includes(String(user.email).trim().toLowerCase()));
const val = (s) => (s && s.exists && s.exists() ? s.val() : null);

/* The signed-in user accepts a pending admin invite (one atomic write). */
export async function claimAdminInvite(user) {
  if (!user || !user.email) return null;
  const key = emailKey(user.email);
  const inv = val(await dbGet(`adminInvites/${key}`).catch(() => null));
  if (!inv) return null;
  if (!user.emailVerified) return { needsVerify: true };
  const now = Date.now();
  const role = inv.role === "super" ? "super" : "admin";
  const updates = {
    [`admins/${user.uid}`]: true,
    [`adminInvites/${key}`]: null,
    [`adminMeta/${user.uid}`]: { email: String(user.email).toLowerCase(), name: String(user.displayName || "").slice(0, 100), role, addedBy: String(inv.by || "").slice(0, 200), at: now }
  };
  if (role === "super") updates[`superadmins/${user.uid}`] = true;
  const logId = await dbKey("adminLog");
  updates[`adminLog/${logId}`] = { at: now, by: String(user.email).toLowerCase(), action: "joined", target: String(user.email).toLowerCase(), role };
  await dbUpdateRoot(updates);
  return { claimed: true, role };
}

/* The owner account claims its super-admin seat (first visit). */
export async function ensureOwnerSeat(user) {
  if (!user) return false;
  if (isBuiltinSuper(user) && !isAdminEmail(user)) {
    const has = val(await dbGet(`superadmins/${user.uid}`).catch(() => null)) === true;
    if (has) return true;
    await dbUpdateRoot({
      [`admins/${user.uid}`]: true,
      [`superadmins/${user.uid}`]: true,
      [`adminMeta/${user.uid}`]: { email: String(user.email).toLowerCase(), name: String(user.displayName || "Super admin").slice(0, 100), role: "super", addedBy: "built-in", at: Date.now() }
    });
    return true;
  }
  if (!isAdminEmail(user) || !user.emailVerified) return false;
  const already = val(await dbGet(`superadmins/${user.uid}`).catch(() => null)) === true;
  if (already) return true;
  await dbUpdateRoot({
    [`admins/${user.uid}`]: true,
    [`superadmins/${user.uid}`]: true,
    [`adminMeta/${user.uid}`]: { email: String(user.email).toLowerCase(), name: String(user.displayName || "Owner").slice(0, 100), role: "owner", addedBy: "owner", at: Date.now() }
  });
  return true;
}

export async function isSuperAdmin(user) {
  if (!user) return false;
  return val(await dbGet(`superadmins/${user.uid}`).catch(() => null)) === true;
}
