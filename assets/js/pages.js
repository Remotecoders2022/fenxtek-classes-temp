/* ============================================================
   FENXTEK — small page interactions (no dependencies)
   - Courses: batch tag filter (works for static and CRM batches)
   - Exams: post search + active category chip
   ============================================================ */
(function () {
  "use strict";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  };

  /* ---------- Courses: batch filter ---------- */
  var grid = $("[data-batch-grid]");
  var bar = $("[data-batch-filters]");
  if (grid && bar) {
    var active = "all";
    var apply = function () {
      $$(".bcard", grid).forEach(function (c) {
        c.hidden = active !== "all" && (c.getAttribute("data-tag") || "") !== active;
      });
    };
    var build = function () {
      var counts = {};
      var cards = $$(".bcard", grid);
      cards.forEach(function (c) {
        var t = c.getAttribute("data-tag");
        if (t) counts[t] = (counts[t] || 0) + 1;
      });
      var tags = Object.keys(counts);
      if (tags.length < 2) {
        bar.hidden = true;
        active = "all";
        apply();
        return;
      }
      if (active !== "all" && !counts[active]) active = "all";
      bar.hidden = false;
      bar.innerHTML = ["all"].concat(tags).map(function (t) {
        var n = t === "all" ? cards.length : counts[t];
        return '<button type="button" class="chip" data-tag="' + esc(t) + '" aria-pressed="' + (t === active) + '">' +
          esc(t === "all" ? "All batches" : t) + "<em>" + (n < 10 ? "0" + n : n) + "</em></button>";
      }).join("");
      apply();
    };
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tag]");
      if (!b) return;
      active = b.getAttribute("data-tag");
      $$("[data-tag]", bar).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      apply();
    });
    build();
    /* CRM batches replace the static cards — rebuild the chips. */
    new MutationObserver(build).observe(grid, { childList: true });
  }

  /* ---------- Exams: search ---------- */
  var search = $("[data-exam-search]");
  var xgrid = $("[data-exam-grid]");
  if (search && xgrid) {
    var count = $("[data-exam-count]");
    var empty = $("[data-exam-empty]");
    var cats = $$(".xcat", xgrid);
    var total = $$("li", xgrid).length;
    var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim(); };
    var run = function () {
      var q = norm(search.value);
      var words = q ? q.split(" ") : [];
      var hits = 0;
      cats.forEach(function (cat) {
        var title = norm(($("h3", cat) || {}).textContent);
        var catHit = words.length && words.every(function (w) { return title.indexOf(w) > -1; });
        var any = false;
        $$("li", cat).forEach(function (li) {
          var t = norm(li.textContent);
          var ok = !words.length || catHit || words.every(function (w) { return t.indexOf(w) > -1; });
          li.classList.toggle("is-hit", Boolean(words.length) && ok);
          li.classList.toggle("is-miss", !ok);
          if (ok) { any = true; hits++; }
        });
        cat.hidden = !any;
      });
      if (count) count.textContent = words.length ? hits + " / " + total : total + " posts";
      if (empty) empty.hidden = hits > 0;
    };
    search.addEventListener("input", run);
    search.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { search.value = ""; run(); }
    });
    run();
  }

  /* ---------- Exams: active category chip ---------- */
  var nav = $("[data-exam-nav]");
  if (nav && "IntersectionObserver" in window) {
    var links = $$("a[href^='#']", nav);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.setAttribute("aria-current", String(a.getAttribute("href") === "#" + en.target.id));
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach(function (a) {
      var t = document.getElementById(a.getAttribute("href").slice(1));
      if (t) io.observe(t);
    });
  }
})();
