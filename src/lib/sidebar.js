// What the course sidebar lists: the courses (favourites, or all when none is), the course a
// page belongs to and which of its menu items is the current one. Pure; the module renders.
(function (root) {
  "use strict";

  /** Every course, by course code: what you choose the sidebar's courses from. */
  function sorted(courses) {
    return (courses || []).filter((c) => c && c.id)
      .sort((a, b) => String(a.short || a.name).localeCompare(String(b.short || b.name), undefined, { numeric: true }));
  }

  /**
   * The courses in the sidebar: favourites when there are any, else every course, by course
   * code. `choice` ({ courseId: true | false }) adds or takes away courses you picked yourself.
   */
  function listed(courses, choice) {
    const all = sorted(courses);
    const favs = all.some((c) => c.fav);
    return all.filter((c) => {
      const mine = choice && choice[String(c.id)];
      return typeof mine === "boolean" ? mine : !favs || c.fav;
    });
  }

  /** The course a path is in, its front page included: "/courses/12/modules" -> "12". */
  function courseOf(path) {
    const m = /^\/courses\/(\d+)(?:[/?#]|$)/.exec(String(path || ""));
    return m ? m[1] : null;
  }

  /**
   * The course menu item for a path: the one whose page the path is, or is under. The front
   * page ("Home", "/courses/12") counts only on the front page itself.
   */
  function activeTab(tabs, path) {
    const p = String(path || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    let best = null;
    for (const tab of tabs || []) {
      const u = String(tab.url || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
      if (!u) continue;
      const front = /^\/courses\/\d+$/.test(u);
      const hit = p === u || (!front && p.startsWith(`${u}/`));
      if (hit && (!best || u.length > best.len)) best = { id: tab.id, len: u.length };
    }
    return best ? best.id : null;
  }

  /** A course's menu items less the ones you hid there, the front page ("Home") too. */
  function visibleTabs(tabs, hiddenIds) {
    const hidden = new Set((hiddenIds || []).map(String));
    return (tabs || []).filter((tab) => !hidden.has(String(tab.id)));
  }

  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

  /** Canvas' course colours (users/self/colors) -> { courseId: "#hex" }. Anything but a plain hex is left out. */
  function colorsFromApi(data) {
    const out = {};
    for (const [k, v] of Object.entries((data && data.custom_colors) || {})) {
      const m = /^course_(\d+)$/.exec(k);
      if (m && HEX.test(String(v))) out[m[1]] = String(v);
    }
    return out;
  }

  const api = { sorted, listed, courseOf, activeTab, visibleTabs, colorsFromApi };
  root.CJ = Object.assign(root.CJ || {}, { sidebar: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
