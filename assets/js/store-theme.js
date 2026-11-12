/* ============================================================
   FENXTEK — festive store themes (Blinkit-style)
   Shared by the student store (dashboard.js) and the admin
   editor (admin-theme.js) so the admin preview is pixel-for-
   pixel what students see.

   site/storeTheme = {
     active: "normal" | <themeId>,   // manual choice
     auto: bool,                     // follow each theme's schedule
     themes: { <themeId>: { ...overrides, from, to, on } },
     updatedAt
   }
   A theme with an end date switches itself off after it; with
   `auto`, a theme whose window is running wins over `active`.
   ============================================================ */

export const THEME_PATH = "site/storeTheme";
export const THEME_IDS = ["diwali", "holi", "christmas", "newyear", "children", "sale"];
export const EFFECTS = {
  none: "No effect",
  diya: "Diya glow (rising embers)",
  snow: "Snowfall",
  confetti: "Confetti",
  fireworks: "Fireworks",
  colour: "Colour splash (Holi)",
  balloons: "Balloons (floating up)"
};
export const LEVELS = { 1: "Subtle", 2: "Balanced", 3: "Festive" };

const yearFor = (now) => {
  const d = new Date(now);
  return d.getMonth() >= 10 ? d.getFullYear() + 1 : d.getFullYear(); // Nov / Dec → next year
};

