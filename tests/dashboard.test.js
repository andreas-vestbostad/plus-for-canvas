process.env.TZ = "Europe/Oslo";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/lib/deadlines.js");
const Dash = require("../src/lib/dashboard.js");

const NOW = Date.parse("2026-09-29T10:00:00+02:00");
const DAY = 864e5;
const dl = (id, courseId, offsetDays, status = "open", extra = {}) =>
  Object.assign({ id, title: id, courseId, url: `/courses/${courseId}/assignments/${id}`, due: NOW + offsetDays * DAY, status, gradedAt: null, feedback: false }, extra);

test("summary counts what is due this week, what is late and grades you have not seen", () => {
  const lists = D.arrange([
    dl("a", 1, 1), dl("b", 1, 6), dl("c", 2, 9),
    dl("late", 2, -2, "missing"), dl("old", 2, -3, "overdue"),
    dl("g", 1, -5, "graded", { gradedAt: NOW - 2 * DAY, unseen: true }),
    dl("seen", 1, -6, "graded", { gradedAt: NOW - 3 * DAY }),
    dl("s", 1, -1, "submitted"),
  ], NOW);
  assert.deepEqual(Dash.summary(lists, NOW), { dueWeek: 2, late: 2, newGrades: 1 });
});

test("summary is all zero for nothing", () => {
  assert.deepEqual(Dash.summary(D.arrange([], NOW), NOW), { dueWeek: 0, late: 0, newGrades: 0 });
});

test("per course: late work comes before the next open deadline, and is counted", () => {
  const lists = D.arrange([dl("next", 1, 2), dl("later", 1, 5), dl("late", 1, -1, "missing"), dl("other", 2, 1)], NOW);
  const c = Dash.perCourse(lists, 1);
  assert.equal(c.next.id, "late");
  assert.equal(c.late, 1);
  assert.equal(Dash.perCourse(lists, 2).next.id, "other");
  assert.deepEqual(Dash.perCourse(lists, 3), { next: null, late: 0, items: [] });
});

test("per course lists late work, then the rest by due date, handed-in work included", () => {
  const lists = Object.assign(D.arrange([dl("b", 1, 3), dl("a", 1, 1), dl("late", 1, -1, "missing"), dl("d", 1, 5)], NOW),
    { ahead: [dl("in", 1, 2, "submitted"), dl("other", 2, 2, "submitted")] });
  const c = Dash.perCourse(lists, 1);
  assert.deepEqual(c.items.map((d) => d.id), ["late", "a", "in"]);
  assert.equal(c.next.id, "late");
  assert.equal(c.late, 1);
  assert.deepEqual(Dash.perCourse(lists, 1, 10).items.map((d) => d.id), ["late", "a", "in", "b", "d"]);
});

test("per course matches ids given as strings from the page", () => {
  const lists = D.arrange([dl("x", 42, 1)], NOW);
  assert.equal(Dash.perCourse(lists, "42").next.id, "x");
});

test("courseOfPath finds the course of a page inside it, not its front page", () => {
  assert.equal(Dash.courseOfPath("/courses/12/modules"), "12");
  assert.equal(Dash.courseOfPath("/courses/12/assignments/5"), "12");
  assert.equal(Dash.courseOfPath("/courses/12"), null);
  assert.equal(Dash.courseOfPath("/courses/12/"), null);
  assert.equal(Dash.courseOfPath("/calendar"), null);
  assert.equal(Dash.courseOfPath("/courses/abc/pages"), null);
});

test("recordResume keeps the latest place per course and does not change the old map", () => {
  const before = { 12: { url: "/courses/12/modules", label: "Modules", t: 1 } };
  const after = Dash.recordResume(before, "12", { url: "/courses/12/pages/intro", label: "  Intro  " }, 5);
  assert.deepEqual(after[12], { url: "/courses/12/pages/intro", label: "Intro", t: 5 });
  assert.equal(before[12].url, "/courses/12/modules");
});

test("recordResume forgets the oldest courses past the limit", () => {
  let map = {};
  for (let i = 0; i < Dash.RESUME_MAX + 5; i++) map = Dash.recordResume(map, String(i), { url: `/courses/${i}/x`, label: "x" }, i);
  assert.equal(Object.keys(map).length, Dash.RESUME_MAX);
  assert.equal(map[0], undefined);
  assert.ok(map[Dash.RESUME_MAX + 4]);
});

test("recordResume shortens long labels and ignores bad entries", () => {
  const long = "x".repeat(300);
  assert.equal(Dash.recordResume({}, "1", { url: "/courses/1/x", label: long }, 1)[1].label.length, 80);
  assert.deepEqual(Dash.recordResume({}, "1", { url: "https://evil.test/", label: "x" }, 1), {});
  assert.deepEqual(Dash.recordResume({}, "1", { url: "/courses/2/x", label: "x" }, 1), {}, "url must belong to the course");
});

test("scores come from the student enrollment, and hidden or missing grades are left out", () => {
  const scores = Dash.scoresFromCourses([
    { id: 1, enrollments: [{ type: "student", computed_current_score: 78.25 }] },
    { id: 2, enrollments: [{ type: "teacher" }] },
    { id: 3, hide_final_grades: true, enrollments: [{ type: "student", computed_current_score: 90 }] },
    { id: 4, enrollments: [{ type: "student", computed_current_score: null }] },
    { id: 5 },
    null,
  ]);
  assert.deepEqual(scores, { 1: 78.25 });
});

test("formatScore shows a percent the local way, or nothing", () => {
  assert.equal(Dash.formatScore(78.25, "en"), "78.3%");
  assert.match(Dash.formatScore(78, "nb"), /^78\s?%$/);
  assert.equal(Dash.formatScore(undefined, "en"), null);
  assert.equal(Dash.formatScore(NaN, "en"), null);
});

test("cardLinks keeps the visible icon links under each card, inside that course only", () => {
  const links = Dash.cardLinks([
    { id: "7", links: [
      { icon: "icon-announcement", label: "Announcements", path: "/courses/7/announcements", hidden: null },
      { icon: "icon-folder", label: "Files", path: "/courses/7/files", hidden: true },
      { icon: "icon-assignment", label: "Other", path: "/courses/8/assignments" },
      { icon: "x\" onload=\"", label: "Bad", path: "/courses/7/x" },
      { icon: "icon-discussion", label: "Off site", path: "https://evil.test/courses/7/" },
    ] },
    { id: "9" },
    null,
  ]);
  assert.deepEqual(links, { 7: [{ icon: "icon-announcement", label: "Announcements", path: "/courses/7/announcements" }] });
});

test("unreadFromSummary counts what Canvas badges: announcements, discussions and due dates", () => {
  assert.deepEqual(Dash.unreadFromSummary([
    { type: "Announcement", notification_category: null, unread_count: 2 },
    { type: "DiscussionTopic", notification_category: null, unread_count: 0 },
    { type: "Message", notification_category: "Grading", unread_count: 4 },
    { type: "Message", notification_category: "Due Date", unread_count: 1 },
    { type: "Submission", unread_count: 3 },
  ]), { "icon-announcement": 2, "icon-assignment": 1 });
  assert.deepEqual(Dash.unreadFromSummary(null), {});
});
