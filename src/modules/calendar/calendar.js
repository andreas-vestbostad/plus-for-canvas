// Calendar module: redraws the small month view in the calendar's sidebar. Canvas draws
// gradient cells and a corner triangle on days with events; this makes the cells flat,
// the day numbers round and puts a dot under days with events. Works in light and dark:
// the colours are variables, and the dark ones take over while Dark Reader is on.
// Loaded at document_start, before the page paints, and only while the module is on.
(function (root) {
  "use strict";

  const CSS = `
    #minical {
      --cjc-surface: #fff; --cjc-line: #dfe3e8; --cjc-strong: #2d3b45; --cjc-text: #2d3b45;
      --cjc-muted: #a0aab3; --cjc-button: #6b7780; --cjc-hover: #eef1f4;
      --cjc-accent: var(--cj-accent, var(--ic-brand-primary, #0374b5)); --cjc-accent-fg: var(--cj-accent-fg, #fff);
      --cjc-mark: var(--cjc-accent);
    }
    html[data-darkreader-scheme="dark"] #minical {
      --cjc-surface: #1a1f26; --cjc-line: #2a313a; --cjc-strong: #f0f4f8; --cjc-text: #c9d3dd;
      --cjc-muted: #56626f; --cjc-button: #8a9bb0; --cjc-hover: #212730;
      --cjc-accent: var(--cj-accent, #2f6fb3); --cjc-mark: var(--cj-accent, #7cc2f7);
    }
    #minical { background: var(--cjc-surface) !important; border: 1px solid var(--cjc-line) !important;
      border-radius: 8px !important; padding: 0 4px !important; text-shadow: none !important; }
    #minical *, #minical td, #minical th { border-color: transparent !important; background-image: none !important; text-shadow: none !important; }
    #minical .fc-toolbar h2 { color: var(--cjc-strong) !important; }
    #minical .fc-button { color: var(--cjc-button) !important; }
    #minical .fc-button:hover { color: var(--cjc-strong) !important; }
    #minical .fc-button:focus:not(:focus-visible) { outline: none !important; box-shadow: none !important; }
    #minical .fc-button:focus-visible { outline: 2px solid var(--cjc-mark) !important; outline-offset: -2px !important;
      border-radius: 6px !important; box-shadow: none !important; }
    /* FullCalendar sizes the grid for five weeks; let six-week months grow instead of scroll. */
    #minical .fc-scroller { height: auto !important; overflow: visible !important; }
    #minical td.fc-day, #minical td.fc-day-top { background-color: transparent !important; }
    #minical td.fc-day.event::after { display: none !important; }
    #minical td.fc-day.event { background: radial-gradient(circle, var(--cjc-mark) 2px, transparent 2.5px)
      center bottom -1px / 6px 6px no-repeat !important; }
    /* The day number keeps FullCalendar's row height. */
    #minical .fc-day-top { text-align: center !important; }
    #minical .fc-day-number { display: block !important; float: none !important; width: 22px !important; height: 22px !important;
      line-height: 22px !important; font-size: .875rem !important; margin: 0 auto !important; padding: 0 !important;
      border: 0 !important; border-radius: 50% !important; background: transparent !important; box-shadow: none !important;
      color: var(--cjc-text) !important; text-align: center !important; transition: none !important; }
    #minical .fc-other-month .fc-day-number { color: var(--cjc-muted) !important; }
    #minical .fc-day-number:hover { background: var(--cjc-hover) !important; color: var(--cjc-strong) !important; }
    #minical .fc-today .fc-day-number { background: var(--cjc-accent) !important; color: var(--cjc-accent-fg) !important; font-weight: 700 !important; }
  `;

  /** Whether the calendar is redrawn on this host: its own switch, unless the site was removed. */
  function active(modules, disabledHosts, host = "") {
    const { enabled, siteOff } = root.CJ.registry;
    return enabled(modules).calendar && !siteOff(host, disabledHosts);
  }

  if (typeof module !== "undefined") {
    module.exports = { CSS, active };
    return;
  }
  if (window.__cj_calendar) return;
  window.__cj_calendar = true;

  let style = null;
  function apply(on) {
    if (!on) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      // Dark Reader neither converts nor removes "stylus" styles, so both colour sets
      // stay as written and the dark ones switch on with Dark Reader's own attribute.
      style.className = "stylus cj-calendar";
      style.textContent = CSS;
    }
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
  }

  // Changes can land before the first read resolves; they win over what the read returns.
  const KEYS = ["modules", "disabledHosts"];
  const changed = {};
  let settings = null;
  const refresh = () => apply(active(settings.modules, settings.disabledHosts, location.host));

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
    settings = Object.assign({ modules: s.modules, disabledHosts: s.disabledHosts }, changed);
    refresh();
  }, (e) => console.warn("Plus could not read calendar settings:", e));
})(globalThis);
