"use client";

/**
 * BrandContext — brand config, merchant switching, and theme injection.
 *
 * Responsibilities:
 *  - Loads the active brand config (Phase 1: from src/config/brands/index.ts)
 *  - Manages which merchant is currently active (the data-scope filter)
 *  - Exposes a Firestore-compatible query ID for the active merchant
 *  - Drives theme token injection whenever brand or dark/light mode changes
 *
 * Phase 2 migration: replace getActiveBrandConfig() with a Firestore fetch
 * keyed on the authenticated user's brand ID. The rest of this file stays
 * identical — components never need to change.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getActiveBrandConfig } from "@/config/brands";
import { injectThemeTokens } from "@/lib/theme/inject";
import { defaultTheme, type BrandTheme } from "@/lib/theme/tokens";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useTheme } from "@/contexts/ThemeContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The merchant selector value.
 * "all"   → combined view (all merchants for this brand)
 * string  → a specific merchant ID from brand.merchants[n].id
 */
export type ActiveMerchant = "all" | string;

interface BrandContextValue {
  /** The full brand config for the current tenant. */
  brand: BrandTheme;
  /**
   * The currently selected merchant scope.
   * "all" means show data from every merchant in this brand.
   */
  activeMerchant: ActiveMerchant;
  setActiveMerchant: (id: ActiveMerchant) => void;
  /**
   * The legacy Firestore query string for the active merchant.
   * Maps "all" → "combined" so existing query functions need no changes.
   * All page components and data hooks should use this value when querying.
   */
  merchantQueryId: string;
  /**
   * Whether the Ships nav tab should be shown for the current merchant scope.
   * True if the active merchant (or any merchant when "all") has showShips: true.
   */
  showShipsTab: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const BrandContext = createContext<BrandContextValue | null>(null);

const MERCHANT_STORAGE_KEY = "pref:merchant";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BrandProvider({
  children,
  isDark,
}: {
  children: ReactNode;
  /** Current dark-mode state — passed in so we can re-inject tokens on toggle. */
  isDark: boolean;
}) {
  // Phase 1: load synchronously from static config.
  // Phase 2: replace with async Firestore fetch and surface isLoading.
  const [brand] = useState<BrandTheme>(() => {
    try {
      return getActiveBrandConfig();
    } catch {
      return defaultTheme;
    }
  });

  const [activeMerchant, setActiveMerchantState] =
    usePersistedState<ActiveMerchant>(MERCHANT_STORAGE_KEY, "all");

  // Validate persisted merchant is still valid for the current brand config.
  // If not (e.g., merchant removed), reset to "all".
  useEffect(() => {
    if (activeMerchant === "all") return;
    const valid = brand.merchants.some((m) => m.id === activeMerchant);
    if (!valid) {
      setActiveMerchantState("all");
    }
  }, [brand, activeMerchant, setActiveMerchantState]);

  const setActiveMerchant = useCallback(
    (id: ActiveMerchant) => {
      setActiveMerchantState(id);
    },
    [setActiveMerchantState],
  );

  // Inject CSS variables whenever brand tokens or dark/light mode changes.
  useEffect(() => {
    injectThemeTokens(brand.tokens, isDark);
  }, [brand, isDark]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  /**
   * Legacy Firestore query string.
   * Existing query functions use brand === "combined" as the "all" sentinel.
   * We keep that contract here so no query code needs to change.
   */
  const merchantQueryId: string =
    activeMerchant === "all" ? "combined" : activeMerchant;

  /**
   * Ships tab visibility.
   * Show if the active merchant has showShips: true, or — when viewing
   * "all" merchants — if any merchant in the brand has showShips: true.
   */
  const showShipsTab: boolean =
    activeMerchant === "all"
      ? brand.merchants.some((m) => m.showShips === true)
      : (brand.merchants.find((m) => m.id === activeMerchant)?.showShips ??
        false);

  return (
    <BrandContext.Provider
      value={{
        brand,
        activeMerchant,
        setActiveMerchant,
        merchantQueryId,
        showShipsTab,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBrand(): BrandContextValue {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error("useBrand must be used within a BrandProvider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// Convenience wrapper for layout.tsx
// Reads isDark from ThemeContext so BrandProvider re-injects tokens on toggle.
// ---------------------------------------------------------------------------

export function BrandProviderWithTheme({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <BrandProvider isDark={theme === "dark"}>
      {children}
    </BrandProvider>
  );
}
