/* Cabinet Mode intro site: copy buttons, hero edict carousel and screenshot
   lightbox. Plain JS, no dependencies.

   Language is intentionally not auto-redirected from navigator.language:
   crawlers and first-time visitors must be able to see the canonical page
   they requested. The explicit language switch in the header is enough. */

(function () {
  "use strict";

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

  /* --- hero edict carousel --- */
  var edictLines = document.querySelectorAll(".hero-edict span");
  if (edictLines.length > 0) {
    edictLines[0].classList.add("is-active");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (edictLines.length > 1 && !reduceMotion) {
      var edictIdx = 0;
      setInterval(function () {
        edictLines[edictIdx].classList.remove("is-active");
        edictIdx = (edictIdx + 1) % edictLines.length;
        edictLines[edictIdx].classList.add("is-active");
      }, 3500);
    }
  }

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
