/**
 * Runtime CSS variable injection.
 *
 * Calls deriveTokens() with the current brand tokens + dark-mode flag,
 * then writes every resulting variable onto document.documentElement.
 *
 * This runs:
 *  1. On initial mount (from BrandContext / ThemeContext)
 *  2. When the user toggles dark / light mode
 *
 * For pre-hydration flash prevention, theme-init.js applies the
 * brand tokens from localStorage before React mounts (Phase 1: uses
 * the hardcoded Uniworld Journeys defaults baked into that file).
 */

import { deriveTokens } from "./derive";
import type { BrandTokens } from "./tokens";

/**
 * Apply the full set of derived CSS variables for the given brand tokens
 * and colour scheme to the document root.
 *
 * Safe to call during SSR — exits early when `window` is unavailable.
 */
export function injectThemeTokens(
  tokens: BrandTokens,
  isDark: boolean,
): void {
  if (typeof window === "undefined") return;

  const vars = deriveTokens(tokens, isDark);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
