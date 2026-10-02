// Colour themes: an accent colour family, with a light and a dark variant each. Whether the
// page is light or dark is the dark mode module's business; a theme only picks the colours.
// Pure; theme.js puts css() on the page, the settings page uses vars().
(function (root) {
  "use strict";

  // Rainbow: Canvas' menu gets a top-to-bottom rainbow (white icons stay readable on every
  // stop) and each menu item its own colour when it is the current one. Links and buttons
  // stay purple, since rainbow text is hard to read.
  const RAINBOW = {
    stops: ["#b71c1c", "#bf360c", "#8a6100", "#1b5e20", "#0d47a1", "#4a148c"],
    light: ["#c62828", "#bf360c", "#8a6100", "#2e7d32", "#1565c0", "#6a1b9a"],
    dark: ["#ef9a9a", "#ffab91", "#ffe082", "#a5d6a7", "#90caf9", "#ce93d8"],
  };

  const DEFAULT_COLOR = "#1d64a8";

  // The backgrounds accent text sits on: Canvas' white page, and the dark mode module's.
  const LIGHT_BG = "#ffffff";
  const DARK_BG = "#14181d";
  // Text on a light accent in dark mode; darker than DARK_BG, so it reads wherever links do.
  const DARK_FG = "#0b0f14";
  // Dark mode's text colour (dark.js), which the menu icons get on a dark page.
  const DARK_TEXT = "#dbe2e9";

  /** A stored colour as "#rrggbb", or the default when it is anything else. */
  const color = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : DEFAULT_COLOR);

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hex = (cs) => `#${cs.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;

  /** WCAG contrast ratio between two "#rrggbb" colours. */
  function contrast(a, b) {
    const lum = (h) => {
      const [r, g, bl] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  function toHsl(h) {
    const [r, g, b] = rgb(h);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hue * 60 + 360) % 360, s, l];
  }
  function fromHsl([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hex([r + m, g + m, b + m]);
  }
  /** The colour with its lightness moved by `by` (-1..1). */
  const shift = (h, by) => {
    const [hue, s, l] = toHsl(h);
    return fromHsl([hue, s, Math.min(1, Math.max(0, l + by))]);
  };
  /** The colour itself if `ok`, else the nearest lighter (dir 1) or darker (dir -1) one that is. */
  function until(h, ok, dir) {
    const [hue, s, l] = toHsl(h);
    for (let i = 0, cur = h; i <= 100; i++, cur = fromHsl([hue, s, Math.min(1, Math.max(0, l + dir * i / 100))])) {
      if (ok(cur)) return cur;
    }
    return dir < 0 ? "#000000" : "#ffffff";
  }

  /** A full theme from one colour, nudged lighter or darker only where it would be hard to read. */
  function derive(input) {
    const base = color(input);
    const accent = until(base, (h) => contrast(h, LIGHT_BG) >= 4.5, -1);
    const [hue, s, l] = toHsl(accent);
    // The menu is the largest patch of colour, so it keeps the colour's hue and saturation,
    // only as dark as white icons (or dark mode's text) need.
    const nav = until(shift(accent, -0.06), (h) => contrast(h, "#ffffff") >= 7, -1);
    const darkAccent = until(base, (h) => contrast(h, DARK_BG) >= 4.5, 1);
    const darkNav = until(fromHsl([hue, s, Math.min(l, 0.3)]), (h) => contrast(h, DARK_TEXT) >= 7, -1);
    return {
      light: { accent, hover: shift(accent, -0.08), fg: "#ffffff", nav },
      dark: { accent: darkAccent, hover: shift(darkAccent, 0.08), fg: DARK_FG, nav: darkNav },
    };
  }

  // accent: links, buttons, selection. hover: the pressed/hovered accent. fg: text on the
  // accent. nav: Canvas' side menu (white icons on it in light, dark mode's text colour in dark).
  // The presets, built from one colour each like your own colour is. Other colours are a
  // colour-picker away, so only a few.
  const THEMES = {
    blue: derive("#1d64a8"),
    green: derive("#15803d"),
    purple: derive("#7c3aed"),
  };

  // "canvas" leaves Canvas' own colours alone; "custom" is built from the colour you pick.
  const NAMES = ["canvas", ...Object.keys(THEMES), "rainbow", "custom"];

  /** The theme to show, from the module switch and the stored choice. */
  const pick = (moduleOn, name) => (moduleOn && name !== "canvas" && NAMES.includes(name) ? name : "canvas");

  /** A theme's light and dark colours, or null for Canvas' own. */
  function colorsOf(name, custom) {
    if (Object.prototype.hasOwnProperty.call(THEMES, name)) return THEMES[name];
    if (name === "rainbow") return THEMES.purple;
    if (name === "custom") return derive(custom);
    return null;
  }

  /** Plus' own accent variables for "light" or "dark"; empty for Canvas' colours. */
  function vars(name, scheme, custom) {
    const th = colorsOf(name, custom);
    if (!th) return "";
    const c = th[scheme];
    return `--cj-accent: ${c.accent}; --cj-accent-hover: ${c.hover}; --cj-accent-fg: ${c.fg};`;
  }

  // Canvas' theme editor variables, which its own stylesheets read. Forced, because Canvas
  // defines them on :root in a stylesheet that loads after ours.
  function brand(c, withNav) {
    const v = {
      "--ic-brand-primary": c.accent,
      "--ic-brand-primary-darkened-5": c.hover,
      "--ic-brand-primary-darkened-10": c.hover,
      "--ic-brand-primary-darkened-15": c.hover,
      "--ic-link-color": c.accent,
      "--ic-link-color-darkened-10": c.hover,
      "--ic-brand-button--primary-bgd": c.accent,
      "--ic-brand-button--primary-bgd-darkened-5": c.hover,
      "--ic-brand-button--primary-bgd-darkened-15": c.hover,
      "--ic-brand-button--primary-text": c.fg,
      "--ic-brand-global-nav-ic-icon-svg-fill--active": c.accent,
      "--ic-brand-global-nav-menu-item__text-color--active": c.accent,
      "--ic-brand-global-nav-menu-item__badge-bgd": c.accent,
      "--ic-brand-global-nav-menu-item__badge-text": c.fg,
    };
    if (withNav) {
      Object.assign(v, {
        "--ic-brand-global-nav-bgd": c.nav,
        "--ic-brand-global-nav-ic-icon-svg-fill": "#ffffff",
        "--ic-brand-global-nav-menu-item__text-color": "#ffffff",
        "--ic-brand-global-nav-avatar-border": "#ffffff",
      });
    }
    return Object.entries(v).map(([k, x]) => `${k}: ${x} !important;`).join(" ");
  }

  /**
   * The stylesheet for a theme: the light colours, and the dark ones while Dark Reader
   * darkens the page (it marks <html>, like the palette follows). Empty for Canvas' colours.
   */
  function css(name, custom) {
    const th = colorsOf(name, custom);
    if (!th) return "";
    const nav = (c) => `--cj-nav: ${c.nav}; --cj-nav-active: var(--cj-accent);`;
    const base = `html:root { ${vars(name, "light", custom)} ${nav(th.light)} ${brand(th.light, true)} }\n`
      + `html[data-darkreader-scheme]:root { ${vars(name, "dark", custom)} ${nav(th.dark)} ${brand(th.dark, false)} }\n`
      + TARGETS;
    return name === "rainbow" ? base + rainbowCss() : base;
  }

  // Canvas' own elements, coloured straight from the --cj-* variables. Canvas' variables are
  // not enough: on a dark page Dark Reader swaps them for converted copies of Canvas' colours.
  // Buttons and links that are really something else (tabs, menu, cards' buttons) keep theirs.
  const LINK = ":is(#main, #right-side-wrapper, .ic-app-nav-toggle-and-crumbs) a[href]:not(.btn, .Button, [class*=\"Button\"], [class*=\"baseButton\"], "
    + "[role=\"button\"], [role=\"tab\"], #section-tabs a)";
  const PRIMARY = ":is(.btn-primary, .Button--primary, .ui-button.btn-primary)";
  const ACTIVE = "#header .ic-app-header__menu-list-item--active";
  // Dark Reader paints the menu's inner layers too; clear them so the menu colour shows,
  // except the current item's highlight.
  const IDLE = ".ic-app-header__menu-list-item:not(.ic-app-header__menu-list-item--active)";
  // Dark Reader gives every element its own text colour, so a link's text (in spans and
  // headings) inherits the link's colour explicitly. Icons keep theirs; our line icons
  // (paths with style="fill:none") are stroked in the current item's colour, never filled.
  const TARGETS = `${LINK} { color: var(--cj-accent) !important; }
${LINK}:hover { color: var(--cj-accent-hover) !important; }
${LINK} :not(svg, svg *, img) { color: inherit !important; }
#header :is(.ic-app-header__main-navigation, .ic-app-header__menu-list, ${IDLE}, ${IDLE} :not([class*="badge"], [class*="Badge"], [class*="badge"] *)) {
  background-color: transparent !important; }
