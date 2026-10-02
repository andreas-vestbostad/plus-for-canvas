// The controls for a module's own settings (dark mode's choice, the theme and its colour),
// shared by the settings tray in Canvas and the settings page. They build and listen; the
// caller decides how to save and how to report errors.
(function (root) {
  "use strict";
  const CJ = root.CJ || {};
  const themes = CJ.themes || require("./themes.js");

  // How long a dragged colour must rest before it is saved (storage.sync limits writes).
  const COLOR_SAVE_DELAY = 250;

  /** The stored value if the module offers it, else its first value. */
  const choiceValue = (choice, v) => (choice.values.includes(v) ? v : choice.values[0]);

  /** A select for m.choice, showing `value`. Calls save(value) on change. */
  function choiceSelect({ el, t }, m, value, save, props = {}) {
    const select = el("select", props,
      ...m.choice.values.map((v) => el("option", { value: v, textContent: t(`mod_${m.id}_${v}`) })));
    select.value = choiceValue(m.choice, value);
    select.setAttribute("aria-label", t(`mod_${m.id}`));
    select.addEventListener("change", () => save(select.value));
    return select;
  }

  /**
   * A colour picker for m.color, showing `value`. "input" fires while dragging: save(colour)
   * runs shortly after it pauses, so the page follows along without running into
   * storage.sync's write limits; "change" saves the final colour at once.
   */
  function colorInput({ el, t }, m, value, save, { delay = COLOR_SAVE_DELAY, ...props } = {}) {
    const input = el("input", Object.assign({ type: "color", value: themes.color(value) }, props));
    input.setAttribute("aria-label", t(`mod_${m.id}_color`));
    let timer = 0;
    const saveNow = () => {
      clearTimeout(timer);
      save(themes.color(input.value));
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(saveNow, delay);
    });
    input.addEventListener("change", saveNow);
    return input;
  }

  const api = { COLOR_SAVE_DELAY, choiceValue, choiceSelect, colorInput };
  root.CJ = Object.assign(root.CJ || {}, { controls: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
