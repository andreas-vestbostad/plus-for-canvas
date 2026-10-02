process.env.TZ = "Europe/Oslo";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../src/lib/home.js");

const NOW = Date.parse("2026-09-29T10:00:00+02:00");
const DAY = 864e5;
const dl = (id, courseId, offsetDays, status = "open", extra = {}) =>
  Object.assign({ id, title: id, courseId, url: `/courses/${courseId}/assignments/${id}`, due: NOW + offsetDays * DAY, status, gradedAt: null, feedback: false }, extra);
const course = (id, extra = {}) => Object.assign({ id, name: `Course ${id}`, code: `C${id}`, short: `C${id}`, fav: false, term: "" }, extra);

test("the summary is the same as on the dashboard", () => {
  const h = H.buildHome({ courses: [], deadlines: [dl("a", 1, 1), dl("late", 1, -1, "missing")], now: NOW });
  assert.deepEqual(h.summary, { dueWeek: 1, late: 1, newGrades: 0 });
});

test("late work comes first, then upcoming work grouped by day", () => {
  const h = H.buildHome({ courses: [], deadlines: [dl("b", 1, 1.2), dl("a", 1, 1), dl("c", 2, 3), dl("late", 1, -1, "missing")], now: NOW });
  assert.deepEqual(h.late.map((d) => d.id), ["late"]);
  assert.deepEqual(h.days.map((g) => g.items.map((d) => d.id)), [["a", "b"], ["c"]]);
  assert.equal(new Date(h.days[0].day).getDate(), 30);
  assert.equal(new Date(h.days[0].day).getHours(), 0);
});

test("upcoming stops after two weeks and counts what is later", () => {
  const h = H.buildHome({ courses: [], deadlines: [dl("soon", 1, 2), dl("far", 1, 20), dl("farther", 1, 30)], now: NOW });
  assert.deepEqual(h.days.flatMap((g) => g.items.map((d) => d.id)), ["soon"]);
  assert.equal(h.later, 2);
});

test("archived deadlines are left out", () => {
  const h = H.buildHome({ courses: [], deadlines: [dl("a", 1, 1), dl("b", 1, 2)], archived: new Set(["a"]), now: NOW });
  assert.deepEqual(h.days.flatMap((g) => g.items.map((d) => d.id)), ["b"]);
});

test("courses: favourites only when there are any, most urgent first", () => {
  const courses = [course(1, { fav: true }), course(2, { fav: true }), course(3, { fav: true }), course(4)];
  const h = H.buildHome({
    courses,
    deadlines: [dl("x", 1, 5), dl("y", 2, 1), dl("late", 3, -1, "missing"), dl("z", 4, 1)],
    scores: { 2: 88.5 }, places: { 1: { url: "/courses/1/pages/p", label: "P" } }, now: NOW,
  });
  assert.deepEqual(h.courses.map((c) => c.id), [3, 2, 1]);
  assert.equal(h.courses[0].late, 1);
  assert.equal(h.courses[1].score, 88.5);
  assert.equal(h.courses[2].place.label, "P");
  assert.equal(h.courses[2].next.id, "x");
});

test("courses: your own order wins, and courses it does not have come after", () => {
  const courses = [course(1), course(2), course(3), course(4)];
  const deadlines = [dl("late", 3, -1, "missing"), dl("y", 4, 1)];
  assert.deepEqual(H.buildHome({ courses, deadlines, now: NOW }).courses.map((c) => c.id), [3, 4, 1, 2]);
  const h = H.buildHome({ courses, deadlines, order: { 2: 0, 1: 1 }, now: NOW });
  assert.deepEqual(h.courses.map((c) => c.id), [2, 1, 3, 4]);
});

test("reorder: a hidden course keeps its place for when it comes back", () => {
  assert.deepEqual(H.reorder({}, [3, 1, 2]), { 3: 0, 1: 1, 2: 2 });
  // Course 2 is hidden; you move 3 in front of 1.
  assert.deepEqual(H.reorder({ 1: 0, 2: 1, 3: 2 }, [3, 1]), { 3: 0, 2: 1, 1: 2 });
  assert.deepEqual(H.reorder({ 1: 0 }, [2, 1]), { 2: 0, 1: 1 }, "new courses join in");
});

test("courses without a deadline come last, by name; all courses when none is a favourite", () => {
  const h = H.buildHome({ courses: [course(2, { name: "Beta" }), course(1, { name: "Alfa" }), course(3)], deadlines: [dl("d", 3, 1)], now: NOW });
  assert.deepEqual(h.courses.map((c) => c.id), [3, 1, 2]);
  assert.equal(h.courses[1].next, null);
  assert.equal(h.courses[1].score, null);
});

test("recently graded work is listed, newest first, at most five", () => {
  const graded = [1, 2, 3, 4, 5, 6].map((i) => dl(`g${i}`, 1, -i, "graded", { gradedAt: NOW - i * 3600e3, unseen: true }));
  const h = H.buildHome({ courses: [], deadlines: graded, now: NOW });
  assert.deepEqual(h.graded.map((d) => d.id), ["g1", "g2", "g3", "g4", "g5"]);
});

test("only grades you have not seen are listed and counted", () => {
  const h = H.buildHome({
    courses: [],
    deadlines: [
      dl("new", 1, -1, "graded", { gradedAt: NOW - 3600e3, unseen: true }),
      dl("old", 1, -2, "graded", { gradedAt: NOW - 7200e3 }),
      dl("opened", 1, -3, "graded", { gradedAt: NOW - 9000e3, unseen: true }),
    ],
    seen: new Set(["opened"]),
    now: NOW,
  });
  assert.deepEqual(h.graded.map((d) => d.id), ["new"]);
  assert.equal(h.summary.newGrades, 1);
});

