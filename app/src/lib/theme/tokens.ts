/**
 * Brand theme token system — type definitions and default fallback only.
 *
 * This file intentionally contains NO brand-specific configuration.
 * Brand configs (Uniworld Journeys, etc.) live in src/config/brands/ and
 * are loaded by BrandContext. In Phase 2 they will be fetched from Firestore
 * instead — BrandContext is the only consumer that changes.
 *
 * Each brand/tenant exposes 6 minimal tokens. All other CSS variables
 * (surfaces, borders, text colours, dark-mode variants, etc.) are
 * derived programmatically in derive.ts.
 */

export interface BrandTokens {
  /** Header background, active states, primary actions */
  primary: string;
  /** Deepest tone — dark-mode page background, strong emphasis */
  primaryDark: string;
  /** Tab indicators, star ratings, badges */
  accent: string;
  /** Accent hover / glow states */
  accentLight: string;
  /** Mid-tone — secondary text, borders, muted UI */
  neutral: string;
  /** Warm tint for page backgrounds and card surfaces (light mode) */
  surfaceWarm: string;
}

export interface BrandMerchant {
  /** Feefo merchant ID (used as the data-filter key) */
  id: string;
  /** Display label shown in the merchant switcher */
  label: string;
  /**
   * Whether to show the Ships nav tab when this merchant is active.
   * When activeMerchant is "all", ships are shown if ANY merchant
   * has showShips: true.
   */
  showShips?: boolean;
}

export interface BrandTheme {
  id: string;
  name: string;
  tokens: BrandTokens;
  /** URL to logo image (Phase 2: uploaded via Settings page) */
  logo?: string;
  /** Accessible alt text for the logo */
  logoAlt?: string;
  /** Text shown in the header when no logo is set */
  appTitle: string;
  /** One or more Feefo merchant IDs belonging to this brand */
  merchants: BrandMerchant[];
}

// ---------------------------------------------------------------------------
// Default / vanilla fallback theme
// Used when no brand config is available (e.g. new tenant before Phase 2).
// ---------------------------------------------------------------------------

export const defaultTheme: BrandTheme = {
  id: "default",
  name: "Default",
  tokens: {
    primary: "#1e293b", // Slate 800
    primaryDark: "#0f172a", // Slate 900
    accent: "#3b82f6", // Blue 500
    accentLight: "#60a5fa", // Blue 400
    neutral: "#64748b", // Slate 500
    surfaceWarm: "#f8fafc", // Slate 50
  },
  appTitle: "Feefo Reviews",
  merchants: [],
};
