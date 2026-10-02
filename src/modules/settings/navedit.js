// "Customize the menu" in the Plus settings tray: every item in Canvas' menu with a
// switch to show or hide it, up/down buttons and dragging to reorder, and a reset.
// Hiding Plus itself asks first and says how to get it back. The layout lives in
// navlayout.js (CJ.navLayout); this only draws the controls.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-navedit";
  // Pixels the pointer moves before a press on a row becomes a drag.
  const DRAG_START = 4;
  const STYLE = `
    .${ID} { margin-top: 24px; padding-top: 16px; border-top: 1px solid #c7cdd1; }
    .${ID} h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 700; }
    .${ID}-sub { margin: 0 0 8px; color: #6b7780; font-size: .875rem; }
    .${ID}-list { list-style: none; margin: 0; padding: 0; }
    .${ID}-list > li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #e8eaec; }
    .${ID}-list > li[data-nav-id] { position: relative; background: #fff; cursor: grab; user-select: none; transition: transform .15s ease; }
    .${ID}-list > li.is-dragging { z-index: 1; cursor: grabbing; transition: none; box-shadow: 0 4px 12px rgba(0, 0, 0, .18); border-radius: 4px; }
    .${ID}-grip { flex: none; width: 16px; color: #8b969e; text-align: center; touch-action: none; }
    .${ID}-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${ID}-off .${ID}-label { color: #6b7780; text-decoration: line-through; }
    .${ID}-move { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: none; color: inherit; cursor: pointer; font-size: 14px; }
    .${ID}-move:hover:not(:disabled) { background: rgba(0, 0, 0, .06); }
    .${ID}-move:disabled { opacity: .3; cursor: default; }
    .${ID}-warn { margin: 4px 0 8px; padding: 12px; border: 1px solid #fc5e13; border-radius: 6px; background: #fef0e8; font-size: .875rem; }
    .${ID}-warn p { margin: 0 0 8px; }
    .${ID}-warn button { margin-right: 8px; padding: 4px 10px; border: 1px solid #c7cdd1; border-radius: 4px; background: #fff; color: #273540; font: inherit; cursor: pointer; }
    .${ID}-warn button.is-primary { border-color: #d01a19; background: #d01a19; color: #fff; }
    .${ID}-reset { margin-top: 12px; padding: 0; border: 0; background: none; color: var(--cj-accent, #2b7abc); font: inherit; cursor: pointer; }
    .${ID}-reset:hover { text-decoration: underline; }
  `;

  /**
   * The section's controls. `switchClass` is the settings tray's switch style, `onError` is
   * called when a change cannot be saved, `rerender` redraws the tray.
   */
  function create({ t, isMac, el, switchClass, onError, rerender }) {
    const N = CJ.navorder;
    let confirming = null;
    const style = el("style", { id: `${ID}-style`, textContent: STYLE });
    document.head.append(style);

    const layoutApi = () => CJ.navLayout;

    function save(next) {
      const L = layoutApi();
      if (!L) return;
      confirming = null;
      L.save(next).catch((e) => { console.warn("Plus could not save the menu:", e); onError(); });
      rerender();
    }

    const moveTo = (id, index) => { const L = layoutApi(); save(N.moveTo(L.get(), L.present(), id, index)); };

    function toggle(item) {
      const L = layoutApi();
      if (!item.hidden && N.needsWarning(item.id)) {
        confirming = item.id;
        rerender();
        return;
      }
      save(N.toggleHidden(L.get(), item.id));
    }

    function warning(item) {
      const yes = el("button", { type: "button", className: "is-primary", textContent: t("nav_hideAnyway") });
      // The warning goes away on either answer; focus goes back to the item's switch.
      yes.dataset.focus = `nav-show-${item.id}`;
      yes.addEventListener("click", () => save(N.toggleHidden(layoutApi().get(), item.id)));
      const no = el("button", { type: "button", textContent: t("nav_cancel") });
      no.dataset.focus = `nav-show-${item.id}`;
      no.addEventListener("click", () => { confirming = null; rerender(); });
      const box = el("div", { className: `${ID}-warn` },
        el("p", { textContent: t("nav_hideWarning", [isMac ? "⌘K" : "Ctrl+K"]) }), yes, no);
      box.setAttribute("role", "alert");
      return box;
    }

    // Drag a row by its grip or label: it follows the pointer and the rows it passes make
    // room, and the menu is saved in the new order on release. Escape puts it back. The
    // up/down buttons do the same from the keyboard.
    function dragAndDrop(li, item, index) {
      li.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button")) return;
        if (e.pointerType !== "mouse" && !e.target.closest(`.${ID}-grip`)) return;
        e.preventDefault();
        const others = [...li.parentNode.children].filter((r) => r !== li && r.dataset.navId);
        const mids = others.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
        const box = li.getBoundingClientRect();
        const startY = e.clientY;
        let started = false, target = index;
        li.setPointerCapture(e.pointerId);

        function shift(to) {
          others.forEach((r, j) => {
            const dy = j >= to && j < index ? box.height : j >= index && j < to ? -box.height : 0;
            r.style.transform = dy ? `translateY(${dy}px)` : "";
          });
        }
        function finish(drop) {
          li.removeEventListener("pointermove", onMove);
          li.removeEventListener("pointerup", onUp);
          li.removeEventListener("pointercancel", onCancel);
          document.removeEventListener("keydown", onKey, true);
          if (li.hasPointerCapture(e.pointerId)) li.releasePointerCapture(e.pointerId);
          li.classList.remove("is-dragging");
          for (const r of [li, ...others]) r.style.transform = "";
          if (drop && started && target !== index) moveTo(item.id, target);
        }
        function onMove(ev) {
          const dy = ev.clientY - startY;
          if (!started && Math.abs(dy) < DRAG_START) return;
          started = true;
          li.classList.add("is-dragging");
          li.style.transform = `translateY(${dy}px)`;
          const next = N.dropIndex(mids, box.top + box.height / 2 + dy);
          if (next !== target) { target = next; shift(target); }
        }
        const onUp = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); finish(false); } };
        li.addEventListener("pointermove", onMove);
        li.addEventListener("pointerup", onUp);
        li.addEventListener("pointercancel", onCancel);
        document.addEventListener("keydown", onKey, true);
      });
    }

    function row(item, index, count) {
      const up = el("button", { type: "button", className: `${ID}-move`, textContent: "↑", disabled: index === 0 });
      const down = el("button", { type: "button", className: `${ID}-move`, textContent: "↓", disabled: index === count - 1 });
      up.setAttribute("aria-label", t("nav_up", [item.label]));
      down.setAttribute("aria-label", t("nav_down", [item.label]));
      up.dataset.focus = `nav-up-${item.id}`;
      down.dataset.focus = `nav-down-${item.id}`;
      up.addEventListener("click", () => moveTo(item.id, index - 1));
      down.addEventListener("click", () => moveTo(item.id, index + 1));
      const shown = el("button", { type: "button", className: switchClass, disabled: item.locked });
      shown.setAttribute("role", "switch");
      shown.setAttribute("aria-checked", String(!item.hidden));
      shown.setAttribute("aria-label", t("nav_show", [item.label]));
      if (item.locked) shown.title = t("nav_locked");
      shown.dataset.focus = `nav-show-${item.id}`;
      shown.addEventListener("click", () => toggle(item));
      const grip = el("span", { className: `${ID}-grip`, textContent: "⋮⋮" });
      grip.setAttribute("aria-hidden", "true");
      const li = el("li", { className: item.hidden ? `${ID}-off` : "" },
        grip, el("span", { className: `${ID}-label`, textContent: item.label }), up, down, shown);
      li.dataset.navId = item.id;
      dragAndDrop(li, item, index);
      return li;
    }

    /** The section for the tray, or null when the menu layout is not running. */
    function render() {
      const L = layoutApi();
      if (!L) return null;
      const items = L.list();
      const rows = [];
      items.forEach((item, i) => {
        rows.push(row(item, i, items.length));
        if (confirming === item.id) rows.push(el("li", {}, warning(item)));
      });
      const reset = el("button", { type: "button", className: `${ID}-reset`, textContent: t("nav_reset") });
      reset.dataset.focus = "nav-reset";
      reset.addEventListener("click", () => save(N.reset()));
      return el("section", { className: ID },
        el("h3", { textContent: t("nav_title") }),
        el("p", { className: `${ID}-sub`, textContent: t("nav_sub") }),
        el("ul", { className: `${ID}-list` }, ...rows),
        reset);
    }

    return { render, destroy() { style.remove(); } };
  }

  CJ.navEdit = { create };
})();
