/* ============================================================
   FENXTEK — premium payment receipt
   Drawn straight onto a <canvas> (no html2canvas), so the PNG is
   crisp at 2x and looks identical in the student portal and CRM.
   ============================================================ */

import { money, num, formatDate, methodLabel, validityLabel, orderBreakdown } from "./commerce.js?v=3";

const W = 1200; // css px — exported at 2x = 2400 px wide
const PAD = 72;
const C = {
  paper: "#F7F4EC",
  card: "#FFFFFF",
  ink: "#0B0B10",
  muted: "#6B6862",
  line: "#E6E1D6",
  violet: "#5A4BFF",
  lime: "#D9FF57",
  ok: "#12805A",
  warn: "#B7791F",
  err: "#B42318"
};
const SANS = "'Inter Tight', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace";
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "fenxtek-logo.png";
    });
  }
  return logoPromise;
}

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`600 20px 'Inter Tight'`),
        document.fonts.load(`400 20px 'Inter Tight'`),
        document.fonts.load(`500 12px 'JetBrains Mono'`),
        document.fonts.load(`italic 400 30px 'Instrument Serif'`)
      ]),
      new Promise((r) => setTimeout(r, 1500))
    ]);
  } catch (e) {
    /* fall back to system fonts */
  }
}

/* ---------------- amount in words (Indian numbering) ---------------- */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function three(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
}
export function amountInWords(value) {
  let n = Math.round(Math.abs(num(value)));
  if (!n) return "Rupees Zero Only";
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thousand) parts.push(two(thousand) + " Thousand");
  if (n) parts.push(three(n));
  return "Rupees " + parts.join(" ") + " Only";
}

