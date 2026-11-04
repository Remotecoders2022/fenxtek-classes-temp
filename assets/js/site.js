
(function(){
"use strict";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(pointer: fine)').matches;

/* ---------- year ---------- */
const yr = $('#year');
if (yr) yr.textContent = new Date().getFullYear();

/* ---------- toast ---------- */
const toastEl = $('#toast');
let toastT;
function toast(msg){
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

/* ---------- preloader ---------- */
const pre = $('#preloader');
const revealPage = () => document.body.classList.add('loaded');
if (pre && !reduce){
  const plNum = $('#plNum'), plBar = $('#plBar');
  let start = null, finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    pre.classList.add('done');
    revealPage();
    setTimeout(() => pre.remove(), 800);
  };
  const step = (t) => {
    if (!start) start = t;
    const p = Math.min(1, (t - start) / 1500);
    plNum.textContent = Math.round(p * 100);
    plBar.style.transform = 'scaleX(' + p + ')';
    if (p < 1) requestAnimationFrame(step);
    else setTimeout(finish, 200);
  };
  requestAnimationFrame(step);
  setTimeout(finish, 3400);
} else {
  if (pre) pre.remove();
  revealPage();
}

/* ---------- custom cursor ---------- */
if (fine && !reduce){
  const dot = $('#curDot'), ring = $('#curRing');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
  }, { passive: true });
  (function loop(){
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    requestAnimationFrame(loop);
  })();
  const targets = 'a,button,input,.p-card,.voice,.exam-card,.why-row,.batch-row,.dir-photo';
  $$(targets).forEach((el) => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'));
  });
  document.addEventListener('mouseleave', () => document.body.classList.add('cur-hide'));
  document.addEventListener('mouseenter', () => document.body.classList.remove('cur-hide'));
}

/* ---------- header + progress + pin ---------- */
const hdr = $('#hdr');
const prog = $('#progressBar');
const toTop = $('#toTop');
const menu = $('#menu');
const burger = $('#burger');
let lastY = window.scrollY, ticking = false;
if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

function setMenu(open){
  if (!menu || !burger) return;
  menu.classList.toggle('open', open);
  hdr.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('locked', open);
}
if (burger) burger.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
$$('#menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

/* ---------- pinned exams ---------- */
const pin = $('#exams');
const pinTrack = $('#pinTrack');
const pinBar = $('#pinBar');
const pinMQ = window.matchMedia('(max-width: 980px)');
let pinActive = false, pinTop = 0, pinMax = 0;

function setupPin(){
  if (!pin || !pinTrack) return;
  if (pinMQ.matches || reduce){
    pinActive = false;
    pin.style.height = '';
    pinTrack.style.transform = '';
    if (pinBar) pinBar.style.transform = 'scaleX(0)';
    return;
  }
  pinTrack.style.transform = 'translate3d(0,0,0)';
  pinMax = Math.max(0, pinTrack.scrollWidth - window.innerWidth);
  if (pinMax < 20){
    pinActive = false;
    pin.style.height = '';
    return;
  }
  pinActive = true;
  pin.style.height = (window.innerHeight + pinMax) + 'px';
  pinTop = pin.getBoundingClientRect().top + window.scrollY;
}
function onPinScroll(){
  if (!pinActive) return;
  const p = Math.max(0, Math.min(1, (window.scrollY - pinTop) / pinMax));
  pinTrack.style.transform = 'translate3d(' + (-p * pinMax) + 'px,0,0)';
  if (pinBar) pinBar.style.transform = 'scaleX(' + p + ')';
}

function onScroll(){
  const y = window.scrollY;
  if (hdr){
    hdr.classList.toggle('scrolled', y > 40);
    if (!menu.classList.contains('open')) hdr.classList.toggle('hide', y > 700 && y > lastY + 4);
  }
  if (prog){
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
  }
  if (toTop) toTop.classList.toggle('show', y > 900);
  lastY = y;
  sweepReveals();
  onPinScroll();
}
addEventListener('scroll', () => {
  if (!ticking){
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }
}, { passive: true });

let rz;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { setupPin(); onScroll(); }, 150);
});

/* ---------- reveal ---------- */
const revEls = $$('[data-reveal]');
if ('IntersectionObserver' in window && !reduce){
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting){
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  revEls.forEach((el) => io.observe(el));
} else {
  revEls.forEach((el) => el.classList.add('in'));
}
/* safety sweep: anchor jumps skip frames, so reveal anything above the fold */
function sweepReveals(){
  if (reduce) return;
  const vh = innerHeight;
  revEls.forEach((el) => {
    if (el.classList.contains('in')) return;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.94) el.classList.add('in');
  });
}

/* ---------- counters ---------- */
function countUp(el, target){
  if (reduce){ el.textContent = target.toLocaleString('en-IN'); return; }
  const t0 = performance.now(), dur = 1500;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * e).toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
$$('[data-count]').forEach((el) => {
  const target = parseInt(el.dataset.count, 10) || 0;
  let done = false;
  if (!('IntersectionObserver' in window)){ countUp(el, target); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && !done){
        done = true;
        countUp(el, target);
        io.disconnect();
      }
    });
  }, { threshold: 0.6 });
  io.observe(el);
});

/* ---------- card spotlight ---------- */
$$('.p-card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
});

/* ---------- faq ---------- */
$$('.faq').forEach((item) => {
  const btn = $('.faq-btn', item);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
});

/* ---------- join form ---------- */const form = $('#joinForm');
const email = $('#joinEmail');
const formOk = $('#formOk');
if (form){
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (email.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){
      email.focus();
      toast('Please enter a valid email address.');
      return;
    }
    if (formOk) formOk.classList.add('show');
    form.reset();
    toast("You're in — we'll write soon.");
  });
}

/* ---------- footer wordmark: cursor spotlight + tilt ---------- */
const fWord = $('#fWord');
if (fWord && fine && !reduce){
  fWord.addEventListener('pointermove', (e) => {
    const r = fWord.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const nx = x / r.width - 0.5, ny = y / r.height - 0.5;
    fWord.style.setProperty('--mx', x + 'px');
    fWord.style.setProperty('--my', y + 'px');
    fWord.style.setProperty('--ry', (nx * 3).toFixed(2) + 'deg');
    fWord.style.setProperty('--rx', (ny * -2).toFixed(2) + 'deg');
    fWord.style.setProperty('--tx', (nx * -12).toFixed(2) + 'px');
    fWord.style.setProperty('--ty', (ny * -6).toFixed(2) + 'px');
  }, { passive: true });
  fWord.addEventListener('pointerleave', () => {
    fWord.style.setProperty('--mx', '50%');
    fWord.style.setProperty('--my', '55%');
    fWord.style.setProperty('--rx', '0deg');
    fWord.style.setProperty('--ry', '0deg');
    fWord.style.setProperty('--tx', '0px');
    fWord.style.setProperty('--ty', '0px');
  });
}

/* ---------- image fallback ---------- */
const dirImg = $('.dir-photo img');
if (dirImg) dirImg.addEventListener('error', () => dirImg.remove());

/* ---------- init ---------- */
function init(){
  setupPin();
  onScroll();
}
init();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
addEventListener('load', init);
})();
