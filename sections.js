/* pi402 site. Interactive sections below the hero:
 * 402 transcript stepper, card vs Lightning scrubber, lightmeter pricing
 * calculator, budget policy demo, and copy buttons. Classic script.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = function () { return window.PI402 && window.PI402.reduce(); };
  var fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };

  /* ================================================ 402 transcript */
  var door = "L402";
  var cur = 0;
  var timers = [];
  var txEl = $("hsTx");

  function hk(k, v) { return '<span class="hk">' + k + '</span> <span class="hv">' + v + "</span>"; }

  function model() {
    var L = door === "L402";
    return [
      {
        title: "1. The unpaid request", who: "buyer to aperture", rpc: [],
        body: "<p>The buyer sends an ordinary chat completion. There is no account, no API key, no <code>Authorization</code> header. The request names a model, and that is enough for the seller to quote a price.</p><p>The <code>stream_options</code> line matters later: it asks the upstream to report usage in the final chunk, which is what gets billed.</p>",
        block: { dir: "request / buyer to aperture", lines: [
          '<span class="hk">POST</span> /v1/chat/completions HTTP/1.1',
          hk("Host:", "inference.example"),
          hk("Content-Type:", "application/json"), "",
          '{"model":"moonshotai/Kimi-K3","stream":true,',
          ' "stream_options":{"include_usage":true},',
          ' "messages":[{"role":"user","content":"..."}]}',
          '<span class="cm"># no Authorization header</span>'] },
      },
      {
        title: "2. A 402 with two offers", who: "aperture to buyer", rpc: ["GetPrice", "ChallengeMinted"],
        body: "<p>Aperture asks the price server to quote a bundle (<code>GetPrice</code>), mints the challenge, and books the bundle against it (<code>ChallengeMinted</code>). The response carries <strong>both offers</strong>; the buyer picks whichever it speaks.</p><p>The L402 macaroon commits to its invoice's payment hash. The Payment offer mints its own, distinct invoice, so each 402 books one bundle per door. Only the one that gets paid is drawn down.</p>",
        block: { dir: "response / aperture to buyer", lines: [
          'HTTP/1.1 <span class="st">402 Payment Required</span>',
          (L ? '<span class="pm">' : "") + hk("WWW-Authenticate:", 'L402 macaroon="AgEJ...", invoice="lnbc..."') + (L ? "</span>" : ""),
          (!L ? '<span class="pm">' : "") + hk("WWW-Authenticate:", 'Payment id="qB3...", realm="inference.example",') + "",
          '    method="lightning", intent="charge",',
          '    request="eyJ...", expires="..."' + (!L ? "</span>" : ""),
          '<span class="cm"># header shapes are illustrative; the macaroon and invoice are truncated</span>'] },
      },
      {
        title: "3. Budget check, then pay", who: "buyer wallet", rpc: [],
        body: "<p>The agent's payment layer checks the quoted outflow against its per-request ceiling and daily cap <em>before any wallet action</em>. If it passes, the wallet pays the invoice for the door it chose.</p><p>A Wavelength wallet does this through a swap, so the buyer needs no channels.</p>",
        block: { dir: "local / buyer", lines: [
          '<span class="cm"># policy: quoted total outflow within per-request ceiling and daily cap</span>',
          '<span class="cm"># wallet: pay ' + (L ? "the L402 invoice" : "the Payment charge invoice") + " over Lightning</span>"] },
      },
      {
        title: "4. The preimage comes back", who: "lightning to buyer", rpc: [],
        body: "<p>Settlement reveals the preimage. It is the proof of payment, and it hashes to the payment hash the macaroon (or the Payment challenge) was committed to. There is no separate step where the seller issues a key: <strong>settlement produces the credential as a side effect.</strong></p>",
        block: { dir: "settlement / lightning", lines: [
          '<span class="pm">preimage = 9f2c...e41a</span>',
          '<span class="cm"># sha256(preimage) == payment_hash</span>'] },
      },
      {
        title: "5. Retry with the credential", who: "buyer to aperture", rpc: ["AuthorizeRequest"],
        body: "<p>The buyer repeats the request exactly once, now carrying the credential. Aperture derives the meter key from it, calls <code>AuthorizeRequest</code>, and the price server checks the balance and reserves an estimate. Then aperture proxies upstream, injecting the seller's model key. The buyer never sees it.</p><p>The same credential works on every later request until the bundle refuses one.</p>",
        block: { dir: "request / buyer to aperture", lines: [
          '<span class="hk">POST</span> /v1/chat/completions HTTP/1.1',
          hk("Host:", "inference.example"),
          L ? '<span class="pm">' + hk("Authorization:", "L402 AgEJ...:9f2c...e41a") + "</span>"
            : '<span class="pm">' + hk("Authorization:", "Payment eyJ...") + "</span>",
          L ? '<span class="cm"># macaroon : preimage</span>' : '<span class="cm"># credential payload carries the preimage</span>',
          '<span class="cm"># ...same body as before</span>'] },
      },
      {
        title: "6. The stream, then the debit", who: "aperture to buyer", rpc: ["ReportUsage"], stream: true,
        body: "<p>The response streams back untouched. Aperture keeps a bounded tail of the bytes, and when the body finishes, <code>ReportUsage</code> hands that tail to the price server. It reads the usage object the upstream reported and debits the true cost.</p><p>Here: 38 input tokens at 1 msat plus 112 output tokens at 2 msat is <strong>262 msat</strong>, drawn from the bundle. If the next request would overdraw it, the cycle starts again at step 2.</p>",
        block: { dir: "response / aperture to buyer", lines: [
          'HTTP/1.1 <span class="st ok">200 OK</span>',
          hk("Content-Type:", "text/event-stream"), "",
          'data: {"choices":[{"delta":{"content":"A"}}]}',
          'data: {"choices":[{"delta":{"content":" token"}}]}',
          '<span class="dim2">... 110 more chunks ...</span>',
          'data: {"choices":[],"usage":{"prompt_tokens":38,"completion_tokens":112}}',
          "data: [DONE]",
          '<span class="pm"># ReportUsage: 38 x 1 + 112 x 2 = 262 msat debited</span>'] },
      },
    ];
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function renderHs() {
    clearTimers();
    var m = model(), s = m[cur];
    // pills
    var pills = $("hsSteps"); pills.textContent = "";
    m.forEach(function (st, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "step-pill" + (i < cur ? " done" : "");
      b.textContent = String(i + 1) + " " + ["request", "402", "pay", "preimage", "retry", "stream"][i];
      if (i === cur) b.setAttribute("aria-current", "step");
      b.addEventListener("click", function () { cur = i; renderHs(); });
      pills.appendChild(b);
    });
    // transcript
    txEl.textContent = "";
    for (var i = 0; i <= cur; i++) {
      var blk = document.createElement("div");
      blk.className = "blk" + (i === cur ? " cur" : "");
      var lines = m[i].block.lines;
      var head = '<span class="dir">' + m[i].block.dir + "</span>";
      if (i === cur && s.stream && !reduce()) {
        blk.innerHTML = head;
        txEl.appendChild(blk);
        (function (blk, lines, head) {
          var n = 0;
          function more() {
            n++;
            blk.innerHTML = head + lines.slice(0, n).join("\n");
            txEl.scrollTop = txEl.scrollHeight;
            if (n < lines.length) timers.push(setTimeout(more, 260));
          }
          timers.push(setTimeout(more, 150));
        })(blk, lines, head);
      } else {
        blk.innerHTML = head + lines.join("\n");
        txEl.appendChild(blk);
      }
    }
    txEl.scrollTop = txEl.scrollHeight;
    // annotation
    $("hsTitle").textContent = s.title;
    $("hsBody").innerHTML = s.body;
    $("hsWho").textContent = s.who;
    $("hsCount").textContent = (cur + 1) + " / " + m.length;
    var rr = $("hsRpc"); rr.textContent = "";
    s.rpc.forEach(function (n) {
      var sp = document.createElement("span"); sp.className = "rpc on"; sp.textContent = n; rr.appendChild(sp);
    });
    $("hsPrev").disabled = cur === 0;
    $("hsNext").textContent = cur === m.length - 1 ? "Replay" : "Next step";
  }

  $("hsNext").addEventListener("click", function () { cur = cur === 5 ? 0 : cur + 1; renderHs(); });
  $("hsPrev").addEventListener("click", function () { if (cur > 0) { cur--; renderHs(); } });
  $("hsReset").addEventListener("click", function () { cur = 0; renderHs(); });
  function setDoor(d) {
    door = d;
    $("doorL").setAttribute("aria-pressed", String(d === "L402"));
    $("doorP").setAttribute("aria-pressed", String(d === "Payment"));
    renderHs();
  }
  $("doorL").addEventListener("click", function () { setDoor("L402"); });
  $("doorP").addEventListener("click", function () { setDoor("Payment"); });
  renderHs();

  /* ================================================ timeline */
  var rng = $("tlRange"), rev = $("tlRev"), cb = $("tlCB"), playing = null;
  function tl() {
    var d = +rng.value, r = cb.checked;
    $("tlDay").textContent = d;
    rng.setAttribute("aria-valuetext", "day " + d);
    document.querySelectorAll("[data-ph]").forEach(function (p) { p.style.left = (d / 120 * 100) + "%"; });
    rev.classList.toggle("on", r);
    var c;
    if (r && d >= 90) c = "<b>Chargeback landed.</b> The money is pulled back. The tokens were served on day 0 and are not coming back; the seller has absorbed the loss.";
    else if (d === 0) c = "<b>Tokens served.</b> The payment is authorized, not final. The compute is already spent.";
    else if (d < 60) c = "<b>Day " + d + ".</b> The tokens are long gone. The payment can still be reversed, and the seller cannot yet know whether it was paid.";
    else if (d < 120) c = "<b>Day " + d + ".</b> Inside the 60 to 120 day window. A dispute can still land.";
    else c = "<b>Day 120.</b> The window has closed. The payment is final, unless a dispute already landed.";
    $("tlCard").innerHTML = c;
    $("tlLn").innerHTML = d === 0
      ? "<b>The preimage is revealed within seconds.</b> The payment is final. The seller's exposure is the time it takes to settle."
      : "<b>Final since day 0.</b> There is no chargeback mechanism and no identity to chase. Either the preimage exists or it does not.";
  }
  rng.addEventListener("input", function () { stopPlay(); tl(); });
  cb.addEventListener("change", tl);
  function stopPlay() { if (playing) { clearInterval(playing); playing = null; $("tlPlay").textContent = "Play"; } }
  $("tlPlay").addEventListener("click", function () {
    if (playing) { stopPlay(); return; }
    if (+rng.value >= 120) rng.value = 0;
    $("tlPlay").textContent = "Pause";
    var step = reduce() ? 30 : 1, every = reduce() ? 600 : 60;
    playing = setInterval(function () {
      rng.value = Math.min(120, +rng.value + step); tl();
      if (+rng.value >= 120) stopPlay();
    }, every);
  });
  tl();

  /* ================================================ lightmeter calc */
  function round6(x) { return Math.round(x * 1e6) / 1e6; }
  function calc() {
    var parts = $("cModel").value.split("|"), uI = +parts[1], uO = +parts[2];
    var m = +$("cMargin").value, btc = Math.max(1, +$("cBtc").value || 1), bt = Math.max(1, +$("cBundle").value || 1);
    $("cMarginV").textContent = m;
    // $/Mtok to msat/token: usd * 1e11 msat per btc / btcusd / 1e6 tokens.
    var rI = uI * 1e5 / btc, rO = uO * 1e5 / btc;
    var mI = rI * (1 + m / 100), mO = rO * (1 + m / 100);
    var qI = Math.ceil(round6(mI)), qO = Math.ceil(round6(mO));
    var sats = Math.ceil(round6(bt * (qI + qO) / 2 / 1000));
    $("cUsdI").textContent = "$" + uI.toFixed(2); $("cUsdO").textContent = "$" + uO.toFixed(2);
    $("cRawI").textContent = rI.toFixed(3); $("cRawO").textContent = rO.toFixed(3);
    $("cMarI").textContent = mI.toFixed(3); $("cMarO").textContent = mO.toFixed(3);
    $("cRndI").textContent = qI; $("cRndO").textContent = qO;
    $("cSats").textContent = fmt(sats);
    $("cEq").textContent = "ceil(" + fmt(bt) + " x (" + qI + " + " + qO + ") / 2 / 1000) = " + fmt(sats) + " sats. msat/token = $/Mtok x 1e11 / btcusd / 1e6.";
  }
  ["cModel", "cMargin", "cBtc", "cBundle"].forEach(function (id) { $(id).addEventListener("input", calc); });
  calc();

  /* ================================================ budget policy */
  var B = { spent: 0, n: 0 };
  function bv() { return { fund: +$("bFund").value, req: +$("bReq").value, day: +$("bDay").value, quote: +$("bModel").value }; }
  function blog(c, t) {
    var d = document.createElement("div"); d.className = c; d.textContent = t;
    $("bLog").appendChild(d); $("bLog").scrollTop = $("bLog").scrollHeight;
  }
  function bhud() {
    var v = bv();
    $("bFundV").textContent = fmt(v.fund) + " sats"; $("bReqV").textContent = fmt(v.req) + " sats"; $("bDayV").textContent = fmt(v.day) + " sats";
    $("bWal").textContent = fmt(Math.max(0, v.fund - B.spent)); $("bSpent").textContent = fmt(B.spent); $("bN").textContent = B.n;
  }
  $("bBuy").addEventListener("click", function () {
    var v = bv(), wal = Math.max(0, v.fund - B.spent), q = v.quote;
    blog("rq", "< 402, bundle quote " + fmt(q) + " sats");
    if (q > v.req) blog("a402", "  DENIED: " + fmt(q) + " exceeds the per-request ceiling " + fmt(v.req) + ". No wallet action taken.");
    else if (B.spent + q > v.day) blog("a402", "  DENIED: would take today's spend to " + fmt(B.spent + q) + ", over the daily cap " + fmt(v.day) + ".");
    else if (q > wal) blog("a402", "  DENIED: wallet holds " + fmt(wal) + ". The funded amount is the hard ceiling.");
    else { B.spent += q; B.n++; blog("ok", "  PAID " + fmt(q) + " sats, credential cached, request retried."); }
    bhud();
  });
  $("bReset").addEventListener("click", function () { B.spent = 0; B.n = 0; $("bLog").textContent = ""; bhud(); });
  ["bFund", "bReq", "bDay"].forEach(function (id) { $(id).addEventListener("input", bhud); });
  bhud();

  /* ================================================ copy buttons */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var txt = btn.parentNode.querySelector("pre").innerText;
      function done(ok) { btn.textContent = ok ? "copied" : "select + copy"; setTimeout(function () { btn.textContent = "copy"; }, 1400); }
      try { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); }); }
      catch (e) { done(false); }
    });
  });
})();

/* mobile menu */
(function () {
  var btn = document.getElementById("menuBtn"), nav = document.getElementById("siteNav");
  if (!btn || !nav) return;
  function set(open) { nav.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "close" : "menu"; }
  btn.addEventListener("click", function () { set(!nav.classList.contains("open")); });
  nav.addEventListener("click", function (e) { if (e.target.tagName === "A") set(false); });
  window.matchMedia("(min-width: 861px)").addEventListener("change", function (m) { if (m.matches) set(false); });
})();