/* ---------------- drawing helpers ---------------- */
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
function text(ctx, str, x, y, font, color, align = "left", spacing = 0) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing ? spacing + "px" : "0px";
  ctx.fillText(String(str), x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
function wrap(ctx, str, maxWidth, font) {
  ctx.font = font;
  const words = String(str || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((w) => {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function clip(ctx, str, maxWidth, font) {
  ctx.font = font;
  let s = String(str || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

function itemsOf(order) {
  return (Array.isArray(order.items) ? order.items : Object.values(order.items || {})).filter(Boolean);
}

function stampOf(order) {
  if (order.status === "refunded") return { label: "REFUNDED", color: C.muted };
  if (order.status === "pending") return { label: "PENDING", color: C.warn };
  if (order.status === "rejected") return { label: "VOID", color: C.err };
  return { label: "PAID", color: C.ok };
}

/* ---------------- main renderer ---------------- */
export async function renderReceipt(order, settings = {}) {
  await fontsReady();
  const logo = await loadLogo();
  const items = itemsOf(order);
  const biz = {
    name: settings.businessName || "FenxTek Shorthand Classes",
    address: settings.address || "Kanpur, Uttar Pradesh, India",
    gstin: settings.gstin || "",
    phone: settings.supportPhone || settings.phone || "",
    email: settings.supportEmail || settings.email || "",
    note: settings.receiptNote || "Thank you for learning with FenxTek. Keep the daily dictation going — that is the whole method."
  };

  /* measure dynamic height */
  const meas = document.createElement("canvas").getContext("2d");
  const titleFont = `600 22px ${SANS}`;
  const colCourse = 560;
  const rowHeights = items.map((it) => {
    const lines = wrap(meas, it.title || "Course", colCourse, titleFont).slice(0, 2);
    return 34 + lines.length * 28 + 26;
  });
  const tableH = 56 + rowHeights.reduce((a, b) => a + b, 0);
  const mrpSum = items.reduce((s, it) => s + Math.max(num(it.mrp), num(it.price)), 0);
  const subSum = num(order.subtotal) || items.reduce((s, it) => s + num(it.price), 0);
  const bd = orderBreakdown(order);
  const totalRows = 2 + (mrpSum > subSum ? 1 : 0) + (bd.member ? 1 : 0) + (bd.coupon ? 1 : 0) + (bd.coins ? 1 : 0);
  const totalsH = Math.max(totalRows * 34 + 6 + 86, 190);
  const H = 300 + 250 + tableH + 40 + totalsH + 70 + 230;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  /* page */
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  /* ===== header band ===== */
  const bandH = 300;
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, bandH);
  let g = ctx.createRadialGradient(W * 0.78, 40, 10, W * 0.78, 40, 520);
  g.addColorStop(0, "rgba(90,75,255,0.55)");
  g.addColorStop(1, "rgba(90,75,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, bandH);
  g = ctx.createRadialGradient(140, bandH, 10, 140, bandH, 380);
  g.addColorStop(0, "rgba(217,255,87,0.16)");
  g.addColorStop(1, "rgba(217,255,87,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, bandH);
  /* subtle grid */
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, bandH); ctx.stroke(); }
  for (let y = 0; y < bandH; y += 48) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  /* waveform */
  for (let i = 0; i < 46; i++) {
    const h = 10 + Math.abs(Math.sin(i * 1.7)) * 46 + (i % 3) * 6;
    const x = W - PAD - 46 * 9 + i * 9;
    const gg = ctx.createLinearGradient(0, 210 - h / 2, 0, 210 + h / 2);
    gg.addColorStop(0, "rgba(217,255,87,0.9)");
    gg.addColorStop(1, "rgba(90,75,255,0.9)");
    ctx.fillStyle = gg;
    rr(ctx, x, 230 - h / 2, 4, h, 2);
    ctx.fill();
  }
  /* brand */
  if (logo) ctx.drawImage(logo, PAD, 64, 64, 64);
  text(ctx, "FenxTek", PAD + 82, 98, `700 32px ${SANS}`, "#FFFFFF", "left", -0.6);
  text(ctx, "SHORTHAND CLASSES", PAD + 84, 122, `500 11px ${MONO}`, "rgba(255,255,255,0.55)", "left", 3);
  /* title */
  text(ctx, "PAYMENT RECEIPT", W - PAD, 84, `500 12px ${MONO}`, C.lime, "right", 3);
  text(ctx, order.orderNo || "—", W - PAD, 122, `600 30px ${SANS}`, "#FFFFFF", "right", -0.4);
  text(ctx, "Issued " + formatDate(order.paidAt || order.createdAt, true), W - PAD, 148, `400 14px ${SANS}`, "rgba(255,255,255,0.6)", "right");
  /* big amount */
  text(ctx, "AMOUNT PAID", PAD, 206, `500 11px ${MONO}`, "rgba(255,255,255,0.5)", "left", 3);
  text(ctx, money(order.total), PAD, 262, `700 58px ${SANS}`, "#FFFFFF", "left", -2);
  ctx.font = `700 58px ${SANS}`;
  const amtW = ctx.measureText(money(order.total)).width;
  text(ctx, "INR", PAD + amtW + 14, 262, `500 14px ${MONO}`, C.lime, "left", 2);

  /* lime rule */
  const lg = ctx.createLinearGradient(0, 0, W, 0);
  lg.addColorStop(0, C.violet);
  lg.addColorStop(1, C.lime);
  ctx.fillStyle = lg;
  ctx.fillRect(0, bandH, W, 6);

  /* ===== stamp ===== */
  const st = stampOf(order);
  ctx.save();
  ctx.translate(W - PAD - 70, bandH + 20);
  ctx.rotate(-0.12);
  ctx.strokeStyle = st.color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  rr(ctx, -82, -10, 164, 60, 12);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  rr(ctx, -76, -4, 152, 48, 9);
  ctx.stroke();
  text(ctx, st.label, 0, 29, `800 26px ${SANS}`, st.color, "center", 4);
  ctx.restore();

  /* ===== parties ===== */
  let y = bandH + 70;
  const colW = (W - PAD * 2 - 40) / 2;
  const party = (x, label, rows) => {
    text(ctx, label, x, y, `500 11px ${MONO}`, C.muted, "left", 2.6);
    let yy = y + 36;
    rows.forEach((r, i) => {
      if (!r) return;
      if (i === 0) {
        text(ctx, clip(ctx, r, colW, `600 24px ${SANS}`), x, yy, `600 24px ${SANS}`, C.ink, "left", -0.4);
        yy += 30;
      } else {
        text(ctx, clip(ctx, r, colW, `400 16px ${SANS}`), x, yy, `400 16px ${SANS}`, C.muted);
        yy += 24;
      }
    });
  };
  party(PAD, "BILLED TO", [order.name || "Student", order.email, order.phone, order.uid ? "Student ID · " + String(order.uid).slice(0, 10).toUpperCase() : ""]);
  /* receipt facts */
  const fx = PAD + colW + 40;
  text(ctx, "PAYMENT DETAILS", fx, y, `500 11px ${MONO}`, C.muted, "left", 2.6);
  const facts = [
    ["Method", methodLabel(order.method)],
    ["Transaction ID", order.paymentId || order.utr || (order.method === "free" ? "Not applicable" : "—")],
    ["Order date", formatDate(order.createdAt, true)],
    ["Paid on", formatDate(order.paidAt || order.createdAt, true)]
  ];
  facts.forEach((f, i) => {
    const yy = y + 34 + i * 30;
    text(ctx, f[0], fx, yy, `400 15px ${SANS}`, C.muted);
    text(ctx, clip(ctx, f[1], colW - 150, `500 15px ${SANS}`), fx + colW, yy, `500 15px ${SANS}`, C.ink, "right");
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(fx, yy + 11.5);
    ctx.lineTo(fx + colW, yy + 11.5);
    ctx.stroke();
  });

  /* ===== items table ===== */
  y = bandH + 250;
  const tx = PAD;
  const tw = W - PAD * 2;
  rr(ctx, tx, y, tw, tableH, 22);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  /* header */
  ctx.save();
  rr(ctx, tx, y, tw, 56, 22);
  ctx.clip();
  ctx.fillStyle = "#F1EEE6";
  ctx.fillRect(tx, y, tw, 56);
  ctx.restore();
  const colX = { n: tx + 28, course: tx + 80, validity: tx + 680, mrp: tx + tw - 190, price: tx + tw - 28 };
  const hy = y + 35;
  text(ctx, "#", colX.n, hy, `500 11px ${MONO}`, C.muted, "left", 2);
  text(ctx, "ITEM", colX.course, hy, `500 11px ${MONO}`, C.muted, "left", 2);
  text(ctx, "VALIDITY", colX.validity, hy, `500 11px ${MONO}`, C.muted, "left", 2);
  text(ctx, "MRP", colX.mrp, hy, `500 11px ${MONO}`, C.muted, "right", 2);
  text(ctx, "PRICE", colX.price, hy, `500 11px ${MONO}`, C.muted, "right", 2);
  let ry = y + 56;
  items.forEach((it, i) => {
    const h = rowHeights[i];
    if (i > 0) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(tx + 24, ry + 0.5);
      ctx.lineTo(tx + tw - 24, ry + 0.5);
      ctx.stroke();
    }
    const lines = wrap(ctx, it.title || "Course", colCourse, titleFont).slice(0, 2);
    text(ctx, String(i + 1).padStart(2, "0"), colX.n, ry + 46, `500 14px ${MONO}`, C.violet);
    lines.forEach((ln, li) => text(ctx, ln, colX.course, ry + 46 + li * 28, titleFont, C.ink, "left", -0.3));
    const sub = [it.category, it.mode, it.language].filter(Boolean).join(" · ");
    text(ctx, sub, colX.course, ry + 46 + lines.length * 28, `400 14px ${SANS}`, C.muted);
    text(ctx, validityLabel(it.validityDays), colX.validity, ry + 46, `400 15px ${SANS}`, C.ink);
    const mrp = Math.max(num(it.mrp), num(it.price));
    if (mrp > num(it.price)) {
      const s = money(mrp);
      text(ctx, s, colX.mrp, ry + 46, `400 15px ${SANS}`, C.muted, "right");
      ctx.font = `400 15px ${SANS}`;
      const sw = ctx.measureText(s).width;
      ctx.strokeStyle = C.muted;
      ctx.beginPath();
      ctx.moveTo(colX.mrp - sw, ry + 41);
      ctx.lineTo(colX.mrp, ry + 41);
      ctx.stroke();
    } else {
      text(ctx, "—", colX.mrp, ry + 46, `400 15px ${SANS}`, C.muted, "right");
    }
    text(ctx, money(it.price), colX.price, ry + 46, `600 18px ${SANS}`, C.ink, "right");
    ry += h;
  });

  /* ===== totals ===== */
  y = bandH + 250 + tableH + 40;
  const totX = W - PAD - 440;
  const totW = 440;
  const mrpTotal = items.reduce((s, it) => s + Math.max(num(it.mrp), num(it.price)), 0);
  const subtotal = num(order.subtotal) || items.reduce((s, it) => s + num(it.price), 0);
  const rows = [["MRP total", money(mrpTotal), C.ink]];
  if (mrpTotal > subtotal) rows.push(["Discount on MRP", "− " + money(mrpTotal - subtotal), C.ok]);
  rows.push(["Subtotal", money(subtotal), C.ink]);
  if (bd.member) rows.push([`Member price${order.memberPlan ? " · " + order.memberPlan : ""}`, "− " + money(bd.member), C.ok]);
  if (bd.coupon) rows.push([order.coupon && order.coupon.code ? `Coupon · ${order.coupon.code}` : "Discount", "− " + money(bd.coupon), C.ok]);
  if (bd.coins) rows.push([`E-coins redeemed${order.coinsReturned ? " (returned)" : ""}`, "− " + money(bd.coins), C.ok]);
  rows.forEach((r, i) => {
    const yy = y + i * 34;
    text(ctx, r[0], totX, yy, `400 16px ${SANS}`, C.muted);
    text(ctx, r[1], totX + totW, yy, `500 16px ${SANS}`, r[2], "right");
  });
  const ty = y + rows.length * 34 + 6;
  rr(ctx, totX - 20, ty, totW + 40, 86, 18);
  ctx.fillStyle = C.ink;
  ctx.fill();
  text(ctx, "TOTAL PAID", totX + 4, ty + 36, `500 11px ${MONO}`, "rgba(255,255,255,0.55)", "left", 2.4);
  text(ctx, "Inclusive of all taxes", totX + 4, ty + 62, `400 13px ${SANS}`, "rgba(255,255,255,0.5)");
  text(ctx, money(order.total), totX + totW - 4, ty + 58, `700 36px ${SANS}`, C.lime, "right", -1);

  /* left: savings + words */
  const savings = Math.max(0, mrpTotal - num(order.total));
  const lx = PAD;
  const lw = totX - PAD - 70;
  if (savings > 0) {
    rr(ctx, lx, y - 24, 250, 44, 22);
    ctx.fillStyle = "rgba(18,128,90,0.1)";
    ctx.fill();
    text(ctx, `You saved ${money(savings)}`, lx + 125, y + 4, `600 16px ${SANS}`, C.ok, "center");
  }
  text(ctx, "AMOUNT IN WORDS", lx, y + 64, `500 11px ${MONO}`, C.muted, "left", 2.4);
  wrap(ctx, amountInWords(order.total), lw, `italic 400 24px ${SERIF}`)
    .slice(0, 3)
    .forEach((ln, i) => text(ctx, ln, lx, y + 98 + i * 30, `italic 400 24px ${SERIF}`, C.ink));

  /* ===== footer ===== */
  const fy = H - 230;
  ctx.strokeStyle = C.line;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(PAD, fy + 0.5);
  ctx.lineTo(W - PAD, fy + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, "Thank you!", PAD, fy + 62, `italic 400 40px ${SERIF}`, C.violet);
  wrap(ctx, biz.note, 560, `400 15px ${SANS}`)
    .slice(0, 3)
    .forEach((ln, i) => text(ctx, ln, PAD, fy + 94 + i * 22, `400 15px ${SANS}`, C.muted));
  const bx = W - PAD;
  text(ctx, biz.name, bx, fy + 50, `600 17px ${SANS}`, C.ink, "right");
  const bl = [biz.address, biz.gstin ? "GSTIN · " + biz.gstin : "", [biz.phone, biz.email].filter(Boolean).join("  ·  ")].filter(Boolean);
  bl.forEach((ln, i) => text(ctx, clip(ctx, ln, 520, `400 14px ${SANS}`), bx, fy + 76 + i * 22, `400 14px ${SANS}`, C.muted, "right"));
  text(
    ctx,
    `Computer-generated receipt · no signature required · Ref ${String(order.id || "").slice(-10).toUpperCase()}`,
    W / 2,
    H - 40,
    `500 11px ${MONO}`,
    "rgba(11,11,16,0.4)",
    "center",
    1.2
  );
  ctx.fillStyle = lg;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas;
}

export async function receiptDataURL(order, settings) {
  const canvas = await renderReceipt(order, settings);
  return canvas.toDataURL("image/png");
}

export async function downloadReceipt(order, settings) {
  const canvas = await renderReceipt(order, settings);
  const name = `FenxTek-Receipt-${order.orderNo || order.id || "order"}.png`;
  await new Promise((resolve) => {
    const finish = (url, revoke) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(() => URL.revokeObjectURL(url), 3000);
      resolve();
    };
    if (canvas.toBlob) {
      canvas.toBlob((blob) => (blob ? finish(URL.createObjectURL(blob), true) : finish(canvas.toDataURL("image/png"), false)), "image/png");
    } else finish(canvas.toDataURL("image/png"), false);
  });
  return name;
}
