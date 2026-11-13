/* pi402 site. Ordered (Bayer) dither textures: the hero band and the edges where color plates meet.
   Everything is drawn from the page's own CSS colors, so it follows the theme. */
(function () {
  "use strict";
  var B = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]
  ];
  var DOT = 2; // css px per dither cell
  function ss(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function parse(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    var p = m[1].split(",").map(parseFloat); if (p.length > 3 && p[3] === 0) return null; return [p[0], p[1], p[2]];
  }
  function surface(el) { // first opaque background walking up to body
    for (var n = el; n; n = n.parentElement) { var c = parse(getComputedStyle(n).backgroundColor); if (c) return c; }
    return [0, 0, 0];
  }
  function cssVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }
  function resolve(el, v) { // "--sat" or "#hex" or rgb()
    if (v.charAt(0) === "-") { var probe = document.createElement("i"); probe.style.color = "var(" + v + ")"; el.appendChild(probe); var c = getComputedStyle(probe).color; probe.remove(); return parse(c) || [0,0,0]; }
    var probe2 = document.createElement("i"); probe2.style.color = v; el.appendChild(probe2); var c2 = getComputedStyle(probe2).color; probe2.remove(); return parse(c2) || [0,0,0];
  }

  /* Paint stripes into a canvas. Each stripe: { w: fraction of width, a: base color, b: dot color, fade: 0..1 where the dots end (top->down), curve } */
  function paint(canvas, stripes, opts) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cols = Math.ceil(W / DOT), rows = Math.ceil(H / DOT);
    var x0 = 0;
    stripes.forEach(function (s) {
      var sw = Math.round(s.w * W);
      ctx.fillStyle = "rgb(" + s.a.join(",") + ")"; ctx.fillRect(x0, 0, sw, H);
      ctx.fillStyle = "rgb(" + s.b.join(",") + ")";
      var c0 = Math.floor(x0 / DOT), c1 = Math.ceil((x0 + sw) / DOT);
      var span = Math.max(1, c1 - c0);
      for (var r = 0; r < rows; r++) {
        var t = r / rows; // 0 top .. 1 bottom
        for (var c = c0; c < c1; c++) {
          var u = (c - c0) / span;
          var d = s.fn(t, u); if (d <= 0) continue;
          if (B[r & 7][c & 7] < d * 64) ctx.fillRect(c * DOT, r * DOT, DOT, DOT);
        }
      }
      x0 += sw;
    });
    if (opts && opts.after) opts.after(ctx, W, H);
  }

  /* ---- hero band: a slow clockwork animation. Every layer moves on its own period; nothing is fast. ---- */
  var TICK = 90;          // ms between frames: a deliberate refresh, not 60fps
  var marks = null, markSeed = 402;
  function rnd() { markSeed = (markSeed * 16807) % 2147483647; return markSeed / 2147483647; }
  function makeMarks(n) {
    markSeed = 402; var out = [];
    for (var i = 0; i < n; i++) out.push({ x: 0.04 + 0.9 * rnd(), y: rnd(), v: 0.010 + 0.016 * rnd(), big: rnd() < 0.18, drift: (rnd() - 0.5) * 0.004 });
    return out;
  }
  function heroBand(now) {
    var cv = document.getElementById("heroDither"); if (!cv) return;
    var root = cv.parentNode;
    var ink = resolve(root, "--bg"), sat = resolve(root, "--sat"), bg = ink,   // the hero follows the page theme
        slate = resolve(root, "--pl-ice-bg"), tok = resolve(root, "--tok"), ink2 = resolve(root, "--pl-ink-3"), dust = resolve(root, "--dust");
    var T = now / 1000; // seconds
    function cloud(cx, cy, rad, amp) { return function (t, u) { var dx = (u - cx) * 2.4, dy = t - cy; return amp * (1 - ss(rad * 0.35, rad, Math.sqrt(dx * dx + dy * dy))); }; }
    // fades breathe: the dissolve line creeps up and down by a few percent over long, unequal periods
    function fade(end, amp, period, phase) { return function (t, u) { var sh = 0.05 * Math.sin(T / period * 6.2832 + phase); return (amp || 1) * (1 - ss(0.04, end + sh, t + (u - 0.5) * 0.06)); }; }
    // cloud drifts in a slow orbit
    var blob = cloud(0.62 + 0.06 * Math.sin(T / 47 * 6.2832), 0.42 + 0.05 * Math.cos(T / 61 * 6.2832), 0.78, 0.55);
    var blob2 = cloud(0.15 + 0.04 * Math.cos(T / 53 * 6.2832), 0.95, 0.5, 0.35);
    var blob = cloud(0.74 + 0.05 * Math.sin(T / 47 * 6.2832), 0.42 + 0.05 * Math.cos(T / 61 * 6.2832), 0.62, 0.55);
    var blob2 = cloud(0.98 + 0.03 * Math.cos(T / 53 * 6.2832), 0.95, 0.35, 0.3);
    var stripes = [
      { w: 1, a: ink, b: dust, fn: function (t, u) { return Math.min(0.6, blob(t, u) + blob2(t, u)) * ss(0.30, 0.62, u); } }
    ];
    paint(cv, stripes, { after: function (ctx, W, H) {
      // orange plus marks trickle down the ink field, each at its own pace, snapped to the dither grid
      var fieldW = W, n = Math.round(W / 48), arm = 3;
      if (!marks || marks.length !== n) marks = makeMarks(n);
      ctx.fillStyle = "rgb(" + sat.join(",") + ")";
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        var yy = (m.y + T * m.v) % 1.12 - 0.06;            // wraps just outside the band
        var xx = m.x + Math.sin(T / 31 * 6.2832 + i) * m.drift;
        var x = Math.round(xx * fieldW / DOT) * DOT, y = Math.round(yy * H / DOT) * DOT;
        var a = m.big ? arm + 2 : arm;
        ctx.fillRect(x - a, y, 2 * a + 1, 1); ctx.fillRect(x, y - a, 1, 2 * a + 1);
      }
    } });
  }

  /* ---- posters: small ink squares that carry the band's texture ---- */
  var posterMarks = new WeakMap();
  function posters(now) {
    var cvs = document.querySelectorAll("canvas.poster-canvas"); if (!cvs.length) return;
    var T = now / 1000;
    cvs.forEach(function (cv) {
      var root = cv.parentNode;
      var ink = resolve(root, "--pl-ink-bg"), sat = resolve(root, "--pl-ink-sat"), dust = resolve(root, "--dust");
      function cloud(cx, cy, rad, amp) { return function (t, u) { var dx = (u - cx) * 1.1, dy = t - cy; return amp * (1 - ss(rad * 0.35, rad, Math.sqrt(dx * dx + dy * dy))); }; }
      var b1 = cloud(0.70 + 0.05 * Math.sin(T / 53 * 6.2832), 0.38 + 0.05 * Math.cos(T / 67 * 6.2832), 0.75, 0.5);
      var b2 = cloud(0.10, 1.0 + 0.04 * Math.sin(T / 41 * 6.2832), 0.55, 0.3);
      paint(cv, [{ w: 1, a: ink, b: dust, fn: function (t, u) { return Math.min(0.7, b1(t, u) + b2(t, u)); } }], { after: function (ctx, W, H) {
        var n = Math.round(W / 40), arm = 3;
        var ms = posterMarks.get(cv); if (!ms || ms.length !== n) { ms = makeMarks(n); posterMarks.set(cv, ms); }
        ctx.fillStyle = "rgb(" + sat.join(",") + ")";
        for (var i = 0; i < ms.length; i++) {
          var m = ms[i]; var yy = (m.y + T * m.v) % 1.12 - 0.06, xx = 0.03 + (m.x - 0.04) * 1.02;
          var x = Math.round(xx * W / DOT) * DOT, y = Math.round(yy * H / DOT) * DOT, a = m.big ? arm + 2 : arm;
          ctx.fillRect(x - a, y, 2 * a + 1, 1); ctx.fillRect(x, y - a, 1, 2 * a + 1);
        }
      } });
    });
  }

  /* ---- plate edges: the strip at the top of each section dithers from the previous surface into this one ---- */
  function edges() {
    document.querySelectorAll('.has-edge').forEach(function (el) { el.classList.remove('has-edge'); });
    document.querySelectorAll('canvas.dedge').forEach(function (c) { c.remove(); });
    return;
    var blocks = Array.prototype.slice.call(document.querySelectorAll("main > section, footer"));
    blocks.forEach(function (el, i) {
      if (i === 0) return;
      var prev = blocks[i - 1];
      var a = surface(prev), b = surface(el);
      var same = a.join() === b.join();
      var cv = el.querySelector(":scope > canvas.dedge");
      if (same) { if (cv) cv.remove(); el.classList.remove("has-edge"); return; }
      el.classList.add("has-edge");
      if (!cv) { cv = document.createElement("canvas"); cv.className = "dedge"; cv.setAttribute("aria-hidden", "true"); el.insertBefore(cv, el.firstChild); }
      paint(cv, [{ w: 1, a: b, b: a, fn: function (t) { return 1 - ss(0, 1, t); } }]);
    });
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var visible = true, last = 0, loop = 0;
  function frame(now) {
    loop = requestAnimationFrame(frame);
    if (document.hidden || !visible || reduce.matches) return;
    if (now - last < TICK) return;
    last = now; heroBand(now); posters(now);
  }
  function draw() { heroBand(performance.now()); posters(performance.now()); edges(); }
  var raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule); else schedule();
  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schedule);
  var vis = new Map(); function anyVisible() { var v = false; vis.forEach(function (x) { v = v || x; }); return v; }
  if ("IntersectionObserver" in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { vis.set(e.target, e.isIntersecting); }); visible = anyVisible(); }); document.querySelectorAll("#heroDither, canvas.poster-canvas").forEach(function (el) { io.observe(el); }); }
  loop = requestAnimationFrame(frame);
})();