export const PRESETS = {
  diwali: {
    name: "Diwali",
    tagline: "Diyas, lanterns & rangoli",
    badge: "Diwali Dhamaka",
    title: "Light up your *preparation*",
    subtitle: "Festive prices on every shorthand and typing course. Begin something bright this Diwali.",
    cta: "Shop Diwali deals",
    link: "store",
    coupon: "",
    c1: "#2A0B3F",
    c2: "#8C1D4F",
    accent: "#FFB627",
    text: "#FFF6E5",
    effect: "diya",
    level: 2,
    ribbon: "Diwali special",
    countdown: true,
    marquee: "Diwali dhamaka · festive prices on every course · instant access",
    garland: true,
    glow: true
  },
  holi: {
    name: "Holi",
    tagline: "Colour splashes & gulal",
    badge: "Holi Hai!",
    title: "Add *colour* to your speed",
    subtitle: "Splash into savings — festive offers on dictation packs, typing and test series.",
    cta: "Grab Holi offers",
    link: "store",
    coupon: "",
    c1: "#FF3D7F",
    c2: "#6D28D9",
    accent: "#FFE14D",
    text: "#FFFFFF",
    effect: "colour",
    level: 2,
    ribbon: "Holi offer",
    countdown: true,
    marquee: "Holi hai · a splash of savings · instant access to every class",
    garland: true,
    glow: true
  },
  christmas: {
    name: "Christmas",
    tagline: "Tree, gifts & snowfall",
    badge: "Merry Christmas",
    title: "Gift yourself a *sarkari naukri*",
    subtitle: "Unwrap year-end prices on courses and memberships. The best gift is a skill that pays.",
    cta: "Unwrap deals",
    link: "store",
    coupon: "",
    c1: "#0B3B2C",
    c2: "#17694A",
    accent: "#FF4D4D",
    text: "#F2FFF7",
    effect: "snow",
    level: 2,
    ribbon: "Christmas deal",
    countdown: true,
    marquee: "Christmas deal · gift yourself a sarkari naukri · instant access",
    garland: true,
    glow: true
  },
  newyear: {
    name: "New Year",
    tagline: "Fireworks & a fresh start",
    badge: "Happy New Year {year}",
    title: "New year, *new speed*",
    subtitle: "Make {year} the year you clear the exam. Start today with New Year pricing.",
    cta: "Start {year} strong",
    link: "store",
    coupon: "",
    c1: "#0A0F33",
    c2: "#36207A",
    accent: "#FFD166",
    text: "#FFFFFF",
    effect: "fireworks",
    level: 2,
    ribbon: "New Year offer",
    countdown: true,
    marquee: "New Year pricing · make this the year you clear the exam",
    garland: true,
    glow: true
  },
  children: {
    name: "Children’s Day",
    tagline: "Balloons, kites & bright ideas",
    badge: "Happy Children’s Day",
    title: "Big dreams, *bright futures*",
    subtitle: "Children’s Day special — festive prices on every shorthand and typing course. Give a skill that lasts a lifetime.",
    cta: "Shop Children’s Day deals",
    link: "store",
    coupon: "",
    c1: "#1E5FD8",
    c2: "#7B2FF7",
    accent: "#FFE45C",
    text: "#FFFFFF",
    effect: "balloons",
    level: 2,
    ribbon: "Children’s Day special",
    countdown: true,
    marquee: "Children’s Day special · festive prices on every course · give a skill that lasts a lifetime",
    garland: true,
    glow: true
  },
  sale: {
    name: "Holiday sale",
    tagline: "Any holiday or mega sale",
    badge: "Holiday sale",
    title: "Big savings, *bigger results*",
    subtitle: "Limited-time holiday prices across the store. Once it's gone, it's gone.",
    cta: "Shop the sale",
    link: "store",
    coupon: "",
    c1: "#FF5A1F",
    c2: "#D41C4B",
    accent: "#FFF27A",
    text: "#FFFFFF",
    effect: "confetti",
    level: 2,
    ribbon: "Sale price",
    countdown: true,
    marquee: "Limited period · the season's biggest prices · instant access",
    garland: true,
    glow: true
  }
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const str = (v, max, d = "") => (typeof v === "string" ? v.slice(0, max) : d);
const numOr = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

/* preset + saved overrides, sanitised */
export function themeOf(id, saved, now = Date.now()) {
  const p = PRESETS[id];
  if (!p) return null;
  const s = saved && typeof saved === "object" ? saved : {};
  const t = {
    id,
    name: p.name,
    tagline: p.tagline,
    badge: str(s.badge, 40, p.badge),
    title: str(s.title, 90, p.title),
    subtitle: str(s.subtitle, 200, p.subtitle),
    cta: str(s.cta, 30, p.cta),
    link: str(s.link, 120, p.link) || "store",
    coupon: str(s.coupon, 24, p.coupon).toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
    c1: HEX.test(s.c1) ? s.c1 : p.c1,
    c2: HEX.test(s.c2) ? s.c2 : p.c2,
    accent: HEX.test(s.accent) ? s.accent : p.accent,
    text: HEX.test(s.text) ? s.text : p.text,
    effect: EFFECTS[s.effect] ? s.effect : p.effect,
    level: [1, 2, 3].includes(s.level) ? s.level : p.level,
    ribbon: s.ribbon === undefined ? p.ribbon : str(s.ribbon, 24, ""),
    marquee: str(s.marquee, 160, p.marquee),
    garland: typeof s.garland === "boolean" ? s.garland : p.garland !== false,
    glow: typeof s.glow === "boolean" ? s.glow : p.glow !== false,
    countdown: typeof s.countdown === "boolean" ? s.countdown : p.countdown,
    from: numOr(s.from, 0),
    to: numOr(s.to, 0),
    on: s.on !== false,
    custom: Boolean(saved && Object.keys(s).length)
  };
  const y = String(yearFor(now));
  ["badge", "title", "subtitle", "cta", "ribbon"].forEach((k) => (t[k] = t[k].replace(/\{year\}/g, y)));
  return t;
}

/* which theme is live right now (null = normal store) */
export function resolveTheme(value, now = Date.now()) {
  const v = value && typeof value === "object" ? value : {};
  const saved = v.themes && typeof v.themes === "object" ? v.themes : {};
  if (v.auto) {
    const running = THEME_IDS.map((id) => themeOf(id, saved[id], now))
      .filter((t) => t.on && t.from && t.to && now >= t.from && now < t.to)
      .sort((a, b) => b.from - a.from);
    if (running.length) return { ...running[0], why: "schedule" };
  }
  if (THEME_IDS.includes(v.active)) {
    const t = themeOf(v.active, saved[v.active], now);
    if (t.to && now >= t.to) return null; // ended
    if (t.from && now < t.from && v.auto) return null; // waits for its start
    return { ...t, why: "manual" };
  }
  return null;
}

/* admin: status chip for a theme */
export function themeStatus(id, value, now = Date.now()) {
  const v = value && typeof value === "object" ? value : {};
  const live = resolveTheme(v, now);
  if (live && live.id === id) return { key: "live", label: live.why === "schedule" ? "Live · scheduled" : "Live" };
  const t = themeOf(id, (v.themes || {})[id], now);
  if (t.to && now >= t.to && (v.active === id || v.auto)) return { key: "ended", label: "Ended" };
  if (v.auto && t.on && t.from && t.to && now < t.from) return { key: "scheduled", label: `Starts ${shortDate(t.from)}` };
  return { key: "off", label: "Off" };
}

export const shortDate = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const signature = (t) => (t ? [t.id, t.effect, t.level, t.c1, t.c2, t.accent, t.text].join("|") : "");

const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
/* *word* → highlighted */
const rich = (s) => esc(s).replace(/\*([^*]{1,40})\*/g, "<em>$1</em>");

export function themeVars(t) {
  return `--ft-c1:${t.c1};--ft-c2:${t.c2};--ft-ac:${t.accent};--ft-tx:${t.text}`;
}

export function linkHref(link) {
  const l = String(link || "store");
  if (l === "store") return "#store";
  if (l === "membership") return "#membership";
  if (l === "cart") return "#cart";
  if (l === "rewards") return "#rewards";
  if (l.startsWith("course:")) return `#course/${encodeURIComponent(l.slice(7))}`;
  if (/^#[\w/-]{1,100}$/.test(l)) return l;
  return "#store";
}

/* ---------------- illustrations ---------------- */
let artSeq = 0;
const SPARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/><circle cx="19" cy="4" r="1.6" fill="currentColor"/><circle cx="5" cy="19" r="1.2" fill="currentColor"/></svg>`;

function diya(x, y, s, g) {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<ellipse cx="0" cy="-30" rx="26" ry="34" fill="url(#${g}glow)"/>` +
    `<path class="ft-flame" d="M0 -40 C 7 -28 9 -20 0 -10 C -9 -20 -7 -28 0 -40 Z" fill="url(#${g}flame)"/>` +
    `<path d="M0 -24 C 3 -19 3 -15 0 -11 C -3 -15 -3 -19 0 -24 Z" fill="#FFF7D6"/>` +
    `<path d="M-34 -8 Q 0 34 34 -8 Z" fill="url(#${g}clay)"/>` +
    `<ellipse cx="0" cy="-8" rx="34" ry="7" fill="#7A2E0E"/>` +
    `<ellipse cx="0" cy="-9" rx="28" ry="4.5" fill="#E8A13A"/>` +
    `<path d="M-22 4 Q 0 14 22 4" stroke="#FFD27A" stroke-width="2" fill="none" stroke-dasharray="2 5" stroke-linecap="round"/>` +
    `</g>`
  );
}
function lantern(x, len, s, g) {
  return (
    `<g class="ft-swing" style="transform-origin:${x}px 0px">` +
    `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="currentColor" stroke-opacity=".5" stroke-width="1.5"/>` +
    `<g transform="translate(${x} ${len}) scale(${s})">` +
    `<path d="M0 0 L22 26 L0 58 L-22 26 Z" fill="url(#${g}lan)"/>` +
    `<path d="M0 0 L22 26 L0 58 L-22 26 Z" fill="none" stroke="#FFE3A3" stroke-width="1.5"/>` +
    `<path d="M-22 26 H22 M0 0 V58" stroke="#FFE3A3" stroke-width="1" opacity=".7"/>` +
    `<circle cx="0" cy="26" r="6" fill="#FFF3C4"/>` +
    `<path d="M-6 58 L0 82 L6 58" fill="#FFB627"/>` +
    `</g></g>`
  );
}

