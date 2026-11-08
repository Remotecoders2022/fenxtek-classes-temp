/* ============================================================
   FENXTEK — typing test (monkeytype style)
   A section of the student portal. Three layouts: plain English,
   Hindi in Kruti Dev 010 and Hindi in Mangal (Inscript). Speed is
   counted the way the exams do it — 5 keystrokes = 1 word.

   Results and personal bests live on the student's account
   (typing/<uid> and typingBest/<uid>/<mode>), so they follow the
   student across devices.
   ============================================================ */

import { dbUpdateRoot, dbKey, dbWatch, friendlyError } from "./firebase.js?v=5";
import { PATH, esc, num } from "./commerce.js?v=5";
import { krutiDevToUnicode } from "./typing-kd.js?v=1";
import { PASSAGES, QUICK } from "./typing-text.js?v=1";
import { KD, KD_KEY, INS_KEY } from "./typing-layouts.js?v=1";

const icon = (n) => `<svg class="ty-ic" aria-hidden="true"><use href="#${n}"/></svg>`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(num(n) * 10) / 10;
const fmtN = (n) => Math.round(num(n)).toLocaleString("en-IN");
const coinWord = (n) => (num(n) === 1 ? "E-coin" : "E-coins");

/* ---------- modes ---------- */
const MODES = [
  { id: "en", label: "English", sub: "QWERTY · plain text", hi: false },
  { id: "kd", label: "हिन्दी · कृतिदेव", sub: "Kruti Dev 010", hi: true },
  { id: "ins", label: "हिन्दी · मंगल", sub: "Inscript", hi: true }
];
const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];
const DURS = [15, 30, 60, 120];

/* ---------- physical keyboard (US layout, layout independent) ----------
   The student's OS layout must not change the test: we read e.code
   and translate it ourselves, so an Inscript or AZERTY system
   layout still produces the same characters. */
const US = {
  Backquote: "`~", Digit1: "1!", Digit2: "2@", Digit3: "3#", Digit4: "4$", Digit5: "5%",
  Digit6: "6^", Digit7: "7&", Digit8: "8*", Digit9: "9(", Digit0: "0)", Minus: "-_", Equal: "=+",
  KeyQ: "qQ", KeyW: "wW", KeyE: "eE", KeyR: "rR", KeyT: "tT", KeyY: "yY", KeyU: "uU",
  KeyI: "iI", KeyO: "oO", KeyP: "pP", BracketLeft: "[{", BracketRight: "]}", Backslash: "\\|",
  KeyA: "aA", KeyS: "sS", KeyD: "dD", KeyF: "fF", KeyG: "gG", KeyH: "hH", KeyJ: "jJ",
  KeyK: "kK", KeyL: "lL", Semicolon: ";:", Quote: "'\"",
  KeyZ: "zZ", KeyX: "xX", KeyC: "cC", KeyV: "vV", KeyB: "bB", KeyN: "nN", KeyM: "mM",
  Comma: ",<", Period: ".>", Slash: "/?", Space: "  "
};
const CHAR2KEY = {};
Object.keys(US).forEach((code) => {
  US[code].split("").forEach((ch, i) => {
    if (!(ch in CHAR2KEY)) CHAR2KEY[ch] = { code, shift: i === 1 };
  });
});
/* Inscript: key code -> Devanagari character per shift state */
const INS_REV = {};
Object.keys(INS_KEY || {}).forEach((code) => {
  const [lo, hi] = INS_KEY[code];
  if (lo) INS_REV[lo] = { code, shift: 0 };
  if (hi && !(hi in INS_REV)) INS_REV[hi] = { code, shift: 1 };
});
const DIAG_ROWS = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
  ["Space"]
];

/* ---------- passage cells ---------- */
const CLUSTER_RE = /(?:[\u0915-\u0939\u0958-\u095F]\u094D)*[\u0915-\u0939\u0958-\u095F\u0905-\u0914\u0900-\u0903][\u093E-\u094C\u0901-\u0903\u0951-\u0954\u094D]*/g;
function cellsOf(word, mode) {
  if (!word) return [];
  if (mode !== "kd") return Array.from(word);
  /* group the word into Kruti Dev clusters, keeping punctuation and any
     stray character as a cell of its own (a word like "है," is two
     keystroke groups: "है" then ",") */
  const out = [];
  let i = 0;
  while (i < word.length) {
    CLUSTER_RE.lastIndex = i;
    const m = CLUSTER_RE.exec(word);
    if (m && m.index === i && m[0]) {
      out.push(m[0]);
      i += m[0].length;
    } else {
      out.push(word[i]);
      i += 1;
    }
  }
  CLUSTER_RE.lastIndex = 0;
  return out;
}
/* canonical Kruti Dev keys for one cell (used for the key hint) */
const kdCanon = (cell) => KD[cell] || "";

/* ============================================================
   state (module level: a re-render must not kill a live test)
   ============================================================ */
