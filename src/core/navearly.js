// Before the page paints: hide the menu until navlayout.js has laid it out (it removes the
// class). If the core scripts never get there, show it anyway shortly after load.
(function () {
  "use strict";
  if (window.__cj_navEarly) return;
  window.__cj_navEarly = true;
  const PENDING = "cj-nav-pending";
  const FALLBACK_MS = 1500;
  const root = document.documentElement;
  root.classList.add(PENDING);
  const reveal = () => setTimeout(() => root.classList.remove(PENDING), FALLBACK_MS);
  if (document.readyState === "complete") reveal();
  else window.addEventListener("load", reveal, { once: true });
})();