const ART = {
  diwali(g) {
    const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="0" cy="-46" rx="11" ry="24" transform="rotate(${i * 30})"/>`).join("");
    const dots = Array.from({ length: 24 }, (_, i) => `<circle cx="0" cy="-84" r="3" transform="rotate(${i * 15})"/>`).join("");
    return (
      `<defs>` +
      `<radialGradient id="${g}glow"><stop offset="0" stop-color="#FFC94A" stop-opacity=".75"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${g}flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE66B"/><stop offset=".6" stop-color="#FF9F1C"/><stop offset="1" stop-color="#FF5E00"/></linearGradient>` +
      `<linearGradient id="${g}clay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0652B"/><stop offset="1" stop-color="#8E2C0C"/></linearGradient>` +
      `<linearGradient id="${g}lan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4F7B"/><stop offset="1" stop-color="#FF9F1C"/></linearGradient>` +
      `</defs>` +
      `<g transform="translate(200 150)"><g class="ft-spin" fill="none" stroke="var(--ft-ac)" stroke-opacity=".38" stroke-width="2">` +
      `<circle r="92"/><circle r="70" stroke-dasharray="4 7"/><g fill="var(--ft-ac)" fill-opacity=".1">${petals}</g><g fill="var(--ft-ac)" stroke="none" fill-opacity=".55">${dots}</g><circle r="14" fill="var(--ft-ac)" fill-opacity=".5"/>` +
      `</g></g>` +
      lantern(70, 26, 0.9, g) +
      lantern(318, 10, 0.75, g) +
      diya(130, 232, 1, g) +
      diya(214, 246, 1.25, g) +
      diya(300, 232, 0.95, g)
    );
  },
  christmas(g) {
    const flakes = [
      [40, 60, 1],
      [330, 40, 0.8],
      [360, 150, 0.6],
      [60, 170, 0.7]
    ]
      .map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"><path d="M0 -12 V12 M-10.4 -6 L10.4 6 M-10.4 6 L10.4 -6"/></g>`)
      .join("");
    const balls = [
      [196, 120, "#FF4D4D"],
      [222, 156, "#FFD166"],
      [176, 172, "#fff"],
      [236, 206, "#FF4D4D"],
      [166, 222, "#FFD166"],
      [206, 236, "#7DD3FC"]
    ]
      .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="#fff" opacity=".7"/>`)
      .join("");
    return (
      `<defs><linearGradient id="${g}tree" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3DDC84"/><stop offset="1" stop-color="#0E7A43"/></linearGradient>` +
      `<radialGradient id="${g}star"><stop offset="0" stop-color="#FFE580" stop-opacity=".9"/><stop offset="1" stop-color="#FFD166" stop-opacity="0"/></radialGradient></defs>` +
      flakes +
      `<circle cx="200" cy="74" r="34" fill="url(#${g}star)" class="ft-pulse"/>` +
      `<path d="M200 82 L150 150 H170 L130 206 H156 L112 262 H288 L244 206 H270 L230 150 H250 Z" fill="url(#${g}tree)"/>` +
      `<path d="M148 168 Q200 190 248 160 M136 222 Q200 250 262 214" stroke="#FFD166" stroke-width="2.5" fill="none" stroke-dasharray="1 7" stroke-linecap="round"/>` +
      balls +
      `<path d="M200 56 l6.5 13.2 14.5 2.1 -10.5 10.2 2.5 14.5 -13-6.8 -13 6.8 2.5-14.5 -10.5-10.2 14.5-2.1z" fill="#FFD166"/>` +
      `<rect x="186" y="262" width="28" height="22" rx="3" fill="#7A4A21"/>` +
      `<g transform="translate(272 236)"><rect width="58" height="48" rx="6" fill="var(--ft-ac)"/><rect x="24" width="10" height="48" fill="#FFD166"/><rect y="16" width="58" height="10" fill="#FFD166"/><path d="M29 0 C 16 -18 6 -6 29 0 C 52 -6 42 -18 29 0" fill="none" stroke="#FFD166" stroke-width="4"/></g>` +
      `<g transform="translate(86 248)"><rect width="46" height="36" rx="5" fill="#FFD166"/><rect x="18" width="9" height="36" fill="var(--ft-ac)"/><path d="M22 0 C 12 -14 4 -4 22 0 C 40 -4 32 -14 22 0" fill="none" stroke="var(--ft-ac)" stroke-width="3.5"/></g>`
    );
  },
  newyear(g, t, now) {
    const burst = (x, y, r, c, d) =>
      `<g transform="translate(${x} ${y})"><g class="ft-burst" style="animation-delay:${d}s">` +
      Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${-r * 0.35}" x2="0" y2="${-r}" stroke="${c}" stroke-width="3" stroke-linecap="round" transform="rotate(${i * 30})"/>`).join("") +
      Array.from({ length: 12 }, (_, i) => `<circle cx="0" cy="${-r - 8}" r="2.4" fill="${c}" transform="rotate(${i * 30 + 15})"/>`).join("") +
      `</g></g>`;
    return (
      `<defs><linearGradient id="${g}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".5" stop-color="#FFD166"/><stop offset="1" stop-color="#E09F1F"/></linearGradient></defs>` +
      burst(110, 70, 44, "#FFD166", 0) +
      burst(300, 56, 34, "#FF7EB6", 0.8) +
      burst(220, 118, 26, "#7DE2FF", 1.6) +
      burst(350, 150, 22, "#B4FF7A", 2.2) +
      `<text x="216" y="262" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="104" letter-spacing="-6" fill="url(#${g}gold)">${yearFor(now)}</text>` +
      `<text x="216" y="262" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="104" letter-spacing="-6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5">${yearFor(now)}</text>` +
      `<g fill="#fff">${[
        [40, 40],
        [180, 30],
        [370, 90],
        [60, 150],
        [260, 180]
      ]
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1.5 + (i % 2)}" class="ft-twinkle" style="animation-delay:${i * 0.4}s"/>`)
        .join("")}</g>`
    );
  },
  holi() {
    const blob = (x, y, s, c, r) =>
      `<path transform="translate(${x} ${y}) scale(${s}) rotate(${r})" fill="${c}" d="M0-52C18-54 30-40 44-36S70-14 62 6 66 40 44 50 10 70-12 60-50 54-58 30-74 0-56-20-34-50 0-52Z"/>`;
    const drops = [
      [96, 60, 7, "#FFE14D"],
      [330, 52, 6, "#22D3EE"],
      [352, 118, 5, "#FF3D7F"],
      [62, 196, 6, "#4ADE80"],
      [262, 40, 4, "#fff"]
    ]
      .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`)
      .join("");
    const bowl = (x, c) =>
      `<g transform="translate(${x} 250)"><path d="M-26 -14 Q0 -44 26 -14 Z" fill="${c}"/><path d="M-32 -14 H32 Q28 14 0 16 Q-28 14 -32 -14 Z" fill="#B45309"/><path d="M-32 -14 H32" stroke="#FCD34D" stroke-width="3"/></g>`;
    return (
      `<g><g class="ft-float">${blob(150, 120, 1.25, "#FFE14D", 10)}${blob(250, 100, 1.05, "#22D3EE", 70)}${blob(300, 170, 0.8, "#4ADE80", 150)}${blob(120, 190, 0.7, "#FF8A3D", 200)}${blob(215, 160, 0.75, "#FF3D7F", 300)}</g></g>` +
      drops +
      bowl(130, "#FF3D7F") +
      bowl(210, "#FFE14D") +
      bowl(290, "#4ADE80")
    );
  },
  children(g) {
    /* a balloon: `y` is where the knot sits, the string hangs below it */
    const balloon = (x, y, s, c, d) =>
      `<g class="ft-float" style="animation-delay:${d}s">` +
      `<path d="M${x} ${y - 14 * s} q 7 13 0 25 q -7 12 0 25" stroke="rgba(255,255,255,.5)" stroke-width="1.3" fill="none"/>` +
      `<ellipse cx="${x}" cy="${y - 40 * s}" rx="${20 * s}" ry="${25 * s}" fill="${c}"/>` +
      `<ellipse cx="${x - 6 * s}" cy="${y - 48 * s}" rx="${5 * s}" ry="${7.5 * s}" fill="#fff" opacity=".5"/>` +
      `<path d="M${x - 4 * s} ${y - 16 * s} l4 5.5 l4 -5.5 l-4 -4.5 z" fill="${c}"/>` +
      `</g>`;
    const kite = (x, y, c) =>
      `<g class="ft-swing" style="transform-origin:${x}px ${y}px">` +
      `<path d="M${x} ${y - 34} L${x + 26} ${y} L${x} ${y + 40} L${x - 26} ${y} Z" fill="${c}"/>` +
      `<path d="M${x} ${y - 34} V${y + 40} M${x - 26} ${y} H${x + 26}" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>` +
      `<path d="M${x} ${y + 40} q 11 12 -2 22 q -13 10 2 22" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `</g>`;
    const pinwheel = (x, y, s, a, b) =>
      `<g transform="translate(${x} ${y}) scale(${s})">` +
      `<line x1="0" y1="0" x2="0" y2="48" stroke="#fff" stroke-opacity=".45" stroke-width="2.5"/>` +
      `<g class="ft-spin" style="animation-duration:7s">` +
      [0, 90, 180, 270]
        .map((r) => `<path d="M0 0 C 7 -21 26 -26 30 -6 C 30 9 12 11 0 0 Z" fill="${r % 180 ? b : a}" transform="rotate(${r})"/>`)
        .join("") +
      `<circle r="4" fill="#fff"/>` +
      `</g></g>`;
    const stars = [[52, 46], [116, 24], [360, 58], [300, 30], [34, 124], [374, 148]]
      .map(
        ([x, y], i) =>
          `<path class="ft-twinkle" style="animation-delay:${i * 0.4}s" transform="translate(${x} ${y})" d="M0 -8 L2.2 -2.2 L8 0 L2.2 2.2 L0 8 L-2.2 2.2 L-8 0 L-2.2 -2.2 Z" fill="#fff" fill-opacity=".85"/>`
      )
      .join("");
    return (
      `<circle cx="286" cy="118" r="80" fill="var(--ft-ac)" fill-opacity=".13" class="ft-pulse"/>` +
      stars +
      kite(76, 72, "var(--ft-ac)") +
      balloon(206, 152, 1.15, "#FF6FB5", 0) +
      balloon(258, 180, 0.95, "#5AC8FA", 0.9) +
      balloon(312, 150, 1.05, "#FFE45C", 1.8) +
      balloon(236, 208, 0.8, "#7CE8B4", 2.6) +
      balloon(290, 216, 0.7, "#C08BFF", 3.4) +
      pinwheel(104, 236, 1, "#FF6FB5", "#5AC8FA")
    );
  },
  sale() {
    const tag = (x, y, r, s, big, small, c, tc) =>
      `<g class="ft-swing" style="transform-origin:${x}px ${y - 60}px"><g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">` +
      `<path d="M0 -60 L0 -30" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>` +
      `<path d="M-40 -30 H22 L48 0 L22 30 H-40 Q-48 30 -48 22 V-22 Q-48 -30 -40 -30 Z" transform="rotate(90)" fill="${c}"/>` +
      `<circle cx="0" cy="-20" r="5" fill="var(--ft-c2)"/>` +
      `<text x="0" y="12" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="24" fill="${tc}">${big}</text>` +
      `<text x="0" y="30" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700" font-size="10" letter-spacing="2" fill="${tc}">${small}</text>` +
      `</g></g>`;
    return (
      `<g transform="translate(220 150)"><g class="ft-spin"><circle r="96" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-dasharray="3 9"/></g></g>` +
      `<circle cx="220" cy="150" r="70" fill="#fff" fill-opacity=".1"/>` +
      `<text x="220" y="178" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="800" font-size="96" fill="var(--ft-ac)" opacity=".95">%</text>` +
      tag(110, 120, -12, 1, "50%", "OFF", "var(--ft-ac)", "#7A1026") +
      tag(330, 110, 14, 0.85, "SALE", "TODAY", "#fff", "#C2163F") +
      `<g fill="#fff">${[
        [70, 230, 10, 4, 20],
        [290, 236, 12, 4, -30],
        [360, 220, 8, 3, 60],
        [180, 250, 9, 3, -10]
      ]
        .map(([x, y, w, h, r]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" transform="rotate(${r} ${x} ${y})" opacity=".8"/>`)
        .join("")}</g>`
    );
  }
};

/* ---------------- hero banner ---------------- */
/* opts: { preview, now, fxOn } — preview renders inert links */
export function heroHTML(t, opts = {}) {
  if (!t) return "";
  const now = opts.now || Date.now();
  const g = `ft${++artSeq}`;
  const art = (ART[t.id] || ART.sale)(g, t, now);
  const end = t.countdown && t.to && t.to > now ? t.to : 0;
  const href = linkHref(t.link);
  const ctaInner = `<span>${esc(t.cta)}</span><svg aria-hidden="true"><use href="#i-arr"/></svg>`;
  const cta = t.cta
    ? opts.preview
      ? `<span class="ft-cta">${ctaInner}</span>`
      : `<a class="ft-cta" href="${esc(href)}"${href === "#store" ? " data-ft-scroll" : ""}>${ctaInner}</a>`
    : "";
  const coupon = t.coupon
    ? `<button type="button" class="ft-coupon"${opts.preview ? " tabindex=\"-1\"" : ` data-ft-coupon="${esc(t.coupon)}"`} aria-label="Copy code ${esc(t.coupon)}"><span class="ft-coupon-k">Use code</span><b>${esc(t.coupon)}</b><i><svg aria-hidden="true"><use href="#i-copy"/></svg>Copy</i></button>`
    : "";
  return (
    `<div class="ft-wrap"><section class="ft ft--${t.id}" style="${themeVars(t)}" aria-label="${esc(t.name)} offers">` +
    `<div class="ft-pattern" aria-hidden="true"></div>` +
    `<svg class="ft-art" viewBox="0 0 400 300" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">${art}</svg>` +
    `<div class="ft-body">` +
    `<span class="ft-badge">${SPARK}${esc(t.badge)}</span>` +
    `<h2 class="ft-title">${rich(t.title)}</h2>` +
    (t.subtitle ? `<p class="ft-sub">${esc(t.subtitle)}</p>` : "") +
    (cta || coupon ? `<div class="ft-acts">${cta}${coupon}</div>` : "") +
    (end ? countdownHTML(end, now) : "") +
    `</div>` +
    (opts.preview || t.effect === "none"
      ? ""
      : `<button type="button" class="ft-fxbtn" data-ft-fx aria-pressed="${opts.fxOn === false ? "false" : "true"}" title="Festive effects">${SPARK}<span>${opts.fxOn === false ? "Effects off" : "Effects on"}</span></button>`) +
    `</section></div>`
  );
}

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}
const pad = (n) => String(n).padStart(2, "0");
export function countdownHTML(end, now) {
  const [d, h, m, s] = parts(end - now);
  return (
    `<div class="ft-count" data-ft-end="${end}" role="timer" aria-label="Offer ends in">` +
    `<small>Ends in</small>` +
    `<span><b data-u="d">${pad(d)}</b><i>days</i></span><em>:</em>` +
    `<span><b data-u="h">${pad(h)}</b><i>hrs</i></span><em>:</em>` +
    `<span><b data-u="m">${pad(m)}</b><i>min</i></span><em>:</em>` +
    `<span><b data-u="s">${pad(s)}</b><i>sec</i></span>` +
    `</div>`
  );
}

