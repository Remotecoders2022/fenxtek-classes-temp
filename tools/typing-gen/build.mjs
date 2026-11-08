/* Generates assets/js/typing-layouts.js:
   - Kruti Dev key sequence for every Hindi cluster in the passage bank
   - Inscript key for every Hindi character in the passage bank
   - one-key reference tables for the on-screen keyboard help
   Every entry is round-trip checked against the converter. */
import { krutiDevToUnicode } from "./oracle.mjs";
const bank = new Function(
  fs.readFileSync("../../assets/js/typing-text.js", "utf8").replace(/export const/g, "const") + "\nreturn { PASSAGES, QUICK };"
)();
const { PASSAGES, QUICK } = bank;
import fs from "fs";

/* ---------- Kruti Dev dictionary (build time only) ---------- */
const src = fs.readFileSync("./oracle.mjs", "utf8");
const grab = (name) => {
  const i = src.indexOf(`const ${name} = [`);
  const j = src.indexOf("\n    ];", i);
  return new Function("return [" + src.slice(src.indexOf("[", i) + 1, j) + "]")();
};
const krutiChars = grab("krutiChars");
const unicodeChars = grab("unicodeChars");

const dict = new Map();
/* Prefer key sequences a student can actually press on a US keyboard:
   every ASCII sequence beats every sequence containing a Kruti Dev
   high byte, then shortest wins. */
const score = (k) => (/[^\x20-\x7e]/.test(k) ? 1e6 : 0) + k.length;
const add = (u, k) => {
  if (!u || !k || /[a-zA-Z]/.test(u)) return;
  const prev = dict.get(u);
  if (prev == null || score(k) < score(prev) || (score(k) === score(prev) && k < prev)) dict.set(u, k);
};
krutiChars.forEach((k, i) => add(unicodeChars[i], k));
const chars = Array.from(new Set(krutiChars.join("").split(""))).sort();
for (const c of chars) { try { add(krutiDevToUnicode(c), c); } catch (e) {} }
for (const a of chars) for (const b of chars) { const s = a + b; try { add(krutiDevToUnicode(s), s); } catch (e) {} }

const memo = new Map();
function toKD(text) {
  if (text === "") return "";
  if (memo.has(text)) return memo.get(text);
  memo.set(text, null); // guard against cycles while recursing
  let best = null;
  /* only accept a candidate the converter turns back into this exact
     cluster — Kruti Dev has plenty of short sequences that look right
     but decode to something else. */
  const consider = (cand) => {
    if (cand == null) return;
    if (krutiDevToUnicode(cand) !== text) return;
    if (best == null || score(cand) < score(best)) best = cand;
  };
  /* longest-match tokenisation, backtracking over every split */
  for (let len = Math.min(5, text.length); len >= 1; len--) {
    const head = text.slice(0, len);
    if (!dict.has(head)) continue;
    const rest = toKD(text.slice(len));
    if (rest == null) continue;
    consider(dict.get(head) + rest);
  }
  /* Kruti Dev types the i-matra before its consonant: "हि" is f then g */
  if (text.endsWith("\u093F")) {
    const rest = toKD(text.slice(0, -1));
    if (rest != null) consider("f" + rest);
  }
  memo.set(text, best);
  return best;
}

/* ---------- clusters ---------- */
const CLUSTER = /(?:[\u0915-\u0939\u0958-\u095F]\u094D)*[\u0915-\u0939\u0958-\u095F\u0905-\u0914\u0900-\u0903][\u093E-\u094C\u0901-\u0903\u0951-\u0954\u094D]*/g;
const clustersOf = (t) => t.match(CLUSTER) || [];

