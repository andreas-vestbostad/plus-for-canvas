// Jump module: the command palette. Hotkeys, data loading and navigation.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  CJ.registry.define("jump", function init({ api, t, isMac, alive, retire: retireAll }) {
    const state = {
      courses: [],
      index: new Map(),
      aliases: {},
      tabs: {},
      items: {},
      freq: {},
      loading: new Set(),
      failedAt: {},
      coursesFresh: false,
      notCanvas: false,
      error: null,
      deadlines: null,
      deadlinesFresh: false,
      deadlinesLoading: false,
      deadlinesFailedAt: 0,
      // Bumped by "refresh", so a fetch that started before it cannot put old data back.
      deadlinesGen: 0,
      archived: new Set(),
    };

    // Course content is fetched a couple of courses at a time so a broad search
    // does not fire every course's requests at once and trip Canvas' rate limit.
    const MAX_PARALLEL = 2;
    const RETRY_AFTER = 60e3;
    const queue = [];
    let active = 0;

    const GLOBALS = () => [
      { label: t("g_dashboard"), url: "/", kw: ["dashboard", "dashbord", "home", "hjem"] },
      { label: t("g_home"), url: `/${CJ.home.HASH}`, kw: ["hjem+", "home+", "oversikt", "overview", "canvas+ hjem", "canvas+ home"] },
      { label: t("g_calendar"), url: "/calendar", kw: ["calendar", "kalender", "timeplan"] },
      { label: t("g_inbox"), url: "/conversations", kw: ["inbox", "innboks", "messages", "meldinger"] },
      { label: t("g_todo"), url: "/?view=planner", kw: ["todo", "planner", "gjoremal", "planlegger"] },
      { label: t("g_grades"), url: "/grades", kw: ["grades", "karakterer"] },
      { label: t("g_courses"), url: "/courses", kw: ["courses", "emner", "fag", "all"] },
      { label: t("g_files"), url: "/files", kw: ["files", "filer"] },
      { label: t("g_settings"), url: "/profile/settings", kw: ["settings", "innstillinger", "profile", "profil"] },
      { label: t("g_notifications"), url: "/profile/communication", kw: ["notifications", "varsler", "varslinger"] },
    ];
    const COMMANDS = () => [
      { id: "refresh", label: t("cmd_refresh"), kw: ["refresh", "reload", "oppdater", "sync"] },
      { id: "options", label: t("cmd_options"), kw: ["options", "settings", "innstillinger", "aliases", "alias", "plus", "canvas+", "canvas plus", "canvas jump"] },
      { id: "dark", label: t("cmd_dark"), kw: ["dark", "light", "theme", "mørk", "mork", "lys", "tema"] },
      { id: "tray", label: t("cmd_tray"), kw: ["meny", "menu", "sidebar", "tilpass", "customize", "canvas+", "skuff", "tray"] },
      { id: "navreset", label: t("cmd_navreset"), kw: ["meny", "menu", "sidebar", "vis alle", "show all", "skjult", "hidden", "gjenopprett", "restore"] },
    ];

    function looksLikeCanvas() {
      return !!(document.getElementById("application") || document.querySelector(".ic-app, [class*='ic-app-']") ||
        document.querySelector('link[href*="instructure"], script[src*="instructure"]'));
    }

    function isTyping(el) {
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));
    }

    function currentCourseId() {
      const m = location.pathname.match(/^\/courses\/(\d+)/);
      return m ? +m[1] : null;
    }

    function rebuildIndex() {
      state.index = CJ.buildIndex(state.courses, state.aliases);
    }

    async function loadSettings() {
      const { aliases = {} } = await chrome.storage.sync.get("aliases");
      state.aliases = aliases[location.host] || {};
      rebuildIndex();
    }

    async function warmFromCache() {
      const [courses, freq, deadlines] = await Promise.all([api.peek("courses"), api.getFreq(), api.peek("deadlines")]);
      // Show cached deadlines at once; the first "frist" query still refreshes them when stale.
      if (deadlines && !state.deadlines) state.deadlines = deadlines;
      // The palette may already have loaded fresh data while we were reading the cache.
      if (courses && !state.coursesFresh) state.courses = courses;
      state.freq = Object.assign({}, freq, state.freq);
      await loadSettings();
      const names = state.courses.flatMap((c) => [`tabs:${c.id}`, `items:${c.id}`]);
      const hits = await api.peekMany(names);
      for (const c of state.courses) {
        if (hits[`tabs:${c.id}`] && !state.tabs[c.id]) state.tabs[c.id] = hits[`tabs:${c.id}`];
        if (hits[`items:${c.id}`] && !state.items[c.id]) state.items[c.id] = hits[`items:${c.id}`];
      }
    }

    async function ensureCourses(force) {
      if (state.coursesFresh && !force) return;
      try {
        state.courses = await api.loadCourses(force);
        state.coursesFresh = true;
        state.error = null;
        rebuildIndex();
      } catch (e) {
        state.error = e;
      }
    }

    /** Queue tabs + content for a course. Urgent ones (the course you are in or typed) jump the queue. */
    function loadCourseData(id, force, urgent) {
      if (state.loading.has(id)) return;
      if (!force && Date.now() - (state.failedAt[id] || 0) < RETRY_AFTER) return;
      state.loading.add(id);
      if (urgent) queue.unshift({ id, force });
      else queue.push({ id, force });
      pump();
    }

    function pump() {
      while (active < MAX_PARALLEL && queue.length) {
        const { id, force } = queue.shift();
        active++;
        Promise.allSettled([api.loadTabs(id, force), api.loadItems(id, force)]).then(([tabs, items]) => {
          if (tabs.status === "fulfilled") state.tabs[id] = tabs.value;
          if (items.status === "fulfilled") {
            state.items[id] = items.value;
            delete state.failedAt[id];
          } else {
            state.failedAt[id] = Date.now();
            console.warn(`Plus could not load course ${id}:`, items.reason);
          }
          state.loading.delete(id);
          active--;
          pump();
          if (palette.isOpen()) run(palette.query(), true);
        });
      }
    }

    const locale = (() => { try { return chrome.i18n.getUILanguage(); } catch { return "en"; } })();

    /** Palette rows for the deadlines: what is left first, then what you finished lately. */
    function deadlineRows(list) {
      const now = Date.now();
      const { todo, submitted, graded } = CJ.deadlines.arrange(list, now, state.archived);
      return todo.concat(submitted, graded).map((d) => ({ title: d.title, courseId: d.courseId, url: d.url, hint: CJ.deadlines.describe(d, now, t, locale) }));
    }

    function loadDeadlines(force) {
      if (state.deadlinesLoading || (!force && Date.now() - state.deadlinesFailedAt < RETRY_AFTER)) return;
      state.deadlinesLoading = true;
      const gen = state.deadlinesGen;
      Promise.all([api.loadDeadlines(force), api.getArchived().catch(() => ({}))]).then(
        ([list, archive]) => {
          if (gen !== state.deadlinesGen) return;
          state.deadlines = list;
          state.archived = new Set(Object.keys(archive));
          state.deadlinesFresh = true;
        },
        (e) => {
          if (gen !== state.deadlinesGen) return;
          console.warn("Plus could not load deadlines:", e);
          state.deadlines = state.deadlines || [];
          state.deadlinesFailedAt = Date.now();
        },
      ).then(() => {
        if (gen !== state.deadlinesGen) return;
        state.deadlinesLoading = false;
        if (palette.isOpen()) run(palette.query(), true);
      });
    }

    function run(query, keepSelection) {
      if (state.notCanvas) {
        palette.setResults([], { error: t("notCanvas") });
        return;
      }
      const currentId = currentCourseId();
      const res = CJ.suggest(query, {
        t, courses: state.courses, index: state.index, aliases: state.aliases,
        currentId, tabs: state.tabs, items: state.items, freq: state.freq,
        globals: GLOBALS(), commands: COMMANDS(), now: Date.now(),
        deadlines: state.deadlines && deadlineRows(state.deadlines),
      });
      if (res.wantsDeadlines && !state.deadlinesFresh) loadDeadlines(false);
      const urgentId = res.scope ? res.scope.id : currentId;
      for (const id of res.needs) loadCourseData(id, false, id === urgentId);
      const loading = res.needs.some((id) => state.loading.has(id)) || (res.wantsDeadlines && state.deadlinesLoading) ||
        (!state.courses.length && !state.coursesFresh && !state.error);
      const error = state.error && !state.courses.length ? t("loadError") : null;
      palette.setResults(res.results, { loading: loading && !error, error, scope: res.scope, keepSelection });
    }

    function pick(r, newTab) {
      if (r.action) return command(r.action);
      // Only ever navigate within this Canvas site ("/path", never "//host" or "javascript:").
      if (!/^\/(?!\/)/.test(r.url || "")) {
        console.warn("Plus ignored an unexpected link:", r.url);
        return;
      }
      palette.close();
      state.freq = CJ.recordVisit(state.freq, r, Date.now());
      api.setFreq(state.freq).catch(() => {});
      if (newTab) window.open(r.url, "_blank", "noopener");
      else location.assign(r.url);
    }

    async function command(id) {
      if (id === "options") {
        palette.close();
        chrome.runtime.sendMessage({ type: "cj:openOptions" }).catch(() => {});
      } else if (id === "tray") {
        palette.close();
        document.dispatchEvent(new CustomEvent("cj:open-settings"));
      } else if (id === "navreset") {
        palette.close();
        try {
          const { navLayout } = await chrome.storage.sync.get("navLayout");
          await chrome.storage.sync.set({ navLayout: CJ.navorder.showAll(navLayout) });
        } catch (e) {
          console.warn("Plus could not show the menu items:", e);
        }
      } else if (id === "dark") {
        palette.close();
        await CJ.theme.flip().catch((e) => console.warn("Plus could not switch dark mode:", e));
      } else if (id === "refresh") {
        await api.clearHost();
        state.tabs = {};
        state.items = {};
        state.failedAt = {};
        state.coursesFresh = false;
        state.deadlines = null;
        state.deadlinesFresh = false;
        state.deadlinesLoading = false;
        state.deadlinesFailedAt = 0;
        state.deadlinesGen++;
        palette.setValue("");
        await ensureCourses(true);
        const cur = currentCourseId();
        if (cur) loadCourseData(cur, true, true);
        run(palette.query());
      }
    }

    const palette = CJ.createPalette({ t, isMac, onInput: (q) => run(q), onPick: pick });

    async function open() {
      // The toolbar button can inject us into any page; only talk to the API on Canvas.
      state.notCanvas = !looksLikeCanvas();
      palette.open("");
      if (state.notCanvas) return;
      await ensureCourses(false);
      if (palette.isOpen()) run(palette.query(), true);
      const cur = currentCourseId();
      if (cur) loadCourseData(cur, false, true);
    }

    function toggle() {
      palette.isOpen() ? palette.close() : open();
    }

    function onKey(e) {
      // Orphaned by an extension update: let the keys through to the fresh copy.
      if (!alive()) return retireAll();
      const k = (e.key || "").toLowerCase();
      const modK = (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.shiftKey && !e.altKey && k === "k";
      const altSpace = e.altKey && !e.metaKey && !e.ctrlKey && e.code === "Space";
      if (!modK && !altSpace) return;
      if (!palette.isOpen()) {
        // Leave Cmd+K alone inside rich text editors, where it means "insert link".
        const el = e.target;
        if (modK && el && (el.isContentEditable || (el.closest && el.closest(".tox, .mce-content-body")))) return;
        // Option+Space types a non-breaking space on a Mac, so never take it from a text field.
        if (altSpace && isTyping(el)) return;
        if (!looksLikeCanvas()) return;
      }
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
    window.addEventListener("keydown", onKey, true);

    // Archiving in the deadlines tray takes the item out of "frist" results too.
    const archiveKey = `cj:${location.host}:dlArchive`;
    const onStorage = (changes, area) => {
      if (area === "sync" && changes.aliases) loadSettings();
      if (area === "local" && changes[archiveKey]) {
        state.archived = new Set(Object.keys(changes[archiveKey].newValue || {}));
        if (palette.isOpen()) run(palette.query(), true);
      }
    };
    chrome.storage.onChanged.addListener(onStorage);

    warmFromCache().catch(() => {});

    return {
      toggle,
      stop() {
        window.removeEventListener("keydown", onKey, true);
        palette.destroy();
        try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
      },
    };
  });
})();