/* one shared 1-second ticker for every countdown on the page */
let ticker = 0;
export function startCountdowns() {
  if (ticker) return;
  const tick = () => {
    const els = document.querySelectorAll("[data-ft-end]");
    const now = Date.now();
    els.forEach((el) => {
      const [d, h, m, s] = parts(Number(el.dataset.ftEnd) - now);
      const set = (u, v) => {
        const b = el.querySelector(`[data-u="${u}"]`);
        if (b && b.textContent !== v) b.textContent = v;
      };
      set("d", pad(d));
      set("h", pad(h));
      set("m", pad(m));
      set("s", pad(s));
    });
  };
  ticker = setInterval(tick, 1000);
}

/* ---------------- card ribbon ---------------- */
export function ribbonHTML(t) {
  if (!t || !t.ribbon) return "";
  return `<span class="sc-fest ft-ribbon ft-ribbon--${t.id}" style="${themeVars(t)}">${SPARK}${esc(t.ribbon)}</span>`;
}

/* ---------------- store garland (toran) ----------------
   A hanging festive band across the top of the course store.
   The rope is a sampled sine so every pendant lands exactly on it.  */
const PENDANT = {
  diwali: `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 22c-6 0-10 2-10 5h20c0-3-4-5-10-5z" fill="currentColor"/><ellipse cx="12" cy="21" rx="9" ry="2.6" fill="currentColor" opacity=".35"/><path d="M12 2c2.6 4.2 4.6 6.3 4.6 9a4.6 4.6 0 0 1-9.2 0c0-2.7 2-4.8 4.6-9z" fill="var(--ft-flame,#FFC24A)"/><path d="M12 8c1.3 2.2 2.3 3.3 2.3 4.8a2.3 2.3 0 0 1-4.6 0c0-1.5 1-2.6 2.3-4.8z" fill="#fff" opacity=".85"/></svg>`,
  holi: `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 2c3.8 5.6 6.4 9.4 6.4 12.6A6.4 6.4 0 0 1 12 21a6.4 6.4 0 0 1-6.4-6.4C5.6 11.4 8.2 7.6 12 2z" fill="currentColor"/><circle cx="9.4" cy="14" r="2" fill="#fff" opacity=".45"/><path d="M8 26h8l-1.4 5H9.4z" fill="currentColor" opacity=".6"/></svg>`,
  christmas: `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 2v30M3.6 7.5l16.8 17M20.4 7.5 3.6 24.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M12 6.5 14 5l-1.4 2.6L15 8.6l-2.6.4-.6 2.6-.8-2.6-2.6-.4 2.4-1L9.4 5z" fill="currentColor"/></svg>`,
  newyear: `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 2l2.1 6.6L21 11l-6.9 2.4L12 20l-2.1-6.6L3 11l6.9-2.4z" fill="currentColor"/><circle cx="19.5" cy="5" r="1.7" fill="currentColor" opacity=".7"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" opacity=".7"/></svg>`,
  sale: `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M13.6 2H6a2 2 0 0 0-2 2v7.6L17.2 24.8a2.4 2.4 0 0 0 3.4-3.4L7.4 8.4z" fill="currentColor"/><circle cx="7.6" cy="7.6" r="1.9" fill="#fff"/><path d="m4 21 4.4-1 3.2 3.2-1.8 4.4-4.6-2.2z" fill="currentColor" opacity=".75"/></svg>`
};

