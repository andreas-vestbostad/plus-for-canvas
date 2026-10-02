const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/lib/sidebar.js");

const course = (id, short, fav = false) => ({ id, name: `Course ${short}`, short, fav });

test("lists favourites when there are any, by course code", () => {
  const courses = [course(1, "INF264", true), course(2, "BIO101"), course(3, "INF140", true)];
  assert.deepEqual(S.listed(courses).map((c) => c.id), [3, 1]);
  assert.deepEqual(S.listed(courses.map((c) => Object.assign({}, c, { fav: false }))).map((c) => c.id), [2, 3, 1]);
  assert.deepEqual(S.listed(null), []);
});

test("courses you pick are added or taken away, the rest follow the favourites", () => {
  const courses = [course(1, "INF264", true), course(2, "BIO101"), course(3, "INF140", true)];
  assert.deepEqual(S.listed(courses, { 2: true, 3: false }).map((c) => c.id), [2, 1]);
  assert.deepEqual(S.listed(courses, {}).map((c) => c.id), [3, 1]);
  assert.deepEqual(S.sorted(courses).map((c) => c.id), [2, 3, 1]);
});

test("course codes sort by number, not by text", () => {
  assert.deepEqual(S.listed([course(1, "INF100"), course(2, "INF20")]).map((c) => c.short), ["INF20", "INF100"]);
});

test("courseOf finds the course of any page in it, its front page included", () => {
  assert.equal(S.courseOf("/courses/12"), "12");
  assert.equal(S.courseOf("/courses/12/"), "12");
  assert.equal(S.courseOf("/courses/12/modules"), "12");
  assert.equal(S.courseOf("/courses/123x"), null);
  assert.equal(S.courseOf("/calendar"), null);
});

test("activeTab is the menu item a page is, or is under; the front page only on itself", () => {
  const tabs = [
    { id: "home", url: "/courses/12" },
    { id: "modules", url: "/courses/12/modules" },
    { id: "assignments", url: "/courses/12/assignments" },
    { id: "syllabus", url: "/courses/12/assignments/syllabus" },
  ];
  assert.equal(S.activeTab(tabs, "/courses/12"), "home");
  assert.equal(S.activeTab(tabs, "/courses/12/"), "home");
  assert.equal(S.activeTab(tabs, "/courses/12/modules"), "modules");
  assert.equal(S.activeTab(tabs, "/courses/12/assignments/5"), "assignments");
  assert.equal(S.activeTab(tabs, "/courses/12/assignments/syllabus"), "syllabus", "the longest match wins");
  assert.equal(S.activeTab(tabs, "/courses/12/pages/x"), null);
  assert.equal(S.activeTab(tabs, "/courses/12/modulesx"), null);
});

test("colorsFromApi keeps plain hex colours of courses only", () => {
  const data = { custom_colors: { course_12: "#4f8045", course_13: "#ABC", group_5: "#000000", course_14: "red; background: url(x)", user_1: "#fff", course_x: "#123456" } };
  assert.deepEqual(S.colorsFromApi(data), { 12: "#4f8045", 13: "#ABC" });
  assert.deepEqual(S.colorsFromApi(null), {});
});

test("visibleTabs leaves out what you hid, Home and the page you are on too", () => {
  const tabs = [{ id: "home" }, { id: "announcements" }, { id: "modules" }, { id: "context_external_tool_9" }];
  assert.deepEqual(S.visibleTabs(tabs, ["announcements", "context_external_tool_9"]).map((t) => t.id), ["home", "modules"]);
  assert.deepEqual(S.visibleTabs(tabs, ["home", "announcements", "modules", "context_external_tool_9"]), []);
  assert.equal(S.visibleTabs(tabs, undefined).length, 4);
});
