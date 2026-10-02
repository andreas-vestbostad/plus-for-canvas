// Loader: starts the modules that are turned on, and starts or stops them when that changes.
(function () {
  "use strict";
  // After the extension is reloaded or updated, this copy stays in open tabs but can no
  // longer reach chrome.* ("Extension context invalidated").
  const alive = () => {
    try { return !!chrome.runtime.id; } catch { return false; }
  };
  // A copy from before an update shares this window. Ask it whether it still works, so a
  // fresh injection is not blocked by an orphan that has not seen a keypress yet.
  const prev = window.__canvasJump;
  if (typeof prev === "function" ? prev() : prev) return;
  window.__canvasJump = alive;

  const CJ = globalThis.CJ;
  const registry = CJ.registry;
  // Falls back to the key once orphaned.
  const t = (k, subs) => {
    try { return chrome.i18n.getMessage(k, subs) || k; } catch { return k; }
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  const running = new Map();
  const ctx = { api: CJ.canvas, t, isMac, alive, retire };

  function start(id) {
    const init = registry.impl(id);
    if (running.has(id) || !init) return;
    try {
      running.set(id, init(ctx) || {});
    } catch (e) {
      console.warn(`Plus could not start ${id}:`, e);
    }
  }

  function stop(id) {
    const mod = running.get(id);
    running.delete(id);
    try {
      if (mod && mod.stop) mod.stop();
    } catch (e) {
      console.warn(`Plus could not stop ${id}:`, e);
    }
  }

  // Always running while Plus is on for this site: the in-page settings tray and the
  // menu layout (so a hidden Plus item can always be brought back).
  const ALWAYS = ["navlayout", "settings"];

  // The latest stored modules and removed built-in sites.
  const settings = { modules: undefined, disabledHosts: [] };

  function apply() {
    const siteOn = !registry.siteOff(location.host, settings.disabledHosts);
    const on = registry.enabled(settings.modules);
    for (const id of ALWAYS) siteOn ? start(id) : stop(id);
    for (const { id } of registry.MODULES) siteOn && on[id] ? start(id) : stop(id);
  }

  // Step aside once orphaned: stop everything and allow a fresh copy to be injected.
  function retire() {
    for (const id of [...running.keys()]) stop(id);
    window.__canvasJump = null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== "cj:toggle") return;
    const jump = running.get("jump");
    if (jump && jump.toggle) jump.toggle();
    reply({ ok: !!jump });
  });

  // A change can land before the first read resolves; the read must not undo it.
  const changed = new Set();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let any = false;
    for (const k of Object.keys(settings)) {
      if (!changes[k]) continue;
      changed.add(k);
      settings[k] = changes[k].newValue || (k === "disabledHosts" ? [] : undefined);
      any = true;
    }
    if (any) apply();
  });

  chrome.storage.sync.get(Object.keys(settings)).then(
    (stored) => {
      for (const k of Object.keys(settings)) if (!changed.has(k) && stored[k] !== undefined) settings[k] = stored[k];
      apply();
    },
    (e) => {
      console.warn("Plus could not read settings, using defaults:", e);
      apply();
    },
  );
})();