export function garlandHTML(t) {
  if (!t || !t.garland) return "";
  const W = 1200;
  const H = 78;
  const ropeY = (x) => 16 + 9 * Math.sin((x / W) * Math.PI * 3) + 5 * Math.sin((x / W) * Math.PI * 7 + 1.1);
  let d = "";
  for (let x = 0; x <= W; x += 20) d += (x ? "L" : "M") + x + " " + ropeY(x).toFixed(1) + " ";
  let beads = "";
  for (let x = 26; x < W; x += 58) beads += `<circle cx="${x}" cy="${ropeY(x).toFixed(1)}" r="2.9"/>`;
  const pend = PENDANT[t.id] || PENDANT.sale;
  const n = 13;
  let drops = "";
  for (let i = 0; i < n; i++) {
    const x = 54 + (i * (W - 108)) / (n - 1);
    drops +=
      `<span class="ft-tp ft-tp--${i % 3}" style="left:${((x / W) * 100).toFixed(3)}%;top:${ropeY(x).toFixed(1)}px;` +
      `--dl:${(-i * 0.16).toFixed(2)}s">${pend}</span>`;
  }
  return (
    `<div class="ft-toran ft-toran--${t.id}" style="${themeVars(t)}" aria-hidden="true">` +
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false">` +
    `<defs><linearGradient id="ftRopeG" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="var(--ft-ac)"/><stop offset=".5" stop-color="var(--ft-c2)"/><stop offset="1" stop-color="var(--ft-ac)"/>` +
    `</linearGradient></defs>` +
    `<path d="${d}" fill="none" stroke="url(#ftRopeG)" stroke-width="4.5" stroke-linecap="round"/>` +
    `<g class="ft-toran__beads" fill="var(--ft-ac)">${beads}</g>` +
    `</svg>` +
    drops +
    `</div>`
  );
}

