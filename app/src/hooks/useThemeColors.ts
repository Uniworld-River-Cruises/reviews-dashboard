"use client";

/**
 * useThemeColors — reads brand CSS custom properties from :root and returns
 * them as plain strings that Recharts props can consume.
 *
 * Why this exists:
 *   Recharts components accept colour values as plain strings / style objects,
 *   not as CSS variable names.  Because the brand injects its palette via
 *   document.documentElement.style.setProperty() at runtime, we must read the
 *   resolved values from the computed style rather than hard-code them.
 *
 * This hook subscribes to mutations on the <html> element's style and class
 * attributes so it re-renders automatically whenever:
 *   - The brand changes (BrandProvider re-injects tokens)
 *   - Dark / light mode is toggled (ThemeContext adds/removes the .dark class)
 *
 * Usage:
 *   const { accent, tooltipStyle, axisTickFill } = useThemeColors();
 *   <Line stroke={accent} />
 *   <Tooltip contentStyle={tooltipStyle} />
 *   <XAxis tick={{ fill: axisTickFill }} />
 */

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Snapshot of all CSS variables we care about, serialised to a string. */
function buildSnapshot(): string {
  return [
    getCssVar("--header-bg"),
    getCssVar("--brand-accent"),
    getCssVar("--brand-accent-light"),
    getCssVar("--surface"),
    getCssVar("--border"),
    getCssVar("--text-primary"),
    getCssVar("--text-secondary"),
    getCssVar("--text-tertiary"),
  ].join("|");
}

const SERVER_SNAPSHOT = "|||||||| ";

/** Watch the <html> style and class attributes — both change on brand/theme injection. */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  return () => observer.disconnect();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ThemeColors {
  /** --header-bg: primary dark brand colour (e.g. charcoal for Uniworld). */
  primary: string;
  /** --brand-accent: e.g. warm gold for Uniworld. */
  accent: string;
  /** --brand-accent-light: lighter tint of accent. */
  accentLight: string;
  /** --surface: card / panel background. */
  surface: string;
  /** --border: default border colour. */
  border: string;
  /** --text-primary */
  textPrimary: string;
  /** --text-secondary */
  textSecondary: string;
  /** --text-tertiary */
  textTertiary: string;

  // ── Recharts convenience objects ──────────────────────────────────────────

  /** Pass directly to <Tooltip contentStyle={…}> */
  tooltipStyle: {
    backgroundColor: string;
    border: string;
    borderRadius: string;
    color: string;
    boxShadow: string;
  };

  /** Pass to <Tooltip labelStyle={…}> */
  tooltipLabelStyle: { color: string; fontWeight: number };

  /** Pass to <Tooltip itemStyle={…}> */
  tooltipItemStyle: { color: string };

  /** Fill for axis tick labels (XAxis / YAxis tick prop). */
  axisTickFill: string;

  /** Stroke for CartesianGrid lines. */
  gridStroke: string;
}

// Fallback values match the Uniworld Journeys light-mode palette so SSR
// and the first paint look correct even before the hook re-subscribes.
const FALLBACK: Omit<
  ThemeColors,
  "tooltipStyle" | "tooltipLabelStyle" | "tooltipItemStyle"
> = {
  primary:       "#373535",
  accent:        "#c2ab82",
  accentLight:   "#e7d39c",
  surface:       "#ffffff",
  border:        "rgba(101,94,81,0.2)",
  textPrimary:   "#1e1c1c",
  textSecondary: "#655e51",
  textTertiary:  "#9d988e",
  axisTickFill:  "#9d988e",
  gridStroke:    "rgba(101,94,81,0.2)",
};

export function useThemeColors(): ThemeColors {
  // useSyncExternalStore is safe for SSR (returns serverSnapshot on server).
  const snapshot = useSyncExternalStore(subscribe, buildSnapshot, () => SERVER_SNAPSHOT);

  // Destructure by position (matches buildSnapshot order).
  const [
    primary,
    accent,
    accentLight,
    surface,
    border,
    textPrimary,
    textSecondary,
    textTertiary,
  ] = snapshot.split("|").map((v) => v.trim());

  const colors = {
    primary:       primary       || FALLBACK.primary,
    accent:        accent        || FALLBACK.accent,
    accentLight:   accentLight   || FALLBACK.accentLight,
    surface:       surface       || FALLBACK.surface,
    border:        border        || FALLBACK.border,
    textPrimary:   textPrimary   || FALLBACK.textPrimary,
    textSecondary: textSecondary || FALLBACK.textSecondary,
    textTertiary:  textTertiary  || FALLBACK.textTertiary,
  };

  return {
    ...colors,
    axisTickFill:  colors.textTertiary,
    gridStroke:    colors.border,
    tooltipStyle: {
      backgroundColor: colors.surface,
      border:          `1px solid ${colors.border}`,
      borderRadius:    "12px",
      color:           colors.textPrimary,
      boxShadow:       "0 12px 32px rgba(0,0,0,0.12)",
    },
    tooltipLabelStyle: {
      color:      colors.textPrimary,
      fontWeight: 600,
    },
    tooltipItemStyle: {
      color: colors.textSecondary,
    },
  };
}
