// The palette UI. Lives in a closed Shadow DOM so Canvas styles never leak in (or out).
(function (root) {
  "use strict";
  const CJ = root.CJ;

  const DARK = `--bg: #1a1f26; --fg: #eef2f6; --dim: #98a4b0; --line: #2a313a; --sel: var(--cj-accent, #4a6385); --selfg: var(--cj-accent-fg, #fff); --mark: var(--cj-accent, #9db4d6); --chip: #262d36;
    --thumb: #4a4e57; --k-nav: #8a9ab5; --k-content: #4cc39f; --k-recent: #a893ec; color-scheme: dark;`;
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bg { position: fixed; inset: 0; background: rgba(15, 18, 25, .38); animation: fade .12s ease-out; }
    .box {
      --bg: #ffffff; --fg: #1d2330; --dim: #6b7280; --line: #e7e9ee; --sel: var(--cj-accent, #3c4f6b); --selfg: var(--cj-accent-fg, #fff);
      --mark: var(--cj-accent, #4a6a96); --chip: #eef1f6; --thumb: #c9ced6;
      --k-nav: #5b6b86; --k-content: #1f9d7a; --k-recent: #8a6be0;
      color-scheme: light;
      position: fixed; top: 13vh; left: 50%; transform: translateX(-50%);
      width: min(640px, calc(100vw - 32px)); background: var(--bg); color: var(--fg);
      border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.32), 0 0 0 1px rgba(0,0,0,.06);
      overflow: hidden; font: 14.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: pop .14s ease-out;
    }
    /* Follow the page, not the system: the dark mode module can darken the page while the
       system is light, or keep it light while the system is dark. Dark Reader marks <html>
       while it themes the page, and in "auto" it tracks the system itself. */
    :host-context(html[data-darkreader-scheme]) .box { ${DARK} }
    @keyframes fade { from { opacity: 0 } }
    @keyframes pop { from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(.985) } }
    .top { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); }
    .scope { display: none; font-size: 12.5px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: var(--chip); white-space: nowrap; }
    .scope.on { display: inline-block; }
    input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 16px 0; font: inherit; font-size: 18px; background: transparent; color: inherit; }
    input::placeholder { color: var(--dim); }
    .bar { height: 2px; background: transparent; overflow: hidden; }
    .bar.on::after { content: ""; display: block; height: 100%; width: 30%; background: var(--sel); animation: slide 1s ease-in-out infinite; }
    @keyframes slide { from { transform: translateX(-100%) } to { transform: translateX(340%) } }
    ul { list-style: none; margin: 0; padding: 6px; max-height: 56vh; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--thumb) transparent; }
    li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    li.on { background: var(--sel); color: var(--selfg); }
    li.on .hint, li.on .sub { color: inherit; opacity: .8; }
    li.on mark { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--k-content); }
    .dot.nav { background: var(--k-nav); }
    .dot.recent { background: var(--k-recent); }
    li.on .dot { background: var(--selfg); }
    .main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
    .label, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { color: var(--dim); font-size: 13px; flex: 1; min-width: 0; }
    .label { flex: none; max-width: 100%; }
    .main.long .label { flex: 1; min-width: 0; }
    mark { background: none; color: var(--mark); font-weight: 650; }
    .hint { flex: none; color: var(--dim); font-size: 12.5px; white-space: nowrap; }
    .empty { padding: 18px 16px; color: var(--dim); }
    .foot { display: flex; flex-wrap: wrap; gap: 14px; padding: 8px 16px; font-size: 12px; color: var(--dim); border-top: 1px solid var(--line); }
    kbd { font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 5px; border-radius: 4px; background: var(--chip); color: var(--fg); margin-right: 4px; }
    .brand { margin-left: auto; opacity: .7; }
  `;

  // Three dot colours: places to go (courses, sections, global pages, commands), things
  // inside a course (content, the default), and recent picks. The hint names the exact kind.
  const NAV_KINDS = new Set(["course", "section", "global", "command"]);
  const dotGroup = (kind) => (kind === "recent" ? "recent" : NAV_KINDS.has(kind) ? "nav" : "content");

  function createPalette({ t, isMac, onInput, onPick }) {
    let host, shadow, input, list, bar, scopeEl, results = [], sel = 0, lastQuery = "", moved = false, failed = null, returnFocus = null;
    const mod = isMac ? "⌘" : "Ctrl";

    function build() {
      host = document.createElement("div");
      host.setAttribute("data-canvas-jump", "");
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:none";
      shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `<style>${CSS}</style>
        <div class="bg"></div>
        <div class="box" role="dialog" aria-modal="true" aria-label="Plus">
          <div class="top"><span class="scope"></span><input spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cj-list"></div>
          <div class="bar"></div>
          <ul id="cj-list" role="listbox"></ul>
          <div class="foot">
            <span><kbd>↵</kbd>${t("footOpen")}</span>
            <span><kbd>${mod}↵</kbd>${t("footNewTab")}</span>
            <span><kbd>Tab</kbd>${t("footComplete")}</span>
            <span><kbd>Esc</kbd>${t("footClose")}</span>
            <span class="brand">Plus</span>
          </div>
        </div>`;
      input = shadow.querySelector("input");
      input.placeholder = t("placeholder");
      list = shadow.querySelector("ul");
      bar = shadow.querySelector(".bar");
      scopeEl = shadow.querySelector(".scope");
      shadow.querySelector(".bg").addEventListener("mousedown", close);
      input.addEventListener("input", () => { lastQuery = input.value; moved = false; onInput(input.value); });
      input.addEventListener("keydown", onKey);
      // Keep Canvas' own keyboard shortcuts from reacting while we type.
      for (const ev of ["keydown", "keyup", "keypress"]) host.addEventListener(ev, (e) => e.stopPropagation());
      document.documentElement.appendChild(host);
    }

    function labelNode(text, query) {
      const span = document.createElement("span");
      span.className = "label";
      const ranges = query ? CJ.highlight(text, query) : [];
      let at = 0;
      for (const [a, b] of ranges) {
        if (a > at) span.append(text.slice(at, a));
        const m = document.createElement("mark");
        m.textContent = text.slice(a, b);
        span.append(m);
        at = b;
      }
      span.append(text.slice(at));
      return span;
    }

    /** Move the highlight without rebuilding the list. */
    function showSelection(scroll) {
      Array.from(list.children).forEach((li, i) => {
        li.classList.toggle("on", i === sel);
        li.setAttribute("aria-selected", String(i === sel));
      });
      const on = list.children[sel];
      if (on && on.id) input.setAttribute("aria-activedescendant", on.id);
      else input.removeAttribute("aria-activedescendant");
      if (on && scroll) on.scrollIntoView({ block: "nearest" });
    }

    function render() {
      list.textContent = "";
      if (!results.length) {
        const li = document.createElement("div");
        li.className = "empty";
        li.textContent = failed || (bar.classList.contains("on") ? t("loading") : t("noResults"));
        list.append(li);
        showSelection(false);
        return;
      }
      results.forEach((r, i) => {
        const li = document.createElement("li");
        li.id = `cj-opt-${i}`;
        li.setAttribute("role", "option");
        const dot = document.createElement("span");
        dot.className = "dot " + dotGroup(r.kind);
        const main = document.createElement("span");
        main.className = "main" + (r.sub ? "" : " long");
        main.append(labelNode(r.label, r.hl));
        if (r.sub) {
          const sub = document.createElement("span");
          sub.className = "sub";
          sub.textContent = r.sub;
          main.append(sub);
        }
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = r.hint || "";
        li.append(dot, main, hint);
        li.addEventListener("mousemove", () => { if (sel !== i) { sel = i; moved = true; showSelection(false); } });
        li.addEventListener("click", (e) => onPick(r, e.metaKey || e.ctrlKey));
        list.append(li);
      });
      showSelection(true);
    }

    function move(d) {
      if (!results.length) return;
      sel = (sel + d + results.length) % results.length;
      moved = true;
      showSelection(true);
    }

    function onKey(e) {
      const k = e.key;
      if (k === "Escape") { e.preventDefault(); close(); }
      else if (k === "ArrowDown" || (e.ctrlKey && k === "n")) { e.preventDefault(); move(1); }
      else if (k === "ArrowUp" || (e.ctrlKey && k === "p")) { e.preventDefault(); move(-1); }
      else if (k === "Enter") { e.preventDefault(); if (results[sel]) onPick(results[sel], e.metaKey || e.ctrlKey); }
      else if (k === "Tab") {
        e.preventDefault();
        const r = results[sel];
        if (r && r.complete) setValue(r.complete);
        else move(e.shiftKey ? -1 : 1);
      }
    }

    function setValue(v) {
      input.value = v;
      lastQuery = v;
      moved = false;
      onInput(v);
    }

    function open(prefill) {
      if (!host) build();
      // Remember where you were so Esc puts you back there.
      if (host.style.display === "none") returnFocus = document.activeElement;
      host.style.display = "block";
      setValue(prefill || "");
      setTimeout(() => input.focus(), 0);
    }

    function close() {
      if (!host || host.style.display === "none") return;
      host.style.display = "none";
      const back = returnFocus;
      returnFocus = null;
      if (back && back !== document.body && back.isConnected && back.focus) back.focus({ preventScroll: true });
    }

    /** Take the palette out of the page (when the module is turned off). */
    function destroy() {
      close();
      if (host) host.remove();
      host = null;
    }

    return {
      open, close, setValue, destroy,
      isOpen: () => !!host && host.style.display !== "none",
      query: () => lastQuery,
      /** error: a message to show instead of results, or null. */
      setResults(next, { loading = false, error = null, scope = null, keepSelection = false } = {}) {
        const prevUrl = results[sel] && results[sel].url;
        results = next;
        failed = error || null;
        sel = 0;
        if (keepSelection && moved && prevUrl) {
          const i = results.findIndex((r) => r.url === prevUrl);
          if (i >= 0) sel = i;
        }
        bar.classList.toggle("on", loading);
        scopeEl.classList.toggle("on", !!scope);
        scopeEl.textContent = scope ? scope.short : "";
        render();
      },
    };
  }

  root.CJ = Object.assign(root.CJ || {}, { createPalette });
})(globalThis);
