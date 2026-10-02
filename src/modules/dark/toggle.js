// Dark mode switch: a "Dark mode" item in Canvas' global navigation that flips the page
// between dark and light, and the flip() the palette's "dark" command uses. It only writes
// the setting; dark.js (loaded early in every frame) re-themes the page when it changes.
(function (root) {
  "use strict";

  /** Whether the page is dark for a mode ("auto" follows the system; unknown means "auto"). */
  function isDark(mode, systemDark) {
    if (mode === "on") return true;
    if (mode === "off") return false;
    return !!systemDark;
  }

  /** The settings a flip writes: dark if the page is light now, light if it is dark. */
  function flipped(moduleOn, mode, systemDark) {
    const dark = moduleOn && isDark(mode, systemDark);
    return { moduleOn: true, mode: dark ? "off" : "on" };
  }

  if (typeof module !== "undefined") {
    module.exports = { isDark, flipped };
    return;
  }

  const CJ = root.CJ;
  const ID = "cj-darknav";
  const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

  // Drawn to sit next to Canvas' line icons. Static markup, never from the page.
  const ICON_ATTRS = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const LINE = 'style="fill:none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const MOON = `<svg ${ICON_ATTRS}><path ${LINE} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;
  const SUN = `<svg ${ICON_ATTRS}><circle ${LINE} cx="12" cy="12" r="4"/><path ${LINE} d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`;

  /** Flip the page between dark and light, turning the dark mode feature on if it was off. */
  async function flip() {
    const { modules = {}, darkMode } = await chrome.storage.sync.get(["modules", "darkMode"]);
    const moduleOn = CJ.registry.enabled(modules).dark;
    const next = flipped(moduleOn, darkMode, systemQuery().matches);
    const change = { darkMode: next.mode };
    if (!moduleOn) change.modules = Object.assign({}, modules, { dark: true });
    await chrome.storage.sync.set(change);
  }

  CJ.theme = { isDark, flipped, flip };

  CJ.registry.define("dark", function init({ t }) {
    const nav = CJ.nav.item({ id: ID, label: t("dark_nav"), after: "cj-deadlines-link", before: "cj-settings-link" });
    if (!nav) return {};
    const { button } = nav;

    let mode = null;
    const query = systemQuery();
    function render() {
      const dark = isDark(mode, query.matches);
      nav.setIcon(dark ? SUN : MOON);
      button.setAttribute("aria-pressed", String(dark));
      button.title = t(dark ? "dark_toLight" : "dark_toDark");
    }

    const onClick = () => flip().catch((e) => console.warn("Plus could not switch dark mode:", e));
    const onStorage = (changes, area) => {
      if (area !== "sync" || !changes.darkMode) return;
      mode = changes.darkMode.newValue;
      render();
    };
    button.addEventListener("click", onClick);
    query.addEventListener("change", render);
    chrome.storage.onChanged.addListener(onStorage);
    render();
    chrome.storage.sync.get("darkMode").then(({ darkMode }) => {
      if (mode === null) { mode = darkMode; render(); }
    }, (e) => console.warn("Plus could not read dark mode settings:", e));

    return {
      stop() {
        query.removeEventListener("change", render);
        try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
        nav.remove();
      },
    };
  });
})(globalThis);
