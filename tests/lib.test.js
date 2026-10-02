const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/lib/match.js");
const C = require("../src/lib/courses.js");
const S = require("../src/lib/suggest.js");

const t = (k) => ({ sec_home: "Home", sec_modules: "Modules", sec_calendar: "Calendar", sec_announcements: "Announcements",
  sec_assignments: "Assignments" }[k] || k);

const courses = [
  { id: 1, course_code: "BIO101", name: "BIO101 Introduction to biology", is_favorite: true },
  { id: 2, course_code: "HIS210", name: "HIS210 Modern history" },
  { id: 3, course_code: "ØKO150", name: "ØKO150 Mikroøkonomi" },
  { id: 4, course_code: "PHYS120_1 26H", name: "Grunnkurs i fysikk" },
].map(C.fromApi);

function ctx(extra = {}) {
  const aliases = { 1: ["bio"] };
  return Object.assign({
    t, courses, aliases, index: C.buildIndex(courses, aliases), tabs: {}, items: {}, freq: {},
    globals: [{ label: "Inbox", url: "/conversations", kw: ["innboks"] }], commands: [], now: 1e12,
  }, extra);
}

test("norm folds Norwegian letters", () => {
  assert.equal(M.norm("Kunngjøringer ÆÅ"), "kunngjoringer aea");
});

test("scoring prefers word starts and handles hw2 vs 'HW 2'", () => {
  assert.ok(M.scoreText("mod", "Modules") > M.scoreText("mod", "Common modes"));
  assert.ok(M.scoreText("hw2", "HW 2: Trees") >= 45);
  assert.ok(M.scoreText("lecture 5", "Lecture 5 slides") > M.scoreText("lecture 5", "Lecture 15 slides"));
  assert.equal(M.scoreText("zzz", "Modules"), 0);
});

test("highlight maps back through ø -> o", () => {
  assert.deepEqual(M.highlight("Kunngjøringer", "kunngjo"), [[0, 7]]);
  assert.deepEqual(M.highlight("BIO101 Modules", "mod"), [[7, 10]]);
});

test("short codes and automatic aliases", () => {
  assert.equal(courses[2].short, "ØKO150");
  assert.equal(courses[3].short, "PHYS120");
  assert.ok(C.autoAliases(courses[0]).includes("101"));
  assert.ok(C.autoAliases(courses[2]).includes("oko150"));
});

test("matchCourse: exact, custom, unique digit prefix, not plain words", () => {
  const c = ctx();
  assert.equal(C.matchCourse("101", courses, c.index).id, 1);
  assert.equal(C.matchCourse("bio", courses, c.index).id, 1);
  assert.equal(C.matchCourse("øko150", courses, c.index).id, 3);
  assert.equal(C.matchCourse("10", courses, c.index).id, 1);
  assert.equal(C.matchCourse("mod", courses, c.index), null);
  assert.equal(C.matchCourse("1", courses, c.index), null);
});

test("ambiguous alias resolves to nothing", () => {
  const two = [...courses, C.fromApi({ id: 9, course_code: "CHEM101", name: "CHEM101" })];
  const idx = C.buildIndex(two, {});
  assert.equal(C.matchCourse("101", two, idx), null);
  assert.equal(C.matchCourse("bio101", two, idx).id, 1);
});

test("'101 mod' puts BIO101 Modules first", () => {
  const r = S.suggest("101 mod", ctx()).results;
  assert.equal(r[0].url, "/courses/1/modules");
});

test("'210 ann' goes to announcements", () => {
  const r = S.suggest("210 ann", ctx()).results;
  assert.equal(r[0].url, "/courses/2/announcements");
});

test("API tabs replace defaults, hidden defaults disappear", () => {
  const tabs = { 1: [{ id: "home", label: "Hjem", url: "/courses/1" }, { id: "modules", label: "Moduler", url: "/courses/1/modules" }] };
  const r = S.suggest("101", ctx({ tabs })).results.map((x) => x.url);
  assert.ok(r.includes("/courses/1/modules"));
  assert.ok(!r.includes("/courses/1/quizzes"));
  assert.equal(r[0], "/courses/1");
});

