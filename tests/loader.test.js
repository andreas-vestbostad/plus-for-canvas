const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { CORE_FILES } = require("../src/core/registry.js");

/** Run the content scripts in their manifest order inside a fake page. */
function page(syncData = {}, host = "canvas.test", pathname = "/courses/1") {
  const local = {};
  const listeners = { keydown: [], message: [], storage: [] };
  const sync = Object.assign({}, syncData);
  const chrome = {
    runtime: { id: "x", onMessage: { addListener: (f) => listeners.message.push(f) }, sendMessage: async () => {} },
    i18n: { getMessage: (k) => k },
    storage: {
      sync: { get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, sync[k]])) },
      local: { get: async () => ({}), set: async (o) => { Object.assign(local, o); }, remove: async () => {} },
      onChanged: {
        addListener: (f) => listeners.storage.push(f),
        removeListener: (f) => { listeners.storage = listeners.storage.filter((g) => g !== f); },
      },
    },
  };
  const window = {
    addEventListener: (type, f) => type === "keydown" && listeners.keydown.push(f),
    removeEventListener: (type, f) => { listeners.keydown = listeners.keydown.filter((g) => g !== f); },
  };
  const sandbox = { chrome, window, navigator: { platform: "MacIntel" }, location: { host, pathname },
    document: { title: "Oblig 2", getElementById: () => null, querySelector: () => null }, console, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const inject = () => {
    for (const f of CORE_FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });
  };
  inject();
  const settle = () => new Promise((r) => setImmediate(r));
  const change = (key, value) => listeners.storage.forEach((f) => f({ [key]: { newValue: value } }, "sync"));
  const changeModules = (value) => listeners.storage.forEach((f) => f({ modules: { newValue: value } }, "sync"));
  const toggle = () => new Promise((reply) => listeners.message.forEach((f) => f({ type: "cj:toggle" }, {}, reply)));
  return { listeners, settle, change, changeModules, toggle, inject, chrome, local };
}

test("the palette starts by default", async () => {
  const p = page();
  await p.settle();
  assert.equal(p.listeners.keydown.length, 1);
});

test("a module that is turned off does not start, and starts when turned on", async () => {
  const p = page({ modules: { jump: false } });
  await p.settle();
  assert.equal(p.listeners.keydown.length, 0);
  assert.equal((await p.toggle()).ok, false, "toolbar button reports that the palette is off");
  p.changeModules({ jump: true });
  assert.equal(p.listeners.keydown.length, 1);
  p.changeModules({ jump: false });
  assert.equal(p.listeners.keydown.length, 0);
});

test("a change that lands before the first settings read wins", async () => {
  const p = page({ modules: { jump: true } });
  p.changeModules({ jump: false });
  await p.settle();
  assert.equal(p.listeners.keydown.length, 0);
});

test("a second copy in the same page does not start twice", async () => {
  const p = page();
  await p.settle();
  p.inject();
  await p.settle();
  assert.equal(p.listeners.keydown.length, 1);
});

test("a fresh copy takes over from one orphaned by an extension update", async () => {
  const p = page();
  await p.settle();
  delete p.chrome.runtime.id;
  p.inject();
  p.chrome.runtime.id = "y";
  await p.settle();
  assert.equal(p.listeners.keydown.length, 2, "both listen until the old one sees a key");
  const [oldKey, newKey] = p.listeners.keydown;
  p.chrome.runtime.id = undefined;
  oldKey({ key: "a" });
  assert.deepEqual(p.listeners.keydown, [newKey]);
});

test("nothing starts on a built-in site the user removed, and it comes back when added", async () => {
  const p = page({ disabledHosts: ["mitt.uib.no"] }, "mitt.uib.no");
  await p.settle();
  assert.equal(p.listeners.keydown.length, 0);
  p.change("disabledHosts", []);
  assert.equal(p.listeners.keydown.length, 1);
  p.change("disabledHosts", ["mitt.uib.no"]);
  assert.equal(p.listeners.keydown.length, 0);
});

test("removing another site leaves this one running", async () => {
  const p = page({ disabledHosts: ["*.instructure.com"] }, "mitt.uib.no");
  await p.settle();
  assert.equal(p.listeners.keydown.length, 1);
});

test("Canvas+ Home remembers pages inside a course, not its front page", async () => {
  const inside = page({}, "canvas.test", "/courses/7/assignments/3");
  await inside.settle();
  assert.equal(inside.local["cj:canvas.test:places"][7].url, "/courses/7/assignments/3");
  assert.equal(inside.local["cj:canvas.test:places"][7].label, "Oblig 2");
  const front = page();
  await front.settle();
  assert.equal(front.local["cj:canvas.test:places"], undefined);
  const off = page({ modules: { home: false } }, "canvas.test", "/courses/7/modules");
  await off.settle();
  assert.equal(off.local["cj:canvas.test:places"], undefined, "not while the module is off");
});
