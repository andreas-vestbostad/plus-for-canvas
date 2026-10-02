// Catches mistakes only; no style rules.
"use strict";
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["src/vendor/**", "*.zip"] },
  js.configs.recommended,
  { rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
  {
    files: ["src/**/*.js", "options/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions, module: "readonly", importScripts: "readonly", require: "readonly", CJ: "readonly" },
    },
  },
  {
    // The settings page scripts share their top-level functions with each other.
    files: ["options/**/*.js"],
    languageOptions: {
      globals: Object.fromEntries(["t", "$", "isMac", "el", "svg", "flash", "fillWithTokens", "openShortcuts", "actionShortcut",
        "renderAliases", "renderFeatures", "renderSites", "renderHow", "updateFeatures"].map((g) => [g, "readonly"])),
    },
    rules: { "no-unused-vars": ["error", { vars: "local" }], "no-redeclare": "off" },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, chrome: "writable" } },
  },
];