${PRIMARY} { background-color: var(--cj-accent) !important; border-color: var(--cj-accent) !important; color: var(--cj-accent-fg) !important; }
${PRIMARY}:is(:hover, :focus) { background-color: var(--cj-accent-hover) !important; border-color: var(--cj-accent-hover) !important; }
#section-tabs a.active { color: var(--cj-accent) !important; border-left-color: var(--cj-accent) !important; }
#header.ic-app-header, html[data-darkreader-scheme] #header.ic-app-header { background-color: var(--cj-nav) !important; }
${ACTIVE} :is(.ic-icon-svg, .ic-icon-svg *):not([style*="fill:none"]) { fill: var(--cj-nav-active) !important; }
${ACTIVE} .ic-icon-svg [style*="fill:none"] { stroke: var(--cj-nav-active) !important; }
${ACTIVE} .menu-item__text { color: var(--cj-nav-active) !important; }
::selection { background-color: var(--cj-accent); color: var(--cj-accent-fg); }
`;

  // Each menu item gets its own colour for when it is the current one.
  function rainbowCss() {
    const n = RAINBOW.light.length;
    const items = (scheme, prefix) => RAINBOW[scheme]
      .map((c, i) => `${prefix}.ic-app-header__menu-list > li:nth-child(${n}n+${i + 1}) { --cj-nav-active: ${c}; }`).join("\n");
    return `#header.ic-app-header { background-image: linear-gradient(to bottom, ${RAINBOW.stops.join(", ")}) !important; }\n`
      + `${items("light", "")}\n${items("dark", "html[data-darkreader-scheme] ")}\n`;
  }

  const api = { THEMES, RAINBOW, NAMES, DEFAULT_COLOR, color, contrast, derive, pick, vars, css };
  root.CJ = Object.assign(root.CJ || {}, { themes: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
