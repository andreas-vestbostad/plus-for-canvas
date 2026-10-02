// Settings tray: a "Plus" item in Canvas' global navigation that opens a tray with the
// feature switches and their settings, so they can be changed without leaving Canvas.
// Below them, "Customize the menu" (navedit.js). Always running while Plus is on for the
// site (the loader starts it, not a switch), and reachable from the palette and the Account
// tray (account.js) even when its menu item is hidden.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-settings";
  const STYLE = `
    .${ID}-sub { margin: 0 0 8px; color: #6b7780; font-size: .875rem; }
    .${ID}-list { list-style: none; margin: 0; padding: 0; }
    .${ID}-list li { padding: 14px 0; border-bottom: 1px solid #e8eaec; }
    .${ID}-row { display: flex; align-items: center; gap: 12px; }
    .${ID}-row label { flex: 1; min-width: 0; margin: 0; font-size: 1rem; font-weight: 700; cursor: pointer; }
    .${ID}-desc { margin: 4px 0 0; font-size: .875rem; color: #6b7780; }
    .${ID}-off .${ID}-desc, .${ID}-off select { opacity: .6; }
    /* Canvas styles buttons and form controls broadly, so the switch is pinned down with an
       id selector and !important. */
    #${ID}-tray .${ID}-switch { all: unset; box-sizing: border-box !important; position: relative !important; display: inline-block !important;
      flex: none !important; width: 40px !important; height: 24px !important; margin: 0 !important; padding: 0 !important;
      border: 0 !important; border-radius: 12px !important; background: #c7cdd1 !important; cursor: pointer !important; transition: background .15s; }
    #${ID}-tray .${ID}-switch::after { content: "" !important; position: absolute !important; top: 3px !important; left: 3px !important;
      width: 18px !important; height: 18px !important; border-radius: 50% !important; background: #fff !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .25) !important; transition: transform .15s; }
    #${ID}-tray .${ID}-switch[aria-checked="true"] { background: var(--cj-accent, #2f6fb3) !important; }
    #${ID}-tray .${ID}-switch[aria-checked="true"]::after { transform: translateX(16px) !important; }
    #${ID}-tray .${ID}-switch:disabled { opacity: .4 !important; cursor: default !important; }
    #${ID}-tray .${ID}-switch:focus-visible { outline: 2px solid var(--cj-accent, #2f6fb3) !important; outline-offset: 2px !important; }
    @media (prefers-reduced-motion: reduce) { #${ID}-tray .${ID}-switch, #${ID}-tray .${ID}-switch::after { transition: none !important; } }
    .${ID}-pick { display: flex; align-items: stretch; gap: 8px; margin: 8px 0 0; }
    .${ID}-select { margin: 0; font: inherit; font-size: .875rem; }
    /* Canvas' own input styles (height, padding, margin) squash the swatch into a line, hence the
       id selector and !important. Stretched to the height of the select beside it. */
    #${ID}-tray .${ID}-color { -webkit-appearance: none !important; appearance: none !important; box-sizing: border-box !important; flex: none !important;
      width: 44px !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 3px !important;
      border: 1px solid #c7cdd1 !important; border-radius: 6px !important; background: #fff !important; box-shadow: none !important; cursor: pointer !important; }
    #${ID}-tray .${ID}-color:hover { border-color: #8b969e !important; }
    #${ID}-tray .${ID}-color:disabled { opacity: .4 !important; cursor: default !important; }
    #${ID}-tray .${ID}-color:focus-visible { outline: 2px solid var(--cj-accent, #2f6fb3) !important; outline-offset: 2px !important; }
    .${ID}-color::-webkit-color-swatch-wrapper { padding: 0; }
    .${ID}-color::-webkit-color-swatch { border: 0; border-radius: 4px; }
    .${ID}-color::-moz-color-swatch { border: 0; border-radius: 4px; }
    .${ID}-all { margin-top: 16px; padding: 0; border: 0; background: none; color: var(--cj-accent, #2b7abc); font: inherit; cursor: pointer; }
    .${ID}-all:hover { text-decoration: underline; }
    .${ID}-err { margin: 8px 0 0; color: #d01a19; font-size: .875rem; }
  `;

  // Other modules (the palette) open the tray with this event.
  const OPEN_EVENT = "cj:open-settings";

  CJ.registry.define("settings", function init({ t, isMac }) {
    const { el } = CJ.nav;
    const { MODULES, enabled } = CJ.registry;
    const KEYS = ["modules", "navLayout"].concat(
      MODULES.filter((m) => m.choice).map((m) => m.choice.key),
      MODULES.filter((m) => m.color).map((m) => m.color.key));
    let stored = {}, error = false;

    const nav = CJ.nav.tray({
      id: ID, label: "Plus", title: t("set_title"), closeLabel: t("dl_close"), icon: CJ.icons.settings,
      before: "global_nav_help_link", onOpen,
    });
    if (!nav) return {};
    const { tray } = nav;
    const style = el("style", { id: `${ID}-style`, textContent: STYLE });
    document.head.append(style);
    const navEdit = CJ.navEdit.create({
      t, isMac, el, switchClass: `${ID}-switch`,
      onError() { error = true; render(); },
      rerender: () => render(),
    });

    async function save(change) {
      // Apply at once, so a second switch flipped before storage answers builds on this one.
      stored = Object.assign({}, stored, change);
      render();
      try {
        await chrome.storage.sync.set(change);
        error = false;
      } catch (e) {
        console.warn("Plus could not save a setting:", e);
        error = true;
        render();
      }
    }

    function choice(m, on) {
      const { key } = m.choice;
      const select = CJ.controls.choiceSelect({ el, t }, m, stored[key], (v) => save({ [key]: v }),
        { className: `${ID}-select`, disabled: !on });
      select.dataset.focus = `choice-${m.id}`;
      return select;
    }

    /** The colour picker for a module's own colour, while its choice asks for one. */
    function colorPicker(m, on) {
      const { key, when } = m.color;
      if (stored[m.choice.key] !== when) return null;
      // Saved while dragging too (once it pauses), so the page follows along. Not through
      // save(): redrawing the tray would take the picker away mid-drag.
      const saveColor = async (value) => {
        stored = Object.assign({}, stored, { [key]: value });
        try {
          await chrome.storage.sync.set({ [key]: value });
        } catch (e) {
          console.warn("Plus could not save a colour:", e);
          error = true;
          render();
        }
      };
      const input = CJ.controls.colorInput({ el, t }, m, stored[key], saveColor, { className: `${ID}-color`, disabled: !on });
      input.dataset.focus = `color-${m.id}`;
      return input;
    }

    function row(m, on) {
      const inputId = `${ID}-${m.id}`;
      const toggle = el("button", { type: "button", id: inputId, className: `${ID}-switch` });
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", String(on));
      toggle.setAttribute("aria-labelledby", `${inputId}-label`);
      toggle.dataset.focus = `switch-${m.id}`;
      toggle.addEventListener("click", () => {
        const modules = Object.assign({}, stored.modules, { [m.id]: !on });
        save({ modules });
      });
      return el("li", { className: on ? "" : `${ID}-off` },
        el("div", { className: `${ID}-row` }, el("label", { id: `${inputId}-label`, htmlFor: inputId, textContent: t(`mod_${m.id}`) }), toggle),
        el("p", { className: `${ID}-desc`, textContent: t(`mod_${m.id}_short`) }),
        m.choice ? el("div", { className: `${ID}-pick` }, choice(m, on), m.color ? colorPicker(m, on) : null) : null);
    }

    function render() {
      if (!nav.isOpen()) return;
      // Re-rendering replaces the controls; keep keyboard focus on the same one.
      const focused = document.activeElement && tray.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
      const on = enabled(stored.modules);
      const all = el("button", { type: "button", className: `${ID}-all`, textContent: t("set_all") });
      all.addEventListener("click", () => {
        nav.setOpen(false);
        chrome.runtime.sendMessage({ type: "cj:openOptions" }).catch(() => {});
      });
      tray.replaceChildren(
        nav.head(t("set_title")),
        el("p", { className: `${ID}-sub`, textContent: t("set_sub") }),
        el("ul", { className: `${ID}-list` }, ...MODULES.map((m) => row(m, on[m.id]))),
        ...(error ? [el("p", { className: `${ID}-err`, textContent: t("opt_saveError") })] : []),
        navEdit.render(),
        el("div", {}, all));
      const again = focused && tray.querySelector(`[data-focus="${focused}"]`);
      if (again) again.focus();
    }

    async function onOpen() {
      try {
        stored = await chrome.storage.sync.get(KEYS);
      } catch (e) {
        console.warn("Plus could not read settings:", e);
      }
      render();
      const first = tray.querySelector(`.${ID}-switch`) || tray.querySelector(".cj-tray-close");
      if (first) first.focus();
    }

    const onStorage = (changes, area) => {
      // Skip what this tray saved itself (a colour being dragged), so the picker stays open.
      if (area !== "sync" || !KEYS.some((k) => changes[k] && changes[k].newValue !== stored[k])) return;
      stored = Object.assign({}, stored);
      for (const k of KEYS) if (changes[k]) stored[k] = changes[k].newValue;
      render();
    };
    chrome.storage.onChanged.addListener(onStorage);

    // Wait a moment, so a tray that is closing (Account) does not take the focus back.
    let pending = null;
    const open = () => {
      clearTimeout(pending);
      pending = setTimeout(openNow, 0);
    };
    const openNow = () => {
      if (nav.isOpen()) { const c = tray.querySelector(".cj-tray-close"); if (c) c.focus(); } else nav.setOpen(true);
    };
    document.addEventListener(OPEN_EVENT, open);
    const stopAccount = CJ.accountLink.start({ t, el });

    return {
      stop() {
        try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
        document.removeEventListener(OPEN_EVENT, open);
        clearTimeout(pending);
        stopAccount();
        navEdit.destroy();
        nav.remove();
        style.remove();
      },
    };
  });
})();
