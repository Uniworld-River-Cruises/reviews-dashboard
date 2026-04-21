"use client";

/**
 * MerchantSwitcher — pill-style selector for switching between merchant scopes.
 *
 * Replaces the old BrandSwitcher component which was hard-wired to
 * DashboardContext with a static list of brands. This version reads the
 * dynamic merchant list from BrandContext and only renders when the active
 * brand has 2 or more merchants (a single-merchant brand has nothing to switch).
 *
 * "All" maps to activeMerchant = "all" in BrandContext (→ "combined" query ID).
 *
 * Accepts a `tone` prop so it can be used both in the dark header bar and
 * on lighter surfaces (e.g. the mobile drawer).
 */

import { useBrand, type ActiveMerchant } from "@/contexts/BrandContext";

type MerchantSwitcherProps = {
  /**
   * "inverse" — renders with translucent-white styling for use on the dark
   *   header background (default).
   * "neutral" — renders with border/bg styling for use on light surfaces.
   */
  tone?: "inverse" | "neutral";
};

export default function MerchantSwitcher({
  tone = "inverse",
}: MerchantSwitcherProps) {
  const { brand, activeMerchant, setActiveMerchant } = useBrand();

  // Nothing to switch when there is only one (or zero) merchants.
  if (brand.merchants.length < 2) return null;

  const options: { value: ActiveMerchant; label: string }[] = [
    { value: "all", label: "All" },
    ...brand.merchants.map((m) => ({ value: m.id, label: m.label })),
  ];

  const isInverse = tone === "inverse";

  return (
    <div
      className={`inline-flex items-center rounded-full p-0.5 ${
        isInverse ? "bg-white/10" : "bg-surface-alt border border-border"
      }`}
    >
      {options.map(({ value, label }) => {
        const isActive = activeMerchant === value;
        return (
          <button
            key={value}
            onClick={() => setActiveMerchant(value)}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap sm:px-4 sm:py-1.5 sm:text-sm ${
              isActive
                ? isInverse
                  ? "bg-brand-accent text-accent-foreground shadow-sm font-semibold"
                  : "bg-surface text-text-primary shadow-sm border border-border"
                : isInverse
                  ? "text-white/70 hover:text-white"
                  : "text-text-secondary hover:text-text-primary"
            }`}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
