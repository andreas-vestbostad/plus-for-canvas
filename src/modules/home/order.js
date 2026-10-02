// Home+: putting the course cards in your own order, by dragging a card's handle or
// with the arrow keys on it.
(function () {
  "use strict";
  const CJ = globalThis.CJ;
  const ID = "cj-home";
  // Room around the drag image, so the tilted card's corners are not cut off (.cj-home-ghost).
  const GHOST_PAD = 16;

  /**
   * getRoot() is the page, getOrder() / setOrder(next) the stored order (setOrder redraws),
   * render() redraws once a drag has ended.
   */
  CJ.homeOrder = function ({ api, t, el, getRoot, getOrder, setOrder, render }) {
    // The course whose card is being dragged. Redraws wait until the drag ends, since a redraw
    // takes the dragged card away and the browser then never says the drag ended.
    let dragging = null, redraw = false;

    /** Put the cards in this order (course ids) from now on; null goes back to the automatic order. */
    function save(ids) {
      const next = ids ? CJ.home.reorder(getOrder(), ids) : {};
      setOrder(next);
      api.updateMine("homeOrder", () => next).catch((e) => console.warn("Home+ could not save the order:", e));
    }

    /** Move a card to `index` among the cards shown, keeping focus on its handle. */
    function moveCard(id, index) {
      const ids = [...getRoot().querySelectorAll(`.${ID}-course`)].map((li) => li.dataset.id);
      const from = ids.indexOf(id);
      const to = Math.max(0, Math.min(ids.length - 1, index));
      if (from < 0 || from === to) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      save(ids);
      const g = getRoot() && getRoot().querySelector(`[data-grip="${CSS.escape(id)}"]`);
      if (g) g.focus();
    }

    /**
     * The handle that moves a card: drag it onto another card (the card goes before or after it,
     * whichever half you drop on), or focus it and use the arrow keys.
     */
    function grip(c, li) {
      const id = String(c.id);
      const label = t("home_move", [c.short || c.name]);
      const b = el("button", { type: "button", className: `${ID}-grip`, innerHTML: CJ.homeStyle.GRIP, title: `${label} – ${t("home_moveHint")}` });
      b.setAttribute("aria-label", `${label}. ${t("home_moveHint")}`);
      b.dataset.grip = id;
      b.draggable = true;
      b.addEventListener("keydown", (e) => {
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const ids = [...getRoot().querySelectorAll(`.${ID}-course`)].map((x) => x.dataset.id);
        moveCard(id, ids.indexOf(id) + step);
      });
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        // The browser draws the drag image once, now; held where it was grabbed.
        const ghost = dragGhost(li);
        const r = li.getBoundingClientRect();
        e.dataTransfer.setDragImage(ghost, e.clientX - r.left + GHOST_PAD, e.clientY - r.top + GHOST_PAD);
        dragging = id;
        setTimeout(() => { ghost.remove(); li.classList.add("is-dragging"); });
      });
      b.addEventListener("dragend", () => { li.classList.remove("is-dragging"); endDrag(); });
      return b;
    }

    /** A tilted copy of the card, off screen, for the browser to draw as the drag image. */
    function dragGhost(li) {
      const copy = li.cloneNode(true);
      for (const x of [copy, ...copy.querySelectorAll("[id]")]) x.removeAttribute("id");
      copy.classList.remove("is-before", "is-after");
      copy.style.width = `${li.offsetWidth}px`;
      const ghost = el("div", { className: `${ID}-ghost` }, copy);
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      getRoot().append(ghost);
      return ghost;
    }

    function endDrag() {
      dragging = null;
      clearDrop();
      if (redraw) { redraw = false; render(); }
    }

    function clearDrop() {
      if (getRoot()) for (const x of getRoot().querySelectorAll(".is-before, .is-after")) x.classList.remove("is-before", "is-after");
    }

    /** Lets a card take a dragged card before or after it. */
    function dropTarget(li) {
      const after = (e) => { const r = li.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };
      li.addEventListener("dragover", (e) => {
        if (!dragging || dragging === li.dataset.id) return;
        // Canvas' own handler further up sets dropEffect to "none", and then the drop never comes.
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const a = after(e);
        if (li.classList.contains(a ? "is-after" : "is-before")) return;
        clearDrop();
        li.classList.add(a ? "is-after" : "is-before");
      });
      li.addEventListener("dragleave", (e) => { if (!li.contains(e.relatedTarget)) li.classList.remove("is-before", "is-after"); });
      li.addEventListener("drop", (e) => {
        if (!dragging || dragging === li.dataset.id) return;
        e.preventDefault();
        e.stopPropagation();
        const ids = [...getRoot().querySelectorAll(`.${ID}-course`)].map((x) => x.dataset.id);
        const from = ids.indexOf(dragging);
        let to = ids.indexOf(li.dataset.id) + (after(e) ? 1 : 0);
        if (from < to) to -= 1;
        const id = dragging;
        endDrag();
        moveCard(id, to);
      });
    }

    /** Whether a redraw must wait for the drag to end; it then happens when the drag ends. */
    function holdRender() {
      if (dragging) redraw = true;
      return !!dragging;
    }

    function reset() {
      dragging = null;
      redraw = false;
    }

    return { save, grip, dropTarget, holdRender, reset };
  };
})();
