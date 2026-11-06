/* QR helpers shared by the portal and the CRM.
   Uses a vendored copy of qrcode-generator 1.4.4 (MIT, Kazuhiko Arase) in
   assets/vendor so QR codes work without a CDN; the CDN is only a fallback. */

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

export function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!loading) {
    loading = loadScript(new URL("../vendor/qrcode-generator.js?v=1", import.meta.url).href)
      .catch(() => loadScript("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"))
      .then(() => {
        if (!window.qrcode) throw new Error("QR library unavailable");
        return window.qrcode;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/* ecc: "L" | "M" | "Q" | "H" — use "H" when a logo covers the centre. */
export async function makeQR(text, ecc = "M") {
  const factory = await loadQR();
  const qr = factory(0, ecc);
  qr.addData(String(text));
  qr.make();
  return qr;
}

export async function qrSvg(text, { ecc = "M", margin = 2 } = {}) {
  const qr = await makeQR(text, ecc);
  return qr.createSvgTag({ cellSize: 4, margin, scalable: true });
}

export function drawQR(ctx, qr, x, y, size, { dark = "#0B0B10", light = "#FFFFFF", quiet = 2 } = {}) {
  const n = qr.getModuleCount();
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, max, size, weight, family) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= max) break;
    s -= 2;
  } while (s > 18);
  return s;
}

/* Printable "scan to join" poster (1080×1350 PNG data URL). */
export async function membershipPoster({ url, code, planName, validity, footer }) {
  const qr = await makeQR(url, "H");
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const sans = '"Inter Tight", "Segoe UI", system-ui, sans-serif';
  const mono = '"JetBrains Mono", ui-monospace, monospace';

  /* background */
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#14122A");
  bg.addColorStop(0.55, "#0B0B10");
  bg.addColorStop(1, "#11140A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = (gx, gy, r, color) => {
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.9, 80, 520, "rgba(90,75,255,0.55)");
  glow(80, H - 60, 520, "rgba(217,255,87,0.22)");

  /* brand */
  const logo = await loadImage(new URL("../../fenxtek-logo.png", import.meta.url).href);
  if (logo) ctx.drawImage(logo, 80, 78, 64, 64);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 40px ${sans}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("FenxTek", logo ? 160 : 80, 118);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 18px ${mono}`;
  ctx.fillText("SHORTHAND CLASSES · MEMBERSHIP", logo ? 162 : 80, 146);

  /* headline */
  ctx.fillStyle = "#D9FF57";
  ctx.font = `600 22px ${mono}`;
  ctx.fillText("SCAN TO JOIN", 80, 250);
  ctx.fillStyle = "#FFFFFF";
  const nameSize = fitText(ctx, planName, W - 160, 84, 800, sans);
  ctx.font = `800 ${nameSize}px ${sans}`;
  ctx.fillText(planName, 80, 250 + nameSize + 14);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(validity, 80, 250 + nameSize + 66);

  /* QR card */
  const size = 540;
  const qx = (W - size) / 2;
  const qy = 470;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, qx - 34, qy - 34, size + 68, size + 68, 44);
  ctx.fill();
  ctx.restore();
  drawQR(ctx, qr, qx, qy, size, { quiet: 1 });
  if (logo) {
    const ls = 104;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, W / 2 - ls / 2 - 12, qy + size / 2 - ls / 2 - 12, ls + 24, ls + 24, 26);
    ctx.fill();
    ctx.drawImage(logo, W / 2 - ls / 2, qy + size / 2 - ls / 2, ls, ls);
  }

  /* code chip */
  ctx.font = `700 38px ${mono}`;
  const label = code.split("").join(" ");
  const tw = ctx.measureText(label).width;
  const cy = qy + size + 80;
  ctx.fillStyle = "#D9FF57";
  roundRect(ctx, (W - tw) / 2 - 34, cy, tw + 68, 74, 37);
  ctx.fill();
  ctx.fillStyle = "#0B0B10";
  ctx.textAlign = "center";
  ctx.fillText(label, W / 2, cy + 50);

  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `500 24px ${sans}`;
  ctx.fillText(footer || "Scan with your phone camera, sign in, and tap Activate.", W / 2, cy + 128);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `500 18px ${mono}`;
  ctx.fillText(url.replace(/^https?:\/\//, "").slice(0, 80), W / 2, H - 46);
  ctx.textAlign = "left";
  return cv.toDataURL("image/png");
}