const T = {
  mode: "en",
  dur: 60,
  text: "",
  words: [], // [{ cells: [str], space: bool }]
  flat: [], // cell text, in order
  target: "", // the passage as one string (cells joined)
  typed: [], // char modes: { ch, ok }
  raw: [], // kd mode: { ch, err }
  pos: 0, // kd: characters of the target produced so far
  cellIdx: 0,
  cellTyped: "",
  badCells: new Set(),
  strokes: 0,
  errCount: 0,
  running: false,
  done: false,
  startedAt: 0,
  endAt: 0,
  samples: [], // { t, correct, errors }
  lastSec: 0,
  result: null,
  keysOn: true,
  bag: { en: [], hi: [] },
  coinNote: ""
};

let CTX = {
  uid: () => "",
  toast: () => {},
  changed: () => {},
  rewards: () => null,
  wallet: () => null,
  walletTx: () => [],
  tests: () => [],
  best: () => ({})
};

/* live data */
let DB = { tests: [], best: {} };
export function initTyping(ctx) {
  CTX = { ...CTX, ...ctx };
  const uid = CTX.uid();
  if (!uid) return;
  dbWatch(`typing/${uid}`, (v) => {
    DB.tests = Object.keys(v || {})
      .map((k) => ({ id: k, ...(v[k] || {}) }))
      .sort((a, b) => num(b.at) - num(a.at));
    CTX.changed("typing");
  });
  dbWatch(`typingBest/${uid}`, (v) => {
    DB.best = v && typeof v === "object" ? v : {};
    CTX.changed("typing");
  });
}

/* ---------- random passages (shuffle bag, no early repeats) ---------- */
function pick(list, bagKey) {
  const bag = T.bag[bagKey];
  if (!bag.length) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    bag.push(...arr);
  }
  return bag.pop();
}
const bankFor = (mode) => (mode === "en" ? PASSAGES.en : PASSAGES.hi);

/* ============================================================
   starting / resetting a test
   ============================================================ */
function newTest() {
  const mode = T.mode;
  const hi = modeOf(mode).hi;
  const list = bankFor(mode);
  const text = T.dur <= 30 ? (QUICK[hi ? "hi" : "en"].length ? (Math.random() < 0.5 ? pick(QUICK[hi ? "hi" : "en"], hi ? "hi" : "en") : pick(list, hi ? "hi" : "en")) : pick(list, hi ? "hi" : "en")) : pick(list, hi ? "hi" : "en");
  T.mode = mode;
  T.text = text;
  T.typed = [];
  T.raw = [];
  T.pos = 0;
  T.cellIdx = 0;
  T.cellTyped = "";
  T.badCells = new Set();
  T.strokes = 0;
  T.errCount = 0;
  T.running = false;
  T.done = false;
  T.startedAt = 0;
  T.endAt = 0;
  T.samples = [];
  T.lastSec = 0;
  T.result = null;
  T.coinNote = "";
  rebuild();
}
/* (re)build the word/cell model from T.text and keep the caret sane */
function rebuild() {
  /* the space between two words is a character the student types, so it
     gets a cell of its own at the end of the word */
  const words = T.text.split(" ").map((w, i, arr) => {
    const cells = cellsOf(w, T.mode);
    if (i < arr.length - 1) cells.push(" ");
    return { cells, space: false };
  });
  T.words = words;
  const flat = [];
  words.forEach((w) => w.cells.forEach((c) => flat.push(c)));
  T.flat = flat;
  T.target = flat.join("");
}
/* top up a long test with another random passage */
function ensureText() {
  /* timed runs keep topping up the passage; "passage" mode ends when the
     student reaches the last word */
  if (T.dur > 0 && T.target.length - progressChars() < 180) {
    const hi = modeOf(T.mode).hi;
    T.text = T.text.replace(/\s+$/, "") + " " + pick(bankFor(T.mode), hi ? "hi" : "en");
    rebuild();
    return true;
  }
  return false;
}

/* ============================================================
   metrics
   ============================================================ */
const elapsedMs = () => (T.startedAt ? Math.max(1, (T.result ? T.result.endAt : Date.now()) - T.startedAt) : 1);
const elapsedMin = () => elapsedMs() / 60000;
function correctStrokes() {
  if (T.mode === "kd") return T.raw.filter((r) => !r.err).length;
  return T.typed.filter((t) => t.ok === 1).length;
}
/* characters of the passage produced so far */
function progressChars() {
  if (T.mode === "kd") return T.pos;
  return T.typed.length;
}
const wpm = () => correctStrokes() / 5 / elapsedMin();
const grossWpm = () => T.strokes / 5 / elapsedMin();
const accuracy = () => (T.strokes ? clamp((100 * (T.strokes - T.errCount)) / T.strokes, 0, 100) : 100);
function consistency() {
  const s = T.samples;
  if (s.length < 3) return 0;
  const deltas = [];
  for (let i = 1; i < s.length; i++) deltas.push(Math.max(0, s[i].correct - s[i - 1].correct));
  if (deltas.length < 2) return 0;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (mean <= 0) return 0;
  const varc = deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / deltas.length;
  return clamp(100 * (1 - Math.sqrt(varc) / mean), 0, 100);
}

/* ============================================================
   keystrokes
   ============================================================ */
