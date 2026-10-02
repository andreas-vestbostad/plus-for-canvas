const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/core/registry.js");
const { CSS, active } = require("../src/modules/calendar/calendar.js");

test("the calendar is a module of its own, on by default, loaded before paint", () => {
  const cal = R.MODULES.find((m) => m.id === "calendar");
  assert.ok(cal, "calendar module");
  assert.equal(cal.defaultOn, true);
  assert.equal(cal.inject.runAt, "document_start");
  assert.deepEqual(cal.inject.js, ["src/core/registry.js", "src/modules/calendar/calendar.js"]);
});

test("the calendar follows its own switch and the site list, not dark mode", () => {
  assert.equal(active(undefined, []), true);
  assert.equal(active({ calendar: false }, []), false);
  assert.equal(active({ dark: false }, []), true, "works in light mode");
  assert.equal(active({ calendar: true }, ["*.instructure.com"], "uib.instructure.com"), false);
});

test("light colours are the default and dark ones follow Dark Reader", () => {
  assert.match(CSS, /^\s*#minical\s*\{[^}]*--cjc-surface:/m, "light tokens on #minical");
  assert.match(CSS, /html\[data-darkreader-scheme="dark"\] #minical\s*\{[^}]*--cjc-surface:/, "dark tokens");
});

