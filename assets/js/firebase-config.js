/* ============================================================
   FIREBASE CONFIGURATION
   ------------------------------------------------------------
   Project: whatsappy-b69e1
   1. Enable Authentication -> Sign-in method -> Email/Password
      and Google.
   2. Paste this file's rules (database.rules.json) into
      Realtime Database -> Rules and publish.
   3. Set ADMIN_EMAILS to the Gmail address that should own the CRM
      (and use the same address inside database.rules.json).
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyBElQHayhqWOktn3gtp_WrMD2ADR6_Y8hg",
  authDomain: "whatsappy-b69e1.firebaseapp.com",
  databaseURL: "https://whatsappy-b69e1-default-rtdb.firebaseio.com",
  projectId: "whatsappy-b69e1",
  storageBucket: "whatsappy-b69e1.firebasestorage.app",
  messagingSenderId: "581607660936",
  appId: "1:581607660936:web:6f13156b911d28acc3ae3d"
};

/* The admin Gmail address. Replace this and the same address inside
   database.rules.json before deploying the rules. */
export const ADMIN_EMAILS = ["admin@example.com"];

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.databaseURL
);
