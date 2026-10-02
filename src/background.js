// Service worker: toolbar button / keyboard command, options page, and the content
// scripts for extra Canvas domains and for modules that need to load early.
"use strict";
importScripts("core/registry.js");
const { BUILT_IN_HOSTS, CORE_FILES, MODULES, planScripts, enabled } = globalThis.CJ.registry;

async function toggleIn(tab) {
  if (!tab || !tab.id || !/^https:/.test(tab.url || "https:")) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "cj:toggle" });
  } catch {
    // Not injected on this site yet. activeTab lets us inject once, on click.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CORE_FILES });
      await chrome.tabs.sendMessage(tab.id, { type: "cj:toggle" });
    } catch (e) {
      console.warn("Plus could not open on this page:", e);
    }
  }
}

chrome.action.onClicked.addListener(toggleIn);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg) return;
  if (msg.type === "cj:openOptions") {
    chrome.runtime.openOptionsPage();
  } else if (msg.type === "cj:syncDomains") {
    syncDomains().then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e) }));
    return true;
  }
});

// Several events can ask for a sync at once (removing a domain fires permissions.onRemoved
// and a message from the options page). Run them one after another so they never race.
let syncing = Promise.resolve();
function syncDomains(reset) {
  const job = () => registerScripts(reset);
  const run = syncing.then(job, job);
  syncing = run.catch(() => {});
  return run;
}

/**
 * Make the registered content scripts match the plan: core files on the custom domains the
 * user added (and granted), early assets of enabled modules on every domain. `reset` drops
 * everything first, so an update never keeps scripts that point at old file lists.
 */
async function registerScripts(reset) {
  const { modules, disabledHosts = [] } = await chrome.storage.sync.get(["modules", "disabledHosts"]);
  const custom = await grantedDomains();
  const wanted = new Map(planScripts({ custom, disabled: disabledHosts, enabled: enabled(modules) }).map((s) => [s.id, s]));
  const existing = (await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith("cj-"));
  const stale = existing.filter((s) => reset || !wanted.has(s.id)).map((s) => s.id);
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  const have = new Set(reset ? [] : existing.map((s) => s.id));
  const add = [...wanted.values()].filter((s) => !have.has(s.id)).map((s) => Object.assign({ persistAcrossSessions: true }, s));
  if (add.length) await chrome.scripting.registerContentScripts(add);
}

chrome.runtime.onInstalled.addListener((details) => {
  syncDomains(true).catch(console.warn);
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => syncDomains().catch(console.warn));
chrome.permissions.onRemoved.addListener(() => syncDomains().catch(console.warn));
/** Custom domains the user added and still has permission for. */
async function grantedDomains() {
  const { domains = [] } = await chrome.storage.sync.get("domains");
  const out = [];
  for (const d of domains) {
    if (await chrome.permissions.contains({ origins: [`https://${d}/*`] })) out.push(d);
  }
  return out;
}

/**
 * Registered scripts only reach pages loaded later, so put a module that was just turned
 * on (its early CSS and JS) into the Canvas tabs that are already open. Each module sets window.__cj_<id> once
 * loaded, and is skipped in frames that have it (it then reacts to the setting itself).
 */
async function injectIntoOpenTabs(ids) {
  const hosts = BUILT_IN_HOSTS.concat(await grantedDomains());
  const tabs = await chrome.tabs.query({ url: hosts.map((h) => `https://${h}/*`) });
  for (const m of MODULES.filter((x) => ids.includes(x.id) && x.inject && x.inject.js)) {
    for (const tab of tabs) {
      const target = { tabId: tab.id, allFrames: !!m.inject.allFrames };
      let probes = [];
      try {
        probes = await chrome.scripting.executeScript({ target, func: (flag) => !!window[flag], args: [`__cj_${m.id}`] });
      } catch (e) {
        console.warn(`Plus could not reach tab ${tab.id}:`, e);
      }
      // One frame at a time, so a frame that went away (or an embedded tool we cannot
      // reach) does not keep the rest of the tab from getting the module.
      for (const p of probes.filter((x) => x.result === false)) {
        const frame = { tabId: tab.id, frameIds: [p.frameId] };
        // The early CSS as well, or the page only looks right after a reload.
        if (m.inject.css) {
          await chrome.scripting.insertCSS({ target: frame, files: m.inject.css })
            .catch((e) => console.warn(`Plus could not add ${m.id} styles to frame ${p.frameId}:`, e));
        }
        await chrome.scripting.executeScript({ target: frame, files: m.inject.js })
          .catch((e) => console.warn(`Plus could not add ${m.id} to frame ${p.frameId}:`, e));
      }
    }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  // A built-in site removed or added back: its early scripts follow on the next page load.
  if (changes.disabledHosts && !changes.modules) syncDomains().catch(console.warn);
  if (!changes.modules) return;
  const before = enabled(changes.modules.oldValue);
  const after = enabled(changes.modules.newValue);
  const turnedOn = MODULES.map((m) => m.id).filter((id) => after[id] && !before[id]);
  syncDomains()
    .then(() => turnedOn.length && injectIntoOpenTabs(turnedOn))
    .catch(console.warn);
});
