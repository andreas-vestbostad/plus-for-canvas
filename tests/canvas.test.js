const test = require("node:test");
const assert = require("node:assert/strict");

// canvas.js is a browser script: give it the globals it expects.
const store = {};
globalThis.location = { host: "canvas.test" };
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        const list = keys == null ? Object.keys(store) : [].concat(keys);
        return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
      },
      set: async (obj) => Object.assign(store, obj),
      remove: async (keys) => [].concat(keys).forEach((k) => delete store[k]),
    },
  },
};
require("../src/lib/match.js");
require("../src/lib/courses.js");
require("../src/lib/deadlines.js");
require("../src/lib/dashboard.js");
require("../src/lib/home.js");
require("../src/lib/sidebar.js");
require("../src/core/canvas.js");
const api = globalThis.CJ.canvas;

function respond(handler) {
  globalThis.fetch = async (url) => {
    const body = handler(url);
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, text: async () => JSON.stringify(body), headers: { get: () => "" } };
  };
}

test("loadItems does not cache an empty result when every request fails", async () => {
  respond(() => new Error("offline"));
  await assert.rejects(api.loadItems(1, true));
  assert.equal(await api.peek("items:1"), null);
});

test("loadItems keeps what it got when only some requests fail", async () => {
  respond((url) => (url.includes("/assignments") ? [{ name: "HW 1", html_url: "https://canvas.test/courses/2/assignments/5" }] : new Error("403")));
  const items = await api.loadItems(2, true);
  assert.deepEqual(items, [{ name: "HW 1", url: "/courses/2/assignments/5", kind: "assignment" }]);
  assert.deepEqual(await api.peek("items:2"), items);
});

test("peekMany reads several cache entries at once", async () => {
  const hits = await api.peekMany(["items:2", "items:404"]);
  assert.deepEqual(Object.keys(hits), ["items:2"]);
});

test("a failed cache write still returns the fetched data", async () => {
  const set = chrome.storage.local.set;
  chrome.storage.local.set = async () => { throw new Error("QUOTA_BYTES quota exceeded"); };
  const warn = console.warn;
  console.warn = () => {};
  try {
    respond((url) => (url.includes("/pages") ? [{ title: "Intro", html_url: "/courses/3/pages/intro" }] : []));
    const items = await api.loadItems(3, true);
    assert.deepEqual(items, [{ name: "Intro", url: "/courses/3/pages/intro", kind: "page" }]);
  } finally {
    chrome.storage.local.set = set;
    console.warn = warn;
  }
});

test("loadCourses drops cached content for courses you no longer have", async () => {
  Object.assign(store, {
    "cj:canvas.test:tabs:7": { t: Date.now(), v: [] },
    "cj:canvas.test:items:7": { t: Date.now(), v: [] },
    "cj:canvas.test:items:8": { t: Date.now(), v: [] },
    "cj:canvas.test:freq": { t: Date.now(), v: {} },
    "cj:other.test:items:7": { t: Date.now(), v: [] },
  });
  respond((url) => (url.includes("/api/v1/courses?") ? [{ id: 8, name: "BIO101", course_code: "BIO101" }] : []));
  await api.loadCourses(true);
  assert.ok(!("cj:canvas.test:tabs:7" in store));
  assert.ok(!("cj:canvas.test:items:7" in store));
  assert.ok("cj:canvas.test:items:8" in store);
  assert.ok("cj:canvas.test:freq" in store);
  assert.ok("cj:other.test:items:7" in store);
});

test("loadDeadlines asks the planner for a window around today and keeps only deadlines", async () => {
  let asked = "";
  const due = new Date(Date.now() + 864e5).toISOString();
  respond((url) => {
    asked = url;
    return [
      { plannable_type: "assignment", course_id: 3, html_url: "/courses/3/assignments/9", plannable: { id: 9, title: "MA3", due_at: due } },
      { plannable_type: "calendar_event", course_id: 3, html_url: "/calendar", plannable: { id: 1, title: "Lecture" } },
    ];
  });
  const list = await api.loadDeadlines(true);
  assert.match(asked, /^\/api\/v1\/planner\/items\?start_date=.+&end_date=.+&per_page=100$/);
  assert.deepEqual(list.map((d) => [d.title, d.status, d.url]), [["MA3", "open", "/courses/3/assignments/9"]]);
  assert.deepEqual(await api.peek("deadlines"), list, "cached for the next page load");
});

