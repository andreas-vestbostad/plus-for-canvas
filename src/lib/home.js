// What Home+ shows: the summary, late work, what is due in the next two weeks by
// day, grades you have not seen yet and the courses, most urgent first. Pure; the module fetches
// and renders.
(function (root) {
  "use strict";
  const CJ = root.CJ || {};
  const D = CJ.deadlines || require("./deadlines.js");
  const Dash = CJ.dashboard || require("./dashboard.js");

  const DAY = 864e5;
  const AHEAD = 14 * DAY;
  const GRADED_MAX = 5;
  const CARD_MAX = 50;
  const HASH = "#cj-home";

  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  const rel = (CJ.pathOf ? CJ : require("./match.js")).pathOf;

  /** Calendar events API -> [{ id, title, start, end, allDay, location, courseId, url }]. */
  function eventsFromCalendar(list) {
    const out = [];
    for (const e of list || []) {
      if (!e || !e.id || e.workflow_state === "deleted") continue;
      const start = Date.parse(e.start_at || "");
      if (!Number.isFinite(start)) continue;
      const end = Date.parse(e.end_at || "");
      const course = /^course_(\d+)$/.exec(e.context_code || "");
      out.push({
        id: String(e.id), title: String(e.title || ""), start, end: Number.isFinite(end) ? end : start, allDay: !!e.all_day,
        location: String(e.location_name || ""), courseId: course ? course[1] : null, url: rel(e.html_url),
      });
    }
    return out;
  }

  /** Today's events (lectures, groups), earliest first. */
  function ofToday(events, now) {
    const from = startOfDay(now), to = from + DAY;
    return (events || []).filter((e) => e.start < to && (e.end > from || e.start >= from))
      .sort((a, b) => a.start - b.start || a.end - b.end);
  }

  /** Whether an event is still to come or going on. All-day ones last the day. */
  const notOver = (e, now) => e.allDay || e.end > now;

  /** Whether this location is Home+: the front page with our hash. */
  const isHomeLocation = (loc) => !!loc && loc.pathname === "/" && loc.hash === HASH;

  /** Open work in the next two weeks, one group per day. */
  function byDay(open, now) {
    const days = [];
    for (const d of open) {
      if (d.due - now >= AHEAD) continue;
      const day = startOfDay(d.due);
      const last = days[days.length - 1];
      if (last && last.day === day) last.items.push(d);
      else days.push({ day, items: [d] });
    }
    return days;
  }

  /** The course cards: favourites (all courses when none is), late first, then the next deadline. */
  /** The courses Home shows: favourites, or all courses when none is. */
  const shownCourses = (courses) => { const favs = courses.filter((c) => c.fav); return favs.length ? favs : courses; };

  /**
   * The course cards, less the ones you hid, late first, then the next deadline. Each has all its
   * deadlines (`items`, handed-in work ticked), how many are left (`due`) and the next one left.
   * Once you have put the cards in your own order ({ courseId: position }), that order wins and
   * courses it does not have come after, sorted as above.
   */
  function courseCards(courses, lists, scores, places, links, unread, hidden, order) {
    const cards = shownCourses(courses).filter((c) => !hidden.has(String(c.id))).map((c) => {
      const { next, late, items } = Dash.perCourse(lists, c.id, CARD_MAX);
      const left = items.filter((d) => !D.isDone(d));
      const score = scores[c.id];
      return {
        id: c.id, name: c.name, code: c.code, short: c.short, next, late, items, due: left.length, nextOpen: left[0] || null,
        score: typeof score === "number" && Number.isFinite(score) ? score : null,
        place: places[c.id] || null,
        links: (links[c.id] || []).map((l) => Object.assign({}, l, { unread: (unread[c.id] || {})[l.icon] || 0 })),
      };
    });
    const rank = (c) => (c.late ? 0 : c.next ? 1 : 2);
    const place = (c) => (Number.isFinite(order[c.id]) ? order[c.id] : Infinity);
    return cards.sort((a, b) => (place(a) - place(b) || 0) || rank(a) - rank(b) || b.late - a.late ||
      (a.next && b.next ? a.next.due - b.next.due : 0) || String(a.name).localeCompare(String(b.name)));
  }

  function buildHome({ courses = [], deadlines = [], events = [], archived = new Set(), seen = new Set(), hidden = new Set(), order = {}, scores = {}, places = {}, links = {}, unread = {}, now = Date.now() } = {}) {
    const all = D.arrange(deadlines || [], now, archived);
    // A grade you have looked at is old news: Canvas' "new activity", less what you opened
    // from here since the deadlines were last fetched.
    // Work you handed in stays, ticked off, until it is due.
    const ahead = (deadlines || []).filter((d) => D.isDone(d) && d.due > now && !archived.has(d.id));
    const lists = Object.assign({}, all, { ahead, graded: all.graded.filter((d) => d.unseen && !seen.has(d.id)) });
    const late = lists.todo.filter(D.needsYou);
    const open = lists.todo.filter((d) => !D.needsYou(d));
    const days = byDay(open.concat(ahead).sort((a, b) => a.due - b.due), now);
    const shown = days.reduce((n, g) => n + g.items.filter((d) => !D.isDone(d)).length, 0);
    return {
      summary: Dash.summary(lists, now),
      today: ofToday(events, now).filter((e) => notOver(e, now)),
      // Today's that are over, so the page can say there are no more rather than none.
      todayOver: ofToday(events, now).filter((e) => !notOver(e, now)).length,
      late,
      days,
      later: open.length - shown,
      graded: lists.graded.slice(0, GRADED_MAX),
      courses: courseCards(courses || [], lists, scores || {}, places || {}, links || {}, unread || {}, hidden, order || {}),
      hiddenCourses: shownCourses(courses || []).filter((c) => hidden.has(String(c.id))).map((c) => ({ id: c.id, short: c.short, name: c.name })),
    };
  }

  /**
   * The order ({ courseId: position }) after you put the cards shown in the order `ids`. Courses
   * not shown now (hidden ones) keep their place, so they come back where they were.
   */
  function reorder(order, ids) {
    const shown = new Set(ids.map(String));
    const before = Object.keys(order || {}).sort((a, b) => order[a] - order[b]);
    const all = before.concat(ids.map(String).filter((id) => !before.includes(id)));
    const next = ids.map(String);
    return Object.fromEntries(all.map((id) => (shown.has(id) ? next.shift() : id)).map((id, i) => [id, i]));
  }

  const api = { HASH, isHomeLocation, eventsFromCalendar, buildHome, startOfDay, reorder };
  root.CJ = Object.assign(root.CJ || {}, { home: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