/* ---------------- offer ticker ----------------
   items: [{ text, tone }] — tone is pill | dot | coin | tag   */
export function marqueeHTML(items, t = null, { label = "Offers" } = {}) {
  const list = (items || []).filter((i) => i && i.text).slice(0, 14);
  if (!list.length) return "";
  const row =
    `<div class="sp-tick__row">` +
    list
      .map(
        (i) =>
          `<span class="sp-tick__i is-${esc(i.tone || "dot")}"><i aria-hidden="true"></i>${esc(i.text)}</span>`
      )
      .join("") +
    `</div>`;
  return (
    `<div class="sp-tick${t ? " is-fest" : ""}"${t ? ` style="${themeVars(t)}"` : ""} role="marquee" aria-label="${esc(label)}">` +
    row +
    row +
    `</div>`
  );
}

/* ---------------- particle effects ---------------- */
const COLOURS = {
  balloons: ["#FF6FB5", "#FFE45C", "#5AC8FA", "#7CE8B4", "#C08BFF", "#FF8A5C"],
  confetti: ["#FFD166", "#FF4D8D", "#5A4BFF", "#22D3EE", "#4ADE80", "#FFFFFF"],
  colour: ["#FF3D7F", "#FFE14D", "#22D3EE", "#4ADE80", "#A855F7", "#FF8A3D"],
  fireworks: ["#FFD166", "#FF7EB6", "#7DE2FF", "#B4FF7A", "#FFFFFF"]
};
/* deterministic pseudo-random so re-renders don't jump */
function rng(seed) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
}