function start() {
  if (T.running || T.done) return;
  T.running = true;
  T.startedAt = Date.now();
  T.endAt = T.dur ? T.startedAt + T.dur * 1000 : 0;
  T.samples = [{ t: 0, correct: 0, errors: 0 }];
  T.lastSec = 0;
  const area = $("#tyArea");
  if (area) area.classList.add("is-typing");
  clearInterval(T.timer);
  T.timer = setInterval(tick, 200);
}
function tick() {
  if (!T.running) return;
  const sec = Math.floor((Date.now() - T.startedAt) / 1000);
  while (T.samples.length <= sec) T.samples.push({ t: T.samples.length, correct: correctStrokes(), errors: T.errCount });
  T.lastSec = sec;
  paintLive();
  if (T.dur && Date.now() >= T.endAt) finish("time");
}
function pushSample() {
  const sec = Math.floor((Date.now() - T.startedAt) / 1000);
  while (T.samples.length <= sec) T.samples.push({ t: T.samples.length, correct: correctStrokes(), errors: T.errCount });
  T.samples.push({ t: sec, correct: correctStrokes(), errors: T.errCount });
}

/* the Kruti Dev buffer, converted */
const kdBuffer = () => T.raw.map((r) => r.ch).join("");
/* A buffer is "aligned" when everything typed so far converts to an exact
   prefix of the passage. Half letters and matras sit in the buffer for a
   keystroke or two before they render, so a keystroke can be right without
   producing a new character yet. */
function kdSync() {
  const out = krutiDevToUnicode(kdBuffer());
  const aligned = T.target.startsWith(out);
  let i = 0;
  while (i < out.length && i < T.target.length && out[i] === T.target[i]) i++;
  T.pos = i;
  return { out, aligned };
}
/* Could the next keystroke still get us back on track? Three ways to be
   mid-word in Kruti Dev: the buffer ends on a marker (f, ~, Z), the keys
   typed so far still read as the start of the canonical sequence for the
   cluster, or one more key would put the converted text back in line. */
function kdPending() {
  const base = kdBuffer();
  if (/[f~Z]$/.test(base)) return true;
  let canon = "";
  for (let c = cellFrom(); c < Math.min(T.flat.length, cellFrom() + 4); c++) canon += kdCanon(T.flat[c]) || "";
  for (let n = Math.min(6, base.length); n >= 1; n--) {
    if (canon.startsWith(base.slice(-n))) return true;
  }
  for (const c of nextCandidates()) {
    if (T.target.startsWith(krutiDevToUnicode(base + c))) return true;
  }
  return false;
}
/* A half letter already shows the consonant it belongs to, so the caret can
   sit on the next cell while the student is still typing this one: the window
   of cells we look at always starts one cell back. */
const cellFrom = () => Math.max(0, T.cellIdx - 1);
/* characters that appear in the canonical keys of the cells ahead */
function nextCandidates() {
  const set = new Set();
  for (let c = cellFrom(); c < Math.min(T.flat.length, cellFrom() + 4); c++) {
    (kdCanon(T.flat[c]) || T.flat[c]).split("").forEach((ch) => set.add(ch));
  }
  return Array.from(set);
}
/* the key that would take the student further — found by asking the
   converter, so alternate spellings of the same word still get a
   sensible hint */
function kdNextChar() {
  const base = kdBuffer();
  let canon = "";
  for (let c = cellFrom(); c < Math.min(T.flat.length, cellFrom() + 3); c++) canon += kdCanon(T.flat[c]) || "";
  const cands = nextCandidates();
  const ordered = canon.split("").concat(cands.filter((c) => !canon.includes(c)));
  let first = "";
  for (const c of ordered) {
    const o = krutiDevToUnicode(base + c);
    if (!T.target.startsWith(o)) continue;
    if (o.length > T.pos) return c;
    if (!first) first = c;
  }
  return first || canon[T.cellTyped.length] || canon[0] || "";
}

function press(ch) {
  if (T.done) return;
  start();
  T.strokes++;
  if (T.mode === "kd") {
    const before = T.cellIdx;
    T.raw.push({ ch, err: false });
    const { aligned: ok } = kdSync();
    syncCell();
    if (!ok) {
      const pending = kdPending();
      if (pending) {
        T.raw[T.raw.length - 1].err = false;
      } else {
        T.raw[T.raw.length - 1].err = true;
        T.errCount++;
        T.badCells.add(T.cellIdx);
      }
    } else {
      T.badCells.delete(T.cellIdx);
    }
    T.cellTyped = T.cellIdx !== before ? "" : T.cellTyped + ch;
  } else {
    const idx = T.typed.length;
    if (idx >= T.target.length) {
      T.strokes--;
      return;
    }
    const want = T.target[idx];
    const ok = ch === want ? 1 : -1;
    T.typed.push({ ch, ok });
    if (ok !== 1) T.errCount++;
  }
  pushSample();
  paintAll();
  if (T.mode !== "kd" && T.typed.length >= T.target.length) return finish("done");
  if (T.mode === "kd" && T.pos >= T.target.length) return finish("done");
  if (ensureText()) paintWords();
}
function back() {
  if (T.done) return;
  if (T.mode === "kd") {
    if (!T.raw.length) return;
    T.raw.pop();
    kdSync();
    syncCell();
    T.cellTyped = T.cellTyped.slice(0, -1);
  } else {
    if (!T.typed.length) return;
    T.typed.pop();
  }
  paintAll();
}
/* which cell the caret is in (Kruti Dev: keystrokes complete a cell at a time) */
function syncCell() {
  let acc = 0;
  for (let i = 0; i < T.flat.length; i++) {
    acc += T.flat[i].length;
    if (acc > T.pos) return void (T.cellIdx = i);
  }
  T.cellIdx = Math.max(0, T.flat.length - 1);
}

