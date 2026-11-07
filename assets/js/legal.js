/* ============================================================
   FENXTEK — legal pages (privacy policy, terms & conditions)
   - highlights the section you are reading in the contents list
   - keeps the active item visible in the mobile contents strip
   No dependencies. Loaded only by privacy.html and terms.html.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var links = Array.prototype.slice.call(document.querySelectorAll(".lg-toc a"));
  var secs = links
    .map(function (a) {
      return document.querySelector(a.getAttribute("href"));
    })
    .filter(Boolean);
  if (!links.length || !secs.length) return;

  var current = -1;
  function activate(i) {
    if (i === current) return;
    current = i;
    links.forEach(function (a, n) {
      a.classList.toggle("is-on", n === i);
    });
    /* mobile: the contents list scrolls sideways, so follow the active item */
    if (links[i] && links[i].scrollIntoView) {
      var box = links[i].parentNode;
      var wide = box && box.scrollWidth > box.clientWidth + 8;
      if (wide) {
        var left = links[i].offsetLeft - box.clientWidth / 2 + links[i].offsetWidth / 2;
        box.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
      }
    }
  }

  if ("IntersectionObserver" in window) {
    var visible = new Map();
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) visible.set(e.target, e.intersectionRatio);
          else visible.delete(e.target);
        });
        var best = null;
        var bestTop = Infinity;
        secs.forEach(function (s) {
          if (visible.has(s)) {
            var top = s.getBoundingClientRect().top;
            if (top < bestTop) {
              bestTop = top;
              best = s;
            }
          }
        });
        if (best) activate(secs.indexOf(best));
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.15, 0.5] }
    );
    secs.forEach(function (s) {
      io.observe(s);
    });
  } else {
    var onScroll = function () {
      var y = window.scrollY + 160;
      var idx = 0;
      secs.forEach(function (s, i) {
        if (s.offsetTop <= y) idx = i;
      });
      activate(idx);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* opening the page on a #section link highlights it straight away */
  if (location.hash) {
    var hit = secs.indexOf(document.querySelector(location.hash));
    if (hit >= 0) activate(hit);
  } else {
    activate(0);
  }
})();
