"use client";

/**
 * Header — single sticky application bar.
 *
 * Consolidates the old two-bar layout (Header + Navigation) into one bar.
 * Renders across all viewports:
 *
 * Desktop (md+):
 *   [App title]  [NavTabs — centred]  [MerchantSwitcher | DatePicker | Refresh | Theme | Auth]
 *
 * Mobile (< md):
 *   [App title]  [Hamburger → MobileDrawer]
 *
 * Background is driven by the --header-bg CSS variable injected by
 * BrandProvider, so the colour updates automatically when the brand or
 * colour-mode changes.
 */

import { useState } from "react";
import { useBrand } from "@/contexts/BrandContext";
import { hasFirebaseWebConfig } from "@/lib/firebase";
import NavTabs from "./NavTabs";
import MerchantSwitcher from "./MerchantSwitcher";
import MobileDrawer from "./MobileDrawer";
import DateRangePicker from "./DateRangePicker";
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
        className="shadow-sm"
        style={{ backgroundColor: "var(--header-bg)", color: "var(--header-text)" }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-stretch justify-between gap-4 sm:h-16">
            {/* ── Left: App title ─────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center">
              <span
                className="whitespace-nowrap text-base font-semibold tracking-wide sm:text-lg"
                style={{ color: "var(--header-text)" }}
              >
                {brand.appTitle}
              </span>
            </div>

            {/* ── Center: NavTabs (desktop only) ──────────────────────────── */}
            <div className="hidden flex-1 items-stretch justify-center md:flex">
              <NavTabs />
            </div>

            {/* ── Right: Controls (desktop only) ──────────────────────────── */}
            <div className="hidden items-center gap-2 md:flex">
              <MerchantSwitcher tone="inverse" />
              <DateRangePicker tone="inverse" />
              {showAuthControls ? (
                <>
                  <RefreshButton tone="inverse" showSyncLabel />
                  <AuthButton
                    tone="inverse"
                    showEmail
                    showStatus={false}
                  />
                </>
              ) : null}
              <ThemeToggle />
            </div>

            {/* ── Mobile: Hamburger ────────────────────────────────────────── */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
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
          </div>
        </div>
      </header>

      {/* Mobile drawer (portal-like, rendered outside the header) */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
