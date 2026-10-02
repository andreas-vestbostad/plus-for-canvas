// Home+'s styles and icons. Static markup, never from the page.
(function () {
  "use strict";
  const ID = "cj-home";

  // Drawn to sit next to Canvas' line icons. Static markup, never from the page.
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path style="fill:none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" d="M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9M10 20v-5.5h4V20M18.5 2.5v3M17 4h3"/></svg>';

  // A ticked circle for work handed in; an empty one for work that is left.
  const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path style="fill:none" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round" d="m3.3 6.2 1.8 1.8 3.6-3.8"/></svg>';

  // The arrow on a card's deadline count.
  const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path style="fill:none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" d="m6 3.5 4.5 4.5L6 12.5"/></svg>';

  // The handle that moves a card: two columns of dots.
  const GRIP = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="6" cy="4" r="1.25"/><circle cx="10" cy="4" r="1.25"/>' +
    '<circle cx="6" cy="8" r="1.25"/><circle cx="10" cy="8" r="1.25"/><circle cx="6" cy="12" r="1.25"/><circle cx="10" cy="12" r="1.25"/></g></svg>';

  // The × that hides a card.
  const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path style="fill:none" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" d="m4.5 4.5 7 7m0-7-7 7"/></svg>';

  // Dark mode comes from Dark Reader rewriting these, so they are plain light colours.
  const STYLE = `
    html.${ID} #dashboard, html.${ID} #right-side-wrapper { display: none !important; }
    #${ID} { --cj-text: #273540; --cj-muted: #6b7780; --cj-faint: #8b969e; --cj-border: #c7cdd1; --cj-line: #e8eaec; --cj-hover: rgba(0, 0, 0, .05);
      --cj-red: #d01a19; --cj-focus: var(--cj-accent, #2b7abc); --cj-radius: 10px; --cj-radius-sm: 6px; --cj-ease: .15s ease;
      padding: 0 0 48px; color: var(--cj-text); }
    #${ID} h1 { margin: 0; font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
    #${ID} h2 { margin: 0 0 10px; font-size: 1.0625rem; font-weight: 700; }
    .${ID}-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 8px 16px; margin: 0 0 24px; }
    .${ID}-date { margin: 2px 0 0; color: var(--cj-muted); }
    .${ID}-stats { display: flex; flex-wrap: wrap; gap: 8px; }
    .${ID}-stat { appearance: none; display: inline-flex; align-items: baseline; gap: 5px; margin: 0; padding: 4px 12px; border: 1px solid var(--cj-border); border-radius: 999px;
      background: #fff; color: inherit; font: inherit; font-size: .875rem; line-height: 1.4; cursor: pointer; transition: border-color var(--cj-ease), background-color var(--cj-ease); }
    .${ID}-stat:hover { border-color: var(--cj-faint); background: #f7f8f9; }
    .${ID}-stat strong { font-weight: 700; font-variant-numeric: tabular-nums; }
    .${ID}-stat.is-late { border-color: var(--cj-red); color: var(--cj-red); }
    .${ID}-stat.is-new { border-color: var(--cj-focus); }
    .${ID}-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem); gap: 32px; align-items: start; }
    @media (max-width: 60rem) { .${ID}-cols { grid-template-columns: minmax(0, 1fr); } }
    .${ID}-section + .${ID}-section { margin-top: 28px; }
    .${ID}-courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
    .${ID}-course { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 12px 14px 6px; border: 1px solid var(--cj-border);
      border-radius: var(--cj-radius); background: #fff; transition: border-color var(--cj-ease), box-shadow var(--cj-ease); }
    .${ID}-course:hover, .${ID}-course:has(:focus-visible) { border-color: var(--cj-faint); box-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 4px 14px rgba(0, 0, 0, .06); }
    .${ID}-course h3 { margin: 0 56px 0 0; font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
    .${ID}-course a { text-decoration: none; }
    .${ID}-course a:hover { text-decoration: underline; }
    .${ID}-course h3 a { color: inherit; }
    .${ID}-name { margin: 0 0 4px; font-size: .75rem; color: var(--cj-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${ID}-row { display: flex; justify-content: space-between; gap: 8px; font-size: .875rem; min-width: 0; }
    .${ID}-row a, .${ID}-ell { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${ID}-when { flex: none; white-space: nowrap; }
    .${ID}-dim { color: var(--cj-muted); }
    .${ID}-red { color: var(--cj-red); font-weight: 700; }
    /* The card's own controls, top right: shown on hover or focus, always on touch screens. */
    .${ID}-hide, .${ID}-grip { position: absolute; top: 8px; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
      margin: 0; padding: 0; border: 0; border-radius: var(--cj-radius-sm); background: none; color: var(--cj-faint); cursor: pointer;
      opacity: 0; transition: opacity var(--cj-ease), background-color var(--cj-ease), color var(--cj-ease); }
    .${ID}-hide { right: 8px; }
    .${ID}-grip { right: 34px; cursor: grab; }
    .${ID}-hide svg, .${ID}-grip svg { width: 16px; height: 16px; }
    .${ID}-course:hover .${ID}-hide, .${ID}-course:hover .${ID}-grip,
    .${ID}-course:has(:focus-visible) .${ID}-hide, .${ID}-course:has(:focus-visible) .${ID}-grip { opacity: 1; }
    @media (hover: none) { .${ID}-hide, .${ID}-grip { opacity: 1; } }
    .${ID}-hide:hover, .${ID}-grip:hover { background: var(--cj-hover); color: var(--cj-text); }
    .${ID}-grip:active { cursor: grabbing; }
    /* While a card is moved: a dashed gap where it was, and a tilted copy under the pointer. */
    .${ID}-course.is-dragging { border-style: dashed; box-shadow: none; }
    .${ID}-course.is-dragging > * { opacity: .3; }
    .${ID}-ghost { position: fixed; top: 0; left: -10000px; padding: 16px; pointer-events: none; }
    .${ID}-ghost > .${ID}-course { transform: rotate(3deg); box-shadow: 0 10px 28px rgba(0, 0, 0, .18); }
    .${ID}-course.is-before { box-shadow: -4px 0 0 -1px var(--cj-focus); }
    .${ID}-course.is-after { box-shadow: 4px 0 0 -1px var(--cj-focus); }
    #${ID} button:focus-visible, .${ID}-links a:focus-visible { outline: 2px solid var(--cj-focus); outline-offset: 1px; }
    .${ID}-stat:focus-visible { outline-offset: 2px; }
    /* A footer across the whole card, so the icons line up across cards of different heights. */
    .${ID}-links { display: flex; align-items: center; gap: 2px; margin: auto -14px 0; padding: 4px 14px 0 5px; border-top: 1px solid var(--cj-line); list-style: none; }
    .${ID}-links a { position: relative; display: inline-flex; padding: 5px 9px; border-radius: var(--cj-radius-sm); color: var(--cj-muted); font-size: 1.1875rem; line-height: 1;
      text-decoration: none; transition: background-color var(--cj-ease), color var(--cj-ease); }
    .${ID}-links a:hover { color: var(--cj-focus); background: var(--cj-hover); text-decoration: none; }
    .${ID}-links i::before { margin: 0; }
    .${ID}-scoreItem { display: flex; align-items: center; margin-left: auto; }
    .${ID}-score { font-size: .8125rem; color: var(--cj-muted); font-variant-numeric: tabular-nums; cursor: help; }
    .${ID}-badge { position: absolute; top: -3px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px;
      background: var(--cj-focus); color: var(--cj-accent-fg, #fff); font-size: .6875rem; font-weight: 700; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px #fff; }
    /* The card's deadlines: a count that folds the list open and shut. */
    .${ID}-due { appearance: none; display: flex; align-items: center; gap: 6px; width: 100%; margin: 0; padding: 2px 0; border: 0; border-radius: 4px; background: none;
      color: inherit; font: inherit; font-size: .875rem; text-align: left; cursor: pointer; }
    .${ID}-due svg { flex: none; width: 12px; height: 12px; color: var(--cj-muted); transition: transform var(--cj-ease); }
    .${ID}-due[aria-expanded="true"] svg { transform: rotate(90deg); }
    .${ID}-due strong { font-weight: 700; }
    .${ID}-due .${ID}-when { margin-left: auto; }
    .${ID}-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .2s ease; }
    .is-open > .${ID}-fold { grid-template-rows: 1fr; }
    .${ID}-fold > div { min-height: 0; overflow: hidden; }
    .${ID}-course .${ID}-tasks { padding: 4px 0 4px 18px; }
    /* Over the whole card, so asking does not make it taller. */
    .${ID}-ask { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; justify-content: center; gap: 4px;
      padding: 12px 14px; border-radius: var(--cj-radius); background: rgba(255, 255, 255, .97); font-size: .875rem; animation: ${ID}-in .15s ease both; }
    .${ID}-ask p { margin: 0; }
    .${ID}-ask strong { font-weight: 700; }
    .${ID}-ask div { display: flex; gap: 8px; margin-top: 6px; }
    .${ID}-ask button { appearance: none; margin: 0; padding: 3px 12px; border: 1px solid var(--cj-border); border-radius: var(--cj-radius-sm); background: #fff;
      color: inherit; font: inherit; cursor: pointer; }
    .${ID}-ask button:first-child { border-color: var(--cj-red); background: var(--cj-red); color: #fff; }
    .${ID}-more { appearance: none; margin: 12px 0 0; padding: 0; border: 0; background: none; color: var(--cj-muted); font: inherit; font-size: .875rem; cursor: pointer; }
    .${ID}-more:hover { color: var(--cj-text); text-decoration: underline; }
    .${ID}-hidden { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
    .${ID}-hidden button { appearance: none; margin: 0; padding: 3px 10px; border: 1px dashed var(--cj-border); border-radius: 999px; background: none;
      color: inherit; font: inherit; font-size: .8125rem; cursor: pointer; }
    .${ID}-hidden button:hover { border-style: solid; }
    .${ID}-tasks { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .${ID}-tasks li { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 6px; font-size: .875rem; }
    .${ID}-tasks a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .${ID}-check { display: inline-flex; width: 14px; height: 14px; box-sizing: border-box; border: 1.5px solid var(--cj-faint); border-radius: 50%; }
    .${ID}-check svg { width: 100%; height: 100%; }
    .is-done > .${ID}-check, .is-done > a > .${ID}-check { border-color: #0b874b; background: #0b874b; color: #fff; }
    .${ID}-tasks .is-done a, .${ID}-list .is-done > a { color: var(--cj-muted); }
    .${ID}-list li.is-done > a { display: inline-flex; align-items: center; gap: 6px; }
    /* Days in Upcoming: quiet, except today and tomorrow. */
    .${ID}-day { margin: 14px 0 2px; font-size: .8125rem; font-weight: 700; color: var(--cj-muted); }
    .${ID}-day:first-of-type { margin-top: 0; }
    .${ID}-day.is-soon { color: var(--cj-focus); }
    .${ID}-list { list-style: none; margin: 0; padding: 0; }
    .${ID}-list li { display: grid; gap: 2px; padding: 7px 0; border-bottom: 1px solid var(--cj-line); }
    .${ID}-list li:last-child { border-bottom: 0; }
    .${ID}-list a { overflow-wrap: anywhere; }
    .${ID}-meta { font-size: .8125rem; color: var(--cj-muted); }
    .${ID}-note { margin: 0; color: var(--cj-muted); }
    .${ID}-event { grid-template-columns: 7.5rem minmax(0, 1fr); column-gap: 12px; }
    .${ID}-event time { font-variant-numeric: tabular-nums; font-weight: 700; }
    .${ID}-now { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: var(--cj-focus); color: var(--cj-accent-fg, #fff); font-size: .75rem; font-weight: 700; }
    /* Placeholders while loading, shaped like what comes, so nothing jumps when it does. */
    .${ID}-bone { display: block; height: .75rem; border-radius: 4px; background: var(--cj-line); animation: ${ID}-pulse 1.4s ease-in-out infinite; }
    .${ID}-skel { pointer-events: none; }
    .${ID}-skel h3 { margin: 0; }
    .${ID}-skel .${ID}-bone + .${ID}-bone { margin-top: 8px; }
    .${ID}-skel .${ID}-links { height: 29px; }
    .${ID}-courses.is-intro > li { animation: ${ID}-in .25s ease both; animation-delay: calc(var(--i, 0) * 30ms); }
    @keyframes ${ID}-pulse { 50% { opacity: .5; } }
    @keyframes ${ID}-in { from { opacity: 0; transform: translateY(4px); } }
    @media (prefers-reduced-motion: reduce) {
      #${ID} *, #${ID} *::before { transition: none !important; animation: none !important; }
    }
  `;

  globalThis.CJ.homeStyle = { STYLE, ICON, CHECK, CHEVRON, GRIP, CLOSE };
})();
