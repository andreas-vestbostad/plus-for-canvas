// Talks to the Canvas REST API of the site you are on, using your existing session.
// Nothing is sent anywhere else. Results are cached in chrome.storage.local.
(function (root) {
  "use strict";
  const CJ = root.CJ;
  const host = location.host;
  const key = (name) => `cj:${host}:${name}`;

  const TTL = {
    courses: 24 * 3600e3,
    tabs: 24 * 3600e3,
    items: 6 * 3600e3,
    deadlines: 10 * 60e3,
    scores: 3600e3,
    events: 30 * 60e3,
    cards: 24 * 3600e3,
    unread: 10 * 60e3,
    colors: 6 * 3600e3,
  };

  // Canvas throttles with 429, or 403 and X-Rate-Limit-Remaining at zero. Wait and ask again,
  // honouring Retry-After. One wait per entry; tests set them to zero.
  const retry = { delays: [1000, 3000] };
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  function throttled(r) {
    if (r.status === 429) return true;
    const left = r.headers.get("X-Rate-Limit-Remaining");
    return r.status === 403 && left !== null && left !== "" && Number(left) < 1;
  }

  async function fetchJson(url) {
    let r;
    for (let i = 0; ; i++) {
      r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!throttled(r) || i >= retry.delays.length) break;
      const after = Number(r.headers.get("Retry-After"));
      await sleep(after > 0 ? Math.min(after, 30) * 1000 : retry.delays[i]);
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const text = (await r.text()).replace(/^while\(1\);/, "");
    return { data: JSON.parse(text), link: r.headers.get("Link") || "" };
  }

  /** GET with Canvas pagination (Link: rel="next"), capped at maxPages. */
  async function getAll(path, maxPages = 5) {
    let url = path;
    const all = [];
    for (let i = 0; url && i < maxPages; i++) {
      const { data, link } = await fetchJson(url);
      if (!Array.isArray(data)) return data;
      all.push(...data);
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : null;
    }
    return all;
  }

  const rel = CJ.pathOf;

  /** Run fn over items, at most n at a time, like Promise.allSettled over items.map(fn). */
  async function settleLimited(items, n, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(items[i]) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
  }
  const PARALLEL = 4;

  // Two callers asking for the same thing at once (the deadline panel and the palette)
  // share one request instead of both paging through the API.
  const inFlight = new Map();

  function cached(name, ttl, loader, force) {
    if (!force && inFlight.has(name)) return inFlight.get(name);
    const run = fetchCached(name, ttl, loader, force);
    inFlight.set(name, run);
    const done = () => { if (inFlight.get(name) === run) inFlight.delete(name); };
    run.then(done, done);
    return run;
  }

  async function fetchCached(name, ttl, loader, force) {
    const k = key(name);
    if (!force) {
      const hit = (await chrome.storage.local.get(k))[k];
      if (hit && Date.now() - hit.t < ttl) return hit.v;
    }
    const v = await loader();
    // A full or broken cache must not throw away data we already fetched.
    await chrome.storage.local.set({ [k]: { t: Date.now(), v } })
      .catch((e) => console.warn(`Plus could not cache ${name}:`, e));
    return v;
  }

  /** Drop cached tabs/items for courses that are no longer in the course list, so the cache does not grow forever. */
  async function pruneCourses(keepIds) {
    const keep = new Set(keepIds.map(String));
    const re = new RegExp(`^cj:${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(?:tabs|items):(\\d+)$`);
    const all = await chrome.storage.local.get(null);
    const drop = Object.keys(all).filter((k) => {
      const m = re.exec(k);
      return m && !keep.has(m[1]);
    });
    if (drop.length) await chrome.storage.local.remove(drop);
  }

  /** Read from cache without ever hitting the network (for instant first paint). */
  async function peek(name) {
    const k = key(name);
    const hit = (await chrome.storage.local.get(k))[k];
    return hit ? hit.v : null;
  }

  /** Mark a cache entry stale but keep its value, so peek still paints and the next load asks Canvas. */
  async function expire(name) {
    const k = key(name);
    const hit = (await chrome.storage.local.get(k))[k];
    if (hit) await chrome.storage.local.set({ [k]: { t: 0, v: hit.v } });
  }

  /** Like peek, for many names in one storage read. Returns { name: value } for the hits. */
  async function peekMany(names) {
    const all = await chrome.storage.local.get(names.map(key));
    const out = {};
    for (const n of names) if (all[key(n)]) out[n] = all[key(n)].v;
    return out;
  }

  function loadCourses(force) {
    return cached("courses", TTL.courses, async () => {
      const list = await getAll("/api/v1/courses?enrollment_state=active&include[]=favorites&include[]=term&per_page=100", 3);
      const courses = list.filter((c) => c && c.id && !c.access_restricted_by_date).map(CJ.fromApi);
      await pruneCourses(courses.map((c) => c.id))
        .catch((e) => console.warn("Plus could not prune the cache:", e));
      return courses;
    }, force);
  }

  function loadTabs(courseId, force) {
    return cached(`tabs:${courseId}`, TTL.tabs, async () => {
      const tabs = await getAll(`/api/v1/courses/${courseId}/tabs?per_page=100`, 1);
      return tabs
        .filter((tb) => !tb.hidden && tb.html_url)
        .map((tb) => ({ id: tb.id, label: tb.label, url: rel(tb.html_url) }));
    }, force);
  }

  const MODULE_KIND = { Page: "page", Assignment: "assignment", File: "file", Discussion: "discussion", Quiz: "quiz", ExternalUrl: "link", ExternalTool: "tool" };

  function loadItems(courseId, force) {
    return cached(`items:${courseId}`, TTL.items, async () => {
      const base = `/api/v1/courses/${courseId}`;
      const settled = await Promise.allSettled([
        getAll(`${base}/modules?include[]=items&per_page=100`),
        getAll(`${base}/assignments?per_page=100&order_by=due_at`),
        getAll(`${base}/pages?per_page=100&sort=updated_at&order=desc`),
        getAll(`${base}/files?per_page=100&sort=updated_at&order=desc`, 3),
        getAll(`${base}/discussion_topics?per_page=100`, 2),
        getAll(`${base}/discussion_topics?only_announcements=true&per_page=50`, 1),
        getAll(`${base}/quizzes?per_page=100`, 2),
      ]);
      // Nothing came back (logged out, offline, rate limited): fail so the empty result is not cached.
      const failed = settled.find((r) => r.status === "rejected");
      if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;
      const [modules, assignments, pages, files, discussions, announcements, quizzes] = settled;
      const items = [];
      const seen = new Set();
      const add = (name, url, kind) => {
        url = rel(url);
        if (!name || !url || seen.has(url)) return;
        seen.add(url);
        items.push({ name: String(name).trim(), url, kind });
      };
      const ok = (r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);

      for (const m of ok(modules)) {
        add(m.name, `/courses/${courseId}/modules#module_${m.id}`, "module");
        for (const it of m.items || []) {
          if (it.type === "SubHeader") continue;
          add(it.title, it.html_url, MODULE_KIND[it.type] || "link");
        }
      }
      for (const a of ok(assignments)) add(a.name, a.html_url, "assignment");
      for (const p of ok(pages)) add(p.title, p.html_url, "page");
      for (const f of ok(files)) add(f.display_name || f.filename, `/courses/${courseId}/files/${f.id}`, "file");
      for (const d of ok(announcements)) add(d.title, d.html_url, "announcement");
      for (const d of ok(discussions)) add(d.title, d.html_url, "discussion");
      for (const q of ok(quizzes)) add(q.title, q.html_url, "quiz");
      return items;
    }, force);
  }

  /** Deadlines from five weeks back (late work, new grades) to six weeks ahead, across all courses. */
  function loadDeadlines(force) {
    return cached("deadlines", TTL.deadlines, async () => {
      const now = Date.now();
      const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
      const items = await getAll(`/api/v1/planner/items?start_date=${iso(now - 35 * 864e5)}&end_date=${iso(now + 42 * 864e5)}&per_page=100`, 3);
      // When you handed in: from the cache if known, else one request per course with something
      // newly handed in. Best effort.
      const list = CJ.deadlines.keepSubmittedAt(CJ.deadlines.fromPlanner(items, now), await peek("deadlines"));
      const byCourse = new Map();
      for (const d of list.filter(CJ.deadlines.needsSubmittedAt)) {
        byCourse.set(d.courseId, (byCourse.get(d.courseId) || []).concat(d.assignmentId));
      }
      const settled = await Promise.allSettled([...byCourse].map(([courseId, ids]) => {
        const q = ids.map((id) => `assignment_ids[]=${encodeURIComponent(id)}`).join("&");
        return getAll(`/api/v1/courses/${encodeURIComponent(courseId)}/students/submissions?${q}&per_page=100`, 1);
      }));
      const subs = settled.flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
      return CJ.deadlines.withSubmittedAt(list, subs);
    }, force);
  }

  // Canvas takes at most ten courses per calendar request.
  const CONTEXTS_PER_REQUEST = 10;

  /** The cache name for today's events, so a new day never paints yesterday's lectures. */
  function eventsName(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `events:${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /** Drop the events cached for other days. */
  async function pruneEvents(keepName) {
    const re = new RegExp(`^cj:${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:events(?::|$)`);
    const drop = Object.keys(await chrome.storage.local.get(null)).filter((k) => re.test(k) && k !== key(keepName));
    if (drop.length) await chrome.storage.local.remove(drop);
  }

  /** Today's calendar events (lectures, groups) in these courses, for Home+. */
  function loadEvents(courseIds, force) {
    const name = eventsName();
    return cached(name, TTL.events, async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 864e5);
      const iso = (d) => encodeURIComponent(d.toISOString());
      const ids = [...new Set((courseIds || []).map(String))];
      const batches = [];
      for (let i = 0; i < ids.length; i += CONTEXTS_PER_REQUEST) batches.push(ids.slice(i, i + CONTEXTS_PER_REQUEST));
      const settled = await settleLimited(batches, PARALLEL, (batch) => {
        const codes = batch.map((id) => `context_codes[]=course_${encodeURIComponent(id)}`).join("&");
        return getAll(`/api/v1/calendar_events?type=event&start_date=${iso(from)}&end_date=${iso(to)}&per_page=100&${codes}`, 2);
      });
      const failed = settled.find((r) => r.status === "rejected");
      if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;
      const lists = settled.map((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
      await pruneEvents(name).catch((e) => console.warn("Plus could not prune old events:", e));
      return CJ.home.eventsFromCalendar(lists.flat());
    }, force);
  }

  /** Current score per course, for Home+. Hidden grades are left out. */
  function loadScores(force) {
    return cached("scores", TTL.scores, async () => {
      const list = await getAll("/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100", 3);
      return CJ.dashboard.scoresFromCourses(list);
    }, force);
  }

  /** The icon links Canvas puts under each course card, for Home+. */
  function loadCardLinks(force) {
    return cached("cards", TTL.cards, async () => CJ.dashboard.cardLinks(await getAll("/api/v1/dashboard/dashboard_cards", 1)), force);
  }

  /** The colour you (or Canvas) gave each course: { courseId: "#hex" }, for the course sidebar. */
  function loadColors(force) {
    return cached("colors", TTL.colors, async () => CJ.sidebar.colorsFromApi(await getAll("/api/v1/users/self/colors", 1)), force);
  }

  /** Unread announcements, discussions and assignments per course: { courseId: { icon: n } }. */
  async function loadUnread(courseIds, force) {
    const ids = [...new Set((courseIds || []).map(String))];
    // The counts are keyed by course: cached counts for another set of courses are a miss.
    const hit = force ? null : await peek("unread");
    const same = hit && Object.keys(hit).sort().join() === [...ids].sort().join();
    return cached("unread", TTL.unread, async () => {
      const settled = await settleLimited(ids, PARALLEL, (id) => getAll(`/api/v1/courses/${encodeURIComponent(id)}/activity_stream/summary`, 1));
      const failed = settled.find((r) => r.status === "rejected");
      if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;
      return Object.fromEntries(ids.map((id, i) => [id, settled[i].status === "fulfilled" ? CJ.dashboard.unreadFromSummary(settled[i].value) : {}]));
    }, force || !same);
  }

  // Places and the archive are read-modify-write on one key each: run changes to a key one at
  // a time, so two quick changes cannot overwrite each other.
  function oneAtATime(fn) {
    let queue = Promise.resolve();
    return (...args) => {
      const run = queue.then(() => fn(...args));
      queue = run.catch(() => {});
      return run;
    };
  }

  // The last page you opened in each course: { courseId: { url, label, t } }. Yours, like the archive.
  async function getPlaces() {
    const v = (await chrome.storage.local.get(key("places")))[key("places")];
    return v && typeof v === "object" ? v : {};
  }

  /** Remember a page inside a course as the place to continue from. Other pages are ignored. */
  const rememberPlace = oneAtATime(async (url, label) => {
    const courseId = CJ.dashboard.courseOfPath(url);
    if (!courseId) return;
    const next = CJ.dashboard.recordResume(await getPlaces(), courseId, { url, label });
    await chrome.storage.local.set({ [key("places")]: next });
  });

  // Deadlines you archived: { id: archivedAt }. Yours, not a cache, so clearing keeps it.
  const ARCHIVE_KEEP = 120 * 864e5;

  async function getArchived() {
    const v = (await chrome.storage.local.get(key("dlArchive")))[key("dlArchive")];
    return v && typeof v === "object" ? v : {};
  }

  /** Archive or restore one deadline. Returns the new map. Old entries are dropped. */
  const setArchived = oneAtATime(async (id, archived) => {
    const now = Date.now();
    const next = Object.fromEntries(Object.entries(await getArchived()).filter(([k, at]) => k !== id && now - at < ARCHIVE_KEEP));
    if (archived) next[id] = now;
    await chrome.storage.local.set({ [key("dlArchive")]: next });
    return next;
  });

  // Choices you made on this site (courses hidden from Home and their order there, course menu
  // items hidden in the sidebar). Yours, not a cache, so clearing keeps them.
  const MINE = ["homeHidden", "homeOrder", "sidebarHidden", "sidebarCourses"];

  async function getMine(name) {
    const v = (await chrome.storage.local.get(key(name)))[key(name)];
    return v && typeof v === "object" ? v : {};
  }

  /** Change one of your choices: fn gets the current map and returns the new one. */
  const updateMine = oneAtATime(async (name, fn) => {
    const next = fn(await getMine(name));
    await chrome.storage.local.set({ [key(name)]: next });
    return next;
  });

  async function clearHost() {
    const all = await chrome.storage.local.get(null);
    const prefix = `cj:${host}:`;
    const keep = new Set([key("freq"), key("dlArchive"), key("places"), ...MINE.map(key)]);
    const drop = Object.keys(all).filter((k) => k.startsWith(prefix) && !keep.has(k));
    if (drop.length) await chrome.storage.local.remove(drop);
  }

  async function getFreq() {
    return (await chrome.storage.local.get(key("freq")))[key("freq")] || {};
  }
  function setFreq(freq) {
    return chrome.storage.local.set({ [key("freq")]: freq });
  }

  root.CJ = Object.assign(root.CJ || {}, {
    canvas: { retry, eventsName, loadCourses, loadTabs, loadItems, loadDeadlines, loadScores, loadEvents, loadCardLinks, loadUnread, loadColors, getPlaces, rememberPlace, getArchived, setArchived, getMine, updateMine, peek, peekMany, expire, clearHost, getFreq, setFreq },
  });
})(globalThis);
