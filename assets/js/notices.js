/* ============================================================
   FENXTEK — notifications (shared)
   notifications/{uid}/{id}  personal  { title, body, link, kind, at }
   broadcasts/{id}           everyone  { title, body, link, kind, at, audience, expiresAt, by }
   users/{uid}/notifSeen     last time the student opened the bell
   ============================================================ */
import { dbKey } from "./firebase.js?v=5";

export const NOTIF_PATH = "notifications";
export const BROADCAST_PATH = "broadcasts";
export const NOTIF_KINDS = ["info", "order", "emi", "offer", "class", "alert"];
export const NOTIF_KIND_ICON = { info: "i-info", order: "i-receipt", emi: "i-clock", offer: "i-gift", class: "i-live", alert: "i-bolt" };

const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

/* only portal routes (#store, #course/x …) or https links */
export function cleanLink(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^#[a-z0-9-]+(\/[A-Za-z0-9_-]+)?$/.test(s)) return s;
  if (/^https:\/\/\S{3,280}$/.test(s)) return s;
  return "";
}

export function noticeRecord({ title, body, link, kind }, now = Date.now()) {
  const rec = { title: clip(title, 120) || "Update from FenxTek", body: clip(body, 500), kind: NOTIF_KINDS.includes(kind) ? kind : "info", at: now };
  const l = cleanLink(link);
  if (l) rec.link = l;
  return rec;
}

/* Multi-path updates that drop one personal notification into a student's bell. */
export async function noticeUpdates(uid, notice, now = Date.now()) {
  if (!uid) return {};
  try {
    const id = await dbKey(`${NOTIF_PATH}/${uid}`);
    return { [`${NOTIF_PATH}/${uid}/${id}`]: noticeRecord(notice, now) };
  } catch (err) {
    console.warn("[notices]", err);
    return {};
  }
}

/* "all" | "members" | "buyers" | "course:ID" | "student:UID" */
export function audienceLabel(a, courseTitle) {
  const s = String(a || "all");
  if (s === "all") return "All students";
  if (s === "members") return "Members";
  if (s === "buyers") return "Course buyers";
  if (s.startsWith("course:")) return `Bought ${courseTitle || s.slice(7)}`;
  return "One student";
}

export function timeAgo(ms, now = Date.now()) {
  const d = Math.max(0, now - Number(ms || 0));
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(Number(ms)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
