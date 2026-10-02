// Items in Canvas' global navigation, and trays that slide out from them like Canvas' own
// Account tray. Built from Canvas' nav markup, in the page's DOM, so they take Canvas'
// fonts, link style, high contrast mode and our dark mode. Shared by the modules.
(function (root) {
  "use strict";
  const CJ = root.CJ;
  if (CJ.nav) return;

  // Canvas' Account tray: 448px wide, 24px padding, this shadow. It slides out from under
  // the nav (z-index 100), so it sits just below it.
  const STYLE = `
    .cj-nav-item .menu-item__badge:empty { display: none; }
    .cj-tray { position: fixed; top: 0; bottom: 0; left: var(--cj-nav-width, 84px); width: 28rem; max-width: calc(100vw - var(--cj-nav-width, 84px));
      z-index: 99; background: #fff; color: #273540; overflow-y: auto; box-sizing: border-box; padding: 24px;
      transform: translateX(-100%); visibility: hidden;
      transition: transform .25s cubic-bezier(.4, 0, .2, 1), box-shadow .25s, visibility 0s linear .25s; }
    .cj-tray.is-open { transform: none; visibility: visible; box-shadow: 0 6px 7px rgba(0, 0, 0, .1), 0 10px 28px rgba(0, 0, 0, .25);
      transition: transform .25s cubic-bezier(.4, 0, .2, 1), box-shadow .25s; }
    @media (prefers-reduced-motion: reduce) { .cj-tray, .cj-tray.is-open { transition: none; } }
    .cj-tray-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
    .cj-tray h2 { font-size: 1.375rem; font-weight: 700; margin: 0; line-height: 1.3; }
    .cj-tray-close { flex: none; width: 28px; height: 28px; border: 0; background: none; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; border-radius: 4px; }
  `;
  const ACTIVE = "ic-app-header__menu-list-item--active";
  let styleUsers = 0;
  function useStyle() {
    if (styleUsers++ === 0) document.head.append(el("style", { id: "cj-nav-style", textContent: STYLE }));
  }
  function dropStyle() {
    if (--styleUsers === 0) { const s = document.getElementById("cj-nav-style"); if (s) s.remove(); }
  }

  function el(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k != null));
    return n;
  }

  /** The <svg> markup at Canvas' nav icon size. Only for static markup from this extension. */
  const navSvg = (markup) => markup.replace("<svg ", '<svg class="ic-icon-svg" width="26" height="26" ');

  /**
   * A nav item built like Canvas' own ("Inbox" has the same icon + badge + text shape),
   * placed after the item with id `after` or before the one with id `before`, else last.
   * With `href` it is a link (a page to go to) instead of a button.
   */
  function item({ id, label, icon, after, before, href }) {
    const menu = document.getElementById("menu");
    if (!menu) return null;
    useStyle();
    const button = href
      ? el("a", { href, id: `${id}-link`, className: "ic-app-header__menu-list-link" })
      : el("button", { type: "button", id: `${id}-link`, className: "ic-app-header__menu-list-link" });
    const iconBox = el("span");
    iconBox.setAttribute("aria-hidden", "true");
    if (icon) iconBox.innerHTML = navSvg(icon);
    const badge = el("span", { className: "menu-item__badge" });
    const text = el("div", { className: "menu-item__text", textContent: label });
    button.append(el("div", { className: "menu-item-icon-container" }, iconBox, badge), text);
    const li = el("li", { className: `menu-item ic-app-header__menu-list-item cj-nav-item ${id}-item` }, button);
    const anchor = (x) => { const a = x && document.getElementById(x); const l = a && a.closest("li"); return l && l.parentNode === menu ? l : null; };
    const a = anchor(after), b = anchor(before);
    if (a) a.after(li); else if (b) b.before(li); else menu.append(li);
    return {
      menu, item: li, button, badge, text,
      setIcon(markup) { iconBox.innerHTML = navSvg(markup); },
      remove() { li.remove(); dropStyle(); },
    };
  }

  /**
   * A nav item with a tray. `onOpen` runs after the tray opens (render and move focus
   * there); `onClose` after it closes. Escape and a click outside close it.
   */
  function tray({ id, label, title, closeLabel, icon, after, before, onOpen, onClose }) {
    const nav = item({ id, label, icon, after, before });
    if (!nav) return null;
    const { menu, item: li, button } = nav;
    button.setAttribute("aria-controls", `${id}-tray`);
    button.setAttribute("aria-expanded", "false");
    const box = el("div", { id: `${id}-tray`, className: `cj-tray ${id}-tray` });
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", title);
    document.body.append(box);

    let open = false, returnFocus = null, wasActive = null, guard = null, sizer = null;
    const others = () => [...menu.querySelectorAll(`:scope > .${ACTIVE}:not(.${id}-item)`)];

    // While the tray is open it is the only current item. Canvas may still mark one of its
    // own afterwards (its tray closing puts back the page's item): that one is set aside too,
    // and becomes the item to give back. That same close also clears every mark, ours too.
    function takeOver() {
      for (const other of others()) {
        wasActive = other;
        other.classList.remove(ACTIVE);
      }
      if (open && !li.classList.contains(ACTIVE)) li.classList.add(ACTIVE);
    }

    // Show the tray as the active nav item, the way Canvas marks Account or Courses.
    function setOpen(next) {
      if (next === open) return;
      open = next;
      box.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
      li.classList.toggle(ACTIVE, open);
      if (open) {
        // Canvas' own tray (Courses, Groups…) would stay open under ours and close with the
        // next click anywhere, marking its item again. Close it first.
        const canvasClose = document.querySelector('#nav-tray-portal [role="dialog"] [data-cid~="CloseButton"]');
        if (canvasClose) canvasClose.click();
        takeOver();
        guard = new MutationObserver(takeOver);
        guard.observe(menu, { attributes: true, attributeFilter: ["class"], subtree: true });
        // Next to the menu, also when it changes width while open (the course sidebar turned on).
        const header = document.getElementById("header");
        const fit = () => box.style.setProperty("--cj-nav-width", `${header.getBoundingClientRect().width}px`);
        if (header) {
          fit();
          sizer = new ResizeObserver(fit);
          sizer.observe(header);
        }
        returnFocus = document.activeElement;
        if (onOpen) onOpen();
      } else {
        if (guard) guard.disconnect();
        if (sizer) sizer.disconnect();
        guard = sizer = null;
        // Unless Canvas has marked an item of its own meanwhile (a click that closed us opened
        // its tray), give the mark back.
        if (wasActive && wasActive.isConnected && !others().length) wasActive.classList.add(ACTIVE);
        wasActive = null;
        if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus();
        returnFocus = null;
        if (onClose) onClose();
      }
    }

    /** The tray's heading row with its close button. */
    function head(text) {
      const close = el("button", { type: "button", className: "cj-tray-close", textContent: "×" });
      close.setAttribute("aria-label", closeLabel);
      close.addEventListener("click", () => setOpen(false));
      return el("div", { className: "cj-tray-head" }, el("h2", { textContent: text }), close);
    }

    const onButton = () => setOpen(!open);
    const onKey = (e) => { if (open && e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const onDown = (e) => { if (open && !box.contains(e.target) && !li.contains(e.target)) setOpen(false); };
    button.addEventListener("click", onButton);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);

    return Object.assign({}, nav, {
      tray: box, head, setOpen, isOpen: () => open,
      remove() {
        if (open) setOpen(false);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("mousedown", onDown, true);
        box.remove();
        nav.remove();
      },
    });
  }

  CJ.nav = { el, item, tray };
})(globalThis);
