// Text normalisation, fuzzy scoring and highlight ranges.
// Pure functions, shared by the content script and the Node tests.
(function (root) {
  "use strict";

  const SPLIT = /[\s_:.,;()/[\]|#-]+/;

  /** Lowercase, fold Nordic letters and strip accents so "Kunngjøringer" ~ "kunngjoringer". */
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function words(t) {
    return t.split(SPLIT).filter(Boolean);
  }

  function isSubsequence(q, text) {
    let i = 0;
    for (const c of text) if (c === q[i] && ++i === q.length) return true;
    return false;
  }

  /** Score one normalised query word against a normalised text. 0 means no match. */
  function scoreWord(w, text, ws) {
    if (!w) return 1;
    if (text === w) return 100;
    if (text.startsWith(w)) return 85;
    if (ws.includes(w)) return 75;
    if (ws.some((x) => x.startsWith(w))) return 65;
    const compact = ws.join("");
    if (compact.startsWith(w)) return 55;      // "hw2" matches "HW 2"
    if (compact.includes(w)) return 45;
    if (text.includes(w)) return 40;
    if (w.length >= 3 && isSubsequence(w, compact)) return 15;
    return 0;
  }

  /**
   * Score a (possibly multi word) query against a text.
   * Every query word has to match something; the result is the average,
   * or the whole phrase score if that is better.
   */
  function scoreText(query, text) {
    const q = norm(query).trim().replace(/\s+/g, " ");
    if (!q) return 1;
    const t = norm(text);
    const ws = words(t);
    const phrase = scoreWord(q, t, ws);
    const qws = q.split(" ");
    if (qws.length === 1) return phrase;
    let sum = 0;
    for (const w of qws) {
      const s = scoreWord(w, t, ws);
      if (!s) return phrase;
      sum += s;
    }
    return Math.max(phrase, sum / qws.length);
  }

  function bestScore(query, texts) {
    let best = 0;
    for (const t of texts) {
      if (!t) continue;
      const s = scoreText(query, t);
      if (s > best) best = s;
    }
    return best;
  }

  /**
   * Character ranges [start, end) in the ORIGINAL label that match the query words.
   * Works through a normalised copy with an index map, so "ø" -> "o" keeps positions right.
   */
  function highlight(label, query) {
    const src = String(label || "");
    let n = "";
    const map = [];
    for (let i = 0; i < src.length; i++) {
      const piece = norm(src[i]);
      for (let k = 0; k < piece.length; k++) { n += piece[k]; map.push(i); }
    }
    const ranges = [];
    for (const w of norm(query).split(/\s+/).filter(Boolean)) {
      // Prefer a match at a word start, fall back to anywhere.
      const re = new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const m = re.exec(n);
      const at = m ? m.index + m[1].length : n.indexOf(w);
      if (at < 0) continue;
      const start = map[at];
      const end = map[at + w.length - 1] + 1;
      ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    return merged;
  }

  /** Absolute URL -> path on its site ("https://x.org/courses/1" -> "/courses/1"). Paths pass through. */
  const pathOf = (u) => String(u || "").replace(/^https?:\/\/[^/]+/, "");

  const api = { norm, scoreText, bestScore, highlight, pathOf };
  root.CJ = Object.assign(root.CJ || {}, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
