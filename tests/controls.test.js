const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/lib/themes.js");
const K = require("../src/lib/controls.js");

// Just enough of a DOM element for the controls: props, attributes and listeners.
function fakeEl(tag, props = {}, ...kids) {
  const listeners = {};
  const attrs = {};
  return Object.assign({
    tag, kids: kids.filter((k) => k != null), attrs, listeners,
    setAttribute: (k, v) => { attrs[k] = v; },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
  }, props);
}
const t = (k) => `[${k}]`;
const dark = { id: "dark", choice: { key: "darkMode", values: ["system", "always"] } };

test("choiceValue keeps a known value and falls back to the first one", () => {
  assert.equal(K.choiceValue(dark.choice, "always"), "always");
  assert.equal(K.choiceValue(dark.choice, "bogus"), "system");
  assert.equal(K.choiceValue(dark.choice, undefined), "system");
});

test("choiceSelect lists the module's values with their labels and saves on change", () => {
  const saved = [];
  const select = K.choiceSelect({ el: fakeEl, t }, dark, "bogus", (v) => saved.push(v), { className: "x" });
  assert.deepEqual(select.kids.map((o) => [o.value, o.textContent]), [["system", "[mod_dark_system]"], ["always", "[mod_dark_always]"]]);
  assert.equal(select.value, "system");
  assert.equal(select.className, "x");
  assert.equal(select.attrs["aria-label"], "[mod_dark]");
  select.value = "always";
  select.fire("change");
  assert.deepEqual(saved, ["always"]);
});

test("colorInput saves once dragging pauses, and at once on change", async () => {
  const saved = [];
  const theme = { id: "theme", color: { key: "themeColor", when: "custom" } };
  const input = K.colorInput({ el: fakeEl, t }, theme, "#123456", (v) => saved.push(v), { delay: 5 });
  assert.equal(input.type, "color");
  assert.equal(input.value, "#123456");
  assert.equal(input.attrs["aria-label"], "[mod_theme_color]");
  input.value = "#111111"; input.fire("input");
  input.value = "#222222"; input.fire("input");
  assert.deepEqual(saved, [], "nothing saved mid-drag");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(saved, ["#222222"], "one save after the pause");
  input.value = "#333333"; input.fire("input"); input.fire("change");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(saved, ["#222222", "#333333"], "change saves and cancels the pending save");
});
