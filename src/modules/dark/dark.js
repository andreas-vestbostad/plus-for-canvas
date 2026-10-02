// Dark mode module: themes the page with the vendored Dark Reader engine, which rewrites
// the page's own colours (images and video stay as they are). Loaded at document_start in
// every frame, before the page paints, and only while the module is on.
(function (root) {
  "use strict";

  const MODES = ["auto", "on", "off"];
  const CACHE_KEY = "cj-dark";

  /** "on", "auto" (follow the system) or "off" (light), from the module switch and the mode choice. */
  function decide(moduleOn, mode) {
    if (!moduleOn) return "off";
    return MODES.includes(mode) ? mode : "auto";
  }

  if (typeof module !== "undefined") {
    module.exports = { decide };
    return;
  }
  if (window.__cj_dark) return;
  window.__cj_dark = true;

  const DR = root.DarkReader;
  const real = window.__cjRealSendMessage;
  if (real) {
    const drSend = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = function (msg, ...rest) {
      return msg && msg.type === "cs-bg-fetch" ? drSend(msg) : real.call(chrome.runtime, msg, ...rest);
    };
  }

  // Canvas' own text is a cool slate (#2d3b45), so the whole theme leans the same way:
  // neutral greys next to it look muddy.
  const THEME = {
    brightness: 100, contrast: 100, sepia: 0,
    darkSchemeBackgroundColor: "#14181d", darkSchemeTextColor: "#dbe2e9",
  };
  // Touch-ups on top of Dark Reader's conversion, for Canvas' own chrome only. Teacher
  // written content (.user_content) keeps whatever colours it was given.
  const CSS = `
    :root { --cj-surface: #1a1f26; --cj-raised: #212730; --cj-nav: #0f1216; --cj-line: #2a313a; --cj-strong: #f0f4f8; }
    #header.ic-app-header { background-color: var(--cj-nav) !important; border-right: 1px solid var(--cj-line) !important; }
    :is(h1, h2, h3, h4):not(.user_content *) { color: var(--cj-strong) !important; }
    .ig-header, .PlannerHeader-styles__root, table thead th { background-color: var(--cj-surface) !important; }
    .ig-header .name, .ig-header-title, #section-tabs a.active { color: var(--cj-strong) !important; }
    .context_module, .item-group-condensed, .ig-list .ig-row, .context_module_item, .ic-app-nav-toggle-and-crumbs,
    .ic-Action-header, table td, table th { border-color: var(--cj-line) !important; }
    .ig-list .ig-row:hover { background-color: var(--cj-raised) !important; }
    .Button:not(.Button--primary):not(.Button--success):not(.Button--danger), .btn:not(.btn-primary) {
      background-color: var(--cj-surface) !important; border-color: var(--cj-line) !important; }
    /* Canvas draws focus rings with hard-coded white, which glares on a dark page. Keep a
       ring for keyboard users (focus-visible), in the accent colour; none on a mouse click. */
    :root { --cj-focus: var(--cj-accent, #7cc2f7); }
    #header .ic-app-header__menu-list-link:focus:not(:focus-visible), a:focus:not(:focus-visible) {
      box-shadow: none !important; outline: none !important; }
    #header .ic-app-header__menu-list-link:focus-visible { box-shadow: inset 0 0 0 2px var(--cj-focus) !important; }
    a:focus-visible { outline: 2px solid var(--cj-focus) !important; outline-offset: 1px !important; }
    /* Canvas' nav badges (unread messages, deadlines) turn into the background colour. */
    #header .menu-item__badge:not(:empty) { background-color: var(--cj-accent, #2f6fb3) !important; color: var(--cj-accent-fg, #fff) !important; }
  `;
  // Canvas fades buttons and the calendar checkboxes between colours (transition: all), so
  // while the theme is being put in place they visibly fade in from white. No transitions
  // until the page has loaded and settled. Dark Reader leaves "darkreader" styles alone.
  const SETTLE_MS = 1000;
  function holdTransitions() {
    const style = document.createElement("style");
    style.className = "darkreader cj-dark-settle";
    style.textContent = "*, *::before, *::after { transition: none !important; }";
    (document.head || document.documentElement).appendChild(style);
    const release = () => setTimeout(() => style.remove(), SETTLE_MS);
    if (document.readyState === "complete") release();
    else window.addEventListener("load", release, { once: true });
  }
  const FIXES = { invert: [], css: CSS, ignoreInlineStyle: [], ignoreImageAnalysis: [], disableStyleSheetsProxy: false };
  DR.setFetchMethod(window.fetch.bind(window));

  let current = null;
  function apply(state) {
    if (state === current) return;
    current = state;
    try { localStorage.setItem(CACHE_KEY, state); } catch {}
    try {
      DR.auto(false);
      if (state === "on") DR.enable(THEME, FIXES);
      else if (state === "auto") DR.auto(THEME, FIXES);
    } catch (e) {
      console.warn("Plus dark mode failed:", e);
    }
  }

  // The last choice is kept in the page's localStorage so the first paint is already
  // dark; chrome.storage answers a moment later and wins.
  let cached = null;
  try { cached = localStorage.getItem(CACHE_KEY); } catch {}
  if (cached === "on" || cached === "auto") {
    holdTransitions();
    apply(cached);
  }

  const { enabled, siteOff } = root.CJ.registry;
  // Changes can land before the first read resolves; they win over what the read returns.
  const changed = {};
  let settings = null;
  const refresh = () => apply(decide(enabled(settings.modules).dark && !siteOff(location.host, settings.disabledHosts), settings.darkMode));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const keys = ["modules", "darkMode", "disabledHosts"].filter((k) => changes[k]);
    for (const k of keys) changed[k] = changes[k].newValue;
    if (settings && keys.length) {
      settings = Object.assign({}, settings, changed);
      refresh();
    }
  });
  chrome.storage.sync.get(["modules", "darkMode", "disabledHosts"]).then((s) => {
    settings = Object.assign({ modules: s.modules, darkMode: s.darkMode, disabledHosts: s.disabledHosts }, changed);
    refresh();
  }, (e) => console.warn("Plus could not read dark mode settings:", e));
})(globalThis);
