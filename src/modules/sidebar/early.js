// Course sidebar, before the page paints: mark <html> so early.css widens Canvas' menu at
// once instead of jumping on every page load, folded the way you left it. sidebar.js adds
// the section headings and the courses at document_idle.
(function () {
  "use strict";
  if (window.__cj_sidebar) return;
  window.__cj_sidebar = true;
  const html = document.documentElement;
  html.classList.add("cj-sidebar-on");
  try {
    if (localStorage.getItem("cj-sidebar-pages") === "closed") html.classList.add("cj-sidebar-pages-closed");
  } catch {}
})();
