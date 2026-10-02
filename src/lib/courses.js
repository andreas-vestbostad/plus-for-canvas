// Course model and aliases. "BIO101" automatically answers to "bio101" and "101".
(function (root) {
  "use strict";
  const { norm } = root.CJ || require("./match.js");

  const CODE_RE = /([A-Za-zÆØÅæøåÄÖÜäöü]{2,})[\s_-]?(\d{2,4})/;

  /** Turn a Canvas API course into the small shape we keep. */
  function fromApi(c) {
    const m = CODE_RE.exec(c.course_code || "") || CODE_RE.exec(c.name || "");
    const short = m ? (m[1] + m[2]).toUpperCase() : (c.course_code || c.name || String(c.id)).trim();
    return {
      id: c.id,
      name: c.name || c.course_code || String(c.id),
      code: c.course_code || "",
      short,
      fav: !!c.is_favorite,
      term: (c.term && c.term.name) || "",
    };
  }

  /** Aliases we can derive without the user doing anything. */
  function autoAliases(course) {
    const out = new Set();
    for (const src of [course.short, course.code]) {
      const n = norm(src).trim();
      if (!n) continue;
      out.add(n);
      out.add(n.replace(/[^a-z0-9]/g, ""));
      const m = /^([a-z]+)[\s_-]?(\d{2,4})/.exec(n);
      if (m) { out.add(m[2]); out.add(m[1] + m[2]); }
    }
    out.delete("");
    return [...out];
  }

  /** alias -> [course ids]. More than one id means the alias is ambiguous. */
  function buildIndex(courses, custom) {
    custom = custom || {};
    const index = new Map();
    const put = (a, id) => {
      a = norm(a).trim();
      if (!a) return;
      const ids = index.get(a) || [];
      if (!ids.includes(id)) ids.push(id);
      index.set(a, ids);
    };
    for (const c of courses) {
      for (const a of autoAliases(c)) put(a, c.id);
      for (const a of custom[c.id] || []) put(a, c.id);
    }
    return index;
  }

  /**
   * Resolve the first word of a query to a course, or null.
   * Exact alias wins. Otherwise a unique prefix that contains a digit ("10" -> 101)
   * so ordinary words like "mod" never get eaten as a course.
   */
  function matchCourse(token, courses, index) {
    const t = norm(token).trim();
    if (!t) return null;
    const byId = (id) => courses.find((c) => c.id === id) || null;
    const exact = index.get(t);
    if (exact) return exact.length === 1 ? byId(exact[0]) : null;
    if (t.length >= 2 && /\d/.test(t)) {
      const ids = new Set();
      for (const [a, list] of index) if (/\d/.test(a) && a.startsWith(t)) list.forEach((id) => ids.add(id));
      if (ids.size === 1) return byId([...ids][0]);
    }
    return null;
  }

  /** Shortest alias that resolves uniquely, used for Tab completion. */
  function preferredAlias(course, courses, index) {
    // Built in aliases first (shortest, so "101" beats "bio101"), your own nicknames as fallback.
    const unique = (list) => list.filter((a) => matchCourse(a, courses, index) === course).sort((a, b) => a.length - b.length);
    const auto = unique(autoAliases(course));
    if (auto.length) return auto[0];
    const custom = unique([...index.keys()].filter((a) => index.get(a).includes(course.id)));
    return custom[0] || norm(course.short);
  }

  const api = { fromApi, autoAliases, buildIndex, matchCourse, preferredAlias };
  root.CJ = Object.assign(root.CJ || {}, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
