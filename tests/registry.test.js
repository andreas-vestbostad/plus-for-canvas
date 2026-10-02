const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/core/registry.js");
const manifest = require("../manifest.json");

const MODULES = [
  { id: "jump", defaultOn: true },
  { id: "dark", defaultOn: false, inject: { css: ["dark.css"], js: ["dark.js"], runAt: "document_start", allFrames: true } },
];

test("enabled merges stored choices over defaults and ignores unknown ids", () => {
  assert.deepEqual(R.enabled(undefined, MODULES), { jump: true, dark: false });
  assert.deepEqual(R.enabled({ dark: true, jump: false, gone: true }, MODULES), { jump: false, dark: true });
  assert.deepEqual(R.enabled({ dark: "yes" }, MODULES), { jump: true, dark: false });
});

test("custom domains get the core scripts, built-in ones come from the manifest", () => {
  const plan = R.planScripts({ builtIn: ["mitt.uib.no"], custom: ["canvas.x.edu"], enabled: { jump: true, dark: false } }, MODULES);
  assert.deepEqual(plan.filter((s) => s.runAt === "document_idle").map((s) => s.id), ["cj-core-canvas.x.edu"]);
  assert.deepEqual(plan[0].matches, ["https://canvas.x.edu/*"]);
  assert.deepEqual(plan[0].js, R.CORE_FILES);
  assert.equal(plan[0].runAt, "document_idle");
});

test("modules with early assets are registered on every domain only while enabled", () => {
  const plan = R.planScripts({ builtIn: ["*.instructure.com"], custom: ["canvas.x.edu"], enabled: { jump: true, dark: true } }, MODULES);
  const dark = plan.filter((s) => s.id.startsWith("cj-dark-"));
  assert.deepEqual(dark.map((s) => s.matches[0]), ["https://*.instructure.com/*", "https://canvas.x.edu/*"]);
  assert.ok(dark.every((s) => /^cj-dark-[a-z0-9._-]+$/.test(s.id)), "ids are safe");
  assert.deepEqual(dark[0].css, ["dark.css"]);
  assert.equal(dark[0].runAt, "document_start");
  assert.equal(dark[0].allFrames, true);
});

test("the manifest injects the same core files on the built-in domains", () => {
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.js, R.CORE_FILES);
  assert.deepEqual(cs.matches, R.BUILT_IN_HOSTS.map((h) => `https://${h}/*`));
});

test("every real module's files exist", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const files = R.CORE_FILES.concat(R.NAV_EARLY.css, R.NAV_EARLY.js, R.MODULES.flatMap((m) => m.inject ? [].concat(m.inject.css || [], m.inject.js || []) : []));
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
});

test("define keeps module implementations by id", () => {
  const init = () => {};
  R.define("jump", init);
  assert.equal(R.impl("jump"), init);
  assert.equal(R.impl("nope"), undefined);
});

test("site patterns match the host and, for wildcards, its subdomains", () => {
  assert.equal(R.hostMatches("mitt.uib.no", "mitt.uib.no"), true);
  assert.equal(R.hostMatches("mitt.uib.no", "evil-mitt.uib.no"), false);
  assert.equal(R.hostMatches("*.instructure.com", "uib.instructure.com"), true);
  assert.equal(R.hostMatches("*.instructure.com", "instructure.com"), true);
  assert.equal(R.hostMatches("*.instructure.com", "notinstructure.com"), false);
});

test("a removed built-in site is off; custom domains cannot switch sites off", () => {
  assert.equal(R.siteOff("mitt.uib.no", ["mitt.uib.no"]), true);
  assert.equal(R.siteOff("uib.instructure.com", ["*.instructure.com"]), true);
  assert.equal(R.siteOff("mitt.uib.no", ["*.instructure.com"]), false);
  assert.equal(R.siteOff("mitt.uib.no", undefined), false);
  assert.equal(R.siteOff("canvas.x.edu", ["canvas.x.edu"]), false, "only built-in patterns count");
});

test("early assets skip removed built-in sites", () => {
  const plan = R.planScripts({ builtIn: ["mitt.uib.no", "*.instructure.com"], disabled: ["mitt.uib.no"], enabled: { jump: true, dark: true } }, MODULES);
  assert.deepEqual([...new Set(plan.map((s) => s.matches[0]))], ["https://*.instructure.com/*"]);
});

test("the menu is hidden before it paints on every domain Canvas+ is on, whatever modules are on", () => {
  const plan = R.planScripts({ builtIn: ["mitt.uib.no", "*.instructure.com"], disabled: ["mitt.uib.no"], custom: ["canvas.x.edu"], enabled: {} }, MODULES);
  const early = plan.filter((s) => s.id.startsWith("cj-navearly-"));
  assert.deepEqual(early.map((s) => s.matches[0]), ["https://*.instructure.com/*", "https://canvas.x.edu/*"]);
  assert.ok(early.every((s) => s.runAt === "document_start" && !s.allFrames));
  assert.deepEqual(early[0].js, R.NAV_EARLY.js);
  assert.deepEqual(early[0].css, R.NAV_EARLY.css);
});

test("Canvas+ Home is a module that loads early to hide the old dashboard before it paints", () => {
  const home = R.MODULES.find((m) => m.id === "home");
  assert.ok(home, "home module");
  assert.equal(home.defaultOn, true);
  assert.equal(home.inject.runAt, "document_start");
  assert.ok(home.inject.js.includes("src/modules/home/early.js"));
  assert.ok(home.inject.css.includes("src/modules/home/early.css"));
});

test("the menu layout, home and settings files load before the loader starts them", () => {
  const at = (f) => R.CORE_FILES.indexOf(f);
  for (const f of ["src/lib/navorder.js", "src/lib/home.js", "src/core/navlayout.js", "src/modules/home/home.js",
    "src/modules/settings/navedit.js", "src/modules/settings/account.js"]) {
    assert.ok(at(f) >= 0, `${f} is a core file`);
    assert.ok(at(f) < at("src/content.js"), `${f} before the loader`);
  }
  assert.ok(at("src/lib/navorder.js") < at("src/modules/jump/jump.js"), "the palette can reset the menu");
  assert.ok(at("src/lib/dashboard.js") < at("src/lib/home.js") && at("src/lib/deadlines.js") < at("src/lib/home.js"));
  assert.ok(at("src/core/navtray.js") < at("src/modules/home/home.js"));
  assert.ok(at("src/modules/settings/navedit.js") < at("src/modules/settings/settings.js"));
});

test("the course sidebar is off by default and widens the menu before the page paints", () => {
  const sidebar = R.MODULES.find((m) => m.id === "sidebar");
  assert.ok(sidebar, "sidebar module");
  assert.equal(sidebar.defaultOn, false);
  assert.equal(sidebar.inject.runAt, "document_start");
  assert.ok(sidebar.inject.css.includes("src/modules/sidebar/early.css"));
  const at = (f) => R.CORE_FILES.indexOf(f);
  assert.ok(at("src/lib/sidebar.js") >= 0 && at("src/lib/sidebar.js") < at("src/modules/sidebar/sidebar.js"));
  assert.ok(at("src/core/navtray.js") < at("src/modules/sidebar/sidebar.js") && at("src/modules/sidebar/sidebar.js") < at("src/content.js"));
});
