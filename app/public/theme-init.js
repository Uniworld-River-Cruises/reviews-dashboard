/**
 * theme-init.js — runs beforeInteractive to prevent flash of unstyled content.
 *
 * Responsibilities:
 *  1. Read the user's saved theme preference (or system preference).
 *  2. Apply the correct CSS custom property set for the active brand + mode
 *     BEFORE React mounts, so there is no visual flash.
 *  3. Set the .dark class and color-scheme so Tailwind dark: variants fire
 *     correctly on first paint.
 *
 * Phase 1: token values are baked in for Uniworld Journeys (the only tenant).
 * Phase 2: replace the hardcoded LIGHT/DARK maps with a small async fetch
 *   from /api/brand-tokens?brand=<brandId> and re-run applyVars() on resolve.
 *
 * ⚠️  This file cannot import ES modules. All logic must be plain ES5-compatible JS.
 */
(function () {
  // ---------------------------------------------------------------------------
  // Uniworld Journeys — derived CSS variable sets (computed from 6 brand tokens)
  //
  // Tokens:
  //   primary:     #373535   primaryDark: #1e1c1c
  //   accent:      #c2ab82   accentLight: #e7d39c
  //   neutral:     #655e51   surfaceWarm: #f1eeea
  // ---------------------------------------------------------------------------

  var LIGHT = {
    "--background":           "#f1eeea",
    "--foreground":           "#373535",
    "--surface":              "#ffffff",
    "--surface-hover":        "#f7f5f2",
    "--surface-alt":          "#f4f1ee",
    "--border":               "rgba(101,94,81,0.2)",
    "--border-light":         "rgba(101,94,81,0.1)",
    "--text-primary":         "#1e1c1c",
    "--text-secondary":       "#655e51",
    "--text-tertiary":        "#9d988e",
    "--header-bg":            "#373535",
    "--header-text":          "#ffffff",
    "--nav-active-text":      "#373535",
    "--nav-active-indicator": "#c2ab82",
    "--nav-inactive-text":    "#a7a4a2",
    "--brand-accent":         "#c2ab82",
    "--brand-accent-light":   "#e7d39c",
    "--brand-accent-hover":   "rgba(194,171,130,0.1)",
    "--brand-primary-hover":  "rgba(55,53,53,0.05)",
    "--brand-primary-light":  "rgba(55,53,53,0.1)",
    "--input-bg":             "#ffffff",
    "--input-border":         "#c7c3bc",
    "--badge-gray-bg":        "#c7c3bc",
    "--badge-gray-text":      "#655e51",
    "--spinner-track":        "#9d988e",
    "--spinner-accent":       "#c2ab82",
    "--nav-bg":               "#ffffff",
    "--nav-border":           "rgba(101,94,81,0.2)",
    "--shadow-sm":            "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "--shadow":               "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
  };

  var DARK = {
    "--background":           "#1e1c1c",
    "--foreground":           "#f1eeea",
    "--surface":              "#2f2d2c",
    "--surface-hover":        "#3e3c3b",
    "--surface-alt":          "#292726",
    "--border":               "#302d29",
    "--border-light":         "#292624",
    "--text-primary":         "#f1eeea",
    "--text-secondary":       "#b9b4ad",
    "--text-tertiary":        "#655e51",
    "--header-bg":            "#1e1c1c",
    "--header-text":          "#f1eeea",
    "--nav-active-text":      "#f1eeea",
    "--nav-active-indicator": "#c2ab82",
    "--nav-inactive-text":    "#9d9a98",
    "--brand-accent":         "#e7d39c",
    "--brand-accent-light":   "#e7d39c",
    "--brand-accent-hover":   "rgba(231,211,156,0.1)",
    "--brand-primary-hover":  "rgba(231,211,156,0.08)",
    "--brand-primary-light":  "rgba(231,211,156,0.15)",
    "--input-bg":             "#2f2d2c",
    "--input-border":         "#37332f",
    "--badge-gray-bg":        "#2c2927",
    "--badge-gray-text":      "#b9b4ad",
    "--spinner-track":        "#2c2927",
    "--spinner-accent":       "#e7d39c",
    "--nav-bg":               "#292726",
    "--nav-border":           "#302d29",
    "--shadow-sm":            "0 1px 2px 0 rgb(0 0 0 / 0.3)",
    "--shadow":               "0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.3)"
  };

  function applyVars(vars) {
    var root = document.documentElement;
    var keys = Object.keys(vars);
    for (var i = 0; i < keys.length; i++) {
      root.style.setProperty(keys[i], vars[keys[i]]);
    }
  }

  try {
    var theme = localStorage.getItem("theme");
    var prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var shouldUseDark = theme === "dark" || (!theme && prefersDark);

    document.documentElement.classList.toggle("dark", shouldUseDark);
    document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";

    applyVars(shouldUseDark ? DARK : LIGHT);
  } catch (e) {
    // Ignore storage/matchMedia failures (e.g. SSR, restrictive CSP).
  }
})();
