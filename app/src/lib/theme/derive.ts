/**
 * Theme derivation engine.
 *
 * Takes the 6 minimal brand tokens and produces a complete map of
 * CSS custom property names → values for both light and dark modes.
 * All colour mixing is done in JS so the output is plain hex/rgba strings
 * that can be injected directly onto :root via inject.ts.
 */

import type { BrandTokens } from "./tokens";

// ---------------------------------------------------------------------------
// Colour utilities
// ---------------------------------------------------------------------------

/** Parse a 3- or 6-digit hex string to [r, g, b] (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Convert [r, g, b] (0–255) back to a lowercase hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Equivalent to CSS `color-mix(in srgb, colorA pct%, colorB)`.
 * pct is how much of colorA to use (0–100); the remainder is colorB.
 */
function mix(colorA: string, pct: number, colorB: string): string {
  const [ar, ag, ab] = hexToRgb(colorA);
  const [br, bg, bb] = hexToRgb(colorB);
  const t = pct / 100;
  return rgbToHex(
    ar * t + br * (1 - t),
    ag * t + bg * (1 - t),
    ab * t + bb * (1 - t),
  );
}

/**
 * Return an rgba() string for a hex colour at the given opacity (0–1).
 * Used for semi-transparent hover/border tokens.
 */
function alpha(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CssVarMap = Record<string, string>;

/**
 * Derive the full set of CSS custom properties from 6 brand tokens.
 *
 * The returned map uses CSS variable names as keys (e.g. `--background`)
 * and resolved colour strings as values.  Pass `isDark: true` to get the
 * dark-mode variant of every token.
 */
export function deriveTokens(tokens: BrandTokens, isDark: boolean): CssVarMap {
  const { primary, primaryDark, accent, accentLight, neutral, surfaceWarm } =
    tokens;

  if (isDark) {
    return {
      // --- Structural ---
      "--background": primaryDark,
      "--foreground": surfaceWarm,
      "--surface": mix(primaryDark, 92, surfaceWarm),
      "--surface-hover": mix(primaryDark, 85, surfaceWarm),
      "--surface-alt": mix(primaryDark, 95, surfaceWarm),

      // --- Borders ---
      "--border": mix(primaryDark, 75, neutral),
      "--border-light": mix(primaryDark, 85, neutral),

      // --- Text ---
      "--text-primary": surfaceWarm,
      "--text-secondary": mix(neutral, 40, surfaceWarm),
      "--text-tertiary": neutral,

      // --- Header / Nav ---
      "--header-bg": primaryDark,
      "--header-text": surfaceWarm,
      "--nav-active-text": surfaceWarm,
      "--nav-active-indicator": accent,
      "--nav-inactive-text": mix(surfaceWarm, 60, primaryDark),

      // --- Brand accent ---
      "--brand-accent": accentLight, // lighter on dark backgrounds
      "--brand-accent-light": accentLight,
      "--brand-accent-hover": alpha(accentLight, 0.1),
      "--accent-foreground": primaryDark, // dark text on accent backgrounds
      "--brand-primary-hover": alpha(accentLight, 0.08),
      "--brand-primary-light": alpha(accentLight, 0.15),

      // --- Inputs ---
      "--input-bg": mix(primaryDark, 92, surfaceWarm),
      "--input-border": mix(primaryDark, 65, neutral),

      // --- Badges ---
      "--badge-gray-bg": mix(primaryDark, 80, neutral),
      "--badge-gray-text": mix(neutral, 40, surfaceWarm),

      // --- Spinner ---
      "--spinner-track": mix(primaryDark, 80, neutral),
      "--spinner-accent": accentLight,

      // --- Nav bg (used in some components) ---
      "--nav-bg": mix(primaryDark, 95, surfaceWarm),
      "--nav-border": mix(primaryDark, 75, neutral),

      // --- Shadows (darker for depth on dark bg) ---
      "--shadow-sm": "0 1px 2px 0 rgb(0 0 0 / 0.3)",
      "--shadow":
        "0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.3)",
    };
  }

  return {
    // --- Structural ---
    "--background": surfaceWarm,
    "--foreground": primary,
    "--surface": "#ffffff",
    "--surface-hover": mix(surfaceWarm, 60, "#ffffff"),
    "--surface-alt": mix(surfaceWarm, 80, "#ffffff"),

    // --- Borders ---
    "--border": alpha(neutral, 0.2),
    "--border-light": alpha(neutral, 0.1),

    // --- Text ---
    "--text-primary": primaryDark,
    "--text-secondary": neutral,
    "--text-tertiary": mix(neutral, 60, surfaceWarm),

    // --- Header / Nav ---
    // The header background is always the dark primary colour, even in light
    // mode. nav-inactive-text must therefore be a light tone — using neutral
    // (Taupe) here gives ~1.9:1 contrast against Charcoal, which fails WCAG AA.
    // mix(surfaceWarm, 60%, primary) ≈ #a7a4a2 → ~5.1:1 on the Charcoal header.
    "--header-bg": primary,
    "--header-text": "#ffffff",
    "--nav-active-text": primary,
    "--nav-active-indicator": accent,
    "--nav-inactive-text": mix(surfaceWarm, 60, primary),

    // --- Brand accent ---
    "--brand-accent": accent,
    "--brand-accent-light": accentLight,
    "--brand-accent-hover": alpha(accent, 0.1),
    "--accent-foreground": primaryDark, // dark text on accent backgrounds
    "--brand-primary-hover": alpha(primary, 0.05),
    "--brand-primary-light": alpha(primary, 0.1),

    // --- Inputs ---
    "--input-bg": "#ffffff",
    "--input-border": mix(neutral, 30, surfaceWarm),

    // --- Badges ---
    "--badge-gray-bg": mix(surfaceWarm, 70, neutral),
    "--badge-gray-text": neutral,

    // --- Spinner ---
    "--spinner-track": mix(surfaceWarm, 40, neutral),
    "--spinner-accent": accent,

    // --- Nav bg (used in some components) ---
    "--nav-bg": "#ffffff",
    "--nav-border": alpha(neutral, 0.2),

    // --- Shadows ---
    "--shadow-sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "--shadow":
      "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  };
}