/* ============================================================
   finish + save
   ============================================================ */
function finish(reason) {
  if (T.done) return;
  T.running = false;
  T.done = true;
  clearInterval(T.timer);
  const area = $("#tyArea");
  if (area) area.classList.remove("is-typing");
  const endAt = T.dur && reason === "time" ? T.endAt : Date.now();
  pushSample();
  const durSec = Math.max(1, Math.round((endAt - T.startedAt) / 1000));
  const res = {
    mode: T.mode,
    wpm: clamp(wpm(), 0, 400),
    raw: clamp(grossWpm(), 0, 400),
    acc: accuracy(),
    consistency: consistency(),
    correct: correctStrokes(),
    strokes: T.strokes,
    errors: T.errCount,
    seconds: durSec,
    at: endAt,
    endAt,
    finished: reason === "done"
  };
  T.result = res;
  if (durSec < 10) {
    T.coinNote = "Too short to record — take at least 10 seconds.";
    paintAll();
    return;
  }
  paintAll();
  saveResult(res);
}

function coinPlan(resWpm) {
  const rw = CTX.rewards() || {};
  if (!rw.enabled || !rw.typingOn) return 0;
  const min = num(rw.typingMinWpm) || 20;
  const cap = num(rw.typingCoins) || 10;
  const daily = num(rw.typingDailyMax) || 40;
  if (resWpm < min) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const used = (CTX.walletTx() || [])
    .filter((t) => t && t.type === "typing" && num(t.at) >= start.getTime())
    .reduce((a, t) => a + num(t.coins), 0);
  const room = Math.max(0, daily - used);
  return Math.max(0, Math.min(cap, room, Math.floor((resWpm - min) / 5) + 1));
}

async function saveResult(res) {
  const uid = CTX.uid();
  if (!uid) return;
  const best = DB.best[T.mode] || {};
  const isPb = round1(res.wpm) > round1(num(best.wpm));
  const coins = isPb ? coinPlan(res.wpm) : 0;
  const id = await dbKey(`typing/${uid}`).catch(() => null);
  if (!id) return;
  const now = Date.now();
  const rec = {
    mode: T.mode,
    wpm: round1(res.wpm),
    raw: round1(res.raw),
    acc: Math.round(res.acc),
    consistency: Math.round(res.consistency),
    chars: res.correct,
    errors: res.errors,
    duration: res.seconds,
    at: now,
    coins,
    pb: isPb,
    finished: res.finished
  };
  const updates = {
    [`typing/${uid}/${id}`]: rec,
    [`typingBest/${uid}/${T.mode}`]: isPb
      ? { wpm: rec.wpm, acc: rec.acc, consistency: rec.consistency, chars: rec.chars, errors: rec.errors, duration: rec.seconds, at: now, id, tests: num(best.tests) + 1 }
      : { ...best, tests: num(best.tests) + 1 }
  };
  if (coins > 0) {
    const w = CTX.wallet() || {};
    const bal = num(w.balance);
    updates[`${PATH.wallets}/${uid}`] = {
      balance: bal + coins,
      earned: num(w.earned) + coins,
      spent: num(w.spent),
      updatedAt: now,
      lastEarn: { type: "typing", coins, testId: id, at: now }
    };
    updates[`${PATH.walletTx}/${uid}/${id}`] = {
      type: "typing",
      coins,
      at: now,
      note: `Typing personal best · ${modeOf(T.mode).label} · ${rec.wpm} wpm`
    };
  }
  try {
    await dbUpdateRoot(updates);
    DB.best = { ...DB.best, [T.mode]: updates[`typingBest/${uid}/${T.mode}`] };
    DB.tests = [{ id, ...rec }].concat(DB.tests);
    T.coinNote = coins > 0 ? `Personal best — ${fmtN(coins)} ${coinWord(coins)} added to your wallet.` : "";
    if (coins > 0) CTX.toast(`${fmtN(coins)} ${coinWord(coins)} earned from typing.`, "ok");
    T.result.coins = coins;
    T.result.pb = isPb;
    paintResult();
    paintHistory();
  } catch (err) {
    console.warn("[typing] save failed", err);
    T.coinNote = "Result not saved — " + friendlyError(err);
    paintResult();
  }
}

/* ============================================================
   painting
   ============================================================ */
function cellState(i) {
  if (T.mode === "kd") {
    let acc = 0;
    for (let c = 0; c < T.flat.length; c++) {
      const end = acc + T.flat[c].length;
      if (c === i) {
        if (T.pos >= end) return "done";
        if (T.pos > acc) return "part";
        return T.badCells.has(c) ? "bad" : "todo";
      }
      acc = end;
    }
    return "todo";
  }
  const rec = T.typed[i];
  if (!rec) return i === T.typed.length ? "cur" : "todo";
  return rec.ok === 1 ? "done" : "bad";
}

