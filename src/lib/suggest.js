// Turns a query plus whatever data we have cached into a ranked list of results.
// Pure and synchronous: it reports which courses it still needs content for,
// so the caller can fetch and simply run it again.
(function (root) {
  "use strict";
  const CJ = root.CJ && root.CJ.scoreText ? root.CJ : Object.assign({}, require("./match.js"), require("./courses.js"));

  // Search words per Canvas tab id, in English and Norwegian. Tab labels from the API are added on top.
  const TAB_KW = {
    home: ["home", "front", "forside", "hjem", "start"],
    modules: ["modules", "moduler", "content", "innhold"],
    assignments: ["assignments", "oppgaver", "innleveringer", "frister", "deadlines", "oblig", "homework", "hw"],
    announcements: ["announcements", "kunngjoringer", "kunngjøringer", "ann", "news", "nyheter"],
    files: ["files", "filer", "documents", "dokumenter"],
    pages: ["pages", "sider", "wiki"],
    discussions: ["discussions", "diskusjoner", "forum"],
    grades: ["grades", "karakterer", "poeng", "resultater", "score", "marks"],
    syllabus: ["syllabus", "emneoversikt", "pensum", "overview"],
    quizzes: ["quizzes", "quizer", "prover", "prøver", "tests"],
    people: ["people", "deltakere", "folk", "users", "students"],
    groups: ["groups", "grupper"],
    outcomes: ["outcomes", "læringsmål", "laeringsmal"],
    collaborations: ["collaborations", "samarbeid"],
    conferences: ["conferences", "konferanser", "video"],
    calendar: ["calendar", "kalender", "timeplan", "schedule"],
  };

  // Used until the real tab list for a course has loaded.
  const DEFAULT_TABS = [
    ["home", ""], ["modules", "/modules"], ["assignments", "/assignments"], ["announcements", "/announcements"],
    ["files", "/files"], ["pages", "/pages"], ["discussions", "/discussion_topics"], ["grades", "/grades"],
    ["syllabus", "/assignments/syllabus"], ["quizzes", "/quizzes"], ["people", "/users"],
  ];

  const MAX_RESULTS = 15;

  // Words that ask for the deadline list (across courses, or within a course: "101 frist").
  const DEADLINE_KW = ["frist", "frister", "deadline", "deadlines", "due", "innlevering", "innleveringer", "upcoming"];

  function frecency(entry, now) {
    if (!entry) return 0;
    const days = Math.max(0, (now - entry.t) / 86400000);
    return Math.min(25, 8 * Math.log2(1 + entry.n)) * Math.exp(-days / 14);
  }

  /** Course name without the code in front, so "BIO101 Introduction to biology" shows as "Introduction to biology". */
  function courseSub(c) {
    const rest = String(c.name || "").replace(new RegExp("^\\s*" + c.short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s:\\-–]*", "i"), "");
    return rest && rest !== c.short ? rest : "";
  }

  function sectionsFor(course, ctx) {
    const t = ctx.t;
    const tabs = ctx.tabs[course.id];
    const list = tabs && tabs.length
      ? tabs.map((tb) => ({ id: tb.id, label: tb.label, url: tb.url, kw: TAB_KW[tb.id] || [] }))
      : DEFAULT_TABS.map(([id, path]) => ({ id, label: t("sec_" + id), url: `/courses/${course.id}${path}`, kw: TAB_KW[id] }));
    list.push({ id: "calendar", label: t("sec_calendar"), url: `/calendar?include_contexts=course_${course.id}`, kw: TAB_KW.calendar });
    return list;
  }

  function suggest(query, ctx) {
    const t = ctx.t;
    const now = ctx.now || Date.now();
    const courses = ctx.courses || [];
    const tokens = String(query || "").trim().split(/\s+/).filter(Boolean);
    const out = [];
    const needs = new Set();
    const boost = (url) => frecency(ctx.freq && ctx.freq[url], now);

    // Empty query: recent picks, then your courses, then the global pages.
    if (!tokens.length) {
      const recent = Object.entries(ctx.freq || {})
        .map(([url, e]) => ({ url, e, f: frecency(e, now) }))
        .filter((x) => x.e.label && x.f > 0.5)
        .sort((a, b) => b.f - a.f)
        .slice(0, 5);
      for (const r of recent) out.push({ label: r.e.label, hint: r.e.hint || t("hintRecent"), url: r.url, kind: "recent" });
      const cur = (c) => (c.id === ctx.currentId ? 1 : 0);
      const sorted = courses.slice().sort((a, b) => (cur(b) - cur(a)) || (b.fav - a.fav) || a.short.localeCompare(b.short));
      for (const c of sorted) {
        out.push({ label: c.short, sub: courseSub(c), hint: t("hintCourse"), url: `/courses/${c.id}`, kind: "course",
          complete: CJ.preferredAlias(c, courses, ctx.index) + " " });
      }
      for (const g of ctx.globals || []) out.push({ label: g.label, hint: t("hintGlobal"), url: g.url, kind: "global" });
      return { results: dedupe(out).slice(0, 30), needs: [], scope: null };
    }

    let course = CJ.matchCourse(tokens[0], courses, ctx.index);
    const explicit = !!course;
    if (!course && ctx.currentId) course = courses.find((c) => c.id === ctx.currentId) || null;
    const q = (explicit ? tokens.slice(1) : tokens).join(" ");

    // Pages inside the course (Modules, Assignments ...).
    if (course) {
      sectionsFor(course, ctx).forEach((sec, i) => {
        let s;
        if (!q) s = sec.id === "home" ? 100 : 70 - i * 0.5;
        // Only built in tabs have a translated name; tools like "context_external_tool_5" do not.
        else s = CJ.bestScore(q, [sec.label, TAB_KW[sec.id] ? t("sec_" + sec.id) : "", ...sec.kw]);
        if (!s) return;
        out.push({
          label: `${course.short} ${sec.label}`, hl: q, hint: explicit ? t("hintSection") : t("hintThisCourse"),
          url: sec.url, kind: "section", s: s + (explicit ? 20 : 0) + boost(sec.url),
        });
      });
    }

    if (!explicit) {
      for (const c of courses) {
        const s = CJ.bestScore(query, [c.short, c.name, c.code, ...(ctx.aliases && ctx.aliases[c.id] || [])]);
        if (s >= 40) out.push({ label: c.short, sub: courseSub(c), hl: query, hint: t("hintCourse"), url: `/courses/${c.id}`,
          kind: "course", complete: CJ.preferredAlias(c, courses, ctx.index) + " ", s: s + 10 + boost(`/courses/${c.id}`) });
      }
      for (const g of ctx.globals || []) {
        const s = CJ.bestScore(query, [g.label, ...(g.kw || [])]);
        if (s) out.push({ label: g.label, hl: query, hint: t("hintGlobal"), url: g.url, kind: "global", s: s + boost(g.url) });
      }
      for (const cmd of ctx.commands || []) {
        const s = CJ.bestScore(query, [cmd.label, ...(cmd.kw || [])]);
        if (s >= 60) out.push({ label: cmd.label, hl: query, hint: t("hintCommand"), action: cmd.id, kind: "command", url: "cmd:" + cmd.id, s: s - 5 });
      }
    }

    // Deadlines, ranked above everything else when asked for, in the order the caller gave.
    let wantsDeadlines = false;
    if (q && CJ.bestScore(q, DEADLINE_KW) >= 60) {
      wantsDeadlines = true;
      const byId = new Map(courses.map((c) => [c.id, c]));
      (ctx.deadlines || [])
        .filter((d) => !explicit || d.courseId === course.id)
        .forEach((d, i) => {
          const c = byId.get(d.courseId);
          out.push({ label: d.title, sub: c ? c.short : "", hint: d.hint, url: d.url, kind: "deadline", s: 300 - i });
        });
    }

    // Content: modules, pages, assignments, files ... Your scoped course first, the rest when not scoped.
    if (q) {
      const scopes = [];
      if (course) scopes.push([course, 0.9]);
      if (!explicit) for (const c of courses) if (!course || c.id !== course.id) scopes.push([c, 0.6]);
      for (const [c, w] of scopes) {
        const items = ctx.items[c.id];
        if (!items) { needs.add(c.id); continue; }
        for (const it of items) {
          const s = CJ.scoreText(q, it.name);
          if (s >= 15) out.push({ label: it.name, hl: q, hint: `${c.short} · ${t("kind_" + it.kind)}`, url: it.url, kind: it.kind, s: s * w + boost(it.url) });
        }
      }
    }

    out.sort((a, b) => b.s - a.s);
    return { results: dedupe(out).slice(0, MAX_RESULTS), needs: [...needs], scope: explicit ? course : null, wantsDeadlines };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((r) => !seen.has(r.url) && seen.add(r.url));
  }

  /** Update the visit log. Keeps the most useful 300 entries. */
  function recordVisit(freq, result, now) {
    const next = Object.assign({}, freq);
    const e = next[result.url] || { n: 0 };
    next[result.url] = { n: e.n + 1, t: now, label: result.label, hint: result.hint };
    const keys = Object.keys(next);
    if (keys.length > 300) {
      keys.sort((a, b) => frecency(next[a], now) - frecency(next[b], now));
      for (const k of keys.slice(0, keys.length - 300)) delete next[k];
    }
    return next;
  }

  const api = { suggest, recordVisit };
  root.CJ = Object.assign(root.CJ || {}, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
