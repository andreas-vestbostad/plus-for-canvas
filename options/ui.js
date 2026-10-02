// Small helpers shared by the settings page scripts.
"use strict";
const t = (k, subs) => chrome.i18n.getMessage(k, subs) || k;
const $ = (s) => document.querySelector(s);
const isMac = /Mac/.test(navigator.platform);

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
}

/** Static SVG markup (from this extension, never from a page) as an element. */
function svg(markup) {
  const box = el("span", { className: "icon" });
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = markup;
  return box;
}

function flash(node, text, isErr) {
  node.textContent = text;
  node.classList.toggle("err", !!isErr);
  clearTimeout(node._t);
  node._t = setTimeout(() => (node.textContent = ""), 3500);
}

/** Fill a node with a message where $1, $2 ... become <kbd>/<code> elements. */
function fillWithTokens(node, key, tokens, tag = "kbd") {
  const marks = tokens.map((_, i) => `§${i}§`);
  const parts = t(key, marks).split(/§(\d)§/);
  node.textContent = "";
  parts.forEach((p, i) => node.append(i % 2 ? el(tag, { textContent: tokens[+p] }) : p));
}

/** The shortcut Chrome has for the toolbar button, or "…" when none is set. */
async function actionShortcut() {
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === "_execute_action");
    if (c) return c.shortcut || "…";
  } catch (e) {
    console.warn("Plus could not read shortcuts:", e);
  }
  return "Alt+J";
}

const openShortcuts = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
