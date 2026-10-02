const test = require("node:test");
const assert = require("node:assert/strict");
const { isDark, flipped } = require("../src/modules/dark/toggle.js");
const R = require("../src/core/registry.js");

test("the page is dark when the mode says so, or when following a dark system", () => {
  assert.equal(isDark("on", false), true);
  assert.equal(isDark("off", true), false);
  assert.equal(isDark("auto", true), true);
  assert.equal(isDark("auto", false), false);
  assert.equal(isDark(undefined, true), true, "unset follows the system");
});

test("a flip goes to the opposite of what the page shows now", () => {
  assert.deepEqual(flipped(true, "on", false), { moduleOn: true, mode: "off" });
  assert.deepEqual(flipped(true, "off", true), { moduleOn: true, mode: "on" });
  assert.deepEqual(flipped(true, "auto", true), { moduleOn: true, mode: "off" });
  assert.deepEqual(flipped(true, "auto", false), { moduleOn: true, mode: "on" });
});

test("flipping with the feature off turns it on, dark", () => {
  // The page is light while the feature is off, whatever the stored mode says.
  assert.deepEqual(flipped(false, "auto", true), { moduleOn: true, mode: "on" });
  assert.deepEqual(flipped(false, "off", false), { moduleOn: true, mode: "on" });
});

test("the switch loads with the core scripts and the settings offer a light mode", () => {
  assert.ok(R.CORE_FILES.includes("src/modules/dark/toggle.js"));
  assert.ok(R.CORE_FILES.indexOf("src/modules/dark/toggle.js") < R.CORE_FILES.indexOf("src/content.js"), "defined before the loader starts modules");
  assert.deepEqual(R.MODULES.find((m) => m.id === "dark").choice.values, ["auto", "on", "off"]);
});
