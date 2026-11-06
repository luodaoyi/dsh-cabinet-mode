/* Cabinet Mode intro site: one-time language auto-redirect, copy buttons,
   screenshot lightbox. Plain JS, no dependencies. */

(function () {
  "use strict";

  var body = document.body;

  /* --- language: first visit only, unless the visitor already chose --- */
  var pageLang = body.getAttribute("data-page-lang"); // "zh" | "en"
  var root = body.getAttribute("data-root") || "./";
  var pref = null;
  try { pref = localStorage.getItem("cm-lang"); } catch (e) { /* storage unavailable */ }

  if (pageLang && !pref) {
    var navLang = (navigator.language || "").toLowerCase();
    var wantsZh = navLang.indexOf("zh") === 0;
    if (pageLang === "zh" && !wantsZh) {
      try { localStorage.setItem("cm-lang", "en"); } catch (e) {}
      location.replace(root + "en/");
    } else if (pageLang === "en" && wantsZh) {
      try { localStorage.setItem("cm-lang", "zh"); } catch (e) {}
      location.replace(root);
    }
  }

  /* --- language switch buttons remember the choice --- */
  document.querySelectorAll("[data-set-lang]").forEach(function (el) {
    el.addEventListener("click", function () {
      try { localStorage.setItem("cm-lang", el.getAttribute("data-set-lang")); } catch (e) {}
      /* let the link navigate */
    });
  });

  /* --- copy buttons --- */
  var copyTimer = null;
  document.querySelectorAll("[data-copy], [data-copy-from]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var fromId = btn.getAttribute("data-copy-from");
      var text = fromId
        ? (document.getElementById(fromId) || {}).textContent || ""
        : btn.getAttribute("data-copy") || "";
      function done(ok) {
        var prev = btn.getAttribute("data-label") || btn.textContent;
        if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", prev);
        btn.textContent = ok ? (btn.getAttribute("data-done") || "OK") : "✕";
        btn.classList.add("done");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          btn.textContent = prev;
          btn.classList.remove("done");
        }, 2000);
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done(ok);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        /* In some embedded browsers the writeText promise never settles
           (permission prompt that never resolves); race it with a timeout
           so the execCommand fallback still runs. */
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          fallback();
        }, 900);
        navigator.clipboard.writeText(text).then(
          function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            done(true);
          },
          function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fallback();
          }
        );
      } else {
        fallback();
      }
    });
  });

  /* --- lightbox for screenshots --- */
  var box = document.createElement("div");
  box.className = "lightbox";
  var big = document.createElement("img");
  box.appendChild(big);
  document.body.appendChild(box);
  document.querySelectorAll("[data-zoom]").forEach(function (img) {
    img.addEventListener("click", function () {
      big.src = img.getAttribute("data-zoom") || img.src;
      box.classList.add("open");
    });
  });
  box.addEventListener("click", function () { box.classList.remove("open"); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") box.classList.remove("open");
  });
})();
