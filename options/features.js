// Feature cards: one per module, with an on/off switch and the module's own settings.
"use strict";

const LINE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const FEATURE_ICONS = {
  jump: `<svg viewBox="0 0 24 24"><path ${LINE} d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>`,
  deadlines: (globalThis.CJ.icons || {}).calendarClock,
  dark: `<svg viewBox="0 0 24 24"><path ${LINE} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><rect ${LINE} x="3.5" y="5" width="17" height="15" rx="2"/><path ${LINE} d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/></svg>`,
  theme: `<svg viewBox="0 0 24 24"><path ${LINE} d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.2-4-7.7-9-7.7Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8" r="1.2" fill="currentColor"/></svg>`,
};

// The live controls per module, so changes made elsewhere (Canvas' menu switch, the
// palette) show up here without redrawing the cards.
const featureControls = new Map();

async function saveModule(id, on) {
  const { modules: cur = {} } = await chrome.storage.sync.get("modules");
  await chrome.storage.sync.set({ modules: Object.assign({}, cur, { [id]: on }) });
}

/** Save one setting and say how it went in the card's status line. */
async function saveSetting(status, key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
    flash(status, t("opt_saved"));
  } catch (e) {
    console.warn(`Plus could not save ${key}:`, e);
    flash(status, t("opt_saveError"), true);
  }
}

/** A select for a module's one setting (like dark mode's "follow the system"). */
async function renderChoice(m, status) {
  const { key } = m.choice;
  const stored = (await chrome.storage.sync.get(key))[key];
  return CJ.controls.choiceSelect({ el, t }, m, stored, (v) => saveSetting(status, key, v));
}

/** A colour picker for a module's own colour (the colour theme's "your colour"). */
async function renderColor(m, status) {
  const { key } = m.color;
  const stored = (await chrome.storage.sync.get(key))[key];
  return CJ.controls.colorInput({ el, t }, m, stored, (v) => saveSetting(status, key, v), { className: "color" });
}

/** The palette card shows its keys and where to change them. */
async function renderKeys() {
  const change = el("button", { type: "button", className: "link", textContent: t("opt_howShortcut") });
  change.addEventListener("click", openShortcuts);
  return el("div", { className: "keys" },
    el("kbd", { textContent: isMac ? "⌘K" : "Ctrl+K" }), el("kbd", { textContent: await actionShortcut() }), change);
}

async function renderCard(m, on) {
  const titleId = `feat-${m.id}`;
  const toggle = el("input", { type: "checkbox", className: "switch", checked: on });
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-labelledby", titleId);
  const status = el("span", { className: "msg", role: "status" });
  const select = m.choice ? await renderChoice(m, status) : null;
  const picker = m.color ? await renderColor(m, status) : null;
  const extra = select ? el("div", { className: "row" }, select, picker) : m.id === "jump" ? await renderKeys() : null;
  const card = el("article", { className: "card" },
    el("div", { className: "card-head" },
      FEATURE_ICONS[m.id] ? svg(FEATURE_ICONS[m.id]) : null,
      el("h3", { id: titleId, textContent: t(`mod_${m.id}`) }),
      toggle),
    el("p", { className: "dim", textContent: t(`mod_${m.id}_desc`) }),
    extra ? el("div", { className: "card-extra" }, extra) : null,
    status);

  const sync = () => {
    card.classList.toggle("off", !toggle.checked);
    if (select) select.disabled = !toggle.checked;
    if (picker) {
      picker.hidden = select.value !== m.color.when;
      picker.disabled = !toggle.checked;
    }
  };
  if (select && picker) select.addEventListener("change", sync);
  toggle.addEventListener("change", async () => {
    sync();
    try {
      await saveModule(m.id, toggle.checked);
      flash(status, t("opt_saved"));
    } catch (e) {
      console.warn("Plus could not save features:", e);
      toggle.checked = !toggle.checked;
      sync();
      flash(status, t("opt_saveError"), true);
    }
  });
  sync();
  featureControls.set(m.id, { toggle, select, picker, sync });
  return card;
}

/** Reflect settings changed outside this page. */
function updateFeatures(changes) {
  if (changes.modules) {
    const on = CJ.registry.enabled(changes.modules.newValue);
    for (const [id, c] of featureControls) { c.toggle.checked = on[id]; c.sync(); }
  }
  for (const m of CJ.registry.MODULES) {
    const c = featureControls.get(m.id);
    if (!m.choice || !c || !c.select || !changes[m.choice.key]) continue;
    const v = changes[m.choice.key].newValue;
    c.select.value = CJ.controls.choiceValue(m.choice, v);
    c.sync();
  }
  for (const m of CJ.registry.MODULES) {
    const c = featureControls.get(m.id);
    if (m.color && c && c.picker && changes[m.color.key]) c.picker.value = CJ.themes.color(changes[m.color.key].newValue);
  }
}

async function renderFeatures() {
  const { modules } = await chrome.storage.sync.get("modules");
  const on = CJ.registry.enabled(modules);
  const cards = [];
  for (const m of CJ.registry.MODULES) cards.push(await renderCard(m, on[m.id]));
  $("#features").replaceChildren(...cards);
}