/* ---------- Inscript layout ---------- */
const ROWS = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "Backspace"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash"],
  ["CapsLock", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Enter"],
  ["ShiftLeft", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", "ShiftRight"],
  ["ControlLeft", "MetaLeft", "AltLeft", "Space", "AltRight", "MetaRight", "ContextMenu"]
];
let inscriptRows = [];
try {
  const m = await import("@coldsofttech/saccade-hi");
  const L = m.createLayout("inscript", "devanagari");
  inscriptRows = L.layers.letters;
} catch (e) {
  console.error("\n!! Inscript package missing — see tools/typing-gen/README.md\n");
  process.exit(1);
}
if (!inscriptRows.length || !Object.keys(insNormal).length) {
  console.error("\n!! Inscript layout came back empty — refusing to write an empty table\n");
  process.exit(1);
}

const insNormal = new Map(); // unicode -> code
const insShift = new Map();
const insHelp = {}; // code -> [normal, shift]
if (inscriptRows.length) {
  ROWS.forEach((codes, ri) => {
    const row = inscriptRows[ri] || [];
    codes.forEach((code, ci) => {
      const k = ri === 4 && code !== "Space" ? null : row[ci];
      if (!k || k.type !== "text") return;
      if (k.value && !insNormal.has(k.value)) insNormal.set(k.value, code);
      if (k.shift && !insShift.has(k.shift)) insShift.set(k.shift, code);
      insHelp[code] = [k.value || "", k.shift || ""];
    });
  });
  /* altgr on the number row gives Latin digits */
  (inscriptRows[0] || []).forEach((k, i) => {
    if (k && k.type === "text" && k.altgr) {
      if (!insNormal.has(k.altgr)) insNormal.set(k.altgr, ROWS[0][i]);
      insHelp[ROWS[0][i]] = [k.value || "", k.shift || "", k.altgr || ""];
    }
  });
}
console.log("inscript entries:", insNormal.size, "shift:", insShift.size);

/* ---------- build the tables ---------- */
const kd = {};
const kdProblems = [];
const insProblems = [];
const allHi = PASSAGES.hi.concat(QUICK.hi).join("\n");
const clusters = Array.from(new Set(allHi.split("").length ? clustersOf(allHi) : []));
for (const c of clusters.sort()) {
  const keys = toKD(c);
  if (!keys) { kdProblems.push([c, "no mapping"]); continue; }
  const back = krutiDevToUnicode(keys);
  if (back !== c) { kdProblems.push([c, keys, back]); continue; }
  kd[c] = keys;
}
console.log("clusters:", clusters.length, "mapped:", Object.keys(kd).length, "problems:", kdProblems.length);

/* every non-cluster character (space, danda, comma, digits) also needs a key */
const others = Array.from(new Set(allHi.replace(CLUSTER, "").split(""))).filter((c) => c && c !== "\n");
for (const c of others.sort()) {
  const keys = toKD(c);
  if (!keys || krutiDevToUnicode(keys) !== c) { kdProblems.push([c, keys, "non-letter"]); continue; }
  kd[c] = keys;
}
console.log("other chars:", others.length);

if (insNormal.size) {
  for (const c of Array.from(new Set(allHi.split(""))).sort()) {
    if (c === "\n" || c === " ") continue;
    if (!insNormal.has(c) && !insShift.has(c)) insProblems.push(c);
  }
  console.log("inscript gaps:", insProblems.length, insProblems.join(" "));
}

/* one-key reference for the keyboard help */
const kdKey = {};
for (const c of chars) {
  if (!/[\x21-\x7e]/.test(c) || c.length !== 1) continue;
  let u;
  try { u = krutiDevToUnicode(c); } catch (e) { continue; }
  if (u && u !== c) kdKey[c] = u;
}

if (kdProblems.length) {
  console.log("\n!! Kruti Dev problems:");
  kdProblems.forEach((p) => console.log("   ", JSON.stringify(p)));
}

/* ---------- write ---------- */
const out = `/* ============================================================
   FENXTEK — typing layouts (generated — do not edit by hand)
   Built by tools/typing-gen/build.mjs from
   @bharattype/hindi-transliteration (MIT) and @coldsofttech/saccade-hi (MIT).
   Every entry is round-trip checked against the converter.

   KD        Hindi cluster -> the Kruti Dev 010 keys that type it
   KD_KEY    one Kruti Dev key -> what it prints
   INS       Hindi character -> [key code, shift?] on an Inscript keyboard
   INS_KEY   key code -> [normal, shift, altGr] for the on-screen diagram
   ============================================================ */

export const KD = ${JSON.stringify(kd)};
export const KD_KEY = ${JSON.stringify(kdKey)};
export const INS = ${JSON.stringify(
  Object.fromEntries(
    Array.from(new Set(allHi.split("")))
      .filter((c) => c !== "\n")
      .map((c) => [c, insNormal.has(c) ? [insNormal.get(c), 0] : insShift.has(c) ? [insShift.get(c), 1] : null])
      .filter((x) => x && x[1])
  )
)};
export const INS_KEY = ${JSON.stringify(insHelp)};
export const KD_CLUSTER_RE = ${CLUSTER.source ? "/" + CLUSTER.source + "/g" : "null"};
`;
fs.writeFileSync("../../assets/js/typing-layouts.js", out);
console.log("\nwrote assets/js/typing-layouts.js —", (out.length / 1024).toFixed(1), "KB");
