const test = require("node:test");
const assert = require("node:assert/strict");
const { decide } = require("../src/modules/dark/dark.js");
const R = require("../src/core/registry.js");

test("dark mode follows the switch and the mode choice", () => {
  assert.equal(decide(false, "on"), "off");
  assert.equal(decide(true, "on"), "on");
  assert.equal(decide(true, "auto"), "auto");
  assert.equal(decide(true, "off"), "off", "the menu switch can keep a page light");
  assert.equal(decide(true, undefined), "auto", "defaults to following the system");
  assert.equal(decide(true, "sepia"), "auto", "unknown values fall back");
});

test("dark mode is off until you turn it on", () => {
  assert.equal(R.enabled(undefined).dark, false);
});

test("turned on, dark mode loads before paint in every frame on every Canvas domain", () => {
  const plan = R.planScripts({ custom: ["canvas.x.edu"], enabled: R.enabled({ dark: true }) });
  const dark = plan.filter((s) => s.id.startsWith("cj-dark-"));
  assert.equal(dark.length, R.BUILT_IN_HOSTS.length + 1);
  for (const s of dark) {
    assert.equal(s.runAt, "document_start");
    assert.equal(s.allFrames, true);
    assert.equal(s.matchOriginAsFallback, true, "reaches the editor's about:blank frame");
    const i = (f) => s.js.findIndex((x) => x.endsWith(f));
    assert.ok(i("keep-runtime.js") < i("darkreader.js") && i("darkreader.js") < i("dark.js"), "runtime is saved before Dark Reader loads");
  }
});