test("nothing loaded yet gives empty lists, not errors", () => {
  const h = H.buildHome({ now: NOW });
  assert.deepEqual(h, { summary: { dueWeek: 0, late: 0, newGrades: 0 }, late: [], days: [], later: 0, graded: [], courses: [], today: [], todayOver: 0, hiddenCourses: [] });
});

test("isHomeLocation matches only the front page with the home hash", () => {
  assert.equal(H.isHomeLocation({ pathname: "/", hash: "#cj-home" }), true);
  assert.equal(H.isHomeLocation({ pathname: "/", hash: "" }), false);
  assert.equal(H.isHomeLocation({ pathname: "/courses", hash: "#cj-home" }), false);
});

const ev = (id, start, end, extra = {}) => Object.assign({
  id, title: `INF${id}: Forelesning`, start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), all_day: false,
  location_name: "Auditorium 1", context_code: "course_7", html_url: `https://canvas.test/calendar?event_id=${id}`, workflow_state: "active",
}, extra);
const at = (h, m = 0) => { const d = new Date(NOW); d.setHours(h, m, 0, 0); return d.getTime(); };

test("eventsFromCalendar keeps what the page needs from Canvas' calendar events", () => {
  const out = H.eventsFromCalendar([ev(1, at(8, 15), at(10)), ev(2, at(12), at(14), { workflow_state: "deleted" }), null, { id: 3 }]);
  assert.deepEqual(out, [{ id: "1", title: "INF1: Forelesning", start: at(8, 15), end: at(10), allDay: false, location: "Auditorium 1", courseId: "7", url: "/calendar?event_id=1" }]);
});

test("today's lectures: only today and not over yet, earliest first", () => {
  const events = H.eventsFromCalendar([ev(2, at(12), at(14)), ev(1, at(9, 15), at(11)), ev(5, at(8, 15), at(10)),
    ev(3, at(8) + DAY, at(10) + DAY), ev(4, at(8) - DAY, at(10) - DAY), ev(6, at(0), at(0) + DAY, { all_day: true })]);
  const h = H.buildHome({ courses: [], deadlines: [], events, now: NOW });
  assert.deepEqual(h.today.map((e) => e.id), ["6", "1", "2"], "the 08:15–10:00 lecture is over at 10:00");
  assert.equal(h.todayOver, 1);
  assert.deepEqual(H.buildHome({ courses: [], deadlines: [], now: NOW }).today, [], "no events, no list");
});

test("course cards carry Canvas' icon links with their unread counts", () => {
  const links = { 1: [{ icon: "icon-announcement", label: "A", path: "/courses/1/announcements" }, { icon: "icon-folder", label: "F", path: "/courses/1/files" }] };
  const h = H.buildHome({ courses: [course(1), course(2)], links, unread: { 1: { "icon-announcement": 3 } }, now: NOW });
  const one = h.courses.find((c) => c.id === 1);
  assert.deepEqual(one.links.map((l) => [l.icon, l.unread]), [["icon-announcement", 3], ["icon-folder", 0]]);
  assert.deepEqual(h.courses.find((c) => c.id === 2).links, []);
  assert.equal(links[1][0].unread, undefined, "the input is not changed");
});

test("handed-in work stays, ticked off, until it is due", () => {
  const deadlines = [dl("open", 1, 1), dl("in", 1, 2, "submitted"), dl("past", 1, -1, "submitted"), dl("far", 1, 20, "submitted")];
  const h = H.buildHome({ courses: [course(1)], deadlines, now: NOW });
  assert.deepEqual(h.days.flatMap((g) => g.items.map((d) => d.id)), ["open", "in"]);
  assert.equal(h.later, 0);
  assert.deepEqual(h.summary, { dueWeek: 1, late: 0, newGrades: 0 });
  assert.deepEqual(h.courses[0].items.map((d) => d.id), ["open", "in", "far"]);
  assert.equal(h.courses[0].next.id, "open");
});

test("hidden courses leave the cards and are listed to bring back; deadlines stay", () => {
  const h = H.buildHome({ courses: [course(1), course(2)], deadlines: [dl("a", 2, 1)], hidden: new Set(["2"]), now: NOW });
  assert.deepEqual(h.courses.map((c) => c.id), [1]);
  assert.deepEqual(h.hiddenCourses, [{ id: 2, short: "C2", name: "Course 2" }]);
  assert.deepEqual(h.days.flatMap((g) => g.items.map((d) => d.id)), ["a"]);
  assert.equal(h.summary.dueWeek, 1);
});

test("a card counts what is left and knows the next one left", () => {
  const deadlines = [dl("in", 1, 1, "submitted"), dl("b", 1, 3), dl("c", 1, 5), dl("d", 1, 6), dl("e", 1, 7)];
  const card = H.buildHome({ courses: [course(1)], deadlines, now: NOW }).courses[0];
  assert.equal(card.due, 4);
  assert.equal(card.nextOpen.id, "b");
  assert.deepEqual(card.items.map((d) => d.id), ["in", "b", "c", "d", "e"], "all of them, not only three");
  const done = H.buildHome({ courses: [course(1)], deadlines: [dl("in", 1, 1, "submitted")], now: NOW }).courses[0];
  assert.equal(done.due, 0);
  assert.equal(done.nextOpen, null);
});
