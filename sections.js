/* pi402 site. Copy buttons, mobile menu, theme toggle. Classic script. */
(function () {
  "use strict";

  /* copy buttons: the button sits next to the <pre> it copies */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var txt = btn.parentNode.querySelector("pre").innerText;
      function done(ok) { btn.textContent = ok ? "copied" : "select + copy"; setTimeout(function () { btn.textContent = "copy"; }, 1400); }
      try { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); }); }
      catch (e) { done(false); }
    });
  });

  /* mobile menu */
  var menu = document.getElementById("menuBtn"), nav = document.getElementById("siteNav");
  if (menu && nav) {
    var set = function (open) { nav.classList.toggle("open", open); menu.setAttribute("aria-expanded", String(open)); menu.textContent = open ? "close" : "menu"; };
    menu.addEventListener("click", function () { set(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") set(false); });
    window.matchMedia("(min-width: 861px)").addEventListener("change", function (m) { if (m.matches) set(false); });
  }

  /* theme toggle; the choice is applied before first paint by the inline script in <head> */
  var theme = document.getElementById("themeBtn");
  if (theme) {
    theme.addEventListener("click", function () {
      var a = document.documentElement.getAttribute("data-theme");
      var cur = (a === "light" || a === "dark") ? a : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("pi402-theme", next); } catch (e) {}
    });
  }
})();
