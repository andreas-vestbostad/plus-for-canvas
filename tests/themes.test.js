const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/lib/themes.js");
const R = require("../src/core/registry.js");

const HEX = /^#[0-9a-f]{6}$/;
// WCAG relative luminance and contrast ratio.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// The page backgrounds accent text sits on: Canvas' white, and the dark mode module's surface.
const LIGHT_BG = "#ffffff";
const DARK_BG = "#14181d";
// Dark mode's text colour, which the menu icons get on a dark page.
const DARK_TEXT = "#dbe2e9";

test("the theme choice lists canvas first, then every preset, rainbow and your own colour", () => {
  assert.equal(T.NAMES[0], "canvas", "Canvas' own colours are the default");
  assert.deepEqual(T.NAMES, ["canvas", ...Object.keys(T.THEMES), "rainbow", "custom"]);
});

test("the theme module offers the same themes as a choice and loads before paint", () => {
  const m = R.MODULES.find((x) => x.id === "theme");
  assert.ok(m, "theme module");
  assert.equal(m.defaultOn, false);
  assert.deepEqual(m.choice, { key: "theme", values: T.NAMES });
  assert.deepEqual(m.color, { key: "themeColor", when: "custom" }, "a colour picker for your own colour");
  assert.equal(m.inject.runAt, "document_start");
  assert.equal(m.inject.allFrames, true);
  const i = (f) => m.inject.js.findIndex((x) => x.endsWith(f));
  assert.ok(i("registry.js") >= 0 && i("registry.js") < i("themes.js") && i("themes.js") < i("theme/theme.js"));
});

test("pick follows the switch and falls back to Canvas' colours", () => {
  assert.equal(T.pick(true, "green"), "green");
  assert.equal(T.pick(false, "green"), "canvas", "module off");
  assert.equal(T.pick(true, undefined), "canvas");
  assert.equal(T.pick(true, "neon"), "canvas", "unknown values fall back");
  assert.equal(T.pick(true, "constructor"), "canvas", "no prototype keys");
  assert.equal(T.pick(true, "rainbow"), "rainbow");
  assert.equal(T.pick(true, "custom"), "custom");
  assert.equal(T.pick(false, "custom"), "canvas");
});

/** The rules every set of theme colours must keep, preset or derived from your colour. */
function readable(label, th) {
  for (const scheme of ["light", "dark"]) {
    const c = th[scheme];
    for (const k of ["accent", "hover", "fg"]) assert.match(c[k], HEX, `${label}.${scheme}.${k}`);
    assert.ok(contrast(c.accent, c.fg) >= 4.5, `${label} ${scheme}: text on accent`);
    assert.ok(contrast(c.hover, c.fg) >= 4.5, `${label} ${scheme}: text on hover`);
  }
  assert.ok(contrast(th.light.accent, LIGHT_BG) >= 4.5, `${label}: links on a light page`);
  assert.ok(contrast(th.dark.accent, DARK_BG) >= 4.5, `${label}: links on a dark page`);
  assert.match(th.light.nav, HEX, `${label}.light.nav`);
  assert.ok(contrast(th.light.nav, "#ffffff") >= 7, `${label}: menu icons on the menu`);
  assert.match(th.dark.nav, HEX, `${label}.dark.nav`);
  assert.ok(contrast(th.dark.nav, DARK_TEXT) >= 7, `${label}: menu icons on the dark menu`);
}

test("every theme has complete, readable light and dark colours", () => {
  for (const [name, th] of Object.entries(T.THEMES)) readable(name, th);
});

test("any colour you pick becomes a readable theme", () => {
  for (const hex of ["#ffff00", "#000000", "#ffffff", "#777777", "#00ff00", "#1d64a8", "#ff69b4", "#0000ff", "#12e4d0"]) {
    readable(hex, T.derive(hex));
  }
});

test("a colour that is already readable is kept as it is", () => {
  assert.equal(T.derive("#1d64a8").light.accent, "#1d64a8");
  assert.equal(T.derive("#6aaeea").dark.accent, "#6aaeea");
  assert.notEqual(T.derive("#ffff00").light.accent, "#ffff00", "yellow is too light for links on white");
  assert.equal(T.derive("#FF0000").light.accent, T.derive("#ff0000").light.accent, "case does not matter");
});

test("color accepts only #rrggbb and falls back to the default", () => {
  assert.equal(T.color("#A1B2C3"), "#a1b2c3");
  for (const bad of [undefined, null, "", "red", "#abc", "#12345g", "#1234567", "url(x)", 42]) {
    assert.equal(T.color(bad), T.DEFAULT_COLOR, String(bad));
  }
  assert.match(T.DEFAULT_COLOR, HEX);
});

