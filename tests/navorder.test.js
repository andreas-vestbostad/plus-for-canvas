const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../src/lib/navorder.js");

const NATURAL = ["global_nav_profile_link", "global_nav_dashboard_link", "global_nav_courses_link", "global_nav_calendar_link", "cj-deadlines-link", "cj-settings-link", "global_nav_help_link"];
const frozen = (o) => Object.freeze({ order: Object.freeze([...(o.order || [])]), hidden: Object.freeze([...(o.hidden || [])]) });

test("normalize keeps only unique string ids and fills in what is missing", () => {
  assert.deepEqual(N.normalize(undefined), { order: [], hidden: [] });
  assert.deepEqual(N.normalize({ order: ["a", "a", 3, "b"], hidden: "x" }), { order: ["a", "b"], hidden: [] });
});

test("with no layout the menu keeps Canvas' own order", () => {
  assert.deepEqual(N.arrange(NATURAL, undefined), NATURAL);
});

test("a saved order is followed; items it does not know keep their natural neighbour", () => {
  const layout = { order: ["global_nav_help_link", "global_nav_profile_link", "global_nav_dashboard_link", "global_nav_calendar_link"] };
  assert.deepEqual(N.arrange(NATURAL, layout), [
    "global_nav_help_link", "global_nav_profile_link", "global_nav_dashboard_link", "global_nav_courses_link",
    "global_nav_calendar_link", "cj-deadlines-link", "cj-settings-link",
  ]);
});

test("saved items that are not on the page are skipped", () => {
  assert.deepEqual(N.arrange(["a", "b"], { order: ["gone", "b", "a"] }), ["b", "a"]);
});

test("an unknown item first in Canvas' order stays first", () => {
  assert.deepEqual(N.arrange(["new", "a", "b"], { order: ["b", "a"] }), ["new", "b", "a"]);
});

test("moveTo moves an item and returns a new layout", () => {
  const layout = frozen({ order: [], hidden: ["x"] });
  const next = N.moveTo(layout, NATURAL, "global_nav_help_link", 1);
  assert.deepEqual(N.arrange(NATURAL, next).slice(0, 3), ["global_nav_profile_link", "global_nav_help_link", "global_nav_dashboard_link"]);
  assert.deepEqual(next.hidden, ["x"]);
  assert.notEqual(next, layout);
});

test("moveTo clamps at the ends and ignores unknown ids", () => {
  const first = N.moveTo({}, NATURAL, "global_nav_profile_link", -1);
  assert.deepEqual(N.arrange(NATURAL, first), NATURAL);
  const last = N.moveTo({}, NATURAL, "global_nav_profile_link", 99);
  assert.equal(N.arrange(NATURAL, last).at(-1), "global_nav_profile_link");
  assert.deepEqual(N.arrange(NATURAL, N.moveTo({}, NATURAL, "nope", 0)), NATURAL);
});

test("moveTo keeps saved items that are missing right now next to where they were", () => {
  const layout = { order: ["b", "home", "a"] };
  const next = N.moveTo(layout, ["a", "b"], "a", 0);
  assert.deepEqual(next.order, ["a", "b", "home"]);
  assert.deepEqual(N.arrange(["a", "b", "home"], next), ["a", "b", "home"]);
});

test("toggleHidden hides and shows, never the locked Account item", () => {
  const hidden = N.toggleHidden(frozen({}), "global_nav_courses_link");
  assert.deepEqual(hidden.hidden, ["global_nav_courses_link"]);
  assert.deepEqual(N.toggleHidden(hidden, "global_nav_courses_link").hidden, []);
  assert.deepEqual(N.toggleHidden({}, "global_nav_profile_link").hidden, []);
  assert.equal(N.isLocked("global_nav_profile_link"), true);
  assert.equal(N.isHidden({ hidden: ["global_nav_profile_link"] }, "global_nav_profile_link"), false, "a stored hide of a locked item is ignored");
});

test("only hiding the Canvas+ item needs a warning", () => {
  assert.equal(N.needsWarning("cj-settings-link"), true);
  assert.equal(N.needsWarning("global_nav_courses_link"), false);
});

test("showAll keeps the order and reset clears everything", () => {
  const layout = frozen({ order: ["b", "a"], hidden: ["a"] });
  assert.deepEqual(N.showAll(layout), { order: ["b", "a"], hidden: [] });
  assert.deepEqual(N.reset(), { order: [], hidden: [] });
  assert.deepEqual(layout.hidden, ["a"], "the input is untouched");
});

test("dropIndex puts a dragged row where its middle is among the other rows", () => {
  // Midpoints of the rows other than the one being dragged, top to bottom.
  const mids = [10, 30, 50];
  assert.equal(N.dropIndex(mids, 0), 0);
  assert.equal(N.dropIndex(mids, 15), 1);
  assert.equal(N.dropIndex(mids, 49), 2);
  assert.equal(N.dropIndex(mids, 99), 3);
  assert.equal(N.dropIndex([], 5), 0);
});

test("keyOf names menu items that have no id from their link, so they can be hidden and moved", () => {
  // UiB adds "Sei frå" and its own "Hjelp" to Canvas' menu without ids.
  const seiFra = { href: "https://www4.uib.no/for-studenter/hjelp-og-kontakt/si-fra", className: "support_url ic-app-header__menu-list-link si_fra_lnk", text: "Sei frå" };
  const help = { href: null, className: "support_url ic-app-header__menu-list-link", text: "Hjelp" };
  assert.equal(N.keyOf(seiFra), "cj-x-https-www4-uib-no-for-studenter-hjelp-og-kontakt-si-fra");
  assert.equal(N.keyOf(help), "cj-x-support-url");
  assert.notEqual(N.keyOf(seiFra), N.keyOf(help));
  assert.equal(N.keyOf({ href: null, className: "ic-app-header__menu-list-link", text: "  Noe  " }), "cj-x-noe");
  assert.equal(N.keyOf({ href: "", className: "", text: "" }), null);
});

test("copies: an item without its own id that has the same name as a real Canvas item is a copy", () => {
  // UiB adds its own "Hjelp" next to Canvas' Help; both open help.
  const entries = [
    { id: "cj-x-support-url", label: "Hjelp" },
    { id: "cj-x-https-www4-uib-no-si-fra", label: "Sei frå" },
    { id: "global_nav_profile_link", label: "Konto" },
    { id: "global_nav_help_link", label: " hjelp " },
  ];
  assert.deepEqual(N.copies(entries), ["cj-x-support-url"]);
  assert.deepEqual(N.copies([{ id: "cj-x-a", label: "A" }, { id: "cj-x-b", label: "A" }]), [], "only a real item makes another a copy");
  assert.deepEqual(N.copies([]), []);
});

test("copies: when the site hides the real item itself, that one is left out and its copy stays", () => {
  // mitt.uib.no hides Canvas' Help with an inline style and shows only its own "Hjelp".
  const entries = [
    { id: "global_nav_help_link", label: "Hjelp", siteHidden: true },
    { id: "cj-x-support-url", label: "Hjelp" },
    { id: "global_nav_profile_link", label: "Konto" },
  ];
  assert.deepEqual(N.copies(entries), ["global_nav_help_link"]);
});
