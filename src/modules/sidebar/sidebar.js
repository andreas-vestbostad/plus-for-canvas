// Course sidebar: Canvas' menu as a wide sidebar (early.css) in two parts that fold away,
// "Pages" (Canvas' items) and "Courses" (yours). Each course opens in place to show its own
// menu (Modules, Assignments, Files…), only when you open it: a course's pages show that menu
// anyway. Only while Canvas' menu is expanded. CJ.sidebar has the rules.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-sidebar";
  // On <html> while the module is on (early.css widens the menu on it). Not ID: the panel has that.
  const ON = "cj-sidebar-on";
  // Courses you opened in the sidebar, kept per browser so they stay open from page to page.
  const OPEN_KEY = "cj-sidebar-open";
  // The two parts folded away ("closed"), per browser. early.js reads the first before paint.
  const PAGES_KEY = "cj-sidebar-pages";
  const COURSES_KEY = "cj-sidebar-courses";
  const PAGES_CLOSED = "cj-sidebar-pages-closed";
  // The Plus tray listens for this (settings.js); it has "Customize the menu".
  const OPEN_SETTINGS = "cj:open-settings";

  // Drawn like Canvas' own line icons. Static markup, never from the page.
  // The gear is Lucide's "settings" icon (ISC licence, src/vendor/lucide/LICENSE).
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/></g></svg>';
  const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path style="fill:none" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round" d="m6 3.5 4.5 4.5L6 12.5"/></svg>';

  // Text in the menu's own colour, so themes and dark mode carry over. Hover and the current
  // item are a light wash on top of whatever colour the menu has.
  const STYLE = `
    nav.${ID}, .${ID}-pages { display: none; }
    @media (min-width: 768px) {
      body.primary-nav-expanded nav.${ID} { display: block; margin: 12px 0; padding: 0 8px;
        color: var(--ic-brand-global-nav-menu-item__text-color, #fff); font-size: .875rem; }
      /* With Pages folded the items' room is empty: Courses sits as close under Pages as Pages
         sits under Account (8px; the items start 6px below the Pages heading). */
      html.${PAGES_CLOSED} body.primary-nav-expanded nav.${ID} { margin-top: 2px; }
      /* In the room early.css keeps between Account and the items. */
      body.primary-nav-expanded .${ID}-pages { display: flex; position: absolute; top: 52px; left: 8px; right: 8px;
        color: var(--ic-brand-global-nav-menu-item__text-color, #fff); }
    }
    .${ID}-section { align-items: center; gap: 2px; min-height: 34px; border-radius: 8px; }
    .${ID} > .${ID}-section, .${ID}-pages > .${ID}-section { display: flex; }
    .${ID} > .${ID}-section { margin: 0 0 4px; }
    .${ID}-pages > .${ID}-section { flex: 1; }
    .${ID}-section:hover { background: rgba(255, 255, 255, .06); }
    .${ID}-fold { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; padding: 6px 8px; border: 0; border-radius: 8px;
      background: none; color: inherit; font: inherit; font-size: 1rem; font-weight: 700; text-align: left; opacity: .65; cursor: pointer; }
    .${ID}-fold:hover { opacity: 1; }
    .${ID}-fold svg, .${ID}-toggle svg { flex: none; width: 14px; height: 14px; transition: transform .15s; }
    .${ID}-fold[aria-expanded="true"] svg, .${ID}-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
    @media (prefers-reduced-motion: reduce) { .${ID}-fold svg, .${ID}-toggle svg { transition: none; } }
    .${ID}-gear { flex: none; display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; margin: 0 2px 0 0; padding: 0;
      border: 0; border-radius: 6px; background: none; color: inherit; opacity: .65; cursor: pointer; }
    .${ID}-gear:hover { opacity: 1; background: rgba(255, 255, 255, .1); }
    .${ID}-gear svg { width: 16px; height: 16px; }
    .${ID}-section > a { flex: none; padding: 4px 8px; font-size: .75rem; opacity: .65; }
    .${ID}-section > a:hover { opacity: 1; }
    .${ID} ul { margin: 0; padding: 0; list-style: none; }
    .${ID}-row { display: flex; align-items: center; border-radius: 8px; }
    .${ID}-row:hover, .${ID} .is-current > .${ID}-row { background: rgba(255, 255, 255, .1); }
    .${ID} a { display: block; min-width: 0; color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${ID} a:hover { text-decoration: underline; }
    .${ID} a:focus-visible, .${ID}-toggle:focus-visible, .${ID}-fold:focus-visible, .${ID}-gear:focus-visible {
      outline: 2px solid currentColor; outline-offset: -2px; border-radius: 8px; opacity: 1; }
    .${ID}-course > .${ID}-row > a { flex: 1; display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 10px; font-size: .9375rem; font-weight: 700; }
    .${ID}-course > .${ID}-row > a > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .${ID}-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .5; }
    .${ID}-dot.has-color { opacity: 1; box-shadow: 0 0 0 1px rgba(255, 255, 255, .35); }
    .${ID}-toggle { flex: none; display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; margin: 0 2px 0 0; padding: 0;
      border: 0; border-radius: 6px; background: none; color: inherit; opacity: .8; cursor: pointer; }
    .${ID}-toggle:hover { opacity: 1; }
    .${ID}-tabs { margin: 2px 0 6px !important; }
    .${ID}-tabs a { padding: 4px 8px 4px 28px; border-radius: 8px; font-weight: 600; }
    .${ID}-tabs a:hover { background: rgba(255, 255, 255, .1); text-decoration: none; }
    .${ID}-tabs a[aria-current="page"] { background: rgba(255, 255, 255, .16); font-weight: 700; }
    .${ID}-edit { display: block; margin: 0 0 6px; padding: 2px 8px 2px 28px; border: 0; background: none; color: inherit;
      font: inherit; font-size: .75rem; opacity: .7; cursor: pointer; }
    .${ID}-edit:hover { opacity: 1; text-decoration: underline; }
    .${ID}-edit:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; border-radius: 6px; opacity: 1; }
    .${ID}-pick label { display: flex; align-items: center; gap: 8px; margin: 0; padding: 3px 8px 3px 28px; font-size: inherit; color: inherit; cursor: pointer; }
    .${ID}-pick input { margin: 0; accent-color: currentColor; }
    .${ID}-note { margin: 0; padding: 4px 8px 4px 28px; opacity: .7; }
    .${ID} > .${ID}-note { padding-left: 8px; }
    .${ID}-pickList label { padding-left: 10px; font-weight: 700; }
    .${ID}-pickCourses { margin-top: 4px; padding-left: 10px; }
  `;

  CJ.registry.define("sidebar", function init({ api, t }) {
    const S = CJ.sidebar;
    const nav = document.querySelector("#header .ic-app-header__main-navigation");
    const menu = document.getElementById("menu");
    if (!nav || !menu) return {};
    const { el } = CJ.nav;
    // early.js marks the page before it paints; this does it when the module is turned on later.
    document.documentElement.classList.add(ON);
    const style = el("style", { id: `${ID}-style`, textContent: STYLE });
    document.head.append(style);
    const box = el("nav", { className: ID });
    box.setAttribute("aria-label", t("home_courses"));
    menu.after(box);

    const isClosed = (key) => { try { return localStorage.getItem(key) === "closed"; } catch { return false; } };
    const setClosed = (key, closed) => { try { if (closed) localStorage.setItem(key, "closed"); else localStorage.removeItem(key); } catch {} };

    /** A heading that folds its part away: arrow and name, plus `extra` on the right. */
    function section(label, controls, isOpen, onFold, extra) {
      const fold = el("button", { type: "button", className: `${ID}-fold` }, el("span"), el("span", { textContent: label }));
      fold.firstChild.innerHTML = CHEVRON;
      fold.firstChild.style.display = "contents";
      fold.setAttribute("aria-expanded", String(isOpen));
      fold.setAttribute("aria-controls", controls);
      fold.addEventListener("click", onFold);
      return el("div", { className: `${ID}-section` }, fold, extra);
    }

    // "Pages" over Canvas' own items, in the room early.css keeps for it under Account; the
    // gear opens Plus, where the menu is customised.
    const html = document.documentElement;
    const gear = el("button", { type: "button", className: `${ID}-gear`, title: t("sidebar_customise") });
    gear.innerHTML = GEAR;
    gear.setAttribute("aria-label", t("sidebar_customise"));
    gear.addEventListener("click", () => document.dispatchEvent(new CustomEvent(OPEN_SETTINGS)));
    const pages = el("div", { className: `${ID}-pages` });
    function renderPages() {
      const shut = isClosed(PAGES_KEY);
      html.classList.toggle(PAGES_CLOSED, shut);
      pages.replaceChildren(section(t("sidebar_pages"), "menu", !shut, () => {
        setClosed(PAGES_KEY, !shut);
        renderPages();
        pages.querySelector(`.${ID}-fold`).focus();
      }, gear));
    }
    renderPages();
    menu.before(pages);

    const here = S.courseOf(location.pathname);
    let courses = null, colors = {}, hiddenTabs = {}, chosen = {}, failed = false, stopped = false;
    // Choosing which courses the sidebar lists, with a box for every course.
    let picking = false;
    // Courses whose menu you are choosing items for right now.
    const editing = new Set();
    const tabs = new Map();
    // The courses you opened yourself. The one you are in is not opened for you: its page shows its menu.
    const open = readOpen();

    function readOpen() {
      try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]").map(String)); } catch { return new Set(); }
    }

    function setOpen(id, on) {
      if (on) open.add(id); else open.delete(id);
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {}
    }

    function loadTabs(id) {
      if (tabs.has(id)) return;
      tabs.set(id, null);
      api.loadTabs(id, false)
        .then((list) => { tabs.set(id, list || []); })
        .catch((e) => { tabs.set(id, "error"); console.warn("Plus could not load a course menu:", e); })
        .then(() => { if (!stopped) render(); });
    }

    /** Show or hide one of a course's menu items here. Saved at once, per course. */
    function setTabHidden(courseId, tabId, hide) {
      api.updateMine("sidebarHidden", (m) => {
        const now = new Set((m[courseId] || []).map(String));
        if (hide) now.add(String(tabId)); else now.delete(String(tabId));
        const next = Object.assign({}, m);
        if (now.size) next[courseId] = [...now]; else delete next[courseId];
        return next;
      }).then((next) => { hiddenTabs = next; if (!stopped) render(); },
        (e) => console.warn("Plus sidebar could not save the course menu:", e));
    }

    /** A small text button under a course's menu ("Customise" / "Done"); focus stays on it across redraws. */
    function editButton(id, label) {
      const b = el("button", { type: "button", className: `${ID}-edit`, textContent: label });
      b.dataset.edit = id;
      b.addEventListener("click", () => {
        if (editing.has(id)) editing.delete(id); else editing.add(id);
        render();
        const again = box.querySelector(`[data-edit="${id}"]`);
        if (again) again.focus();
      });
      return b;
    }

    function tabList(c) {
      const id = String(c.id);
      const list = tabs.get(id);
      if (!Array.isArray(list)) {
        return el("p", { className: `${ID}-note`, textContent: t(list === "error" ? "sidebar_error" : "home_loading") });
      }
      const hidden = hiddenTabs[id] || [];
      if (editing.has(id)) {
        // Every item with a box: ticked shows in the sidebar.
        return el("div", {},
          el("ul", { className: `${ID}-tabs ${ID}-pick` }, ...list.map((tab) => {
            const input = el("input", { type: "checkbox", checked: !hidden.includes(String(tab.id)) });
            input.addEventListener("change", () => setTabHidden(id, tab.id, !input.checked));
            return el("li", {}, el("label", {}, input, el("span", { textContent: tab.label })));
          })),
          editButton(id, t("sidebar_done")));
      }
      const current = id === here ? S.activeTab(list, location.pathname) : null;
      const shown = S.visibleTabs(list, hidden);
      const gone = list.length - shown.length;
      return el("div", {},
        el("ul", { className: `${ID}-tabs` }, ...shown.map((tab) => {
          const a = el("a", { href: tab.url, textContent: tab.label, title: tab.label });
          if (tab.id === current) a.setAttribute("aria-current", "page");
          return el("li", {}, a);
        })),
        editButton(id, gone ? t("sidebar_editHidden", [String(gone)]) : t("sidebar_edit")));
    }

    /** The course's colour from Canvas' dashboard; a faint dot in the menu's colour until it is known. */
    function dot(color) {
      const d = el("span", { className: `${ID}-dot${color ? " has-color" : ""}` });
      d.setAttribute("aria-hidden", "true");
      if (color) d.style.background = color;
      return d;
    }

    function course(c) {
      const id = String(c.id);
      const isOpen = open.has(id);
      if (isOpen) loadTabs(id);
      const listId = `${ID}-tabs-${id}`;
      const toggle = el("button", { type: "button", className: `${ID}-toggle` });
      toggle.innerHTML = CHEVRON;
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-controls", listId);
      toggle.setAttribute("aria-label", t("sidebar_expand", [c.short || c.name]));
      toggle.addEventListener("click", () => {
        setOpen(id, !open.has(id));
        render();
        const again = box.querySelector(`[aria-controls="${listId}"]`);
        if (again) again.focus();
      });
      const body = isOpen ? tabList(c) : null;
      if (body) body.id = listId;
      return el("li", { className: `${ID}-course${id === here ? " is-current" : ""}` },
        el("div", { className: `${ID}-row` },
          el("a", { href: `/courses/${encodeURIComponent(id)}`, title: c.name }, dot(colors[id]), el("span", { textContent: c.short || c.name })), toggle),
        body);
    }

    /** Show or leave out a course here. Saved at once; the rest still follow your favourites. */
    function setChosen(courseId, on) {
      api.updateMine("sidebarCourses", (m) => Object.assign({}, m, { [courseId]: on }))
        .then((next) => { chosen = next; if (!stopped) render(); },
          (e) => console.warn("Plus sidebar could not save the courses:", e));
    }

    /** "Choose courses" under the list, "Done" while choosing; focus stays on it across redraws. */
    function pickButton() {
      const b = el("button", { type: "button", className: `${ID}-edit ${ID}-pickCourses`, textContent: t(picking ? "sidebar_done" : "sidebar_pickCourses") });
      b.addEventListener("click", () => {
        picking = !picking;
        render();
        const again = box.querySelector(`.${ID}-pickCourses`);
        if (again) again.focus();
      });
      return b;
    }

    /** Every course with a box: ticked shows in the sidebar. */
    function coursePicker(list) {
      const shown = new Set(list.map((c) => String(c.id)));
      return el("ul", { id: `${ID}-courses`, className: `${ID}-pick ${ID}-pickList` }, ...S.sorted(courses).map((c) => {
        const id = String(c.id);
        const input = el("input", { type: "checkbox", checked: shown.has(id) });
        input.addEventListener("change", () => setChosen(id, input.checked));
        return el("li", {}, el("label", { title: c.name }, input, dot(colors[id]), el("span", { textContent: c.short || c.name })));
      }));
    }

    function render() {
      const list = courses ? S.listed(courses, chosen) : [];
      const shut = isClosed(COURSES_KEY);
      // replaceChildren writes null out as text, so the list is left out rather than null.
      box.replaceChildren(...[
        // Canvas' Courses item is hidden while this is on (early.css); its "All courses" is here.
        section(t("home_courses"), `${ID}-courses`, !shut, () => {
          setClosed(COURSES_KEY, !shut);
          render();
          box.querySelector(`.${ID}-fold`).focus();
        }, el("a", { href: "/courses", textContent: t("sidebar_allCourses") })),
        shut ? null : !courses ? el("p", { className: `${ID}-note`, textContent: t(failed ? "sidebar_error" : "home_loading") })
          : picking ? coursePicker(list)
            : list.length ? el("ul", { id: `${ID}-courses` }, ...list.map(course))
              : el("p", { className: `${ID}-note`, textContent: t("home_noCourses") }),
        shut || !courses || !courses.length ? null : pickButton(),
      ].filter(Boolean));
    }

    render();
    api.getMine("sidebarHidden")
      .then((m) => { if (!stopped) { hiddenTabs = m; render(); } })
      .catch((e) => console.warn("Plus sidebar could not read the hidden menu items:", e));
    api.getMine("sidebarCourses")
      .then((m) => { if (!stopped) { chosen = m; render(); } })
      .catch((e) => console.warn("Plus sidebar could not read the chosen courses:", e));
    api.peekMany(["courses", "colors"])
      .then((hit) => {
        if (stopped) return;
        if (hit.colors) colors = hit.colors;
        if (hit.courses && !courses) courses = hit.courses;
        render();
      })
      .catch(() => {});
    api.loadColors(false)
      .then((c) => { if (!stopped) { colors = c || {}; render(); } })
      .catch((e) => console.warn("Plus sidebar could not load course colours:", e));
    api.loadCourses(false)
      .then((list) => { if (!stopped) { courses = list || []; render(); } })
      .catch((e) => {
        console.warn("Plus sidebar could not load courses:", e);
        failed = true;
        if (!stopped && !courses) render();
      });

    return {
      stop() {
        stopped = true;
        box.remove();
        pages.remove();
        style.remove();
        html.classList.remove(ON, PAGES_CLOSED);
      },
    };
  });
})();
