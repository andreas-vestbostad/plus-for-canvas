// Canvas sites: the built-in ones and those the user added, with a field to add more.
"use strict";

function cleanDomain(v) {
  v = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Dot separated labels that neither start nor end with "-", then a TLD. No empty labels ("a..com").
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d+)?$/.test(v) ? v : null;
}

/** Ask the service worker to (un)register content scripts; throws if it reports a failure. */
async function syncDomains() {
  const res = await chrome.runtime.sendMessage({ type: "cj:syncDomains" });
  if (!res || !res.ok) throw new Error((res && res.error) || "syncDomains failed");
}

async function removeDomain(d) {
  try {
    const { domains: cur = [] } = await chrome.storage.sync.get("domains");
    await chrome.storage.sync.set({ domains: cur.filter((x) => x !== d) });
    // Losing the permission is best effort; the content script is unregistered either way.
    await chrome.permissions.remove({ origins: [`https://${d}/*`] })
      .catch((e) => console.warn("Plus could not drop permission:", e));
    await syncDomains();
  } catch (e) {
    console.warn("Plus could not remove domain:", e);
    flash($("#domainMsg"), t("opt_saveError"), true);
  }
  renderSites();
}

/** Remove a built-in site, or add it back. Its scripts stay in the extension but stop running there. */
async function setBuiltIn(host, on) {
  try {
    const { disabledHosts: cur = [] } = await chrome.storage.sync.get("disabledHosts");
    const next = on ? cur.filter((h) => h !== host) : [...new Set([...cur, host])];
    await chrome.storage.sync.set({ disabledHosts: next });
  } catch (e) {
    console.warn("Plus could not change a built-in site:", e);
    flash($("#domainMsg"), t("opt_saveError"), true);
  }
  renderSites();
}

function builtInRow(host, removed) {
  const btn = el("button", { type: "button", textContent: t(removed ? "opt_addBack" : "opt_remove") });
  btn.setAttribute("aria-label", `${t(removed ? "opt_addBack" : "opt_remove")} ${host}`);
  btn.addEventListener("click", () => setBuiltIn(host, removed));
  return el("li", { className: removed ? "removed" : "" },
    el("div", {}, el("code", { textContent: host }),
      el("span", { className: "tag", textContent: t(removed ? "opt_removed" : "opt_builtIn") })),
    btn);
}

async function siteRow(d) {
  const granted = await chrome.permissions.contains({ origins: [`https://${d}/*`] }).catch(() => false);
  const btn = el("button", { type: "button", textContent: t("opt_remove") });
  btn.setAttribute("aria-label", `${t("opt_remove")} ${d}`);
  btn.addEventListener("click", () => removeDomain(d));
  return el("li", {},
    el("div", {}, el("code", { textContent: d }),
      granted ? null : el("span", { className: "warn", textContent: t("opt_permMissing") })),
    btn);
}

async function renderSites() {
  $("#domain").placeholder = t("opt_domainPlaceholder");
  const { domains = [], disabledHosts = [] } = await chrome.storage.sync.get(["domains", "disabledHosts"]);
  const builtIn = CJ.registry.BUILT_IN_HOSTS.map((h) => builtInRow(h, disabledHosts.includes(h)));
  const custom = await Promise.all(domains.map(siteRow));
  $("#sites").replaceChildren(...builtIn, ...custom);
}

$("#addDomain").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#domainMsg");
  const d = cleanDomain($("#domain").value);
  if (!d) return flash(msg, t("opt_domainInvalid"), true);
  // A built-in site needs no permission; typing it just adds it back.
  const builtIn = CJ.registry.BUILT_IN_HOSTS.find((h) => CJ.registry.hostMatches(h, d));
  if (builtIn) {
    await setBuiltIn(builtIn, true);
    $("#domain").value = "";
    return flash(msg, t("opt_domainAdded"));
  }
  try {
    // Must be called straight from the user gesture.
    const ok = await chrome.permissions.request({ origins: [`https://${d}/*`] });
    if (!ok) return flash(msg, t("opt_domainDenied"), true);
    const { domains = [] } = await chrome.storage.sync.get("domains");
    if (!domains.includes(d)) await chrome.storage.sync.set({ domains: [...domains, d] });
    await syncDomains();
    $("#domain").value = "";
    flash(msg, t("opt_domainAdded"));
  } catch (e) {
    console.warn("Plus could not add domain:", e);
    flash(msg, t("opt_saveError"), true);
  }
  renderSites();
});
