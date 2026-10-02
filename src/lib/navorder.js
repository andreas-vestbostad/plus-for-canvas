// The order of the items in Canvas' global navigation, and which of them are hidden. The
// layout is { order: [link id], hidden: [link id] }; items it does not mention keep their
// place next to the item before them in Canvas' own order. Pure; navlayout.js applies it.
(function (root) {
  "use strict";

  // Account holds log out and the way back to the Plus settings, so it always stays.
  const LOCKED = ["global_nav_profile_link"];
  // Hiding this one hides the settings tray; the user is told how to get it back.
  const SETTINGS = "cj-settings-link";

  const ids = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x))] : []);

  const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /**
   * A stable id for a menu item whose link has none (UiB adds "Sei frå" and its own "Hjelp"
   * that way): from the link's address, else its own classes (not Canvas' shared ones),
   * else its text. Null when there is nothing to go on.
   */
  function keyOf({ href, className, text } = {}) {
    const own = String(className || "").split(/\s+/).filter((c) => c && !c.startsWith("ic-app-header")).join(" ");
    const basis = slug(href || "") || slug(own) || slug(text || "");
    return basis ? `cj-x-${basis}` : null;
  }

  /**
   * The items to leave out of the menu and the list: the ones the site hides itself
   * (`siteHidden`), which the user could not bring back anyway, and the ones that only repeat
   * a real Canvas item the site shows: no id of their own (keyOf) and the same name as one
   * that has an id. UiB adds its own "Hjelp" next to Canvas' Help, and mitt.uib.no hides
   * Canvas' one.
   */
  function copies(entries) {
    const name = (e) => String(e.label || "").trim().toLowerCase();
    const real = new Set(entries.filter((e) => !e.id.startsWith("cj-x-") && !e.siteHidden).map(name));
    return entries.filter((e) => e.siteHidden || (e.id.startsWith("cj-x-") && real.has(name(e)))).map((e) => e.id);
  }

  /** A clean copy of a stored layout. */
  function normalize(layout) {
    const l = layout && typeof layout === "object" ? layout : {};
    return { order: ids(l.order), hidden: ids(l.hidden) };
  }

  /**
   * `base` with every id of `reference` it lacks put right after the nearest id before it
   * in `reference` (or first, when there is none).
   */
  function weave(base, reference) {
    const out = [...base];
    reference.forEach((id, i) => {
      if (out.includes(id)) return;
      const before = reference.slice(0, i).reverse().find((x) => out.includes(x));
      out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
    });
    return out;
  }

  /** The ids on the page (in Canvas' order) in the order to show them. */
  function arrange(present, layout) {
    const { order } = normalize(layout);
    return weave(order.filter((id) => present.includes(id)), present);
  }

  /** A new layout with `id` at position `index` (clamped) among the items on the page. */
  function moveTo(layout, present, id, index) {
    const l = normalize(layout);
    const current = arrange(present, l);
    if (!current.includes(id)) return l;
    const rest = current.filter((x) => x !== id);
    const at = Math.max(0, Math.min(rest.length, index));
    const shown = rest.slice(0, at).concat(id, rest.slice(at));
    // Saved items that are not on the page now (a feature turned off) keep their neighbours.
    return { order: weave(shown, l.order), hidden: l.hidden };
  }

  const isLocked = (id) => LOCKED.includes(id);
  const isHidden = (layout, id) => !isLocked(id) && normalize(layout).hidden.includes(id);
  const needsWarning = (id) => id === SETTINGS;

  /** A new layout with `id` shown if it was hidden and hidden if it was shown. */
  function toggleHidden(layout, id) {
    const l = normalize(layout);
    if (isLocked(id)) return l;
    const hidden = l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : l.hidden.concat(id);
    return { order: l.order, hidden };
  }

  /**
   * Where a dragged row lands: the number of other rows whose middle (`mids`, top to
   * bottom) is above the dragged row's middle `y`.
   */
  const dropIndex = (mids, y) => mids.filter((m) => m < y).length;

  const showAll = (layout) => ({ order: normalize(layout).order, hidden: [] });
  const reset = () => ({ order: [], hidden: [] });

  const api = { LOCKED, SETTINGS, keyOf, copies, normalize, arrange, moveTo, isLocked, isHidden, needsWarning, toggleHidden, dropIndex, showAll, reset };
  root.CJ = Object.assign(root.CJ || {}, { navorder: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
