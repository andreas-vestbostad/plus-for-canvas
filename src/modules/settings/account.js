// "Plus" right under "Settings" in Canvas' Account tray, opening the extension's options
// page. Canvas draws the Account tray with React when it opens, so we watch for its Settings
// link and add ours next to it.
// If Canvas changes that markup we simply add nothing.
(function () {
  "use strict";
  const CJ = globalThis.CJ;

  const ID = "cj-account-link";
  const SETTINGS_LINK = 'a[href="/profile/settings"], a[href$="//' + location.host + '/profile/settings"]';
  const ACCOUNT_BUTTON = "global_nav_profile_link";

  /** Watch the Account tray. Returns a stop function. */
  function start({ t, el }) {
    // Canvas renders its nav trays into this portal. Without it we add nothing, rather than
    // watching every change on the page.
    const scope = document.getElementById("nav-tray-portal");
    if (!scope) return () => {};

    function add() {
      for (const link of scope.querySelectorAll(SETTINGS_LINK)) {
        const li = link.closest("li");
        if (!li || !li.parentNode || li.closest("[id^='cj-']")) continue;
        if (li.nextElementSibling && li.nextElementSibling.classList.contains(ID)) continue;
        const ours = el("a", { href: "#", className: link.className, textContent: t("acct_cjSettings") });
        ours.addEventListener("click", (e) => {
          e.preventDefault();
          // Clicking Account again closes its tray, the way Canvas does it.
          const account = document.getElementById(ACCOUNT_BUTTON);
          if (account) account.click();
          chrome.runtime.sendMessage({ type: "cj:openOptions" }).catch(() => {});
        });
        li.after(el("li", { className: `${li.className} ${ID}` }, ours));
      }
    }

    const observer = new MutationObserver(add);
    observer.observe(scope, { childList: true, subtree: true });
    add();
    return () => {
      observer.disconnect();
      document.querySelectorAll(`.${ID}`).forEach((n) => n.remove());
    };
  }

  CJ.accountLink = { start };
})();
