// Deadlines module: a "Deadlines" item in Canvas' global navigation, with a badge, that
// opens a tray like Canvas' own Account tray. Only things you hand in, across all courses:
// late work first, then upcoming, then what you handed in and what was graded lately.
// Anything can be archived out of the way, after a quick confirm in the row. Built from Canvas' own nav markup, icon set and
// tray measurements, in the page's DOM, so it takes Canvas' fonts, link style, high
// contrast mode and our dark mode.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-deadlines";
  const TICK = 60e3;
  // The badge counts late work and what is due within this many days.
  const BADGE_DAYS = 7;

  // The tray itself comes from CJ.nav (src/core/navtray.js); this is what goes in it.
  const STYLE = `
    .${ID}-sub { margin: 0 0 12px; color: #6b7780; font-size: .875rem; }
    .${ID}-tray h3, .${ID}-toggle { font-size: 1rem; font-weight: 700; margin: 20px 0 4px; padding: 16px 0 0; border: 0; border-top: 1px solid #c7cdd1; }
    .${ID}-toggle { display: flex; width: 100%; align-items: center; gap: 6px; background: none; color: inherit; font-family: inherit; text-align: left; cursor: pointer; }
    .${ID}-toggle::before { content: "▸"; font-size: .75rem; transition: transform .15s; }
    .${ID}-toggle[aria-expanded="true"]::before { transform: rotate(90deg); }
    .${ID}-list { list-style: none; margin: 0; padding: 0; }
    .${ID}-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 10px 0; border-bottom: 1px solid #e8eaec; }
    .${ID}-list li:last-child { border-bottom: 0; }
    .${ID}-list a { font-size: 1rem; overflow-wrap: anywhere; }
    .${ID}-meta { display: block; margin-top: 2px; font-size: .875rem; color: #6b7780; }
    .${ID}-missing .${ID}-status { color: #d01a19; font-weight: 700; }
    .${ID}-overdue .${ID}-status { color: #bf4d00; font-weight: 700; }
    .${ID}-done .${ID}-status { color: #0b874b; }
    .${ID}-act { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 4px; background: none;
      color: #6b7780; cursor: pointer; opacity: .7; }
    .${ID}-act svg { width: 16px; height: 16px; }
    .${ID}-act:hover, .${ID}-act:focus-visible { opacity: 1; background: rgba(0, 0, 0, .06); color: #273540; }
    .${ID}-confirm { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .875rem; }
    .${ID}-confirm span { flex: 1; min-width: 0; }
    .${ID}-confirm button { padding: 4px 10px; border: 1px solid #c7cdd1; border-radius: 4px; background: none; color: inherit; font: inherit; cursor: pointer; }
    .${ID}-confirm button.is-primary { border-color: #2b7abc; background: #2b7abc; color: #fff; }
    .${ID}-note { color: #6b7780; }
    .${ID}-jump { animation: ${ID}-flash 1.6s ease-out; }
    @keyframes ${ID}-flash { from { background-color: rgba(47, 111, 179, .18); } to { background-color: transparent; } }
    .${ID}-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `;

  CJ.registry.define("deadlines", function init({ api, t }) {
    const { el } = CJ.nav;
    const locale = (() => { try { return chrome.i18n.getUILanguage(); } catch { return "en"; } })();
    let list = null, courses = new Map(), error = false;
    let archived = new Set(), showArchived = false;
    // The deadline whose archive button was pressed and waits for a yes.
    let confirming = null;
    // Where to open the tray ("late", "week" or "graded", from the cards on Home+);
    // kept until fresh data has been drawn, since that redraws the tray.
    let jump = null;

    // Static markup from icons.js, never from the page or the API.
    const nav = CJ.nav.tray({
      id: ID, label: t("dl_nav"), title: t("dl_title"), closeLabel: t("dl_close"), icon: CJ.icons.calendarClock,
      after: "global_nav_calendar_link", onOpen,
    });
    if (!nav) return {};
    const { button, badge, tray } = nav;
    const style = el("style", { id: `${ID}-style`, textContent: STYLE });
    document.head.append(style);

    function onOpen() {
      confirming = null;
      render();
      const close = tray.querySelector(".cj-tray-close");
      if (close && !(jump && list)) close.focus();
      load(false);
    }
    const live = el("p", { className: `${ID}-live` });
    live.setAttribute("aria-live", "polite");

    function actionButton(d, restore) {
      const label = t(restore ? "dl_restore" : "dl_archive");
      const b = el("button", { type: "button", className: `${ID}-act`, title: label });
      b.setAttribute("aria-label", `${label}: ${d.title}`);
      b.dataset.id = d.id;
      b.innerHTML = restore ? CJ.icons.unarchive : CJ.icons.archive; // Static markup from icons.js.
      b.addEventListener("click", () => {
        if (restore) return archive(d, false);
        confirming = d.id;
        render();
        tray.querySelector(`.${ID}-confirm .is-primary`).focus();
      });
      return b;
    }

    /** "Archive this?" in place of the button; cancel puts the button back. */
    function confirmBox(d) {
      const yes = el("button", { type: "button", className: "is-primary", textContent: t("dl_archive") });
      yes.dataset.id = d.id;
      yes.addEventListener("click", () => { confirming = null; archive(d, true); });
      const no = el("button", { type: "button", textContent: t("dl_cancel") });
      no.addEventListener("click", () => { confirming = null; render(d.id); });
      const box = el("div", { className: `${ID}-confirm` }, el("span", { textContent: t("dl_archiveAsk") }), yes, no);
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", `${t("dl_archiveAsk")} ${d.title}`);
      return box;
    }

    function row(d, now, restore) {
      const done = CJ.deadlines.isDone(d);
      const c = courses.get(d.courseId);
      const status = el("span", { className: `${ID}-status`, textContent: CJ.deadlines.describe(d, now, t, locale) });
      return el("li", { className: `${ID}-${done ? "done" : d.status}` },
        el("div", {},
          el("a", { href: d.url, textContent: d.title }),
          el("span", { className: `${ID}-meta` }, c ? `${c.short} · ` : "", status)),
        confirming === d.id && !restore ? confirmBox(d) : actionButton(d, restore));
    }

    function section(title, items, now, mark) {
      if (!items.length) return [];
      const h = el("h3", { textContent: title });
      if (mark) h.dataset.jump = mark;
      return [h, el("ul", { className: `${ID}-list` }, ...items.map((d) => row(d, now)))];
    }

    /** Scroll the tray to the part `jump` names, flash it and put focus on its first link. */
    function showJump() {
      const target = tray.querySelector(`[data-jump="${jump}"]`);
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      const rowEl = target.tagName === "H3" ? target.nextElementSibling : target;
      if (rowEl) rowEl.classList.add(`${ID}-jump`);
      const link = rowEl && rowEl.querySelector("a");
      if (link) link.focus({ preventScroll: true });
    }

    function render(focusId) {
      const now = Date.now();
      const lists = CJ.deadlines.arrange(list || [], now, archived);
      const { todo, submitted, graded } = lists;
      const soon = todo.filter((d) => CJ.deadlines.needsYou(d) || d.due - now < BADGE_DAYS * 864e5).length;
      badge.textContent = soon ? String(soon) : "";
      button.setAttribute("aria-label", soon ? `${t("dl_nav")} (${soon})` : t("dl_nav"));
      if (!nav.isOpen()) return;
      const head = nav.head(t("dl_title"));
      const close = head.querySelector(".cj-tray-close");
      const body = [head, live];
      if (!list) body.push(el("p", { className: `${ID}-note`, textContent: t(error ? "dl_error" : "dl_loading") }));
      else {
        body.push(el("p", { className: `${ID}-sub`, textContent: todo.length ? t("dl_left", [String(todo.length)]) : t("dl_empty") }));
        if (todo.length) {
          const rows = todo.map((d) => row(d, now));
          const late = todo.findIndex(CJ.deadlines.needsYou);
          const week = todo.findIndex((d) => !CJ.deadlines.needsYou(d));
          if (late >= 0) rows[late].dataset.jump = "late";
          if (week >= 0) rows[week].dataset.jump = "week";
          body.push(el("ul", { className: `${ID}-list` }, ...rows));
        }
        body.push(...section(t("dl_recent"), submitted, now), ...section(t("dl_recentGraded"), graded, now, "graded"));
        if (lists.archived.length) {
          const toggle = el("button", { type: "button", className: `${ID}-toggle`, textContent: t("dl_archived", [String(lists.archived.length)]) });
          toggle.setAttribute("aria-expanded", String(showArchived));
          toggle.addEventListener("click", () => {
            showArchived = !showArchived;
            render();
            tray.querySelector(`.${ID}-toggle`).focus();
          });
          body.push(toggle);
          if (showArchived) body.push(el("ul", { className: `${ID}-list` }, ...lists.archived.map((d) => row(d, now, true))));
        }
      }
      const closeHadFocus = !!document.activeElement && document.activeElement.classList.contains("cj-tray-close");
      const confirmHadFocus = !!document.activeElement && !!document.activeElement.closest(`.${ID}-confirm`);
      tray.replaceChildren(...body);
      if (jump && list) showJump();
      else if (focusId !== undefined) {
        const target = focusId && tray.querySelector(`.${ID}-act[data-id="${CSS.escape(focusId)}"]`);
        (target || tray.querySelector(`.${ID}-act`) || close).focus();
      } else if (confirmHadFocus) {
        const yes = tray.querySelector(`.${ID}-confirm .is-primary`);
        if (yes) yes.focus();
      } else if (closeHadFocus) close.focus();
    }

    /** Archive or restore, then keep keyboard focus on the row that took its place. */
    async function archive(d, on) {
      const buttons = [...tray.querySelectorAll(`.${ID}-act, .${ID}-confirm .is-primary`)];
      const i = buttons.findIndex((b) => b.dataset.id === d.id);
      const neighbour = buttons[i + 1] || buttons[i - 1];
      archived = new Set(archived);
      if (on) archived.add(d.id); else archived.delete(d.id);
      live.textContent = t(on ? "dl_archivedOne" : "dl_restoredOne", [d.title]);
      render(neighbour ? neighbour.dataset.id : null);
      try {
        archived = new Set(Object.keys(await api.setArchived(d.id, on)));
      } catch (e) {
        console.warn("Plus could not save the archive:", e);
      }
    }

    // You hand things in on their own page, and Canvas' newer assignment page does it without
    // a reload. So on the page of something still open, always ask Canvas, and leave the cache
    // stale for the next page (Home+, the palette) until it shows as handed in.
    const page = location.pathname;

    async function load(force) {
      const onOpenPage = !!CJ.deadlines.openAt(list, page);
      try {
        const [fresh, courseList, archive] = await Promise.all([
          api.loadDeadlines(force || onOpenPage), api.loadCourses(false).catch(() => null), api.getArchived().catch(() => ({})),
        ]);
        list = fresh;
        archived = new Set(Object.keys(archive));
        if (courseList) courses = new Map(courseList.map((c) => [c.id, c]));
        error = false;
        if (CJ.deadlines.openAt(list, page)) api.expire("deadlines").catch(() => {});
      } catch (e) {
        console.warn("Plus could not load deadlines:", e);
        error = !list;
      }
      render();
      jump = null;
    }

    /** Open the tray at late work, what is due this week or what was graded lately. */
    function openAt(part) {
      jump = part;
      if (nav.isOpen()) { render(); load(false); } else nav.setOpen(true);
    }
    CJ.deadlinesTray = { openAt };

    // Cached first so the badge shows at once, then fresh.
    Promise.all([api.peek("deadlines"), api.peek("courses"), api.getArchived().catch(() => ({}))]).then(([cached, courseList, archive]) => {
      if (courseList) courses = new Map(courseList.map((c) => [c.id, c]));
      archived = new Set(Object.keys(archive));
      if (cached && !list) { list = cached; render(); }
      return load(false);
    }).catch((e) => console.warn("Plus deadlines failed:", e));
    // Keep the badge and the countdown honest while the page stays open.
    const timer = setInterval(render, TICK);

    return {
      stop() {
        clearInterval(timer);
        if (CJ.deadlinesTray && CJ.deadlinesTray.openAt === openAt) delete CJ.deadlinesTray;
        nav.remove();
        style.remove();
      },
    };
  });
})();