// Dark Reader swaps Canvas' variables for its own converted copies, so on a dark page only
// rules that name Canvas' elements and read --cj-* directly reach them.
test("css colours Canvas' links, buttons and menus directly, not only through Canvas' variables", () => {
  const css = T.css("blue");
  const rule = (re) => assert.match(css, re);
  rule(/a\[href\][^{]*\{[^}]*color: var\(--cj-accent\) !important/);
  rule(/\.btn-primary[^{]*\{[^}]*background-color: var\(--cj-accent\) !important[^}]*color: var\(--cj-accent-fg\) !important/);
  rule(/#section-tabs[^{]*\.active[^{]*\{[^}]*var\(--cj-accent\)/);
  rule(/\.ic-app-header__menu-list-item--active[^{]*\{[^}]*fill: var\(--cj-nav-active\) !important/);
  rule(/html\[data-darkreader-scheme\] #header\.ic-app-header \{[^}]*background-color: var\(--cj-nav\) !important/);
  rule(/::selection \{[^}]*var\(--cj-accent\)/);
  rule(/a\[href\][^{]* :not\(svg, svg \*, img\) \{ color: inherit !important; \}/);
  rule(/#header :is\(\.ic-app-header__main-navigation, \.ic-app-header__menu-list, [^{]*\) \{\s*background-color: transparent !important; \}/);
});

// Our own menu icons (Home+, the dark mode toggle) are drawn in lines: path style="fill:none".
test("the current menu item's line icons are stroked, not filled", () => {
  const css = T.css("blue");
  const fill = css.split("\n").find((l) => /--active[^{]*\{[^}]*fill: var\(--cj-nav-active\)/.test(l));
  assert.ok(fill, "a fill rule for the current item");
  assert.match(fill, /:not\(\[style\*="fill:none"\]\)/);
  assert.match(css, /--active \.ic-icon-svg \[style\*="fill:none"\] \{ stroke: var\(--cj-nav-active\) !important; \}/);
});

test("the theme stylesheet survives Dark Reader turning on and off", () => {
  const src = require("node:fs").readFileSync(require.resolve("../src/modules/theme/theme.js"), "utf8");
  // Dark Reader removes every .darkreader element when it stops; it leaves .stylus alone
  // and does not convert it.
  assert.ok(!/className = "darkreader/.test(src), "not a .darkreader style");
  assert.match(src, /className = "stylus /);
});

test("your own colour's css uses the colours derived from it", () => {
  const d = T.derive("#12e4d0");
  const css = T.css("custom", "#12e4d0");
  assert.ok(css.includes(`--cj-accent: ${d.light.accent};`));
  assert.ok(css.includes(`--cj-accent: ${d.dark.accent};`));
  assert.ok(T.css("custom", "url(evil)").includes(`--cj-accent: ${T.derive(T.DEFAULT_COLOR).light.accent};`),
    "a bad stored value never reaches the page");
  assert.equal(T.vars("custom", "light", "#12e4d0"), T.vars("custom", "light", "#12E4D0"));
});

test("rainbow gives Canvas' menu a rainbow and each menu item its own colour", () => {
  const css = T.css("rainbow");
  const p = T.THEMES.purple;
  assert.ok(css.includes(`--cj-accent: ${p.light.accent};`), "links and buttons stay a readable purple");
  assert.match(css, /#header\.ic-app-header \{[^}]*linear-gradient\(/);
  for (const c of T.RAINBOW.stops) assert.ok(contrast(c, "#ffffff") >= 4.5, `menu icons on ${c}`);
  T.RAINBOW.light.forEach((c, i) => {
    assert.ok(contrast(c, LIGHT_BG) >= 4.5, `active item ${c} on a light page`);
    assert.ok(css.includes(`li:nth-child(${T.RAINBOW.light.length}n+${i + 1}) { --cj-nav-active: ${c}; }`), `item ${i + 1}`);
  });
  for (const c of T.RAINBOW.dark) assert.ok(contrast(c, DARK_BG) >= 4.5, `active item ${c} on a dark page`);
  assert.equal(T.RAINBOW.light.length, T.RAINBOW.dark.length);
  assert.ok(!T.css("purple").includes("linear-gradient"), "only rainbow draws the rainbow");
});

test("vars gives the Canvas+ accent variables for a scheme", () => {
  const b = T.THEMES.blue;
  assert.equal(T.vars("blue", "light"),
    `--cj-accent: ${b.light.accent}; --cj-accent-hover: ${b.light.hover}; --cj-accent-fg: ${b.light.fg};`);
  assert.ok(T.vars("blue", "dark").includes(`--cj-accent: ${b.dark.accent};`));
  assert.equal(T.vars("canvas", "light"), "");
  assert.equal(T.vars("neon", "light"), "");
  assert.equal(T.css("canvas"), "", "no css for Canvas' own colours");
  assert.equal(T.css("neon"), "");
});

test("css sets the accent variables for light and dark pages and overrides Canvas' brand colours", () => {
  const g = T.THEMES.green;
  const css = T.css("green");
  const light = css.match(/html:root \{([^}]*)\}/)[1];
  const dark = css.match(/html\[data-darkreader-scheme\]:root \{([^}]*)\}/)[1];
  assert.ok(light.includes(`--cj-accent: ${g.light.accent};`));
  assert.ok(dark.includes(`--cj-accent: ${g.dark.accent};`), "a darkened page gets the dark colours");
  for (const v of ["--ic-brand-primary", "--ic-link-color", "--ic-brand-button--primary-bgd", "--ic-brand-button--primary-text"]) {
    assert.ok(light.includes(`${v}: `), `light sets ${v}`);
    assert.ok(dark.includes(`${v}: `), `dark sets ${v}`);
  }
  assert.ok(light.includes(`--ic-brand-global-nav-bgd: ${g.light.nav} !important;`), "the menu takes the theme");
  assert.ok(dark.includes(`--cj-nav: ${g.dark.nav};`), "a darkened page gets a dark shade of the theme in the menu");
  const decls = css.split(/[{};]/).map((d) => d.trim()).filter((d) => d.startsWith("--ic-"));
  assert.ok(decls.length > 0 && decls.every((d) => d.endsWith("!important")), "Canvas' variables are forced");
});

test("a derived theme keeps the colour's hue, also for pinks and reds", () => {
  const hue = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI + 360) % 360;
  };
  for (const hex of ["#db2777", "#ff69b4", "#7c3aed", "#ea580c"]) {
    const th = T.derive(hex);
    for (const c of [th.light.accent, th.light.hover, th.light.nav, th.dark.accent, th.dark.hover, th.dark.nav]) {
      const d = Math.abs(hue(c) - hue(hex));
      assert.ok(Math.min(d, 360 - d) < 12, `${hex} → ${c}`);
    }
  }
});
