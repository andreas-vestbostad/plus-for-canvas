// The list of feature modules, and which scripts go where. Shared by the service worker,
// the content scripts and the settings page, so it must not touch the DOM or chrome.*.
(function (root) {
  "use strict";
  // Early module scripts load this at document_start; the core scripts load it again later.
  if (root.CJ && root.CJ.registry) {
    if (typeof module !== "undefined") module.exports = root.CJ.registry;
    return;
  }

  const BUILT_IN_HOSTS = ["mitt.uib.no", "*.instructure.com"];

  // Loaded on every Canvas page at document_idle. Order matters: shared code first,
  // then the modules (they only define themselves), then the loader that starts them.
  const CORE_FILES = [
    "src/core/registry.js",
    "src/lib/match.js",
    "src/lib/courses.js",
    "src/lib/suggest.js",
    "src/lib/deadlines.js",
    "src/lib/dashboard.js",
    "src/lib/home.js",
    "src/lib/sidebar.js",
    "src/lib/navorder.js",
    "src/lib/themes.js",
    "src/lib/controls.js",
    "src/core/canvas.js",
    "src/modules/jump/palette.js",
    "src/modules/jump/jump.js",
    "src/modules/deadlines/icons.js",
    "src/modules/deadlines/deadlines.js",
    "src/core/navtray.js",
    "src/core/navlayout.js",
    "src/modules/home/style.js",
    "src/modules/home/order.js",
    "src/modules/home/home.js",
    "src/modules/sidebar/sidebar.js",
    "src/modules/dark/toggle.js",
    "src/modules/settings/navedit.js",
    "src/modules/settings/account.js",
    "src/modules/settings/settings.js",
    "src/content.js",
  ];

  // Hides the menu before the page paints until navlayout.js has laid it out. Like the menu
  // layout it is on wherever Plus is on, not tied to a module.
  const NAV_EARLY = { css: ["src/core/navearly.css"], js: ["src/core/navearly.js"] };

  // `inject` is for assets that must be in place before the page paints (CSS at
  // document_start). They are registered per domain, and only while the module is on.
  const MODULES = [
    { id: "jump", defaultOn: true },
    { id: "deadlines", defaultOn: true },
    {
      // Hides Canvas' dashboard on "/#cj-home" before it paints; home.js draws the page.
      id: "home", defaultOn: true,
      inject: { css: ["src/modules/home/early.css"], js: ["src/modules/home/early.js"], runAt: "document_start" },
    },
    {
      id: "dark", defaultOn: false,
      choice: { key: "darkMode", values: ["auto", "on", "off"] },
      inject: {
        js: ["src/core/registry.js", "src/modules/dark/keep-runtime.js", "src/vendor/darkreader/darkreader.js", "src/modules/dark/dark.js"],
        runAt: "document_start", allFrames: true,
      },
    },
    {
      // Canvas' menu as a wide sidebar with the courses under it. Widened before the page paints.
      id: "sidebar", defaultOn: false,
      inject: { css: ["src/modules/sidebar/early.css"], js: ["src/modules/sidebar/early.js"], runAt: "document_start" },
    },
    {
      // Redraws the calendar's small month view, in light and dark. Top frame only.
      id: "calendar", defaultOn: true,
      inject: { js: ["src/core/registry.js", "src/modules/calendar/calendar.js"], runAt: "document_start" },
    },
    {
      // Colour theme for Canvas and Plus; independent of dark mode. Values match lib/themes.js.
      // `color` adds a colour picker, shown while the choice is `when`.
      id: "theme", defaultOn: false,
      choice: { key: "theme", values: ["canvas", "blue", "green", "purple", "rainbow", "custom"] },
      color: { key: "themeColor", when: "custom" },
      inject: {
        js: ["src/core/registry.js", "src/lib/themes.js", "src/modules/theme/theme.js"],
        runAt: "document_start", allFrames: true,
      },
    },
  ];

  /** Stored choices over defaults. Only real booleans for known modules count. */
  function enabled(stored, modules = MODULES) {
    const out = {};
    for (const m of modules) {
      const v = stored && stored[m.id];
      out[m.id] = typeof v === "boolean" ? v : m.defaultOn;
    }
    return out;
  }

  /** Whether a host matches a site pattern like "mitt.uib.no" or "*.instructure.com". */
  function hostMatches(pattern, host) {
    host = String(host || "").toLowerCase();
    if (!pattern.startsWith("*.")) return host === pattern;
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }

  /** Whether the user removed the built-in site this host belongs to. */
  const siteOff = (host, disabled = []) => disabled.some((p) => BUILT_IN_HOSTS.includes(p) && hostMatches(p, host));

  const safeId = (host) => host.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  const matchesFor = (host) => [`https://${host}/*`];

  /**
   * The dynamic content scripts that should exist. Built-in hosts get the core files from
   * the manifest; custom hosts get them here. Early module assets go on every host the user has not removed.
   */
  function planScripts({ builtIn = BUILT_IN_HOSTS, disabled = [], custom = [], enabled: on }, modules = MODULES) {
    builtIn = builtIn.filter((h) => !disabled.includes(h));
    const plan = custom.map((h) => ({
      id: `cj-core-${safeId(h)}`, matches: matchesFor(h), js: CORE_FILES, runAt: "document_idle",
    }));
    for (const h of builtIn.concat(custom)) {
      plan.push({ id: `cj-navearly-${safeId(h)}`, matches: matchesFor(h), runAt: "document_start", ...NAV_EARLY });
    }
    for (const m of modules) {
      if (!m.inject || !on[m.id]) continue;
      for (const h of builtIn.concat(custom)) {
        const s = { id: `cj-${m.id}-${safeId(h)}`, matches: matchesFor(h), runAt: m.inject.runAt || "document_start" };
        if (m.inject.css) s.css = m.inject.css;
        if (m.inject.js) s.js = m.inject.js;
        // allFrames alone skips about:blank and srcdoc frames, like the rich text editor.
        if (m.inject.allFrames) Object.assign(s, { allFrames: true, matchOriginAsFallback: true });
        plan.push(s);
      }
    }
    return plan;
  }

  // Module code calls define(id, init) when its file loads; the loader starts the enabled ones.
  const impls = new Map();
  const define = (id, init) => { impls.set(id, init); };
  const impl = (id) => impls.get(id);

  const api = { BUILT_IN_HOSTS, CORE_FILES, NAV_EARLY, MODULES, enabled, hostMatches, siteOff, planScripts, define, impl };
  root.CJ = Object.assign(root.CJ || {}, { registry: api });
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
