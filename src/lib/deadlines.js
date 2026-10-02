// Deadlines from the Canvas planner: only things you hand in, with a status and a
// human countdown ("tomorrow 23:59"). Pure; the caller fetches and renders.
(function (root) {
  "use strict";
  const { pathOf } = (root.CJ && root.CJ.pathOf) ? root.CJ : require("./match.js");

  // Planner types that have a due date you work towards. Lectures, announcements and
  // pages also show up in the planner, but they are not deadlines.
  const DUE_TYPES = new Set(["assignment", "quiz", "discussion_topic", "sub_assignment"]);
  const DONE = new Set(["excused", "graded", "submitted", "done"]);
  const GRADED = new Set(["excused", "graded"]);
  const DAY = 864e5;
  // Late work older than this is noise. Handed in work stays until it is graded (grading
  // often takes weeks), up to the same limit; a new grade shows for two weeks.
  const TODO_WINDOW = 21 * DAY;
  const GRADED_WINDOW = 14 * DAY;

  /** Canvas URL -> path on this site, or null for anything that is not a plain path. */
  function sitePath(url) {
    const path = pathOf(url);
    return /^\/(?!\/)/.test(path) ? path : null;
  }

  function statusOf(item, due, now) {
    const s = item.submissions || {};
    if (s.excused) return "excused";
    if (s.graded) return "graded";
    if (s.submitted) return "submitted";
    if (item.planner_override && item.planner_override.marked_complete) return "done";
    if (s.missing) return "missing";
    return due < now ? "overdue" : "open";
  }

  /**
   * Planner API items -> [{ id, title, courseId, assignmentId, url, due, status, submittedAt,
   * gradedAt, feedback, unseen }]. Times are epoch ms; gradedAt is when the grade was posted,
   * or null. The planner does not say when you handed in, so submittedAt starts as null (see
   * withSubmittedAt). unseen is Canvas' "new activity": a grade or feedback you have not opened yet.
   */
  function fromPlanner(items, now = Date.now()) {
    const out = [];
    for (const it of items || []) {
      const p = it && it.plannable;
      if (!p || !DUE_TYPES.has(it.plannable_type)) continue;
      const due = Date.parse(p.due_at || it.plannable_date || "");
      const url = sitePath(it.html_url);
      if (!Number.isFinite(due) || !url || !p.title) continue;
      out.push({
        id: `${it.plannable_type}:${p.id}`, title: String(p.title).trim(), courseId: it.course_id || null,
        assignmentId: it.plannable_type === "assignment" ? String(p.id) : (p.assignment_id ? String(p.assignment_id) : null),
        url, due, status: statusOf(it, due, now), submittedAt: null,
        gradedAt: (it.submissions && Date.parse(it.submissions.posted_at || "")) || null,
        feedback: !!(it.submissions && it.submissions.has_feedback),
        unseen: !!it.new_activity,
      });
    }
    return out;
  }

  /** Handed in, but the planner has not said when: these need a look at their submission. */
  const needsSubmittedAt = (d) => d.status === "submitted" && !d.submittedAt && !!d.assignmentId && !!d.courseId;

  /** Fill in submittedAt from Canvas submissions ({ assignment_id, submitted_at }). */
  function withSubmittedAt(list, submissions) {
    const when = new Map();
    for (const s of submissions || []) {
      const t = s && Date.parse(s.submitted_at || "");
      if (Number.isFinite(t)) when.set(String(s.assignment_id), t);
    }
    return list.map((d) => (d.assignmentId && when.has(d.assignmentId) ? Object.assign({}, d, { submittedAt: when.get(d.assignmentId) }) : d));
  }

  /** Keep submittedAt from an earlier list (the cache), so each hand-in is looked up only once. */
  function keepSubmittedAt(list, before) {
    const when = new Map((before || []).filter((d) => d && d.assignmentId && d.submittedAt).map((d) => [d.assignmentId, d.submittedAt]));
    return list.map((d) => (d.assignmentId && !d.submittedAt && when.has(d.assignmentId) ? Object.assign({}, d, { submittedAt: when.get(d.assignmentId) }) : d));
  }

  const isDone = (d) => DONE.has(d.status);
  const needsYou = (d) => d.status === "missing" || d.status === "overdue";

  /**
   * The lists the tray shows: what is left (late work first, then by due date), what you
   * handed in that is not graded yet (newest first), what was graded lately (newest grade
   * first), and what you archived.
   */
  function arrange(list, now = Date.now(), archivedIds = new Set()) {
    // Status is worked out when fetched; a cached "open" may have passed since.
    const current = list.map((d) => (d.status === "open" && d.due < now ? Object.assign({}, d, { status: "overdue" }) : d));
    const kept = current.filter((d) => !archivedIds.has(d.id));
    const byDue = (a, b) => a.due - b.due;
    const gradedTime = (d) => d.gradedAt || d.due;
    const late = kept.filter((d) => needsYou(d) && now - d.due < TODO_WINDOW).sort((a, b) => b.due - a.due);
    const open = kept.filter((d) => d.status === "open").sort(byDue);
    return {
      todo: late.concat(open),
      submitted: kept.filter((d) => isDone(d) && !GRADED.has(d.status) && now - d.due < TODO_WINDOW).sort((a, b) => b.due - a.due),
      graded: kept.filter((d) => GRADED.has(d.status) && now - gradedTime(d) < GRADED_WINDOW)
        .sort((a, b) => gradedTime(b) - gradedTime(a)),
      archived: current.filter((d) => archivedIds.has(d.id)).sort(byDue),
    };
  }

  function formatters(locale) {
    try {
      return {
        rel: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
        time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
        weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }),
        date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      };
    } catch {
      return formatters("en");
    }
  }

  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /**
   * How far off a deadline is, the way you would say it: "in 3 hours", "today 23:59",
   * "tomorrow 23:59", "Thursday 23:59" within the week, else "9 Oct 23:59".
   */
  function relative(dueIso, now = Date.now(), locale = "en") {
    const due = typeof dueIso === "number" ? dueIso : Date.parse(dueIso);
    const f = formatters(locale);
    const hours = (due - now) / 3600e3;
    if (hours > 0 && hours < 6) return f.rel.format(Math.max(1, Math.round(hours)), "hour");
    const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
    const clock = f.time.format(due);
    if (Math.abs(days) <= 1) return `${f.rel.format(days, "day")} ${clock}`;
    if (days > 1 && days < 7) return `${f.weekday.format(due)} ${clock}`;
    return `${f.date.format(due)} ${clock}`;
  }

  /** One line for a deadline: its status when that says more than the date, else the countdown. */
  function describe(d, now, t, locale) {
    const when = relative(d.due, now, locale);
    if (needsYou(d)) return `${t("dl_" + d.status)} · ${when}`;
    if (!isDone(d)) return when;
    const at = d.status === "graded" ? d.gradedAt : d.status === "submitted" ? d.submittedAt : null;
    const text = at ? `${t("dl_" + d.status)} ${relative(at, now, locale)}` : t("dl_" + d.status);
    return d.feedback ? `${text} · ${t("dl_feedback")}` : text;
  }

  /** The deadline still open whose page (or a page under it, like a quiz attempt) is this path, or null. */
  function openAt(list, path) {
    const here = String(path || "").split(/[?#]/)[0].replace(/\/+$/, "");
    return (list || []).find((d) => {
      if (isDone(d)) return false;
      const url = d.url.split(/[?#]/)[0].replace(/\/+$/, "");
      return here === url || here.startsWith(url + "/");
    }) || null;
  }

  const api = { fromPlanner, needsSubmittedAt, withSubmittedAt, keepSubmittedAt, arrange, relative, describe, isDone, needsYou, openAt };
  root.CJ = Object.assign(root.CJ || {}, { deadlines: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
