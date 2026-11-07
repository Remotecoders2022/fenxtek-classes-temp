
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

/* ---------- loading screen ---------- */
const pre = $('#preloader');
const revealPage = () => document.body.classList.add('loaded');
const unlock = () => document.documentElement.classList.remove('is-loading');
if (pre && !reduce){
  const quick = pre.dataset.quick === '1';
  const dur = quick ? 850 : 1750;
  const pct = $('#plPct'), spd = $('#plSpeed'), bar = $('#plBar'), ring = $('#plRing');
  const words = [...pre.querySelectorAll('.pl-words span')];
  const C = 2 * Math.PI * 54;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let pageLoaded = document.readyState === 'complete';
  addEventListener('load', () => { pageLoaded = true; }, { once: true });
  let start = null, finished = false;

  const paint = (v) => {
    pct.textContent = String(Math.round(v * 100)).padStart(2, '0');
    spd.textContent = String(Math.round(v * 160)).padStart(3, '0');
    bar.style.transform = 'scaleX(' + v + ')';
    ring.style.strokeDashoffset = (C * (1 - v)).toFixed(2);
    words.forEach((w) => w.classList.toggle('on', v >= +w.dataset.at));
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    paint(1);
    try { sessionStorage.setItem('fx:intro', '1'); } catch (e) {}
    pre.classList.add('done');
    unlock();
    setTimeout(revealPage, 380);
    setTimeout(() => pre.remove(), 1600);
  };
  const step = (t) => {
    if (finished) return;
    if (start === null) start = t;
    const raw = Math.min(1, (t - start) / dur);
    let v = ease(raw);
    if (!pageLoaded) v = Math.min(v, 0.92);   // hold near the end until the page has loaded
    paint(v);
    if (raw < 1 || !pageLoaded) requestAnimationFrame(step);
    else setTimeout(finish, quick ? 120 : 320);
  };
  ring.style.strokeDasharray = C.toFixed(2);
  ring.style.strokeDashoffset = C.toFixed(2);
  requestAnimationFrame(step);
  pre.addEventListener('click', finish);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); });
  setTimeout(finish, 4500);                  // never block the page for long
} else {
  if (pre) pre.remove();
  unlock();
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

/* ---------- footer wordmark: 3D keycaps — hover presses, board follows the cursor ---------- */
const keyboards = $$('.kb');
const kbVisible = new Set();
keyboards.forEach((kb) => {
  const plate = $('.kb-plate', kb);
  const keys = $$('.kk', kb);
  const out = $('.kb-txt', kb);
  const hint = $('.kb-hint', kb);
  if (hint && !fine) hint.textContent = 'Tap to type';
  let buf = '', typingT = 0, demoT = 0, touched = false;

  const type = (ch) => {
    buf = (buf + ch).slice(-14);
    if (out) out.textContent = buf;
    kb.classList.add('is-typing');
    clearTimeout(typingT);
    typingT = setTimeout(() => kb.classList.remove('is-typing'), 140);
  };
  const press = (k, silent) => {
    if (k.classList.contains('is-down')) return;
    k.classList.add('is-down');
    if (!silent) type(k.dataset.k);
  };
  const release = (k) => k.classList.remove('is-down');
  const stopDemo = () => { touched = true; clearTimeout(demoT); };

  /* mouse/pen: hovering a key holds it down; touch: press while the finger is on it */
  keys.forEach((k) => {
    k.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch'){ stopDemo(); press(k); } });
    k.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') release(k); });
    k.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch'){ stopDemo(); press(k); }
      else if (k.classList.contains('is-down')){ release(k); requestAnimationFrame(() => press(k)); }
    });
    ['pointerup', 'pointercancel'].forEach((ev) => k.addEventListener(ev, (e) => { if (e.pointerType === 'touch') setTimeout(() => release(k), 90); }));
  });

  /* rise in, then type the name once so the interaction explains itself */
  const reveal = () => {
    kb.classList.add('is-in');
    if (reduce){ buf = 'fenxtek'; if (out) out.textContent = buf; return; }
    demoT = setTimeout(function step(i = 0){
      if (touched || i >= keys.length) return;
      const k = keys[i];
      press(k);
      setTimeout(() => release(k), 130);
      demoT = setTimeout(() => step(i + 1), 165);
    }, 1100);
  };
  if (!('IntersectionObserver' in window)) { reveal(); kbVisible.add(kb); }
  else {
    let shown = false;
    new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) kbVisible.add(kb); else kbVisible.delete(kb);
        if (en.isIntersecting && en.intersectionRatio >= 0.35 && !shown){ shown = true; reveal(); }
      });
    }, { threshold: [0, 0.35] }).observe(kb);
  }

  /* the board tilts toward the cursor; a soft light moves across every cap */
  if (fine && !reduce){
    let raf = 0, px = 0, py = 0;
    const paint = () => {
      raf = 0;
      const r = kb.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (px - r.left) / r.width)) - 0.5;
      const ny = Math.min(1, Math.max(0, (py - r.top) / r.height)) - 0.5;
      kb.style.setProperty('--mx', (px - r.left) + 'px');
      kb.style.setProperty('--my', (py - r.top) + 'px');
      plate.style.setProperty('--tx', (nx * 9).toFixed(2) + 'deg');
      plate.style.setProperty('--ty', (ny * -7).toFixed(2) + 'deg');
      keys.forEach((k) => {
        const kr = k.getBoundingClientRect();
        const lx = Math.min(140, Math.max(-40, ((px - kr.left) / kr.width) * 100));
        const ly = Math.min(120, Math.max(-60, ((py - kr.top) / kr.height) * 100));
        k.style.setProperty('--lx', lx.toFixed(1) + '%');
        k.style.setProperty('--ly', ly.toFixed(1) + '%');
      });
    };
    const zone = kb.closest('.footer') || kb.parentElement || kb;
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX; py = e.clientY;
      kb.classList.add('is-hot');
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    zone.addEventListener('pointerleave', () => {
      kb.classList.remove('is-hot');
      plate.style.setProperty('--tx', '0deg');
      plate.style.setProperty('--ty', '0deg');
      keys.forEach((k) => { k.style.removeProperty('--lx'); k.style.removeProperty('--ly'); });
    });
  }

  kb._kb = { keys, press, release, stopDemo };
});

/* a real keyboard works too: F E N X T K press the matching caps while a board is on screen */
if (keyboards.length){
  const inField = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const held = new Map();
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target) || !kbVisible.size) return;
    const ch = (e.key || '').toLowerCase();
    if (!/^[fenxtk]$/.test(ch) || held.has(ch)) return;
    const hit = [];
    kbVisible.forEach((kb) => {
      const api = kb._kb; if (!api) return;
      api.stopDemo();
      /* "e" appears twice: press the one that comes next in F-E-N-X-T-E-K */
      const txt = ($('.kb-txt', kb) || {}).textContent || '';
      let cand = api.keys.filter((k) => k.dataset.k === ch);
      if (cand.length > 1) cand = [/t$/.test(txt) ? cand[1] : cand[0]];
      cand.forEach((k) => { api.press(k); hit.push([api, k]); });
    });
    held.set(ch, hit);
  });
  addEventListener('keyup', (e) => {
    const ch = (e.key || '').toLowerCase();
    const hit = held.get(ch);
    if (!hit) return;
    hit.forEach(([api, k]) => api.release(k));
    held.delete(ch);
  });
  addEventListener('blur', () => { held.forEach((hit) => hit.forEach(([api, k]) => api.release(k))); held.clear(); });
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
