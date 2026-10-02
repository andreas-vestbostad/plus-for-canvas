// Settings page start-up: text, sections, and live updates.
"use strict";

async function clearKeys(test) {
  const all = await chrome.storage.local.get(null);
  const drop = Object.keys(all).filter(test);
  if (drop.length) await chrome.storage.local.remove(drop);
}
/** Clear matching cache keys and report the outcome next to the buttons. */
async function clearAndReport(test) {
  try {
    await clearKeys(test);
    flash($("#dataMsg"), t("opt_cleared"));
  } catch (e) {
    console.warn("Plus could not clear data:", e);
    flash($("#dataMsg"), t("opt_saveError"), true);
  }
}
$("#clearCache").addEventListener("click", async () => {
  await clearAndReport((k) => k.startsWith("cj:") && !k.endsWith(":freq") && !k.endsWith(":dlArchive"));
  renderAliases();
});
$("#clearHistory").addEventListener("click", () => clearAndReport((k) => k.startsWith("cj:") && k.endsWith(":freq")));

document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = t("opt_title");
for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = t(n.dataset.i18n);
$("#version").textContent = t("opt_version", [chrome.runtime.getManifest().version]);

const report = (what) => (e) => console.warn(`Plus could not show ${what}:`, e);

// The page takes the chosen colour theme too, in the light or dark variant the system asks for.
const themeStyle = document.head.appendChild(document.createElement("style"));
let themeSettings = {};
function applyTheme() {
  const { pick, vars } = CJ.themes;
  const name = pick(CJ.registry.enabled(themeSettings.modules).theme, themeSettings.theme);
  // options.css calls its accent --accent; the rest of the Plus variables are unused here.
  const accent = (scheme) => vars(name, scheme, themeSettings.themeColor).replace("--cj-accent:", "--accent:");
  themeStyle.textContent = name === "canvas" ? ""
    : `:root { ${accent("light")} }\n@media (prefers-color-scheme: dark) { :root { ${accent("dark")} } }`;
}
const THEME_KEYS = ["modules", "theme", "themeColor"];
chrome.storage.sync.get(THEME_KEYS).then((s) => {
  themeSettings = s;
  applyTheme();
}, report("the colour theme"));
renderFeatures().catch(report("features"));
renderSites().catch(report("Canvas sites"));
renderHow().catch(report("palette help"));
renderAliases().catch(report("course aliases"));

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "sync") updateFeatures(ch);
  if (area === "sync" && THEME_KEYS.some((k) => ch[k])) {
    for (const k of THEME_KEYS) if (ch[k]) themeSettings = Object.assign({}, themeSettings, { [k]: ch[k].newValue });
    applyTheme();
  }
  if (area === "sync" && (ch.domains || ch.disabledHosts)) renderSites().catch(report("Canvas sites"));
  if (area === "local" && Object.keys(ch).some((k) => k.endsWith(":courses"))) renderAliases().catch(report("course aliases"));
});