test("content search asks for missing items, then finds them", () => {
  let res = S.suggest("101 hw2", ctx());
  assert.deepEqual(res.needs, [1]);
  const items = { 1: [{ name: "HW 2: Cell division", url: "/courses/1/assignments/7", kind: "assignment" },
                      { name: "Lecture notes", url: "/courses/1/pages/notes", kind: "page" }] };
  res = S.suggest("101 hw2", ctx({ items }));
  assert.equal(res.needs.length, 0);
  assert.equal(res.results[0].url, "/courses/1/assignments/7");
});

test("inside a course, a bare word searches that course", () => {
  const r = S.suggest("mod", ctx({ currentId: 2 })).results;
  assert.equal(r[0].url, "/courses/2/modules");
});

test("global pages match by keyword", () => {
  const r = S.suggest("innboks", ctx()).results;
  assert.equal(r[0].url, "/conversations");
});

test("frecency lifts what you use", () => {
  let freq = {};
  for (let i = 0; i < 5; i++) freq = S.recordVisit(freq, { url: "/courses/1/assignments", label: "BIO101 Assignments" }, 1e12);
  const r = S.suggest("101 a", ctx({ freq })).results;
  assert.equal(r[0].url, "/courses/1/assignments");
  const empty = S.suggest("", ctx({ freq })).results;
  assert.equal(empty[0].kind, "recent");
});

test("empty query lists favourite courses first with Tab completion", () => {
  const r = S.suggest("", ctx()).results.filter((x) => x.kind === "course");
  assert.equal(r[0].label, "BIO101");
  assert.equal(r[0].complete, "101 ");
});

test("external tool tabs are not matched through their untranslated key", () => {
  const tabs = { 1: [{ id: "context_external_tool_5", label: "Zoom", url: "/courses/1/external_tools/5" }] };
  const r = S.suggest("101 tool", ctx({ tabs })).results.map((x) => x.url);
  assert.ok(!r.includes("/courses/1/external_tools/5"));
  assert.ok(S.suggest("101 zoom", ctx({ tabs })).results.some((x) => x.url === "/courses/1/external_tools/5"));
});

const deadlines = [
  { title: "Homework4", courseId: 2, url: "/courses/2/assignments/4", hint: "missing" },
  { title: "MA3", courseId: 1, url: "/courses/1/assignments/3", hint: "in 3 days" },
];

test("'frist' lists deadlines in the order given, with course and countdown", () => {
  const res = S.suggest("frist", ctx({ deadlines }));
  const dl = res.results.filter((r) => r.kind === "deadline");
  assert.deepEqual(dl.map((r) => [r.label, r.sub, r.hint]), [["Homework4", "HIS210", "missing"], ["MA3", "BIO101", "in 3 days"]]);
  assert.equal(res.results[0].kind, "deadline");
  assert.ok(S.suggest("due", ctx({ deadlines })).results.some((r) => r.kind === "deadline"));
});

test("'101 frist' shows only that course's deadlines", () => {
  const dl = S.suggest("101 frist", ctx({ deadlines })).results.filter((r) => r.kind === "deadline");
  assert.deepEqual(dl.map((r) => r.label), ["MA3"]);
});

test("says when the query asks for deadlines, and leaves other queries alone", () => {
  assert.equal(S.suggest("frist", ctx()).wantsDeadlines, true);
  assert.equal(S.suggest("frist", ctx({ deadlines })).wantsDeadlines, true);
  const other = S.suggest("mod", ctx({ deadlines }));
  assert.ok(!other.wantsDeadlines);
  assert.ok(!other.results.some((r) => r.kind === "deadline"));
});

test("pathOf strips the origin from absolute URLs and leaves paths alone", () => {
  const { pathOf } = require("../src/lib/match.js");
  assert.equal(pathOf("https://canvas.test:8443/courses/1"), "/courses/1");
  assert.equal(pathOf("/courses/1"), "/courses/1");
  assert.equal(pathOf(null), "");
});
