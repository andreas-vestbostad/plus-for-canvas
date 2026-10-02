// Home+: a page of its own inside Canvas, at "/#cj-home", reached from a "Home+" item
// in Canvas' menu. What is late, what is due in the next two weeks by day, grades you have
// not seen yet and the courses with their next deadline, score and a link back to where you left
// off. Drawn in Canvas' content area (early.css hides Canvas' dashboard there), so it keeps
// Canvas' menu, fonts and our dark mode. CJ.home has what goes on it.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-home";
  const TICK = 60e3;
  const DASHBOARD_LINK = "global_nav_dashboard_link";
  const ACTIVE = "ic-app-header__menu-list-item--active";
  // Set in the page's localStorage while Canvas' Dashboard is hidden in the menu, so early.js
  // can open Home+ instead of it before the page paints.
  const START_KEY = "cj-start-home";
  const LAYOUT_KEY = "navLayout";
  // Grades opened from here, so they leave "New grades" at once rather than when the cached
  // deadlines (and Canvas' "new activity") are next fetched. Forgotten after two weeks.
  const SEEN_KEY = "cj-seen-grades";
  const SEEN_FOR = 14 * 864e5;

  // Cards whose deadline list you opened, so they stay open from visit to visit.
  const OPEN_KEY = "cj-home-open";

  const { STYLE, ICON, CHECK, CHEVRON, CLOSE } = CJ.homeStyle;
  // What keeps focus on the same control when the page is drawn again.
  const FOCUS_KEYS = ["data-grip", "data-hide", "aria-controls"];

  CJ.registry.define("home", function init({ api, t }) {
    const H = CJ.home;
    // Every page inside a course is a place you can continue from ("Continue" on the cards).
    if (CJ.dashboard.courseOfPath(location.pathname)) {
      api.rememberPlace(location.pathname, document.title || "")
        .catch((e) => console.warn("Plus could not remember this page:", e));
    }
    const nav = CJ.nav.item({ id: ID, label: t("home_nav"), icon: ICON, href: `/${H.HASH}`, after: DASHBOARD_LINK });
    if (!nav) return {};
    const { el } = CJ.nav;
    const locale = (() => { try { return chrome.i18n.getUILanguage(); } catch { return "en"; } })();
    const style = el("style", { id: `${ID}-style`, textContent: STYLE });
    document.head.append(style);

    let data = { courses: null, deadlines: null, events: null, scores: {}, places: {}, links: {}, unread: {}, archived: new Set(), hidden: new Set(), order: {}, seen: readSeen() };
    const openCards = readOpen();
    let showHidden = false;
    // The course whose × was clicked: its card asks before it is hidden.
    let asking = null;
    let loaded = false, root = null, timer = null, onStorage = null, onVisible = null, wasActive = null, oldTitle = null, keeper = null;
    // The cards fade in when they replace the placeholders, not on every redraw.
    let wasSkeleton = false, eventsFailed = false;
    const order = CJ.homeOrder({
      api, t, el, render,
      getRoot: () => root,
      getOrder: () => data.order,
      setOrder: (next) => { data = Object.assign({}, data, { order: next }); render(); },
    });

    function readSeen() {
      try {
        const map = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
        const now = Date.now();
        return new Set(Object.keys(map).filter((id) => now - map[id] < SEEN_FOR));
      } catch {
        return new Set();
      }
    }

    function readOpen() {
      try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]").map(String)); } catch { return new Set(); }
    }

    /** Fold a card's deadline list open or shut in place, so it slides rather than being redrawn. */
    function toggleCard(id) {
      if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openCards])); } catch {}
      const open = openCards.has(id);
      const button = root && root.querySelector(`[aria-controls="${ID}-tasks-${id}"]`);
      const list = document.getElementById(`${ID}-tasks-${id}`);
      if (!button || !list) return render();
      button.setAttribute("aria-expanded", String(open));
      button.parentNode.classList.toggle("is-open", open);
      list.inert = !open;
    }

    /** Hide a course from Home, or bring it back. Deadlines and counts are not affected. */
    function setHidden(id, hide) {
      api.updateMine("homeHidden", (m) => {
        const next = Object.assign({}, m);
        if (hide) next[id] = true; else delete next[id];
        return next;
      }).then((next) => {
        if (asking === id) asking = null;
        data = Object.assign({}, data, { hidden: new Set(Object.keys(next)) });
        render();
      }, (e) => console.warn("Home+ could not hide a course:", e));
    }

    /** Remembers that this grade was opened, and takes it off the page. */
    function markSeen(id) {
      const now = Date.now();
      try {
        const old = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
        const kept = Object.fromEntries(Object.entries(old).filter(([, t]) => now - t < SEEN_FOR));
        localStorage.setItem(SEEN_KEY, JSON.stringify(Object.assign(kept, { [id]: now })));
      } catch (e) {
        console.warn("Home+ could not remember a seen grade:", e);
      }
      data = Object.assign({}, data, { seen: new Set([...data.seen, id]) });
    }

    const courseName = (id) => {
      const c = (data.courses || []).find((x) => String(x.id) === String(id));
      return c ? c.short || c.name : "";
    };

    function dayLabel(day, now) {
      const days = Math.round((day - H.startOfDay(now)) / 864e5);
      try {
        if (days <= 1) {
          const s = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
          return s.charAt(0).toUpperCase() + s.slice(1);
        }
        return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(day);
      } catch {
        return new Date(day).toDateString();
      }
    }

    /** A small count that opens the Deadlines tray at `part` ("late", "week" or "graded"). */
    function stat(key, n, part, cls) {
      const b = el("button", { type: "button", className: `${ID}-stat${cls ? ` ${cls}` : ""}` },
        el("strong", { textContent: String(n) }), el("span", { textContent: t(key) }));
      b.addEventListener("click", () => {
        if (CJ.deadlinesTray) { CJ.deadlinesTray.openAt(part); return; }
        const d = document.getElementById("cj-deadlines-link");
        if (d) d.click();
      });
      return b;
    }

    function clock(ms) {
      try { return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(ms); } catch { return new Date(ms).toTimeString().slice(0, 5); }
    }

    function eventItem(e, now) {
      const on = e.start <= now && now < e.end;
      const when = el("time", { textContent: e.allDay ? t("home_allDay") : `${clock(e.start)}–${clock(e.end)}` });
      when.dateTime = new Date(e.start).toISOString();
      const title = e.url ? el("a", { href: e.url, textContent: e.title }) : el("span", { textContent: e.title });
      const meta = [e.location, e.courseId && !e.title.includes(courseName(e.courseId)) ? courseName(e.courseId) : ""].filter(Boolean).join(" · ");
      return el("li", { className: `${ID}-event` },
        when,
        el("div", {}, title, on ? el("span", { className: `${ID}-now`, textContent: t("home_now") }) : null,
          meta ? el("div", { className: `${ID}-meta`, textContent: meta }) : null));
    }

    /** Today's lectures still to come, or a line saying there are none (more). A placeholder until loaded. */
    function lectures(h, now) {
      if (!data.events && eventsFailed) return null;
      return el("section", { className: `${ID}-section` },
        el("h2", { textContent: t("home_today") }),
        !data.events ? skeletonRows(1)
          : h.today.length ? el("ul", { className: `${ID}-list` }, ...h.today.map((e) => eventItem(e, now)))
            : el("p", { className: `${ID}-note`, textContent: t(h.todayOver ? "home_noMoreToday" : "home_noneToday") }));
    }

    /** A grey bar `width` wide, standing in for text that is loading. */
    const bone = (width) => el("span", { className: `${ID}-bone`, style: `width: ${width}` });

    /** Rows shaped like list items while they load; screen readers hear "Loading". */
    function skeletonRows(n) {
      const list = el("ul", { className: `${ID}-list ${ID}-skel` },
        ...Array.from({ length: n }, (_, i) => el("li", {}, bone(`${70 - (i % 3) * 15}%`), bone("40%"))));
      list.setAttribute("aria-hidden", "true");
      return el("div", {}, el("span", { className: "screenreader-only", textContent: t("home_loading") }), list);
    }

    /** Cards shaped like course cards while the courses load. */
    function skeletonCards() {
      const list = el("ul", { className: `${ID}-courses` }, ...Array.from({ length: 4 }, () =>
        el("li", { className: `${ID}-course ${ID}-skel` },
          el("h3", {}, bone("45%")), bone("75%"), bone("90%"), el("div", { className: `${ID}-links` }))));
      list.setAttribute("aria-hidden", "true");
      return el("div", {}, el("span", { className: "screenreader-only", textContent: t("home_loading") }), list);
    }

    /** The circle in front of a deadline: ticked once handed in. */
    function check(d) {
      const done = CJ.deadlines.isDone(d);
      const span = el("span", { className: `${ID}-check` });
      if (done) {
        span.innerHTML = CHECK;
        span.setAttribute("role", "img");
        span.setAttribute("aria-label", t("home_handedIn"));
      }
      return span;
    }

    function deadlineItem(d, now, onOpen) {
      const late = CJ.deadlines.needsYou(d);
      // Handed-in work under a day in Upcoming; new grades are listed without a tick.
      const ticked = !onOpen && CJ.deadlines.isDone(d);
      const link = ticked ? el("a", { href: d.url }, check(d), el("span", { textContent: d.title })) : el("a", { href: d.url, textContent: d.title });
      if (onOpen) for (const type of ["click", "auxclick"]) link.addEventListener(type, onOpen);
      return el("li", { className: ticked ? "is-done" : "" },
        link,
        el("span", { className: `${ID}-meta` },
          el("span", { textContent: `${courseName(d.courseId)} · ` }),
          el("span", { className: late ? `${ID}-red` : "", textContent: CJ.deadlines.describe(d, now, t, locale) })));
    }

    /** One deadline on a course card: tick, title and when it is due (or that it is handed in). */
    function task(d, now) {
      const done = CJ.deadlines.isDone(d);
      const when = done ? t("dl_" + d.status) : CJ.deadlines.relative(d.due, now, locale);
      return el("li", { className: done ? "is-done" : "" },
        check(d),
        el("a", { href: d.url, textContent: d.title, title: d.title }),
        el("span", { className: `${ID}-when ${CJ.deadlines.needsYou(d) ? `${ID}-red` : `${ID}-dim`}`, textContent: when }));
    }

    /**
     * The card's deadlines: a count with the next one left ("3 due · tomorrow 23:59") that opens
     * the whole list, handed-in work ticked.
     */
    function dueList(c, now) {
      if (!c.items.length) return el("div", { className: `${ID}-row ${ID}-dim`, textContent: t("dash_noDeadline") });
      const id = String(c.id);
      const open = openCards.has(id);
      const listId = `${ID}-tasks-${id}`;
      const count = c.due ? t("home_dueCount", [String(c.due)]) : t("home_doneCount", [String(c.items.length)]);
      const button = el("button", { type: "button", className: `${ID}-due` }, el("span"), el("strong", { textContent: count }),
        c.nextOpen ? el("span", { className: `${ID}-when ${c.late ? `${ID}-red` : `${ID}-dim`}`, textContent: CJ.deadlines.relative(c.nextOpen.due, now, locale) }) : null);
      button.firstChild.innerHTML = CHEVRON;
      button.firstChild.style.display = "contents";
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-controls", listId);
      button.addEventListener("click", () => toggleCard(id));
      const list = el("ul", { id: listId, className: `${ID}-tasks` }, ...c.items.map((d) => task(d, now)));
      list.inert = !open;
      return el("div", { className: open ? "is-open" : "" }, button, el("div", { className: `${ID}-fold` }, el("div", {}, list)));
    }

    /** Ask on the card before hiding it, with focus on the answer. */
    function ask(id) {
      asking = id;
      render();
      const b = root && root.querySelector(`.${ID}-ask button`);
      if (b) b.focus();
    }

    /** "Hide INF100 from Home+?" with Hide / Cancel, in place of the card's ×. Escape cancels. */
    function askHide(c) {
      const id = String(c.id);
      const yes = el("button", { type: "button", textContent: t("home_hideYes") });
      yes.addEventListener("click", () => setHidden(id, true));
      const no = el("button", { type: "button", textContent: t("nav_cancel") });
      no.addEventListener("click", () => cancelAsk(id));
      const box = el("div", { className: `${ID}-ask` },
        el("p", {}, el("strong", { textContent: t("home_hideAsk", [c.short || c.name]) })),
        el("p", { className: `${ID}-dim`, textContent: t("home_hideHint") }),
        el("div", {}, yes, no));
      box.setAttribute("role", "group");
      box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); cancelAsk(id); } });
      return box;
    }

    function cancelAsk(id) {
      asking = null;
      render();
      const h = root && root.querySelector(`[data-hide="${id}"]`);
      if (h) h.focus();
    }

    function courseCard(c, now) {
      const next = dueList(c, now);
      const hide = el("button", { type: "button", className: `${ID}-hide`, innerHTML: CLOSE, title: t("home_hide", [c.short || c.name]) });
      hide.setAttribute("aria-label", t("home_hide", [c.short || c.name]));
      hide.dataset.hide = String(c.id);
      hide.addEventListener("click", () => ask(String(c.id)));
      const score = CJ.dashboard.formatScore(c.score, locale);
      // A side note at the end of the icon row; the tooltip says what it is (Canvas' total so far).
      const scoreTag = score
        ? el("span", { className: `${ID}-score`, title: `${t("dash_score")} – ${t("home_scoreHelp")}` },
          el("span", { className: "screenreader-only", textContent: `${t("dash_score")}: ` }), score)
        : null;
      const resume = c.place
        ? el("div", { className: `${ID}-row` }, el("a", { href: c.place.url, textContent: `${t("dash_resume")} ${c.place.label} ›`, title: c.place.label }))
        : null;
      const li = el("li", { className: `${ID}-course` },
        asking === String(c.id) ? askHide(c) : hide,
        el("h3", {}, el("a", { href: `/courses/${encodeURIComponent(c.id)}`, textContent: c.short || c.name })),
        el("p", { className: `${ID}-name`, textContent: c.name, title: c.name }),
        next, resume, cardLinks(c.links, scoreTag));
      li.dataset.id = String(c.id);
      li.prepend(order.grip(c, li));
      order.dropTarget(li);
      return li;
    }

    /** Canvas' own icon links from its dashboard card (announcements, assignments, ...) with the unread badge. */
    function cardLinks(links, scoreTag) {
      if ((!links || !links.length) && !scoreTag) return null;
      return el("ul", { className: `${ID}-links` }, ...(links || []).map((l) => {
        const label = l.unread ? `${l.label} – ${t("home_unread", [String(l.unread)])}` : l.label;
        const a = el("a", { href: l.path, title: label },
          el("i", { className: l.icon }),
          l.unread ? el("span", { className: `${ID}-badge`, textContent: l.unread > 99 ? "99+" : String(l.unread) }) : null);
        a.setAttribute("aria-label", label);
        a.firstChild.setAttribute("aria-hidden", "true");
        return el("li", {}, a);
      }), scoreTag ? el("li", { className: `${ID}-scoreItem` }, scoreTag) : null);
    }

    function upcoming(h, now) {
      const out = [el("h2", { textContent: t("home_upcoming") })];
      if (!data.deadlines) return out.concat(skeletonRows(4));
      if (h.late.length) out.push(el("h3", { className: `${ID}-day ${ID}-red`, textContent: t("home_late") }), el("ul", { className: `${ID}-list` }, ...h.late.map((d) => deadlineItem(d, now))));
      for (const g of h.days) {
        // Today and tomorrow stand out from the days after.
        const soon = Math.round((g.day - H.startOfDay(now)) / 864e5) <= 1;
        out.push(el("h3", { className: `${ID}-day${soon ? " is-soon" : ""}`, textContent: dayLabel(g.day, now) }), el("ul", { className: `${ID}-list` }, ...g.items.map((d) => deadlineItem(d, now))));
      }
      if (!h.late.length && !h.days.length) out.push(el("p", { className: `${ID}-note`, textContent: t("home_empty") }));
      if (h.later) out.push(el("p", { className: `${ID}-note`, textContent: t("home_later", [String(h.later)]) }));
      return out;
    }

    /** "Reset order" under the cards, once you have put them in your own order. */
    function resetOrder() {
      if (!Object.keys(data.order).length) return null;
      const b = el("button", { type: "button", className: `${ID}-more`, textContent: t("home_resetOrder") });
      b.addEventListener("click", () => {
        order.save(null);
        const g = root && root.querySelector(`.${ID}-grip`);
        if (g) g.focus();
      });
      return el("div", {}, b);
    }

    /** "2 hidden courses · Show", and when shown, a button per course to bring it back. */
    function hiddenList(h) {
      if (!h.hiddenCourses.length) return null;
      const more = el("button", { type: "button", className: `${ID}-more`,
        textContent: `${t("home_hiddenCount", [String(h.hiddenCourses.length)])} · ${t(showHidden ? "home_showLess" : "home_show")}` });
      more.setAttribute("aria-expanded", String(showHidden));
      more.addEventListener("click", () => { showHidden = !showHidden; render(); const b = root && root.querySelector(`.${ID}-more`); if (b) b.focus(); });
      const list = showHidden
        ? el("ul", { className: `${ID}-hidden` }, ...h.hiddenCourses.map((c) => {
          const b = el("button", { type: "button", textContent: `${c.short || c.name} +`, title: t("home_unhide", [c.name]) });
          b.setAttribute("aria-label", t("home_unhide", [c.name]));
          b.addEventListener("click", () => setHidden(String(c.id), false));
          return el("li", {}, b);
        }))
        : null;
      return el("div", {}, more, list);
    }

    function render() {
      if (!root) return;
      if (order.holdRender()) return;
      const now = Date.now();
      const h = H.buildHome(Object.assign({}, data, { now }));
      let date = "";
      try { date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now); } catch {}
      let courses;
      if (!data.courses) {
        courses = skeletonCards();
      } else if (h.courses.length) {
        courses = el("ul", { className: `${ID}-courses${wasSkeleton ? " is-intro" : ""}` }, ...h.courses.map((c, i) => {
          const card = courseCard(c, now);
          card.style.setProperty("--i", String(Math.min(i, 8)));
          return card;
        }));
      } else {
        courses = el("p", { className: `${ID}-note`, textContent: t("home_noCourses") });
      }
      wasSkeleton = !data.courses;
      const focused = focusKey();
      const hiddenCourses = hiddenList(h);
      // Opening a grade in a new tab leaves this page as it is, so it is redrawn here.
      const opened = (d) => () => { markSeen(d.id); setTimeout(render); };
      const graded = h.graded.length
        ? [el("h2", { textContent: t("home_newGrades") }), el("ul", { className: `${ID}-list` }, ...h.graded.map((d) => deadlineItem(d, now, opened(d))))]
        : [];
      const s = h.summary;
      // One screen on a laptop: title over the date, the counts to the right.
      root.replaceChildren(
        el("div", { className: `${ID}-head` },
          el("div", {}, el("h1", { textContent: t("home_title") }), el("p", { className: `${ID}-date`, textContent: date })),
          // This week's deadlines always; late work and new grades only when there are any.
          el("div", { className: `${ID}-stats` },
            stat("home_statWeek", s.dueWeek, "week"),
            s.late ? stat("home_statLate", s.late, "late", "is-late") : null,
            s.newGrades ? stat("home_statGrades", s.newGrades, "graded", "is-new") : null)),
        el("div", { className: `${ID}-cols` },
          el("div", {},
            el("section", { className: `${ID}-section` }, el("h2", { textContent: t("home_courses") }), courses, hiddenCourses, data.courses ? resetOrder() : null),
            lectures(h, now)),
          el("div", {},
            el("section", { className: `${ID}-section` }, ...upcoming(h, now)),
            graded.length ? el("section", { className: `${ID}-section` }, ...graded) : null)));
      const again = focused && root.querySelector(focused);
      if (again) again.focus({ preventScroll: true });
    }

    /** A selector for the focused control on the page, to focus it again after a redraw. */
    function focusKey() {
      const a = document.activeElement;
      if (!a || !root.contains(a)) return null;
      const key = FOCUS_KEYS.find((k) => a.hasAttribute(k));
      return key ? `[${key}="${CSS.escape(a.getAttribute(key))}"]` : null;
    }

    async function load() {
      if (loaded) return;
      loaded = true;
      const eventsName = api.eventsName();
      const [hit, places, archived, hidden, order] = await Promise.all([
        api.peekMany(["courses", "deadlines", "scores", eventsName, "cards", "unread"]), api.getPlaces().catch(() => ({})), api.getArchived().catch(() => ({})),
        api.getMine("homeHidden").catch(() => ({})), api.getMine("homeOrder").catch(() => ({})),
      ]);
      data = Object.assign({}, data, { courses: hit.courses || null, deadlines: hit.deadlines || null, events: hit[eventsName] || null, scores: hit.scores || {}, links: hit.cards || {}, unread: hit.unread || {}, places, archived: new Set(Object.keys(archived)), hidden: new Set(Object.keys(hidden)), order });
      render();
      const settled = await Promise.allSettled([api.loadCourses(false), api.loadDeadlines(false), api.loadScores(false), api.loadCardLinks(false)]);
      const [c, d, s, l] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
      data = Object.assign({}, data, { courses: c || data.courses || [], deadlines: d || data.deadlines || [], scores: s || data.scores, links: l || data.links });
      for (const r of settled) if (r.status === "rejected") console.warn("Home+:", r.reason);
      render();
      // The unread badges only for the courses that have icon links (Canvas' dashboard cards).
      api.loadUnread(Object.keys(data.links), false)
        .then((u) => { data = Object.assign({}, data, { unread: u }); render(); })
        .catch((e) => console.warn("Home+ could not load unread counts:", e));
      try {
        data = Object.assign({}, data, { events: await api.loadEvents(data.courses.map((x) => x.id), false) });
        render();
      } catch (e) {
        console.warn("Home+ could not load today's lectures:", e);
        eventsFailed = true;
        render();
      }
    }

    function markActive(on) {
      const li = nav.item;
      keepActive(on);
      if (on) {
        wasActive = nav.menu.querySelector(`.${ACTIVE}:not(.${ID}-item)`);
        if (wasActive) wasActive.classList.remove(ACTIVE);
      } else if (wasActive) {
        wasActive.classList.add(ACTIVE);
        wasActive = null;
      }
      li.classList.toggle(ACTIVE, on);
      if (on) nav.button.setAttribute("aria-current", "page"); else nav.button.removeAttribute("aria-current");
    }

    // To Canvas this page is still "/", so when one of its trays (Courses, Account) closes it
    // marks Dashboard as the current item again. While Home is showing, it stays ours.
    function keepActive(on) {
      if (keeper) keeper.disconnect();
      keeper = null;
      if (!on) return;
      keeper = new MutationObserver(() => {
        const link = document.getElementById(DASHBOARD_LINK);
        const dash = link && link.closest("li");
        if (!dash || !dash.classList.contains(ACTIVE)) return;
        dash.classList.remove(ACTIVE);
        nav.item.classList.add(ACTIVE);
      });
      keeper.observe(nav.menu, { attributes: true, attributeFilter: ["class"], subtree: true });
    }

    function enter() {
      if (root) return;
      const content = document.getElementById("content");
      if (!content) return;
      document.documentElement.classList.add(ID);
      root = el("main", { id: ID });
      root.setAttribute("aria-label", t("home_title"));
      const dash = document.getElementById("dashboard");
      if (dash && dash.parentNode === content) dash.before(root); else content.prepend(root);
      oldTitle = document.title;
      document.title = `${t("home_title")} · Canvas`;
      markActive(true);
      render();
      load().catch((e) => console.warn("Home+ failed:", e));
      // Keep the countdowns honest, while the tab is in view; archiving in the tray changes the lists.
      timer = setInterval(() => { if (!document.hidden) render(); }, TICK);
      onVisible = () => { if (!document.hidden) render(); };
      document.addEventListener("visibilitychange", onVisible);
      onStorage = (changes, area) => {
        if (area !== "local") return;
        const own = `cj:${location.host}:`;
        const archive = changes[`${own}dlArchive`], hidden = changes[`${own}homeHidden`], order = changes[`${own}homeOrder`];
        if (!archive && !hidden && !order) return;
        if (order) data = Object.assign({}, data, { order: order.newValue || {} });
        if (archive) data = Object.assign({}, data, { archived: new Set(Object.keys(archive.newValue || {})) });
        if (hidden) data = Object.assign({}, data, { hidden: new Set(Object.keys(hidden.newValue || {})) });
        render();
      };
      chrome.storage.onChanged.addListener(onStorage);
    }

    function leave() {
      document.documentElement.classList.remove(ID);
      if (!root) return;
      root.remove();
      root = null;
      order.reset();
      if (oldTitle !== null) document.title = oldTitle;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
      markActive(false);
    }

    const route = () => (H.isHomeLocation(location) ? enter() : leave());
    window.addEventListener("hashchange", route);
    route();

    // With Canvas' Dashboard hidden in the menu, Home+ is where Canvas starts. early.js
    // does it before the page paints from the flag set here; the first time, this does it.
    function startHere(layout, atLoad) {
      const on = CJ.navorder.isHidden(layout, DASHBOARD_LINK);
      try { if (on) localStorage.setItem(START_KEY, "1"); else localStorage.removeItem(START_KEY); } catch {}
      if (on && atLoad && location.pathname === "/" && !location.hash) {
        history.replaceState(history.state, "", `/${location.search}${H.HASH}`);
        route();
      }
    }
    chrome.storage.sync.get(LAYOUT_KEY).then((s) => startHere(s[LAYOUT_KEY], true),
      (e) => console.warn("Home+ could not read the menu layout:", e));
    const onLayout = (changes, area) => { if (area === "sync" && changes[LAYOUT_KEY]) startHere(changes[LAYOUT_KEY].newValue, false); };
    chrome.storage.onChanged.addListener(onLayout);

    return {
      stop() {
        window.removeEventListener("hashchange", route);
        try { chrome.storage.onChanged.removeListener(onLayout); } catch {}
        try { localStorage.removeItem(START_KEY); } catch {}
        leave();
        nav.remove();
        style.remove();
      },
    };
  });
})();
