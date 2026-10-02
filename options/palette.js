// Command palette help and course aliases.
"use strict";

async function renderHow() {
  fillWithTokens($("#howOpen"), "opt_howOpen", [isMac ? "⌘K" : "Ctrl+K", await actionShortcut()]);
}

async function saveAliases(host, courseId, list) {
  const { aliases: cur = {} } = await chrome.storage.sync.get("aliases");
  const forHost = Object.assign({}, cur[host]);
  if (list.length) forHost[courseId] = list; else delete forHost[courseId];
  await chrome.storage.sync.set({ aliases: Object.assign({}, cur, { [host]: forHost }) });
}

function aliasRow(host, c, mine) {
  const input = el("input", {
    value: (mine[c.id] || []).join(", "),
    placeholder: CJ.autoAliases(c).join(", "),
    spellcheck: false,
  });
  input.setAttribute("aria-label", `${c.short} aliases`);
  const status = el("span", { className: "msg" });
  input.addEventListener("change", async () => {
    const list = input.value.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await saveAliases(host, c.id, list);
      flash(status, t("opt_saved"));
    } catch (e) {
      console.warn("Plus could not save aliases:", e);
      flash(status, t("opt_saveError"), true);
    }
  });
  return el("div", { className: "course" },
    el("div", { className: "name" }, el("b", { textContent: c.short }), el("span", { textContent: c.name, title: c.name })),
    el("div", {}, input, status));
}

async function renderAliases() {
  // Cache keys are cj:<host>:courses, and the host may carry a port (canvas.x.org:8443).
  const CACHE_PREFIX = "cj:";
  const COURSES_SUFFIX = ":courses";
  const box = $("#aliases");
  const all = await chrome.storage.local.get(null);
  const { aliases = {} } = await chrome.storage.sync.get("aliases");
  const hosts = Object.keys(all)
    .filter((k) => k.startsWith(CACHE_PREFIX) && k.endsWith(COURSES_SUFFIX))
    .map((k) => ({ host: k.slice(CACHE_PREFIX.length, -COURSES_SUFFIX.length), courses: (all[k].v || []) }))
    .filter((h) => h.courses.length);

  if (!hosts.length) {
    box.replaceChildren(el("p", { className: "dim", textContent: t("opt_aliasEmpty") }));
    return;
  }
  const rows = [];
  for (const { host, courses } of hosts) {
    if (hosts.length > 1) rows.push(el("h4", { textContent: host }));
    const sorted = courses.slice().sort((a, b) => (b.fav - a.fav) || a.short.localeCompare(b.short));
    rows.push(...sorted.map((c) => aliasRow(host, c, aliases[host] || {})));
  }
  box.replaceChildren(...rows);
}
