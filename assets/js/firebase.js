/* ============================================================
   FENXTEK — Firebase core
   Loads the v10 modular SDK from the CDN only when configured,
   so the public site keeps working without credentials.
   ============================================================ */

import { firebaseConfig, ADMIN_EMAILS, isFirebaseConfigured } from "./firebase-config.js?v=3";

const CDN = "https://www.gstatic.com/firebasejs/10.12.5";

export const configured = isFirebaseConfigured;
export { ADMIN_EMAILS };

export const fb = {
  ready: false,
  configured,
  app: null,
  auth: null,
  db: null,
  a: null,
  d: null
};

let initPromise = null;

export function initFirebase() {
  if (!configured) return Promise.resolve(fb);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [appMod, authMod, dbMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-database.js`)
    ]);

    fb.app = appMod.initializeApp(firebaseConfig);
    fb.a = authMod;
    fb.d = dbMod;
    fb.auth = authMod.getAuth(fb.app);
    fb.db = dbMod.getDatabase(fb.app);

    try {
      await authMod.setPersistence(fb.auth, authMod.browserLocalPersistence);
    } catch (err) {
      console.warn("[firebase] persistence unavailable", err);
    }

    fb.ready = true;
    return fb;
  })().catch((err) => {
    initPromise = null;
    console.error("[firebase] init failed", err);
    throw err;
  });

  return initPromise;
}

export function requireConfigured() {
  if (!configured) {
    throw new Error("Firebase is not configured. Add your project keys to assets/js/firebase-config.js and serve the site over HTTP.");
  }
  return initFirebase();
}

/* ---------------- auth ---------------- */

export async function onAuthChange(cb) {
  const f = await initFirebase().catch(() => null);
  if (!f || !f.auth) {
    cb(null);
    return () => {};
  }
  return f.a.onAuthStateChanged(f.auth, cb, (err) => {
    console.warn("[firebase] auth state", err);
    cb(null);
  });
}

export function waitForUser() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (user) => {
      if (settled) return;
      settled = true;
      resolve(user);
    };

    /* Last-resort guard only. 5s used to fire before the SDK finished
       loading on slow connections, which sent signed-in admins back
       to the login page in a loop. */
    const guard = setTimeout(() => done(fb.auth ? fb.auth.currentUser : null), 15000);

    initFirebase()
      .then((f) => {
        if (!f.auth) {
          clearTimeout(guard);
          return done(null);
        }
        const off = f.a.onAuthStateChanged(
          f.auth,
          (user) => {
            clearTimeout(guard);
            if (off) off();
            done(user);
          },
          () => {
            clearTimeout(guard);
            if (off) off();
            done(null);
          }
        );
      })
      .catch(() => {
        clearTimeout(guard);
        done(null);
      });
  });
}

export async function signInEmail(email, password) {
  const f = await requireConfigured();
  return f.a.signInWithEmailAndPassword(f.auth, email, password);
}

export async function setPersistenceMode(remember) {
  const f = await initFirebase().catch(() => null);
  if (!f || !f.auth) return;
  try {
    await f.a.setPersistence(f.auth, remember ? f.a.browserLocalPersistence : f.a.browserSessionPersistence);
  } catch (err) {
    console.warn("[firebase] persistence change failed", err);
  }
}

export async function signUpEmail(name, email, password) {
  const f = await requireConfigured();
  const cred = await f.a.createUserWithEmailAndPassword(f.auth, email, password);
  if (name && cred.user) {
    await f.a.updateProfile(cred.user, { displayName: name }).catch(() => {});
  }
  return cred;
}

export async function signInGoogle() {
  const f = await requireConfigured();
  const provider = new f.a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return f.a.signInWithPopup(f.auth, provider);
}

export async function signOutUser() {
  const f = await initFirebase().catch(() => null);
  if (!f || !f.auth) return;
  return f.a.signOut(f.auth);
}

export async function sendReset(email) {
  const f = await requireConfigured();
  return f.a.sendPasswordResetEmail(f.auth, email);
}

export async function updateDisplayName(name) {
  const f = await initFirebase();
  if (!f.auth || !f.auth.currentUser) return;
  return f.a.updateProfile(f.auth.currentUser, { displayName: name });
}

const emailList = ADMIN_EMAILS.map((e) => String(e).trim().toLowerCase());

/* True when the account's email is one of ADMIN_EMAILS (verified or not). */
export function isAdminEmail(user) {
  return Boolean(user && user.email && emailList.includes(String(user.email).trim().toLowerCase()));
}

/* Sends the "verify your email" link to the signed-in user. */
export async function sendVerification() {
  const f = await requireConfigured();
  if (!f.auth || !f.auth.currentUser) return;
  return f.a.sendEmailVerification(f.auth.currentUser);
}

export async function isAdmin(user) {
  if (!user) return false;
  const f = await initFirebase().catch(() => null);
  if (!f || !f.db) return false;

  const ownRef = f.d.ref(f.db, `admins/${user.uid}`);

  if (isAdminEmail(user)) {
    try {
      const snap = await f.d.get(ownRef);
      if (snap.val() === true) return true;

      /* The rules only let a *verified* admin email claim the seat, so
         nobody can register the address with a password first. Google
         sign-in is verified automatically; after clicking an email link
         the cached token is stale, so reload + refresh it first. */
      if (!user.emailVerified && typeof user.reload === "function") await user.reload().catch(() => {});
      const current = (f.auth && f.auth.currentUser) || user;
      if (!current.emailVerified) return false;
      if (typeof current.getIdToken === "function") await current.getIdToken(true).catch(() => {});

      await f.d.set(ownRef, true);

      /* Confirm the seat actually persisted. If the rules reject the
         claim we must report "not admin", not a half-open CRM. */
      const verify = await f.d.get(ownRef);
      return verify.val() === true;
    } catch (err) {
      console.warn("[firebase] could not claim admin seat", err);
      return false;
    }
  }

  try {
    const snap = await f.d.get(ownRef);
    return snap.val() === true;
  } catch (err) {
    console.warn("[firebase] admin check failed", err);
    return false;
  }
}

/* ---------------- database ---------------- */

export async function dbGet(path) {
  const f = await requireConfigured();
  return f.d.get(f.d.ref(f.db, path));
}

export async function dbSet(path, value) {
  const f = await requireConfigured();
  return f.d.set(f.d.ref(f.db, path), value);
}

export async function dbUpdate(path, value) {
  const f = await requireConfigured();
  return f.d.update(f.d.ref(f.db, path), value);
}

export async function dbPush(path, value) {
  const f = await requireConfigured();
  return f.d.push(f.d.ref(f.db, path), value);
}

export async function dbRemove(path) {
  const f = await requireConfigured();
  return f.d.remove(f.d.ref(f.db, path));
}

/* Atomic multi-path write: { "a/b": 1, "c/d": {...} }. Either every
   path is written or none is (the rules see the combined new state). */
export async function dbUpdateRoot(updates) {
  const f = await requireConfigured();
  return f.d.update(f.d.ref(f.db), updates);
}

/* A fresh, chronologically sortable push key (nothing is written). */
export async function dbKey(path) {
  const f = await requireConfigured();
  return f.d.push(f.d.ref(f.db, path)).key;
}

export async function dbTransaction(path, fn) {
  const f = await requireConfigured();
  return f.d.runTransaction(f.d.ref(f.db, path), fn);
}

export async function dbWatch(path, cb) {
  const f = await initFirebase().catch(() => null);
  if (!f || !f.db) return () => {};
  return f.d.onValue(
    f.d.ref(f.db, path),
    (snap) => cb(snap.val(), snap),
    (err) => console.warn("[firebase] watch " + path, err)
  );
}

/* Convert an RTDB object/array into a sorted array. */
export function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.keys(value)
    .map((key) => ({ id: key, ...(typeof value[key] === "object" ? value[key] : { value: value[key] }) }))
    .sort((a, b) => {
      const ao = Number(a.order);
      const bo = Number(b.order);
      if (!isNaN(ao) && !isNaN(bo) && ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function friendlyError(err) {
  const code = String((err && err.code) || "");
  const map = {
    "auth/invalid-email": "That email address doesn’t look right.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/email-already-in-use": "This email is already registered. Try signing in instead.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the Google pop-up. Allow pop-ups and retry.",
    "auth/network-request-failed": "Network error. Check your connection and retry.",
    "auth/operation-not-allowed": "This sign-in method is disabled in the Firebase console."
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
}