test("loadDeadlines asks when you handed in only once", async () => {
  const due = new Date(Date.now() - 864e5).toISOString();
  const asked = [];
  respond((url) => {
    asked.push(url);
    if (url.includes("/submissions")) return [{ assignment_id: 9, submitted_at: "2026-09-01T10:00:00Z" }];
    return [{ plannable_type: "assignment", course_id: 3, html_url: "/courses/3/assignments/9", plannable: { id: 9, title: "MA3", due_at: due }, submissions: { submitted: true } }];
  });
  const first = await api.loadDeadlines(true);
  assert.equal(first[0].submittedAt, Date.parse("2026-09-01T10:00:00Z"));
  assert.ok(asked.some((u) => u === "/api/v1/courses/3/students/submissions?assignment_ids[]=9&per_page=100"));
  asked.length = 0;
  const again = await api.loadDeadlines(true);
  assert.equal(again[0].submittedAt, first[0].submittedAt, "kept from the cache");
  assert.ok(!asked.some((u) => u.includes("/submissions")), "not asked again");
});

test("two callers asking at once share one request", async () => {
  let calls = 0;
  respond(() => { calls++; return []; });
  await chrome.storage.local.remove("cj:canvas.test:deadlines");
  const [a, b] = await Promise.all([api.loadDeadlines(false), api.loadDeadlines(false)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test("archiving a deadline is kept per site and survives clearing the cache", async () => {
  await api.setArchived("assignment:1", true);
  let map = await api.setArchived("assignment:2", true);
  assert.deepEqual(Object.keys(map).sort(), ["assignment:1", "assignment:2"]);
  map = await api.setArchived("assignment:1", false);
  assert.deepEqual(Object.keys(map), ["assignment:2"]);
  await api.clearHost();
  assert.deepEqual(Object.keys(await api.getArchived()), ["assignment:2"]);
});

test("archive entries older than four months are dropped on the next change", async () => {
  store["cj:canvas.test:dlArchive"] = { "assignment:old": Date.now() - 200 * 864e5 };
  const map = await api.setArchived("assignment:new", true);
  assert.deepEqual(Object.keys(map), ["assignment:new"]);
});

test("loadScores asks for current scores and keeps only visible student scores", async () => {
  let asked = "";
  respond((url) => {
    asked = url;
    return [
      { id: 1, enrollments: [{ type: "student", computed_current_score: 81.5 }] },
      { id: 2, hide_final_grades: true, enrollments: [{ type: "student", computed_current_score: 50 }] },
    ];
  });
  const scores = await api.loadScores(true);
  assert.match(asked, /include\[\]=total_scores/);
  assert.deepEqual(scores, { 1: 81.5 });
  assert.deepEqual(await api.peek("scores"), scores);
});

test("the last place per course is kept per site and survives clearing the cache", async () => {
  await api.rememberPlace("/courses/5/pages/intro", "Intro");
  await api.rememberPlace("/courses/5", "Front page");
  await api.rememberPlace("/calendar", "Calendar");
  await api.clearHost();
  const places = await api.getPlaces();
  assert.deepEqual(Object.keys(places), ["5"]);
  assert.equal(places[5].url, "/courses/5/pages/intro");
});

test("loadUnread asks each course and keeps the others when one fails", async () => {
  respond((url) => (url.includes("/courses/2/") ? new Error("403")
    : [{ type: "Announcement", unread_count: 1 }]));
  const unread = await api.loadUnread([1, "2"], true);
  assert.deepEqual(unread, { 1: { "icon-announcement": 1 }, 2: {} });
});

test("loadUnread is not cached when every course fails", async () => {
  respond(() => new Error("offline"));
  await chrome.storage.local.remove("cj:canvas.test:unread");
  await assert.rejects(api.loadUnread([1], true));
  assert.equal(await api.peek("unread"), null);
});

test("loadCardLinks reads the dashboard cards", async () => {
  respond(() => [{ id: 3, links: [{ icon: "icon-folder", label: "Files", path: "/courses/3/files" }] }]);
  assert.deepEqual(await api.loadCardLinks(true), { 3: [{ icon: "icon-folder", label: "Files", path: "/courses/3/files" }] });
});

test("loadColors reads the course colours", async () => {
  let asked = "";
  respond((url) => { asked = url; return { custom_colors: { course_3: "#4f8045", group_1: "#000000" } }; });
  assert.deepEqual(await api.loadColors(true), { 3: "#4f8045" });
  assert.equal(asked, "/api/v1/users/self/colors");
});

test("two quick changes to your choices both stick, and clearing the cache keeps them", async () => {
  await Promise.all([
    api.updateMine("homeHidden", (m) => Object.assign({}, m, { 1: true })),
    api.updateMine("homeHidden", (m) => Object.assign({}, m, { 2: true })),
    api.updateMine("sidebarHidden", (m) => Object.assign({}, m, { 1: ["announcements"] })),
    api.updateMine("sidebarCourses", (m) => Object.assign({}, m, { 3: false })),
    api.updateMine("homeOrder", () => ({ 2: 0, 1: 1 })),
  ]);
  await api.clearHost();
  assert.deepEqual(await api.getMine("homeHidden"), { 1: true, 2: true });
  assert.deepEqual(await api.getMine("sidebarHidden"), { 1: ["announcements"] });
  assert.deepEqual(await api.getMine("sidebarCourses"), { 3: false });
  assert.deepEqual(await api.getMine("homeOrder"), { 2: 0, 1: 1 });
});

test("archiving two deadlines at once keeps both", async () => {
  delete store["cj:canvas.test:dlArchive"];
  await Promise.all([api.setArchived("assignment:a", true), api.setArchived("assignment:b", true)]);
  assert.deepEqual(Object.keys(await api.getArchived()).sort(), ["assignment:a", "assignment:b"]);
});

test("loadEvents keeps the events it got when one batch of courses fails", async () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  respond((url) => (url.includes("context_codes[]=course_11") ? new Error("503") : [
    { id: 7, title: "Lecture", start_at: today.toISOString(), context_code: "course_1", html_url: "https://canvas.test/calendar" },
  ]));
  const events = await api.loadEvents(ids, true);
  assert.deepEqual(events.map((e) => e.title), ["Lecture"]);
});

test("loadEvents is not cached when every batch fails", async () => {
  respond(() => new Error("offline"));
  await assert.rejects(api.loadEvents([1, 2], true));
});

test("remembering places in two courses at once keeps both", async () => {
  delete store["cj:canvas.test:places"];
  await Promise.all([
    api.rememberPlace("/courses/1/pages/a", "A"),
    api.rememberPlace("/courses/2/pages/b", "B"),
  ]);
  assert.deepEqual(Object.keys(await api.getPlaces()).sort(), ["1", "2"]);
});

test("expire keeps the cached value but makes the next load ask Canvas", async () => {
  let calls = 0;
  respond(() => { calls++; return []; });
  await api.loadDeadlines(true);
  calls = 0;
  await api.loadDeadlines(false);
  assert.equal(calls, 0, "fresh cache");
  await api.expire("deadlines");
  assert.deepEqual(await api.peek("deadlines"), [], "value kept for first paint");
  await api.loadDeadlines(false);
  assert.equal(calls, 1);
});

/** Like respond, with a status and headers per request. */
function respondRaw(handler) {
  globalThis.fetch = async (url) => {
    const { status = 200, headers = {}, body = [] } = handler(url);
    return { ok: status < 400, status, text: async () => JSON.stringify(body), headers: { get: (h) => (h in headers ? headers[h] : null) } };
  };
}

test("a throttled request is asked again, and gives up after the last wait", async () => {
  api.retry.delays = [0, 0];
  let calls = 0;
  respondRaw(() => (++calls < 3 ? { status: 429 } : { body: { custom_colors: { course_4: "#123456" } } }));
  assert.deepEqual(await api.loadColors(true), { 4: "#123456" });
  assert.equal(calls, 3);

  calls = 0;
  respondRaw(() => { calls++; return { status: 403, headers: { "X-Rate-Limit-Remaining": "0.0" } }; });
  await assert.rejects(api.loadColors(true), /403/);
  assert.equal(calls, 3);
});

test("a plain 403 is not asked again", async () => {
  let calls = 0;
  respondRaw(() => { calls++; return { status: 403 }; });
  await assert.rejects(api.loadColors(true), /403/);
  assert.equal(calls, 1);
});

test("events are cached per day and other days are dropped", async () => {
  store["cj:canvas.test:events"] = { t: Date.now(), v: [] };
  store["cj:canvas.test:events:2001-01-01"] = { t: Date.now(), v: [] };
  respond(() => []);
  await api.loadEvents([1], true);
  assert.match(api.eventsName(), /^events:\d{4}-\d{2}-\d{2}$/);
  assert.equal(api.eventsName(new Date(2026, 0, 5, 23, 59)), "events:2026-01-05");
  assert.deepEqual(Object.keys(store).filter((k) => k.startsWith("cj:canvas.test:events")), [`cj:canvas.test:${api.eventsName()}`]);
});

test("cached unread counts for another set of courses are a miss", async () => {
  let calls = 0;
  respond(() => { calls++; return [{ type: "Announcement", unread_count: 2 }]; });
  await api.loadUnread([1, 2], true);
  calls = 0;
  await api.loadUnread(["2", 1], false);
  assert.equal(calls, 0, "same courses, fresh cache");
  assert.deepEqual(Object.keys(await api.loadUnread([1, 2, 3], false)), ["1", "2", "3"]);
  assert.equal(calls, 3);
});
