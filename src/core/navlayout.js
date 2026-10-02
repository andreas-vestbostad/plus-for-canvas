// Menu layout: puts the items in Canvas' global navigation in the order the user chose and
// hides the ones they hid (CJ.navorder has the rules). Always running while Plus is on
// for the site, so a hidden Plus item can always come back. The settings tray edits the
// layout through CJ.navLayout.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const KEY = "navLayout";
  const HIDDEN = "cj-nav-hidden";
  // Set by navearly.js before the page paints; the menu shows once it is laid out.
  const PENDING = "cj-nav-pending";
  const reveal = () => document.documentElement.classList.remove(PENDING);
  const STYLE = `#menu > li.${HIDDEN} { display: none !important; }`;

  /**
   * The id of the link or button in a menu item. Links without one (UiB's "Sei frå" and
   * "Hjelp") get a key from the link itself; items without a link are left alone.
   */
  const idOf = (li) => {
    const link = li.querySelector(":scope > a, :scope > button");
    if (!link) return null;
    return link.id || CJ.navorder.keyOf({ href: link.getAttribute("href"), className: link.className, text: li.textContent });
  };

  /** The name shown for a menu item (Canvas' label element, or UiB's plain text). */
  const labelOf = (li) => {
    const text = li.querySelector(".menu-item__text");
    return (text || li).textContent.trim().replace(/\s+/g, " ");
  };

  CJ.registry.define("navlayout", function init() {
    const N = CJ.navorder;
    const menu = document.getElementById("menu");
    if (!menu) { reveal(); return {}; }
    const { el } = CJ.nav;
    const style = el("style", { id: "cj-navlayout-style", textContent: STYLE });
    document.head.append(style);

    let layout = N.normalize();
    // Canvas' own order (with items our modules add, where they put them), kept apart from
    // the order on screen so an item can always go back to its place.
    let natural = [];
    let observer = null, stopped = false;

    const items = () => [...menu.children].filter((li) => li.tagName === "LI" && idOf(li));
    // Items the site hides itself (mitt.uib.no's Canvas Help) and items that only repeat a
    // Canvas item: always hidden, never listed. Our own hiding is a class, so an inline
    // display: none is the site's.
    const siteHidden = (li) => li.hidden || li.style.display === "none";
    const copies = () => new Set(N.copies(items().map((li) => ({ id: idOf(li), label: labelOf(li), siteHidden: siteHidden(li) }))));

    function learn() {
      const onPage = items().map(idOf);
      natural = natural.filter((id) => onPage.includes(id));
      onPage.forEach((id, i) => {
        if (natural.includes(id)) return;
        const before = onPage.slice(0, i).reverse().find((x) => natural.includes(x));
        natural.splice(before ? natural.indexOf(before) + 1 : 0, 0, id);
      });
    }

    function place(order, hide) {
      const byId = new Map(items().map((li) => [idOf(li), li]));
      const now = items().map(idOf);
      if (order.some((id, i) => now[i] !== id)) for (const id of order) menu.append(byId.get(id));
      for (const [id, li] of byId) li.classList.toggle(HIDDEN, hide(id));
    }

    function apply() {
      if (stopped) return;
      if (observer) observer.disconnect();
      learn();
      const extra = copies();
      place(N.arrange(natural, layout), (id) => extra.has(id) || N.isHidden(layout, id));
      watch();
    }

    // Canvas and our modules add or remove items after load.
    function watch() {
      if (!observer) observer = new MutationObserver(apply);
      observer.observe(menu, { childList: true });
    }

    /** What the settings tray lists: every item, in the order shown, with its label. */
    function list() {
      learn();
      const byId = new Map(items().map((li) => [idOf(li), li]));
      const extra = copies();
      return N.arrange(natural, layout).filter((id) => !extra.has(id))
        .map((id) => ({ id, label: labelOf(byId.get(id)) || id, hidden: N.isHidden(layout, id), locked: N.isLocked(id) }));
    }

    let pendingSaves = 0;
    async function save(next) {
      layout = N.normalize(next);
      apply();
      pendingSaves++;
      try {
        await chrome.storage.sync.set({ [KEY]: layout });
      } finally {
        pendingSaves--;
      }
    }

    CJ.navLayout = {
      list,
      get: () => layout,
      // Without the copies, so positions match list().
      present: () => { learn(); const extra = copies(); return natural.filter((id) => !extra.has(id)); },
      save,
    };

    const onStorage = (changes, area) => {
      if (area !== "sync" || !changes[KEY]) return;
      const next = N.normalize(changes[KEY].newValue);
      // While our own writes are on their way, their echoes are older than what we show.
      if (pendingSaves > 0 || JSON.stringify(next) === JSON.stringify(layout)) return;
      layout = next;
      apply();
    };
    chrome.storage.onChanged.addListener(onStorage);

    apply();
    // The modules started with us have added their items by now; show the menu once it is
    // in the stored order, not the default one first.
    chrome.storage.sync.get(KEY).then(
      (stored) => { layout = N.normalize(stored[KEY]); apply(); },
      (e) => console.warn("Plus could not read the menu layout:", e),
    ).finally(reveal);

    return {
      stop() {
        stopped = true;
        if (observer) observer.disconnect();
        try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
        place(natural.filter((id) => items().some((li) => idOf(li) === id)), () => false);
        if (CJ.navLayout && CJ.navLayout.list === list) delete CJ.navLayout;
        style.remove();
        reveal();
      },
    };
  });
})();