function paintWords() {
  const box = $("#tyWords");
  if (!box) return;
  let fi = 0;
  box.innerHTML = T.words
    .map((w, wi) => {
      const cells = w.cells
        .map((c) => {
          const i = fi++;
          return c === " " ? `<span class="ty-c ty-c--space" data-i="${i}"> </span>` : `<span class="ty-c" data-i="${i}">${esc(c)}</span>`;
        })
        .join("");
      return `<span class="ty-w" data-w="${wi}">${cells}</span>`;
    })
    .join("");
  paintCells();
}
function paintCells() {
  const box = $("#tyWords");
  if (!box) return;
  $$(".ty-c", box).forEach((el) => {
    const i = num(el.dataset.i);
    el.className = "ty-c is-" + cellState(i);
  });
  const cur = T.mode === "kd" ? $(`.ty-c[data-i="${T.cellIdx}"]`, box) : $(`.ty-c[data-i="${T.typed.length}"]`, box);
  const caret = $("#tyCaret");
  const area = $("#tyArea");
  if (!caret) return;
  if (!cur || T.done) {
    caret.hidden = true;
    return;
  }
  caret.hidden = false;
  caret.style.transform = `translate(${cur.offsetLeft}px, ${cur.offsetTop}px)`;
  const h = cur.getBoundingClientRect ? cur.getBoundingClientRect().height : cur.offsetHeight;
  caret.style.height = (h || 24) + "px";
  if (area && area.scrollHeight > area.clientHeight) {
    const top = cur.offsetTop;
    if (top > area.clientHeight * 0.55) area.scrollTop = Math.max(0, top - area.clientHeight * 0.35);
  }
}
function paintLive() {
  const el = $("#tyWpm");
  if (el) el.textContent = String(Math.round(wpm()));
  const ac = $("#tyAcc");
  if (ac) ac.textContent = Math.round(accuracy()) + "%";
  const ks = $("#tyKeys2");
  if (ks) ks.textContent = fmtN(T.strokes);
  const tm = $("#tyTime");
  if (tm) {
    if (!T.running && !T.done) tm.textContent = T.dur ? String(T.dur) : "—";
    else if (T.dur) tm.textContent = String(Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000)));
    else tm.textContent = String(Math.round(elapsedMs() / 1000));
  }
}
function paintKeys() {
  const box = $("#tyKeys");
  if (!box) return;
  if (!T.keysOn || T.mode === "en") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const hint = nextKeyHint();
  const rows = DIAG_ROWS.map((row) => {
    const keys = row
      .map((code) => {
        if (code === "Space") return `<span class="ty-k ty-k--space${hint && hint.code === "Space" ? " is-next" : ""}"></span>`;
        const us = US[code] || "  ";
        let label = "";
        let sub = "";
        let isNext = false;
        if (T.mode === "kd") {
          const ch = hint && hint.ch ? hint.ch : "";
          const want = CHAR2KEY[ch];
          isNext = Boolean(want && want.code === code);
          const shown = isNext ? ch : us[0];
          label = KD_KEY[shown] || shown;
          sub = shown;
        } else {
          const pair = INS_KEY[code] || ["", ""];
          const shiftOn = Boolean(hint && hint.shift);
          label = (shiftOn ? pair[1] : pair[0]) || "";
          sub = shiftOn ? us[1] : us[0];
          isNext = Boolean(hint && hint.code === code);
        }
        return `<span class="ty-k${isNext ? " is-next" : ""}${label ? "" : " is-dead"}"><b>${esc(label || "·")}</b><i>${esc(sub)}</i></span>`;
      })
      .join("");
    return `<span class="ty-krow">${keys}</span>`;
  }).join("");
  const shiftOn = Boolean(hint && hint.shift);
  box.innerHTML =
    `<span class="ty-kb-k">${icon("i-keyboard")}${T.mode === "kd" ? "Press next" : "Press next"} <em>${hint && hint.label ? esc(hint.label) : "—"}</em>${shiftOn ? " <u>with Shift</u>" : ""}</span>` +
    `<span class="ty-kb">${rows}</span>`;
}
/* which key the student should press next */
function nextKeyHint() {
  if (T.mode === "ins") {
    const ch = T.target[T.typed.length];
    if (ch == null) return null;
    if (ch === " ") return { code: "Space", shift: false, label: "␣" };
    const k = INS_REV[ch];
    if (!k) return null;
    return { code: k.code, shift: k.shift === 1, label: ch };
  }
  if (T.mode === "kd") {
    const ch = kdNextChar();
    if (!ch) return null;
    return { ch, code: (CHAR2KEY[ch] || {}).code, shift: (CHAR2KEY[ch] || {}).shift === true, label: ch === " " ? "␣" : KD_KEY[ch] || ch };
  }
  return null;
}
function paintResult() {
  const box = $("#tyResult");
  if (!box) return;
  const r = T.result;
  if (!r) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const best = DB.best[T.mode] || {};
  const pbText = r.pb ? "New personal best" : `Best ${Math.round(num(best.wpm)) || 0} wpm`;
  box.innerHTML =
    `<div class="ty-res-head">` +
    `<div class="ty-res-big"><b>${Math.round(r.wpm)}</b><span>wpm</span></div>` +
    `<div class="ty-res-grid">` +
    statBox("accuracy", Math.round(r.acc) + "%") +
    statBox("consistency", r.consistency ? Math.round(r.consistency) + "%" : "—") +
    statBox("raw", Math.round(r.raw) + " wpm") +
    statBox("keystrokes", fmtN(r.correct)) +
    statBox("errors", fmtN(r.errors)) +
    statBox("time", r.seconds + "s") +
    `</div></div>` +
    `<div class="ty-res-pb${r.pb ? " is-pb" : ""}">${r.pb ? icon("i-crown") : icon("i-info")}<span>${esc(pbText)}</span></div>` +
    `<canvas class="ty-chart" id="tyChart" height="140"></canvas>` +
    `<div class="ty-chart-k"><span>wpm over time</span><span class="ty-chart-err"><i></i>errors</span></div>` +
    (T.coinNote ? `<p class="ty-coins">${icon("i-coin")}<span>${esc(T.coinNote)}</span></p>` : "") +
    `<div class="ty-res-act">` +
    `<button class="p-btn p-btn--lime p-btn--sm" type="button" data-ty="again">${icon("i-refresh")}<span>Next passage</span></button>` +
    `<button class="p-btn p-btn--ghost p-btn--sm" type="button" data-ty="retry">${icon("i-arr")}<span>Restart same</span></button>` +
    `</div>`;
  drawChart();
}
const statBox = (k, v) => `<div class="ty-res-stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`;

