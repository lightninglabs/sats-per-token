/* pi402 site. The hero meter: particle simulation, three.js
 * renderer (WebGPU with WebGL fallback, then a Canvas2D fallback), and the
 * operator console that drives it. Classic script so it runs from file://.
 *
 * Debug switches (query string): ?render=2d forces the Canvas2D fallback,
 * ?render=webgl skips WebGPU, ?reduce=1 forces the reduced-motion path.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = reduceMQ.matches || qs.get("reduce") === "1";
  var themeListeners = [];

  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hex(n) { var s = ""; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; }

  window.PI402 = {
    reduce: function () { return reduce; },
    fmt: fmt,
    onTheme: function (cb) { themeListeners.push(cb); },
    onReduce: function (cb) { reduceMQ.addEventListener && reduceMQ.addEventListener("change", function () { cb(reduceMQ.matches); }); },
  };

  /* ------------------------------------------------------------ theme */
  function effectiveTheme() {
    var a = document.documentElement.getAttribute("data-theme");
    if (a === "light" || a === "dark") return a;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function themeChanged() { themeListeners.forEach(function (cb) { cb(); }); }
  $("themeBtn").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pi402-theme", next); } catch (e) {}
    themeChanged();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);

  /* ------------------------------------------------------- tokenizer */
  var TOK_RE = /\s*[A-Za-z0-9_]{1,4}|\s*[^\sA-Za-z0-9_]/g;
  function pieces(s) { return s.match(TOK_RE) || []; }
  function countTokens(s) { return pieces(s).length; }

  var SAMPLES = [
    { p: "Explain why a chargeback cannot un-run a GPU.",
      c: "A GPU turns joules into heat and tokens. Once the tokens exist, the energy is spent and nothing can return it. A chargeback asks a bank to reverse a payment, which moves money but cannot undo work. The seller is left holding the cost of a computation that already happened." },
    { p: "What does an agent need to pay for its own inference?",
      c: "A funded wallet, a budget that caps what it can spend, and an HTTP client that can answer a 402 by paying and retrying. The model key stays with the seller, so the agent holds sats and nothing else." },
    { p: "Summarize HTTP 402 in one sentence.",
      c: "HTTP 402 means payment comes first: the server returns an invoice and a macaroon, and the macaroon becomes a valid credential once you pay." },
  ];
  var FILLER = "This is a simulated completion. No model runs in this page; these tokens stream from a canned string so the meter has something to count. ";

  /* ------------------------------------------------------- particles */
  var MAXP = 640;
  var parts = [];
  var LANE = [0.26, 0.52, 0.78, 0.78]; // fraction of stage height per kind
  var MODEL_X = 0.14, BUYER_X = 0.86;

  function spawn(kind, o) {
    if (parts.length >= MAXP) return;
    o = o || {};
    var dur = (kind >= 2 ? 1.7 : 1.35) + Math.random() * 0.7;
    parts.push({
      kind: kind, t: o.t || 0, v: o.static ? 0 : 1 / dur,
      dy: (Math.random() - 0.5) * (kind === 3 ? 56 : kind === 0 ? 14 : 20),
      z: (Math.random() - 0.5) * 90, ph: Math.random() * 6.28,
      w: 6 + Math.random() * 9, ghost: !!o.ghost,
    });
  }
  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += p.v * dt;
      if (p.t >= 1) parts.splice(i, 1);
    }
  }

  /* ---------------------------------------------------------- renderers */
  var stage = $("stage");
  var canvasEl = $("meterCanvas");
  var tag = $("renderTag");
  var renderer = null; // { name, resize(w,h), draw(parts,w,h), dispose }
  var cssColors = null;
  function readColors() {
    var cs = getComputedStyle(document.getElementById("stage") || document.documentElement);
    cssColors = { tok: cs.getPropertyValue("--tok").trim(), sat: cs.getPropertyValue("--sat").trim() };
  }
  themeListeners.push(function () { cssColors = null; requestStatic(); });

  function particleXY(p, w, h) {
    var xm = MODEL_X * w, xb = BUYER_X * w;
    var u = p.t;
    var x = p.kind === 1 ? xm + (xb - xm) * u : xb - (xb - xm) * u;
    var y = LANE[p.kind] * h + p.dy + Math.sin(p.ph + u * 8) * 2.5;
    var s = Math.min(1, u * 7, (1 - u) * 7);
    if (p.v === 0) s = 1;
    return { x: x, y: y, s: Math.max(0, s) };
  }

  function make2D() {
    var ctx = canvasEl.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    var dpr = 1;
    return {
      name: "canvas2d",
      resize: function (w, h) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasEl.width = Math.round(w * dpr); canvasEl.height = Math.round(h * dpr);
      },
      draw: function (list, w, h) {
        if (!cssColors) readColors();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < list.length; i++) {
          var p = list[i], q = particleXY(p, w, h);
          var sz = (0.75 + (p.z + 45) / 180);
          ctx.globalAlpha = (p.kind === 0 ? (p.ghost ? 0.35 : 0.6) : 1) * q.s;
          if (p.kind === 1 || p.kind === 0) {
            ctx.fillStyle = cssColors.tok;
            ctx.fillRect(q.x - p.w * sz / 2, q.y - 3 * sz, p.w * sz, 6 * sz);
          } else {
            var d = (p.kind === 3 ? 12 : 9) * sz;
            ctx.fillStyle = cssColors.sat;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y - d / 1.4); ctx.lineTo(q.x + d / 1.4, q.y); ctx.lineTo(q.x, q.y + d / 1.4); ctx.lineTo(q.x - d / 1.4, q.y);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  async function make3D(forceWebGL) {
    var THREE, r, label;
    function freshCanvas() {
      var c = document.createElement("canvas");
      c.id = "meterCanvas"; c.setAttribute("aria-hidden", "true");
      canvasEl.replaceWith(c); canvasEl = c; return c;
    }
    if (navigator.gpu && !forceWebGL) {
      try {
        THREE = await import("three/webgpu");
        r = new THREE.WebGPURenderer({ canvas: canvasEl, alpha: true, antialias: true });
        await r.init();
        label = r.backend && r.backend.isWebGPUBackend ? "three r170 / webgpu" : "three r170 / webgpu renderer, webgl2 backend";
      } catch (err) {
        console.warn("[meter] WebGPU init failed, falling back to WebGL:", err);
        THREE = null; r = null; freshCanvas(); // a canvas that tried webgpu cannot hand out a webgl context
      }
    }
    if (!r) {
      THREE = await import("three");
      r = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true, powerPreference: "low-power" });
      label = "three r170 / webgl";
    }
    r.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(30, 1, 1, 6000);
    var geo = new THREE.PlaneGeometry(1, 1);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var mesh = new THREE.InstancedMesh(geo, mat, MAXP);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(0xffffff)); // allocates instanceColor
    var group = new THREE.Group();
    group.add(mesh); scene.add(group);
    var dummy = new THREE.Object3D();
    var colorObjs = null;
    // WebGPURenderer sizes its instance buffer from mesh.count at first render, so the count stays at
    // MAXP and unused instances are collapsed to zero scale instead of changing the count.
    var zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var z = 0; z < MAXP; z++) mesh.setMatrixAt(z, zero);
    var prevN = 0;
    function loadColors() {
      readColors();
      var tok = new THREE.Color(cssColors.tok), sat = new THREE.Color(cssColors.sat);
      colorObjs = { tok: tok, ghost: tok.clone().multiplyScalar(0.55), sat: sat, burst: sat.clone().lerp(new THREE.Color(0xffffff), 0.25) };
    }
    var W = 1, H = 1, tiltX = 0, tiltY = 0, tx = 0, ty = 0;
    stage.addEventListener("pointermove", function (e) {
      if (reduce) return;
      var b = stage.getBoundingClientRect();
      ty = ((e.clientX - b.left) / b.width - 0.5) * 0.22; tx = ((e.clientY - b.top) / b.height - 0.5) * 0.14;
    });
    return {
      name: label,
      resize: function (w, h) {
        W = w; H = h;
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.setSize(w, h, false);
        cam.aspect = w / h;
        cam.position.z = (h / 2) / Math.tan((cam.fov * Math.PI / 180) / 2);
        cam.updateProjectionMatrix();
      },
      draw: function (list, w, h) {
        if (!colorObjs) loadColors();
        tiltX += (tx - tiltX) * 0.06; tiltY += (ty - tiltY) * 0.06;
        group.rotation.set(tiltX, tiltY, 0);
        var n = list.length;
        for (var i = 0; i < n; i++) {
          var p = list[i], q = particleXY(p, w, h);
          var sat = p.kind >= 2;
          var depth = 0.75 + (p.z + 45) / 180;
          dummy.position.set(q.x - w / 2, -(q.y - h / 2), p.z);
          dummy.rotation.set(0, 0, sat ? Math.PI / 4 : 0);
          var s = Math.max(0.001, q.s);
          if (sat) { var d = (p.kind === 3 ? 9 : 7) * depth * s; dummy.scale.set(d, d, 1); }
          else dummy.scale.set(p.w * depth * s, 6 * depth * s, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, sat ? (p.kind === 3 ? colorObjs.burst : colorObjs.sat) : (p.kind === 0 ? colorObjs.ghost : colorObjs.tok));
        }
        for (var j = n; j < prevN; j++) mesh.setMatrixAt(j, zero);
        prevN = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        r.render(scene, cam);
      },
      invalidateColors: function () { colorObjs = null; },
    };
  }

  /* ----------------------------------------------------- render loop */
  var visible = false, running = false, last = 0, lastW = 0, lastH = 0, starting = false;
  function sizeNow() {
    var b = stage.getBoundingClientRect();
    var w = Math.max(1, Math.round(b.width)), h = Math.max(1, Math.round(b.height));
    if (renderer && (w !== lastW || h !== lastH)) { lastW = w; lastH = h; renderer.resize(w, h); }
    return [w, h];
  }
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    stepParts(dt);
    drawNow();
    requestAnimationFrame(frame);
  }
  function drawNow() {
    if (!renderer) return;
    var wh = sizeNow();
    renderer.draw(parts, wh[0], wh[1]);
  }
  function setRunning(on) {
    if (reduce) on = false;
    if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!on) running = false;
  }
  var staticQueued = false;
  function requestStatic() {
    if (!reduce || staticQueued) { if (!reduce && renderer && renderer.invalidateColors) renderer.invalidateColors(); return; }
    staticQueued = true;
    requestAnimationFrame(function () { staticQueued = false; staticFill(); drawNow(); });
  }

  /* Reduced motion: draw frozen particles that reflect the counters. */
  function staticFill() {
    parts.length = 0;
    function row(kind, n) {
      n = Math.min(n, 34);
      for (var i = 0; i < n; i++) spawn(kind, { t: 0.12 + 0.76 * (i + 0.5) / n, static: true });
    }
    row(0, Math.round(Math.min(S.totalIn, 200) / 6));
    row(1, Math.round(Math.min(S.totalOut, 400) / 10));
    row(2, S.bundles * 6 + Math.round(S.metered / 60));
  }

  async function startRenderer() {
    if (renderer || starting) return;
    starting = true;
    try {
      if (qs.get("render") === "2d") throw new Error("forced canvas2d");
      renderer = await make3D(qs.get("render") === "webgl");
    } catch (err) {
      console.warn("[meter] three.js unavailable, using Canvas2D fallback:", err.message || err);
      try { renderer = make2D(); } catch (e2) { console.warn("[meter] no canvas either:", e2); renderer = null; }
    }
    starting = false;
    tag.textContent = renderer ? renderer.name : "static (no canvas)";
    lastW = 0; sizeNow();
    if (reduce) { staticFill(); drawNow(); } else setRunning(visible && !document.hidden);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) { startRenderer(); setRunning(!document.hidden); } else setRunning(false);
    }, { threshold: 0.05 }).observe(stage);
  } else { visible = true; startRenderer(); }
  document.addEventListener("visibilitychange", function () { setRunning(visible && !document.hidden); });
  window.addEventListener("resize", function () { if (renderer) { lastW = 0; if (reduce) drawNow(); } });
  window.PI402.onReduce(function (m) {
    reduce = m || qs.get("reduce") === "1";
    if (reduce) { setRunning(false); requestStatic(); } else { parts.length = 0; setRunning(visible); }
  });

  /* ---------------------------------------------------- console state */
  var S = {
    inRate: 1, outRate: 2, bundleTok: 1000,
    cred: 0, balance: 0, price: 0, paid: 0, pending: 0, reserve: 0,
    totalIn: 0, totalOut: 0, metered: 0, bundles: 0, running: false,
  };
  var MSAT_USD = 0.00000079;
  var el = {
    prompt: $("prompt"), run: $("runBtn"), reset: $("resetBtn"), estTok: $("estTok"), estMsat: $("estMsat"),
    rateIn: $("rateIn"), rateOut: $("rateOut"), maxTok: $("maxTok"), out: $("outBox"), log: $("log"),
    roIn: $("roIn"), roOut: $("roOut"), roMsat: $("roMsat"), roB: $("roBundles"),
    bal: $("balTxt"), usd: $("usdTxt"), bar: $("bar"), rem: $("barRem"), pend: $("barPend"), resv: $("barResv"),
    banner: $("banner"),
  };

  function readRates() {
    S.inRate = Math.max(1, Math.floor(+el.rateIn.value) || 1);
    S.outRate = Math.max(1, Math.floor(+el.rateOut.value) || 1);
    S.price = Math.ceil(S.bundleTok * (S.inRate + S.outRate) / 2);
  }
  function updateEst() {
    readRates();
    var n = el.prompt.value ? countTokens(el.prompt.value) : 0;
    el.estTok.textContent = fmt(n);
    el.estMsat.textContent = fmt(n * S.inRate);
  }
  function hud() {
    el.roIn.textContent = fmt(S.totalIn);
    el.roOut.textContent = fmt(S.totalOut);
    el.roMsat.textContent = fmt(S.metered);
    el.roB.textContent = fmt(S.bundles);
    el.usd.textContent = "≈ $" + (S.metered * MSAT_USD).toFixed(8) + " spent";
    var P = (S.cred ? S.paid : S.price) || 1;
    if (!S.cred) {
      el.bal.textContent = "no credential";
      el.rem.style.width = "0"; el.pend.style.width = "0"; el.resv.style.display = "none";
      el.bar.setAttribute("aria-valuenow", "0");
    } else {
      var solid = Math.max(0, S.balance - S.pending);
      el.bal.textContent = fmt(solid) + " / " + fmt(S.paid) + " msat" + (S.pending ? " (+" + fmt(S.pending) + " metering)" : "");
      el.rem.style.width = (solid / P * 100) + "%";
      el.pend.style.left = (solid / P * 100) + "%";
      el.pend.style.width = (S.pending / P * 100) + "%";
      el.bar.setAttribute("aria-valuenow", String(Math.round(solid / P * 100)));
      if (S.reserve > 0) {
        var rv = Math.min(S.reserve, S.balance);
        el.resv.style.display = "block";
        el.resv.style.left = ((S.balance - rv) / P * 100) + "%";
        el.resv.style.width = (rv / P * 100) + "%";
      } else el.resv.style.display = "none";
    }
    if (reduce) requestStatic();
  }
  function setPhase(ph, text) {
    stage.setAttribute("data-phase", ph);
    if (text) el.banner.textContent = text;
  }
  function log(cls, text) {
    var d = document.createElement("div");
    d.className = cls; d.textContent = text;
    el.log.appendChild(d);
    while (el.log.childNodes.length > 80) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }
  var flashTimers = {};
  function flash(name) {
    document.querySelectorAll('[data-rpc="' + name + '"]').forEach(function (n) {
      var isItem = n.classList.contains("rpc-item");
      n.classList.add(isItem ? "act" : "on");
      clearTimeout(flashTimers[name + isItem]);
      flashTimers[name + isItem] = setTimeout(function () { n.classList.remove("on", "act"); }, 900);
    });
  }
  function burst(n, spanMs) {
    if (reduce) return;
    for (var i = 0; i < n; i++) setTimeout(function () { spawn(3); }, (i / n) * spanMs);
  }

  function plan(promptText, inTok, maxTok) {
    var canned = null;
    for (var i = 0; i < SAMPLES.length; i++) if (SAMPLES[i].p === promptText.trim()) canned = SAMPLES[i].c;
    var text;
    if (canned) text = canned;
    else {
      var target = Math.min(maxTok, 24 + Math.round(inTok * 0.9));
      text = FILLER; while (countTokens(text) < target) text += FILLER;
    }
    return pieces(text).slice(0, maxTok);
  }

  async function run() {
    if (S.running) return;
    var text = el.prompt.value.trim();
    if (!text) { el.prompt.focus(); return; }
    S.running = true; el.run.disabled = true; el.reset.disabled = true;
    readRates();
    // On a stacked (narrow) layout the stage sits below the console, so bring it into view.
    if (window.innerWidth < 1040) {
      var sb = stage.getBoundingClientRect();
      if (sb.top < 56 || sb.bottom > window.innerHeight) stage.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    var inTok = Math.max(1, countTokens(text));
    var maxTok = +el.maxTok.value;
    var outPieces = plan(text, inTok, maxTok);
    var reserve = Math.min(S.price, inTok * S.inRate + maxTok * S.outRate);
    el.out.textContent = "";

    setPhase("auth", "authorizing");
    log("rq", "> POST /v1/chat/completions  in~" + inTok + " tok, max_tokens " + maxTok);
    log("rq", S.cred ? "> Authorization: L402 …" + "#" + S.cred : "> (no Authorization header)");
    await sleep(380);
    flash("AuthorizeRequest");

    if (!S.cred || S.balance < reserve) {
      var left = S.cred ? S.balance : 0;
      if (S.cred) log("a402", "< AuthorizeRequest refuses: " + fmt(S.balance) + " msat left < reserve " + fmt(reserve));
      await sleep(260);
      setPhase("402", "402 Payment Required");
      flash("GetPrice"); await sleep(260); flash("ChallengeMinted");
      log("a402", "< 402 Payment Required  (L402 + Payment offers, bundle " + fmt(S.price) + " msat)");
      S.reserve = 0; hud();
      await sleep(1000);
      setPhase("paying", "paying " + fmt(S.price) + " msat");
      log("pay", "> budget ok, wallet pays invoice " + fmt(S.price) + " msat");
      burst(26, 1000);
      await sleep(1250);
      var oldCred = S.cred;
      S.cred++; S.paid = S.price; S.balance = S.price; S.pending = 0; S.bundles++;
      el.bar.classList.remove("flash"); void el.bar.offsetWidth; el.bar.classList.add("flash");
      log("ok", "< settled, preimage " + hex(16) + "…");
      if (left > 0) log("rq", "  (" + fmt(left) + " msat stays on credential #" + oldCred + ")");
      hud();
      await sleep(520);
      setPhase("auth", "retrying with credential");
      log("rq", "> retry: Authorization: L402 …#" + S.cred);
      flash("AuthorizeRequest");
      await sleep(420);
    }

    S.reserve = reserve; hud();
    log("ok", "< 200 OK, reserve " + fmt(reserve) + " msat, streaming");
    setPhase("stream", "200 streaming");

    // Prompt tokens travel to the model and are metered at the input rate.
    var steps = reduce ? 1 : 10, inCost = inTok * S.inRate, satAcc = 0, SAT_UNIT = 14;
    for (var s = 0; s < steps; s++) {
      S.totalIn += inTok / steps; S.pending += inCost / steps; S.metered += inCost / steps;
      if (!reduce) { spawn(0); if (s % 2 === 0) spawn(0); }
      satAcc += inCost / steps;
      while (satAcc >= SAT_UNIT && !reduce) { spawn(2); satAcc -= SAT_UNIT; }
      hud(); if (!reduce) await sleep(45);
    }
    S.totalIn = Math.round(S.totalIn);

    // Completion tokens stream back, each one metered at the output rate.
    var delay = reduce ? 0 : 17;
    for (var i = 0; i < outPieces.length; i++) {
      S.totalOut++; S.pending += S.outRate; S.metered += S.outRate;
      if (!reduce) {
        spawn(1);
        satAcc += S.outRate; while (satAcc >= SAT_UNIT) { spawn(2); satAcc -= SAT_UNIT; }
        el.out.textContent += outPieces[i];
        if (i % 2 === 0) { el.out.scrollTop = el.out.scrollHeight; hud(); }
        await sleep(delay);
      }
    }
    if (reduce) el.out.textContent = outPieces.join("");
    S.metered = Math.round(S.metered); S.pending = Math.round(S.pending);
    hud();

    await sleep(reduce ? 200 : 450);
    var debit = inTok * S.inRate + outPieces.length * S.outRate;
    flash("ReportUsage");
    log("ok", "< usage in=" + inTok + " out=" + outPieces.length + "  ReportUsage debits " + fmt(inTok) + "x" + S.inRate + " + " + fmt(outPieces.length) + "x" + S.outRate + " = " + fmt(debit) + " msat");
    S.balance = Math.max(0, S.balance - debit); S.pending = 0; S.reserve = 0;
    S.metered = Math.round(S.metered);
    hud();
    setPhase("idle", "idle, credential #" + S.cred + ", " + fmt(S.balance) + " msat left");
    S.running = false; el.run.disabled = false; el.reset.disabled = false;
  }

  function reset() {
    if (S.running) return;
    S.cred = 0; S.paid = 0; S.balance = 0; S.pending = 0; S.reserve = 0; S.totalIn = 0; S.totalOut = 0; S.metered = 0; S.bundles = 0;
    parts.length = 0; el.out.innerHTML = '<span class="dim">output appears here</span>'; el.log.textContent = "";
    setPhase("idle", "idle, no credential"); updateEst(); hud();
  }

  /* ------------------------------------------------------------- wire */
  var lastEst = 0;
  el.prompt.addEventListener("input", function () {
    updateEst();
    document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
    // Ghost tokens: typing previews the prompt's size on the input lane without sending anything.
    var n = countTokens(el.prompt.value), d = Math.abs(n - lastEst);
    lastEst = n;
    if (!reduce && !S.running) for (var i = 0; i < Math.min(3, d); i++) spawn(0, { ghost: true });
  });
  el.rateIn.addEventListener("input", function () { updateEst(); });
  el.rateOut.addEventListener("input", function () { updateEst(); });
  document.querySelectorAll(".chip").forEach(function (c) {
    c.addEventListener("click", function () {
      el.prompt.value = SAMPLES[+c.dataset.sample].p;
      document.querySelectorAll(".chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o === c)); });
      updateEst(); lastEst = countTokens(el.prompt.value);
    });
  });
  el.run.addEventListener("click", run);
  el.reset.addEventListener("click", reset);
  el.prompt.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });

  updateEst(); lastEst = countTokens(el.prompt.value); hud();
  document.querySelector('.chip[data-sample="0"]').setAttribute("aria-pressed", "true");
  setPhase("idle", "idle, no credential");
})();
