/**
 * Phase 1 brand config loader.
 *
 * This is the single import point for BrandContext. In Phase 2, replace
 * the static import below with a Firestore fetch keyed on the authenticated
 * user's brand ID — the BrandContext interface stays identical.
 *
 * To add a new brand in Phase 1:
 *   1. Create src/config/brands/<brand-id>.ts (copy uniworld-journeys.ts)
 *   2. Import it here and add to the BRAND_CONFIGS map
 *   3. Update ACTIVE_BRAND_ID to point to the new brand
 */

import type { BrandTheme } from "@/lib/theme/tokens";
import { defaultTheme } from "@/lib/theme/tokens";
import uniworldJourneysConfig from "./uniworld-journeys";

const BRAND_CONFIGS: Record<string, BrandTheme> = {
  "uniworld-journeys": uniworldJourneysConfig,
};

/**
 * The brand ID to load in Phase 1.
 * In Phase 2 this is determined by the authenticated user's Firestore record.
 */
const ACTIVE_BRAND_ID = "uniworld-journeys";

/**
 * Returns the active brand config for Phase 1.
 * Falls back to the vanilla default if the brand ID is not found.
 */
export function getActiveBrandConfig(): BrandTheme {
  return BRAND_CONFIGS[ACTIVE_BRAND_ID] ?? defaultTheme;
}
