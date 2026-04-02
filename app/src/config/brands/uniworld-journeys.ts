/**
 * Uniworld Journeys brand configuration.
 *
 * This file is the Phase 1 stand-in for what will eventually be a Firestore
 * document at brands/uniworld-journeys. Its shape exactly matches BrandTheme
 * so that BrandContext can swap to a Firestore fetch in Phase 2 without any
 * structural changes — only the data source changes.
 *
 * Palette: King & Partners Brand Identity R6, March 2026.
 * Warm neutrals — Charcoal anchor, Taupe mid-tone, Plaster background.
 * Gold accent used with relaxed rule: tab indicators, star ratings, and
 * badges in addition to the logo/badge mark.
 *
 * Extended palette reference (for future Settings colour-picker defaults):
 *   Dark Charcoal   #1E1C1C   Charcoal 95  #433F3F
 *   Charcoal 90     #494545   Charcoal 85  #514D4D
 *   Dark Taupe      #5A5246   Taupe 95     #766B5C
 *   Dark Willow     #8B7C69   Willow       #9F907C
 *   Willow 95       #A5967E   Willow 90    #AC9E88
 *   Dark Parchment  #BFB9AE   Parchment    #D6D0C5
 *   Parchment 95    #DED7CB   Plaster 95   #F3F1EC
 *   Plaster 90      #F7F5F2   Plaster 85   #FBFBF9
 *   White           #FFFFFF
 *
 * WCAG AA notes (per K&P compliance chart):
 *   - Charcoal family passes AA against all Plaster shades and White ✓
 *   - Taupe / Dark Taupe passes AA against Plaster shades and White ✓
 *   - Willow shades do NOT pass AA on light backgrounds — decorative use only
 *   - Gold does NOT pass AA for text — icons, indicators, badges only
 */

import type { BrandTheme } from "@/lib/theme/tokens";

const uniworldJourneysConfig: BrandTheme = {
  id: "uniworld-journeys",
  name: "Uniworld Journeys",
  appTitle: "Feefo Reviews",
  tokens: {
    primary: "#373535",    // Charcoal
    primaryDark: "#1E1C1C", // Dark Charcoal
    accent: "#C2AB82",     // Gold — dark end of gradient
    accentLight: "#E7D39C", // Gold — light end of gradient
    neutral: "#655E51",    // Taupe
    surfaceWarm: "#F1EEEA", // Plaster
  },
  merchants: [
    {
      id: "uniworld",
      label: "Uniworld",
      showShips: true,
    },
    {
      id: "luxury-gold",
      label: "Luxury Gold",
      showShips: false,
    },
  ],
};

export default uniworldJourneysConfig;
