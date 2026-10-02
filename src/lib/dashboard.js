// What the dashboard shows: a summary line over the course cards, and per card the next
// deadline, the current score and where you left off. Pure; the module fetches and renders.
(function (root) {
  "use strict";

  const DAY = 864e5;
  // "Due this week" in the summary, the same window as the Deadlines badge.
  const WEEK = 7 * DAY;
  // Courses to remember a last place for; the oldest are forgotten first.
  const RESUME_MAX = 60;
  const LABEL_MAX = 80;

  const { needsYou } = (root.CJ && root.CJ.deadlines) || require("./deadlines.js");

  /** Counts for the summary line, from CJ.deadlines.arrange(). */
  function summary(lists, now = Date.now()) {
    const todo = lists.todo || [];
    return {
      dueWeek: todo.filter((d) => !needsYou(d) && d.due - now < WEEK).length,
      late: todo.filter(needsYou).length,
      newGrades: (lists.graded || []).filter((d) => d.unseen).length,
    };
  }

  /**
   * A course card's deadlines: the next one (late work first, like the tray), how many are late,
   * and up to `max` to list on the card: what is left, then what you handed in that is not due yet
   * (`lists.ahead`), in the order they are due.
   */
  function perCourse(lists, courseId, max = 3) {
    const id = String(courseId);
    const mine = (lists.todo || []).filter((d) => String(d.courseId) === id);
    const late = mine.filter(needsYou);
    const rest = mine.filter((d) => !needsYou(d)).concat((lists.ahead || []).filter((d) => String(d.courseId) === id))
      .sort((a, b) => a.due - b.due);
    return { next: mine[0] || null, late: late.length, items: late.concat(rest).slice(0, max) };
  }

  /** The course a path belongs to, for pages inside a course. Its front page does not count. */
  function courseOfPath(path) {
    const m = /^\/courses\/(\d+)\/[^/?#]/.exec(String(path || ""));
    return m ? m[1] : null;
  }

  /** A new map with this place remembered as the latest in its course. Keeps RESUME_MAX courses. */
  function recordResume(map, courseId, { url, label }, now = Date.now()) {
    const id = String(courseId);
    if (courseOfPath(url) !== id) return Object.assign({}, map);
    const text = String(label || "").trim().slice(0, LABEL_MAX);
    const next = Object.assign({}, map, { [id]: { url, label: text, t: now } });
    const keys = Object.keys(next);
    if (keys.length <= RESUME_MAX) return next;
    const keep = keys.sort((a, b) => next[b].t - next[a].t).slice(0, RESUME_MAX);
    return Object.fromEntries(keep.map((k) => [k, next[k]]));
  }

  /** Courses API (include[]=total_scores) -> { courseId: current score in percent }. */
  function scoresFromCourses(courses) {
    const out = {};
    for (const c of courses || []) {
      if (!c || !c.id || c.hide_final_grades) continue;
      const e = (c.enrollments || []).find((x) => x && x.type === "student" && Number.isFinite(x.computed_current_score));
      if (e) out[c.id] = e.computed_current_score;
    }
    return out;
  }

  /** "78.3%" / "78 %", or null when there is no score. */
  function formatScore(score, locale = "en") {
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    try {
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(score / 100);
    } catch {
      return formatScore(score, "en");
    }
  }

  // Which unread count Canvas shows on which card icon (its DashboardCard does the same).
  const UNREAD_TYPE = { "icon-announcement": "Announcement", "icon-discussion": "DiscussionTopic", "icon-assignment": "Message" };
  const ICON_RE = /^icon-[a-z-]+$/;

  /** Dashboard cards API -> { courseId: [{ icon, label, path }] }, the icon links under each card. */
  function cardLinks(cards) {
    const out = {};
    for (const c of cards || []) {
      if (!c || !c.id || !Array.isArray(c.links)) continue;
      const own = `/courses/${c.id}/`;
      out[c.id] = c.links
        .filter((l) => l && !l.hidden && ICON_RE.test(String(l.icon || "")) && String(l.path || "").startsWith(own))
        .map((l) => ({ icon: l.icon, label: String(l.label || ""), path: l.path }));
    }
    return out;
  }

  /** A course's activity stream summary -> { icon: unread count } for the card icons that have one. */
  function unreadFromSummary(list) {
    const out = {};
    for (const [icon, type] of Object.entries(UNREAD_TYPE)) {
      const hit = (list || []).find((s) => s && s.type === type && (type !== "Message" || s.notification_category === "Due Date"));
      const n = hit && Number(hit.unread_count);
      if (n > 0) out[icon] = n;
    }
    return out;
  }

  const api = { RESUME_MAX, cardLinks, unreadFromSummary, summary, perCourse, courseOfPath, recordResume, scoresFromCourses, formatScore };
  root.CJ = Object.assign(root.CJ || {}, { dashboard: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