function drawChart() {
  const cv = $("#tyChart");
  if (!cv || !T.result) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 640;
  const h = 140;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const g = cv.getContext && cv.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = T.samples;
  const pts = [];
  for (let i = 1; i < s.length; i++) {
    const d = Math.max(0, s[i].correct - s[i - 1].correct);
    pts.push({ wpm: d * 12, err: Math.max(0, s[i].errors - s[i - 1].errors), t: s[i].t });
  }
  if (!pts.length) return;
  const maxW = Math.max(20, ...pts.map((p) => p.wpm)) * 1.25;
  const pad = 6;
  const bw = (w - pad * 2) / Math.max(1, pts.length);
  const y = (v) => h - 26 - (v / maxW) * (h - 40);
  /* grid */
  g.strokeStyle = "rgba(11,11,16,.10)";
  g.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const yy = Math.round(y(maxW * f)) + 0.5;
    g.beginPath();
    g.moveTo(pad, yy);
    g.lineTo(w - pad, yy);
    g.stroke();
  });
  /* error ticks */
  g.fillStyle = "#E2544B";
  pts.forEach((p, i) => {
    if (!p.err) return;
    g.globalAlpha = Math.min(1, 0.35 + p.err * 0.2);
    g.fillRect(pad + i * bw, h - 18, Math.max(2, bw - 2), 6);
    g.globalAlpha = 1;
  });
  /* wpm line */
  const grad = g.createLinearGradient(0, 0, 0, h - 26);
  grad.addColorStop(0, "rgba(90,75,255,.30)");
  grad.addColorStop(1, "rgba(90,75,255,0)");
  g.beginPath();
  g.moveTo(pad, y(pts[0].wpm));
  pts.forEach((p, i) => g.lineTo(pad + i * bw + bw / 2, y(p.wpm)));
  g.lineTo(pad + (pts.length - 1) * bw + bw / 2, h - 26);
  g.lineTo(pad, h - 26);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.beginPath();
  pts.forEach((p, i) => {
    const x = pad + i * bw + bw / 2;
    const yy = y(p.wpm);
    if (i === 0) g.moveTo(x, yy);
    else g.lineTo(x, yy);
  });
  g.strokeStyle = "#5A4BFF";
  g.lineWidth = 2.2;
  g.lineJoin = "round";
  g.stroke();
  g.fillStyle = "#5A4BFF";
  pts.forEach((p, i) => {
    g.beginPath();
    g.arc(pad + i * bw + bw / 2, y(p.wpm), 2, 0, Math.PI * 2);
    g.fill();
  });
}

