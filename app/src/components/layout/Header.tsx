"use client";

/**
 * Header — two-row sticky application bar.
 *
 * Row 1 — Brand + Auth (always visible on desktop, title-only on mobile):
 *   [App title] ················ [ThemeToggle | AuthButton]
 *
 * Row 2 — Nav + Data controls (desktop/large-tablet only):
 *   [NavTabs — scrollable] ····· [MerchantSwitcher | DatePicker | Refresh]
 *
 * Mobile / small-tablet (< lg / 1024px):
 *   [App title] ················ [Hamburger → MobileDrawer]
 *
 * Splitting into two rows means neither the nav tabs nor the data controls
 * ever have to compete for horizontal space with each other, keeping both
 * readable at any viewport width ≥ 1024px.
 *
 * Background colour is driven by the --header-bg CSS variable so it
 * updates automatically on brand or dark/light mode changes.
 */

import { useState } from "react";
import { useBrand } from "@/contexts/BrandContext";
import { hasFirebaseWebConfig } from "@/lib/firebase";
import NavTabs from "./NavTabs";
import MerchantSwitcher from "./MerchantSwitcher";
import MobileDrawer from "./MobileDrawer";
import DateRangePicker from "./DateRangePicker";
import DateFieldSelector from "./DateFieldSelector";
import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";
import AuthButton from "./AuthButton";

export default function Header() {
  const { brand } = useBrand();
  const showAuthControls = hasFirebaseWebConfig();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-40 shadow-sm"
        style={{ backgroundColor: "var(--header-bg)", color: "var(--header-text)" }}
      >
        {/* ── Row 1: Brand + Auth ────────────────────────────────────────────
            Height: h-12 (48px). Always visible. On mobile this is the only row
            and it shows the hamburger instead of auth controls.             */}
        <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
          {/* App title */}
          <span className="shrink-0 text-base font-bold tracking-wide sm:text-lg">
            {brand.appTitle}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Desktop auth controls — only shown at lg+ */}
          <div className="hidden lg:flex items-center gap-2">
            <ThemeToggle tone="inverse" />
            {showAuthControls && (
              <AuthButton tone="inverse" showEmail showStatus={false} />
            )}
          </div>

          {/* Mobile/tablet hamburger — shown below lg */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
        </div>

        {/* ── Row 2: Nav + Data controls — lg+ only ─────────────────────────
            Height: h-11 (44px). Hidden on mobile/small-tablet.
            NavTabs grow to fill space; data controls are shrink-0 so they
            never compress. If tabs somehow overflow they scroll invisibly.  */}
        <div
          className="hidden lg:flex items-center h-11 px-4 sm:px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
        >
          {/* Nav tabs — flex-1 + overflow scroll as a safety net */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
            <NavTabs />
          </div>

          {/* Data controls — separated by a faint divider */}
          <div
            className="shrink-0 flex items-center gap-2 pl-4"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.12)" }}
          >
            <MerchantSwitcher tone="inverse" />
            <DateRangePicker tone="inverse" />
            <DateFieldSelector tone="inverse" />
            {showAuthControls && (
              <RefreshButton tone="inverse" showSyncLabel />
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer — rendered outside the header so it covers the full viewport */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