export function fxHTML(t, { contained = false } = {}) {
  if (!t || !t.effect || t.effect === "none") return "";
  const level = t.level || 2;
  const base = { snow: 22, diya: 16, confetti: 22, fireworks: 4, colour: 9, balloons: 10 }[t.effect] || 16;
  const n = Math.round(base * [0, 0.6, 1, 1.6][level]);
  const r = rng(7 + t.id.length * 31 + level);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (r() * 100).toFixed(1);
    const dl = (-r() * 14).toFixed(2);
    if (t.effect === "snow") {
      const s = (3 + r() * 6).toFixed(1);
      out += `<i style="--x:${x}%;--s:${s}px;--d:${(9 + r() * 10).toFixed(1)}s;--dl:${dl}s;--dx:${(r() * 60 - 30).toFixed(0)}px;--o:${(0.45 + r() * 0.5).toFixed(2)}"></i>`;
    } else if (t.effect === "diya") {
      const s = (3 + r() * 5).toFixed(1);
      out += `<i style="--x:${x}%;--s:${s}px;--d:${(7 + r() * 8).toFixed(1)}s;--dl:${dl}s;--dx:${(r() * 50 - 25).toFixed(0)}px;--c:${pick(["#FFC94A", "#FF9F1C", "#FFE08A"])}"></i>`;
    } else if (t.effect === "confetti") {
      out += `<i style="--x:${x}%;--w:${(6 + r() * 6).toFixed(0)}px;--h:${(9 + r() * 8).toFixed(0)}px;--d:${(6 + r() * 7).toFixed(1)}s;--dl:${dl}s;--dx:${(r() * 120 - 60).toFixed(0)}px;--rot:${(r() * 720 + 360).toFixed(0)}deg;--c:${pick(COLOURS.confetti)}"></i>`;
    } else if (t.effect === "colour") {
      const s = (60 + r() * 120).toFixed(0);
      out += `<i style="--x:${x}%;--s:${s}px;--d:${(10 + r() * 10).toFixed(1)}s;--dl:${dl}s;--dx:${(r() * 80 - 40).toFixed(0)}px;--c:${pick(COLOURS.colour)}"></i>`;
    } else if (t.effect === "balloons") {
      const s = (15 + r() * 15).toFixed(0);
      out += `<i style="--x:${x}%;--s:${s}px;--d:${(9 + r() * 8).toFixed(1)}s;--dl:${dl}s;--dx:${(r() * 90 - 45).toFixed(0)}px;--c:${pick(COLOURS.balloons)}"></i>`;
    } else if (t.effect === "fireworks") {
      const c = pick(COLOURS.fireworks);
      const y = (8 + r() * 38).toFixed(1);
      const sparks = Array.from({ length: 14 }, (_, k) => `<b style="--a:${(k * 360) / 14}deg"></b>`).join("");
      out += `<i style="--x:${(8 + r() * 84).toFixed(1)}%;--y:${y}%;--c:${c};--d:${(2.6 + r() * 1.6).toFixed(2)}s;--dl:${(-r() * 4).toFixed(2)}s;--r:${(40 + r() * 50).toFixed(0)}px">${sparks}</i>`;
    }
  }
  return `<div class="ft-fx ft-fx--${t.effect}${contained ? " is-contained" : ""}" aria-hidden="true" data-sig="${esc(signature(t))}">${out}</div>`;
}

/* students can switch effects off; reduced-motion users never see them */
const FX_KEY = "fx:fest-fx";
export function fxAllowed() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return localStorage.getItem(FX_KEY) !== "off";
  } catch (e) {
    return true;
  }
}
export function setFxAllowed(on) {
  try {
    if (on) localStorage.removeItem(FX_KEY);
    else localStorage.setItem(FX_KEY, "off");
  } catch (e) {
    /* ignore */
  }
}