function paintHistory() {
  const box = $("#tyHist");
  if (!box) return;
  const list = DB.tests.filter((t) => t.mode === T.mode).slice(0, 10);
  if (!list.length) {
    box.innerHTML = `<p class="ty-empty">No ${esc(modeOf(T.mode).label)} tests yet — your last 10 runs and personal bests land here.</p>`;
    return;
  }
  box.innerHTML =
    `<div class="ty-hist-head"><span>When</span><span>wpm</span><span>accuracy</span><span>consistency</span><span>errors</span><span>E-coins</span></div>` +
    list
      .map((t) => {
        const d = new Date(num(t.at));
        const when = isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        return (
          `<div class="ty-hist-row${t.pb ? " is-pb" : ""}">` +
          `<span>${esc(when)}</span>` +
          `<b>${Math.round(num(t.wpm))}</b>` +
          `<span>${Math.round(num(t.acc))}%</span>` +
          `<span>${num(t.consistency) ? Math.round(num(t.consistency)) + "%" : "—"}</span>` +
          `<span>${fmtN(t.errors)}</span>` +
          `<span class="ty-hist-coin">${num(t.coins) ? "+" + fmtN(t.coins) : "—"}</span>` +
          `</div>`
        );
      })
      .join("");
}
function paintBests() {
  const box = $("#tyBests");
  if (!box) return;
  box.innerHTML = MODES.map((m) => {
    const b = DB.best[m.id] || {};
    return (
      `<div class="ty-best${m.id === T.mode ? " is-on" : ""}${m.hi ? " is-hi" : ""}">` +
      `<span class="ty-best-k">${esc(m.label)}</span>` +
      `<b>${Math.round(num(b.wpm)) || "—"}</b><small>wpm best</small>` +
      `<span class="ty-best-sub">${num(b.tests) ? fmtN(b.tests) + " tests · " : ""}${num(b.acc) ? Math.round(num(b.acc)) + "% acc" : "not attempted"}</span>` +
      `</div>`
    );
  }).join("");
}
function paintAll() {
  paintCells();
  paintLive();
  paintKeys();
  paintResult();
}
function paintChrome() {
  $$("[data-ty-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.tyMode === T.mode));
  $$("[data-ty-dur]").forEach((b) => b.classList.toggle("is-on", num(b.dataset.tyDur) === T.dur));
  const kb = $("[data-ty-keys]");
  if (kb) kb.classList.toggle("is-on", T.keysOn);
  const kbWrap = $("#tyKeysToggle");
  if (kbWrap) kbWrap.hidden = T.mode === "en";
}

let resizeOff = null;
let docKeyOff = null;
function onResize() {
  if (T.result) drawChart();
  paintCells();
}
/* any printable key starts the test, without hunting for the caret first */
function onDocKey(e) {
  if (!$("#ty")) return;
  const a = document.activeElement;
  if (a && a.id === "tyInput") return;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
  if (a && a.closest && a.closest("#ty")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1 && e.key !== "Backspace") return;
  const input = $("#tyInput");
  if (input) input.focus({ preventScroll: true });
  handleKey(e);
}
function handleKey(e) {
  if (e.key === "Tab" || e.key === "Escape") {
    e.preventDefault();
    restart(true);
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    back();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) {
    e.preventDefault();
    press(charFor(e));
  }
}

/* ============================================================
   the view
   ============================================================ */
export function vTyping() {
  if (!T.text) newTest();
  const m = modeOf(T.mode);
  const rw = CTX.rewards() || {};
  const earnOn = Boolean(rw.enabled && rw.typingOn);
  return {
    title: "Typing test",
    crumb: "Learn",
    html:
      `<div class="ty${m.hi ? " ty--hi" : ""}" id="ty">` +
      /* controls */
      `<div class="ty-bar">` +
      `<div class="ty-pills" role="group" aria-label="Layout">` +
      MODES.map((x) => `<button class="ty-pill${x.id === T.mode ? " is-on" : ""}" type="button" data-ty-mode="${x.id}"><span>${esc(x.label)}</span><small>${esc(x.sub)}</small></button>`).join("") +
      `</div>` +
      `<div class="ty-pills ty-pills--sm" role="group" aria-label="Duration">` +
      DURS.map((d) => `<button class="ty-pill${d === T.dur ? " is-on" : ""}" type="button" data-ty-dur="${d}">${d}s</button>`).join("") +
      `<button class="ty-pill${T.dur === 0 ? " is-on" : ""}" type="button" data-ty-dur="0">passage</button>` +
      `</div>` +
      `</div>` +
      /* live stats */
      `<div class="ty-live">` +
      `<div class="ty-live-big"><b id="tyWpm">0</b><span>wpm</span></div>` +
      `<div class="ty-live-mini"><div><b id="tyAcc">100%</b><span>accuracy</span></div>` +
      `<div><b id="tyTime">${T.dur || "—"}</b><span>seconds</span></div>` +
      `<div><b id="tyKeys2">0</b><span>keystrokes</span></div></div>` +
      `<button class="ty-ghost" type="button" id="tyKeysToggle" data-ty-keys>${icon("i-keyboard")}<span>keyboard</span></button>` +
      `</div>` +
      /* the test */
      `<div class="ty-stage">` +
      `<div class="ty-area" id="tyArea">` +
      `<div class="ty-words" id="tyWords"></div>` +
      `<span class="ty-caret" id="tyCaret" hidden></span>` +
      `<input class="ty-input" id="tyInput" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type the passage">` +
      `<button class="ty-focus" type="button" id="tyFocus">${icon("i-keyboard")}<span>Click here or press a key to start typing</span></button>` +
      `</div>` +
      `<button class="ty-restart" type="button" data-ty="again" title="Restart (Tab)">${icon("i-refresh")}<span>restart</span></button>` +
      `</div>` +
      /* keyboard hint + tips */
      `<div class="ty-kb-wrap" id="tyKeys" hidden></div>` +
      (m.hi
        ? `<details class="ty-tip"><summary>${icon("i-info")}<span>How ${esc(m.label)} keys work</span></summary>` +
          (T.mode === "kd"
            ? `<p>Kruti Dev 010 prints Hindi from plain English keys. The matra <b>ि</b> is typed <b>before</b> its letter (हि = <code>f</code> then <code>g</code>), a half letter is <b>Shift</b> + the letter (न् = <code>U</code>), and <b>ो</b> is <code>k</code> then <code>s</code>. Anything you type is read by a real Kruti Dev converter, so any spelling the font accepts counts.</p>`
            : `<p>Mangal (Inscript) puts one Hindi letter on every key: <b>क</b> is <code>k</code>, <b>ख</b> is <code>Shift</code>+<code>k</code>, <b>्</b> (halant) is <code>d</code>, <b>।</b> is <code>Shift</code>+<code>.</code>. Press the physical key shown on the diagram — the test reads your keyboard position, so your system layout can be anything.</p>`) +
          `</details>`
        : "") +
      /* result */
      `<section class="ty-result" id="tyResult" hidden></section>` +
      /* bests + history */
      `<section class="ty-cards" id="tyBests"></section>` +
      `<section class="ty-panel">` +
      `<div class="ty-panel-head"><h3>Recent ${esc(m.label)} tests</h3>` +
      (earnOn
        ? `<span class="ty-earn">${icon("i-coin")}${rw.typingNote ? esc(rw.typingNote) : `Earn up to ${fmtN(rw.typingCoins || 10)} ${coinWord(rw.typingCoins)} per personal best${num(rw.typingMinWpm) ? ` above ${fmtN(rw.typingMinWpm)} wpm` : ""}`}</span>`
        : `<span class="ty-earn is-off">${icon("i-info")}E-coin rewards for typing are off</span>`) +
      `</div>` +
      `<div class="ty-hist" id="tyHist"></div>` +
      `</section>` +
      `</div>`,
    mount(root) {
      const area = $("#tyArea", root);
      const input = $("#tyInput", root);
      const focus = $("#tyFocus", root);
      paintWords();
      paintAll();
      paintChrome();
      paintHistory();
      paintBests();

      const focusInput = () => {
        if (input) {
          input.focus({ preventScroll: true });
          input.value = "";
        }
      };
      focusInput();
      if (focus)
        focus.addEventListener("click", () => {
          focusInput();
          if (focus) focus.classList.add("is-hidden");
        });
      const showBlur = () => {
        if (!focus) return;
        focus.classList.remove("is-hidden");
      };
      if (input) {
        input.addEventListener("blur", () => {
          showBlur();
          if (area) area.classList.add("is-blur");
        });
        input.addEventListener("focus", () => {
          if (focus) focus.classList.add("is-hidden");
          if (area) area.classList.remove("is-blur");
        });
        input.addEventListener("keydown", handleKey);
        /* mobile / IME: text arrives without a usable code */
        input.addEventListener("input", () => {
          const v = input.value;
          input.value = "";
          if (!v) return;
          if (T.mode === "kd" && /[\u0900-\u097F]/.test(v)) {
            (v.match(CLUSTER_RE) || Array.from(v)).forEach((c) => (kdCanon(c) || c).split("").forEach((ch) => press(ch)));
          } else {
            Array.from(v).forEach((ch) => press(ch));
          }
        });
      }
      if (area) area.addEventListener("click", focusInput);

      ($("#ty", root) || root).addEventListener("click", (e) => {
        const b = e.target.closest("[data-ty-mode],[data-ty-dur],[data-ty],[data-ty-keys]");
        if (!b) return;
        if (b.dataset.tyMode) {
          if (b.dataset.tyMode === T.mode) return;
          T.mode = b.dataset.tyMode;
          T.keysOn = T.mode !== "en";
          newTest();
          render();
        } else if (b.dataset.tyDur != null) {
          T.dur = num(b.dataset.tyDur);
          newTest();
          render();
        } else if (b.dataset.tyKeys != null) {
          T.keysOn = !T.keysOn;
          paintChrome();
          paintKeys();
        } else if (b.dataset.ty === "again") {
          restart(true);
        } else if (b.dataset.ty === "retry") {
          restart(false);
        }
      });
      if (resizeOff) resizeOff();
      resizeOff = () => window.removeEventListener("resize", onResize);
      window.addEventListener("resize", onResize);
      if (docKeyOff) docKeyOff();
      docKeyOff = () => document.removeEventListener("keydown", onDocKey);
      document.addEventListener("keydown", onDocKey);
    },
    update() {
      /* a live (or just finished) test owns the page: keep it.
         Returning false asks the portal to rebuild the view. */
      return Boolean(T.running || (T.result && !T.done));
    }
  };
}

/* what the student's key means in the current mode */
function charFor(e) {
  const code = e.code || "";
  const shift = Boolean(e.shiftKey);
  if (code === "Space") return " ";
  if (T.mode === "ins") {
    const pair = INS_KEY[code];
    if (pair) {
      const ch = shift ? pair[1] : pair[0];
      if (ch) return ch;
    }
    return e.key && e.key.length === 1 ? e.key : "";
  }
  const us = US[code];
  if (us) return shift ? us[1] : us[0];
  return e.key && e.key.length === 1 ? e.key : "";
}

function restart(newPassage) {
  clearInterval(T.timer);
  if (newPassage) newTest();
  else {
    const text = T.text;
    newTest();
    T.text = text;
    T.words = [];
    rebuild();
  }
  render();
}
/* hand control back to the portal router: the page markup depends on
   the mode, so we let dashboard.js re-render instead of patching here */
function render() {
  CTX.changed("typing");
}
