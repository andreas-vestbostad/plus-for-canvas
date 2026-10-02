process.env.TZ = "Europe/Oslo";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/lib/deadlines.js");

const NOW = Date.parse("2026-09-29T10:00:00+02:00");
const DAY = 864e5;
const at = (offsetDays, hhmm = "23:59") => {
  const d = new Date(NOW + offsetDays * DAY);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const sub = (over = {}) => Object.assign({ submitted: false, graded: false, missing: false, late: false, excused: false }, over);
const item = (type, title, due, submissions = sub(), extra = {}) => Object.assign({
  plannable_type: type, plannable_date: due, course_id: 7, context_name: "INF140 26H / Intro",
  html_url: `/courses/7/assignments/${title}`, submissions, planner_override: null,
  plannable: { id: title, title, due_at: due, points_possible: 10 },
}, extra);

test("only things you hand in are deadlines; lectures and announcements are not", () => {
  const list = D.fromPlanner([
    item("assignment", "MA3", at(3)),
    item("quiz", "Quiz 4", at(1)),
    item("discussion_topic", "Forum", at(2)),
    item("calendar_event", "Forelesning", at(0, "10:15")),
    item("announcement", "News", at(-1)),
    item("wiki_page", "Page", at(1)),
    item("assignment", "No due date", null),
  ]);
  assert.deepEqual(list.map((d) => d.title), ["MA3", "Quiz 4", "Forum"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["assignmentId", "courseId", "due", "feedback", "gradedAt", "id", "status", "submittedAt", "title", "unseen", "url"]);
});

test("status comes from the submission, with the most final state winning", () => {
  const s = (submissions, extra) => D.fromPlanner([item("assignment", "A", at(-2), submissions, extra)], NOW)[0].status;
  assert.equal(s(sub({ excused: true, missing: true })), "excused");
  assert.equal(s(sub({ graded: true })), "graded");
  assert.equal(s(sub({ submitted: true, late: true })), "submitted");
  assert.equal(s(sub(), { planner_override: { marked_complete: true } }), "done");
  assert.equal(s(sub({ missing: true })), "missing");
  assert.equal(s(sub()), "overdue");
  assert.equal(s(false), "overdue", "items without a submission object");
  assert.equal(D.fromPlanner([item("assignment", "B", at(2))], NOW)[0].status, "open");
});

test("links stay on this Canvas site", () => {
  const [d] = D.fromPlanner([item("assignment", "A", at(1), sub(), { html_url: "https://evil.example/x" })]);
  assert.equal(d.url, "/x");
  const [e] = D.fromPlanner([item("assignment", "B", at(1), sub(), { html_url: "javascript:alert(1)" })]);
  assert.equal(e, undefined, "an item without a usable link is dropped");
});

test("arrange: what needs you first, then upcoming by date; handed in and graded apart", () => {
  const list = D.fromPlanner([
    item("assignment", "later", at(10)),
    item("assignment", "soon", at(1)),
    item("assignment", "handed in", at(2), sub({ submitted: true })),
    item("assignment", "missing", at(-3), sub({ missing: true })),
    item("assignment", "old missing", at(-40), sub({ missing: true })),
    item("assignment", "graded yesterday", at(-30), sub({ graded: true, posted_at: at(-1, "09:00") })),
    item("assignment", "graded today", at(-3), sub({ graded: true, posted_at: at(0, "08:00") })),
    item("assignment", "graded long ago", at(-30), sub({ graded: true, posted_at: at(-20) })),
  ], NOW);
  const { todo, submitted, graded, archived } = D.arrange(list, NOW);
  assert.deepEqual(todo.map((d) => d.title), ["missing", "soon", "later"]);
  assert.deepEqual(submitted.map((d) => d.title), ["handed in"]);
  assert.deepEqual(graded.map((d) => d.title), ["graded today", "graded yesterday"], "newest grade first, by when it was graded");
  assert.deepEqual(archived, []);
});

test("handed in work waits in its list until it is graded, newest first, even when grading takes weeks", () => {
  const list = D.fromPlanner([
    item("assignment", "ten days ago", at(-10), sub({ submitted: true })),
    item("assignment", "three days ago", at(-3), sub({ submitted: true })),
    item("assignment", "a month ago", at(-30), sub({ submitted: true })),
  ], NOW);
  assert.deepEqual(D.arrange(list, NOW).submitted.map((d) => d.title), ["three days ago", "ten days ago"]);
});

test("archived deadlines leave every list and wait in their own", () => {
  const list = D.fromPlanner([item("assignment", "A", at(1)), item("assignment", "B", at(2)), item("assignment", "C", at(-1), sub({ submitted: true }))], NOW);
  const ids = new Set([list[0].id, list[2].id]);
  const { todo, submitted, archived } = D.arrange(list, NOW, ids);
  assert.deepEqual(todo.map((d) => d.title), ["B"]);
  assert.deepEqual(submitted, []);
  assert.deepEqual(archived.map((d) => d.title), ["C", "A"], "by due date");
});

test("graded work knows when it was graded and whether there is feedback", () => {
  const [d] = D.fromPlanner([item("assignment", "A", at(-3), sub({ graded: true, has_feedback: true, posted_at: at(-1, "12:00") }))], NOW);
  assert.equal(d.gradedAt, Date.parse(at(-1, "12:00")));
  assert.equal(d.feedback, true);
});

test("a grade you have not looked at yet is unseen (the planner's new activity)", () => {
  const [fresh, seen] = D.fromPlanner([
    item("assignment", "A", at(-3), sub({ graded: true }), { new_activity: true }),
    item("assignment", "B", at(-3), sub({ graded: true }), { new_activity: false }),
  ], NOW);
  assert.equal(fresh.unseen, true);
  assert.equal(seen.unseen, false);
});

test("a cached open deadline that has since passed counts as overdue", () => {
  const [d] = D.fromPlanner([item("assignment", "A", at(1))], NOW);
  const { todo } = D.arrange([d], NOW + 3 * DAY);
  assert.equal(todo[0].status, "overdue");
  assert.equal(d.status, "open", "the input is not changed");
});

test("relative time: hours when close, today/tomorrow, weekday this week, else the date", () => {
  const nb = (iso) => D.relative(iso, NOW, "nb");
  const en = (iso) => D.relative(iso, NOW, "en-GB");
  assert.equal(en(new Date(NOW + 3 * 3600e3).toISOString()), "in 3 hours");
  assert.equal(en(at(0)), "today 23:59");
  assert.equal(en(at(1)), "tomorrow 23:59");
  assert.equal(en(at(3)), "Friday 23:59", "NOW is a Tuesday");
  assert.equal(en(at(9)), "8 Oct 23:59");
  assert.equal(en(at(-1, "12:00")), "yesterday 12:00");
  assert.equal(en(at(-5)), "24 Sept 23:59");
  assert.equal(nb(at(1)), "i morgen 23:59");
  assert.equal(nb(at(3)), "fredag 23:59");
});

test("relative time does not break on a locale the browser does not know", () => {
  assert.equal(typeof D.relative(at(2), NOW, "xx-invalid!!"), "string");
});

test("describe: status for late and finished work, countdown otherwise", () => {
  const t = (k) => ({ dl_missing: "missing", dl_overdue: "overdue", dl_submitted: "handed in", dl_graded: "graded", dl_feedback: "new comment" }[k] || k);
  const d = (status, off) => ({ status, due: Date.parse(at(off)) });
  assert.equal(D.describe(d("missing", -2), NOW, t, "en-GB"), "missing · 27 Sept 23:59");
  assert.equal(D.describe(d("submitted", 1), NOW, t, "en-GB"), "handed in");
  assert.equal(D.describe(Object.assign(d("submitted", -2), { feedback: true }), NOW, t, "en-GB"), "handed in · new comment");
  assert.equal(D.describe(d("open", 1), NOW, t, "en-GB"), "tomorrow 23:59");
  const g = { status: "graded", due: Date.parse(at(-5)), gradedAt: Date.parse(at(-1, "12:00")), feedback: true };
  assert.equal(D.describe(g, NOW, t, "en-GB"), "graded yesterday 12:00 · new comment");
  const h = { status: "submitted", due: Date.parse(at(1)), submittedAt: Date.parse(at(-1, "14:32")) };
  assert.equal(D.describe(h, NOW, t, "en-GB"), "handed in yesterday 14:32");
});

test("withSubmittedAt: when you handed in, from Canvas submissions", () => {
  const list = D.fromPlanner([
    item("assignment", "A", at(1), sub({ submitted: true })),
    item("quiz", "Q", at(1), sub({ submitted: true }), { plannable: { id: "q9", title: "Q", due_at: at(1), assignment_id: 55 } }),
    item("discussion_topic", "F", at(1), sub({ submitted: true })),
    item("assignment", "B", at(2)),
  ]);
  assert.deepEqual(list.filter(D.needsSubmittedAt).map((d) => d.assignmentId), ["A", "55"], "only handed in work with an assignment");
  const out = D.withSubmittedAt(list, [
    { assignment_id: "A", submitted_at: at(-1, "14:32") },
    { assignment_id: 55, submitted_at: null },
  ]);
  assert.equal(out[0].submittedAt, Date.parse(at(-1, "14:32")));
  assert.equal(out[1].submittedAt, null, "no time, no change");
  assert.equal(D.needsSubmittedAt(out[0]), false);
});

test("keepSubmittedAt carries hand-in times over from the cache", () => {
  const list = [{ assignmentId: "1", submittedAt: null }, { assignmentId: "2", submittedAt: null }, { assignmentId: null, submittedAt: null }];
  const out = D.keepSubmittedAt(list, [{ assignmentId: "1", submittedAt: 5 }, { assignmentId: "2", submittedAt: null }]);
  assert.deepEqual(out.map((d) => d.submittedAt), [5, null, null]);
  assert.deepEqual(D.keepSubmittedAt(list, null), list, "no cache");
});

test("openAt finds the open deadline whose page you are on", () => {
  const list = [
    { id: "assignment:1", url: "/courses/7/assignments/1", status: "open" },
    { id: "quiz:2", url: "/courses/7/quizzes/2", status: "overdue" },
    { id: "assignment:3", url: "/courses/7/assignments/3", status: "submitted" },
  ];
  assert.equal(D.openAt(list, "/courses/7/assignments/1").id, "assignment:1");
  assert.equal(D.openAt(list, "/courses/7/assignments/1/").id, "assignment:1");
  assert.equal(D.openAt(list, "/courses/7/quizzes/2/take").id, "quiz:2");
  assert.equal(D.openAt(list, "/courses/7/assignments/1?module_item_id=4#top").id, "assignment:1");
  assert.equal(D.openAt(list, "/courses/7/assignments/10"), null, "not a prefix of another id");
  assert.equal(D.openAt(list, "/courses/7/assignments/3"), null, "handed in already");
  assert.equal(D.openAt(null, "/courses/7/assignments/1"), null);
});
