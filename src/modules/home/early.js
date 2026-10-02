// Home+, before the page paints: mark <html> on "/#cj-home" so early.css hides
// Canvas' dashboard at once instead of flashing it, and go there from "/" while the
// Dashboard is hidden in the menu. home.js takes over at document_idle.
(function () {
  "use strict";
  if (window.__cj_home) return;
  window.__cj_home = true;
  if (location.pathname !== "/") return;
  // Canvas' Dashboard is hidden in the menu (home.js keeps the flag): start at Home+.
  let start = false;
  try { start = localStorage.getItem("cj-start-home") === "1"; } catch {}
  if (start && !location.hash) history.replaceState(history.state, "", `/${location.search}#cj-home`);
  if (location.hash === "#cj-home") document.documentElement.classList.add("cj-home");
})();
