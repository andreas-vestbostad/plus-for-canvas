// Colour theme module: puts the chosen theme on the page as CSS variables, both Plus'
// own (--cj-accent…, read by the palette, trays and Home+) and Canvas' brand colours.
// Loaded at document_start in every frame, before the page paints, and only while the
// module is on. Light or dark is the dark mode module's business.
(function (root) {
  "use strict";
  if (window.__cj_theme) return;
  window.__cj_theme = true;

  const CACHE_KEY = "cj-theme";
  const { pick, css } = root.CJ.themes;
  const { enabled, siteOff } = root.CJ.registry;

  let style = null;
  let current = null;
  function apply(name, custom) {
    const text = css(name, custom);
    if (text === current) return;
    current = text;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ name, custom })); } catch {}
    if (!text) {
      if (style) style.remove();
      style = null;
      document.documentElement.removeAttribute("data-cj-theme");
      return;
    }
    if (!style) {
      style = document.createElement("style");
      // Dark Reader neither converts nor removes "stylus" styles (it removes every
      // "darkreader" one whenever it stops), so the chosen colours stay as they are.
      style.className = "stylus cj-theme";
    }
    style.textContent = text;
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    document.documentElement.setAttribute("data-cj-theme", name);
  }

  // The last theme is kept in the page's localStorage so the first paint already has it;
  // chrome.storage answers a moment later and wins.
  // The cache is page data like any other, so both parts are checked again by pick and css.
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch {}
  if (cached && typeof cached === "object") apply(pick(true, cached.name), cached.custom);

  // Changes can land before the first read resolves; they win over what the read returns.
  const KEYS = ["modules", "theme", "themeColor", "disabledHosts"];
  const changed = {};
  let settings = null;
  const refresh = () => apply(
    pick(enabled(settings.modules).theme && !siteOff(location.host, settings.disabledHosts), settings.theme),
    settings.themeColor);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const keys = KEYS.filter((k) => changes[k]);
    for (const k of keys) changed[k] = changes[k].newValue;
    if (settings && keys.length) {
      settings = Object.assign({}, settings, changed);
      refresh();
    }
  });
  chrome.storage.sync.get(KEYS).then((s) => {
    settings = Object.assign({ modules: s.modules, theme: s.theme, themeColor: s.themeColor, disabledHosts: s.disabledHosts }, changed);
    refresh();
  }, (e) => console.warn("Plus could not read theme settings:", e));
})(globalThis);