/* ---- scroll parallax: three layers at three speeds. Plate moves with the page, content lags by a few px,
   a sparse field of small plus marks in the margins lags further. Off for reduced motion and on phones. ---- */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)"), narrow = window.matchMedia("(max-width: 760px)");
  var band = document.querySelector(".hero-band canvas"), h1 = document.querySelector(".hero h1");
  var sections = Array.prototype.slice.call(document.querySelectorAll("main > section:not(.hero), footer"));
  // marks: deterministic layout per section, kept to the gutters and the top/bottom bands so they never sit under text
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var layers = [];
  sections.forEach(function (sec, si) {
    var layer = document.createElement("div"); layer.className = "plx"; layer.setAttribute("aria-hidden", "true");
    var n = 7 + (si % 3), marks = [];
    for (var i = 0; i < n; i++) {
      var zone = rnd(), x, y;
      if (zone < 0.35) { x = 1.5 + rnd() * 6; y = 8 + rnd() * 84; }            // left gutter
      else if (zone < 0.7) { x = 92.5 + rnd() * 6; y = 8 + rnd() * 84; }      // right gutter
      else if (zone < 0.85) { x = 10 + rnd() * 80; y = 2 + rnd() * 6; }       // top band
      else { x = 10 + rnd() * 80; y = 92 + rnd() * 6; }                       // bottom band
      var s = document.createElement("i");
      var size = rnd() < 0.2 ? 3 : (rnd() < 0.5 ? 2 : 1);                     // 1 small, 2 medium, 3 large
      s.className = "plx-m s" + size;
      s.style.left = x.toFixed(2) + "%"; s.style.top = y.toFixed(2) + "%";
      var k = 0.10 + rnd() * 0.16;                                            // depth: how far behind the page it sits
      marks.push({ el: s, k: k * (size === 3 ? 1.25 : 1) });
      layer.appendChild(s);
    }
    sec.insertBefore(layer, sec.firstChild);
    layers.push({ sec: sec, wrap: sec.querySelector(":scope > .wrap"), marks: marks });
  });
  var ticking = false;
  function reset() {
    [band, h1].forEach(function (el) { if (el) el.style.transform = ""; });
    layers.forEach(function (L) { if (L.wrap) L.wrap.style.transform = ""; L.marks.forEach(function (m) { m.el.style.transform = ""; }); });
  }
  function update() {
    ticking = false;
    if (reduce.matches || narrow.matches) { reset(); return; }
    var y = window.scrollY || 0, vh = window.innerHeight;
    if (band) band.style.transform = "translate3d(0," + Math.round(y * 0.32) + "px,0)";
    if (h1) h1.style.transform = "translate3d(0," + Math.round(y * -0.06) + "px,0)";
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i], r = L.sec.getBoundingClientRect();
      if (r.bottom < -300 || r.top > vh + 300) continue;
      var p = (r.top + r.height / 2 - vh / 2) / vh;                           // -1..1 as the section crosses the viewport
      if (L.wrap) L.wrap.style.transform = "translate3d(0," + (p * 10).toFixed(1) + "px,0)";   // content lags the plate, 10px per viewport
      for (var k = 0; k < L.marks.length; k++) {
        var m = L.marks[k];
        m.el.style.transform = "translate3d(0," + (p * vh * m.k).toFixed(1) + "px,0)";      // marks lag further, each at its own depth
      }
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  reduce.addEventListener("change", onScroll); narrow.addEventListener("change", onScroll);
  update();
})();
