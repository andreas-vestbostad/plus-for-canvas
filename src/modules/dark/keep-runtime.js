// Runs right before the vendored Dark Reader to undo two things it does that do not fit
// an extension content script. Both changes stay inside this extension's isolated world
// (content scripts get their own copies of these objects); the page is not touched.
(function () {
  "use strict";
  if (window.__cjDarkPrepared) return;
  window.__cjDarkPrepared = true;

  // 1. Dark Reader wraps chrome.runtime.sendMessage in a way that drops its return value.
  //    dark.js puts the real one back for everything but Dark Reader's own messages.
  window.__cjRealSendMessage = chrome.runtime.sendMessage;

  // 2. Dark Reader adds an inline <script> to speed up noticing new CSS rules. The
  //    extension's CSP blocks it, which shows up as an error on chrome://extensions.
  //    Skip it; Dark Reader then checks for new rules each frame instead.
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, ref) {
    if (node && node.nodeName === "SCRIPT" && node.classList && node.classList.contains("darkreader--proxy")) return node;
    return insertBefore.call(this, node, ref);
  };
})();
