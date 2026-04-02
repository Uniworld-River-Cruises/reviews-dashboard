"use client";

/**
 * MobileDrawer — slide-in side panel for small screens.
 *
 * Contains everything that the consolidated header bar hides at < md:
 *   - Primary nav links (with active state)
 *   - MerchantSwitcher (if 2+ merchants)
 *   - DateRangePicker
 *   - RefreshButton (if Firebase is configured)
 *   - Dark / light mode toggle
 *   - Auth button
 *
 * The drawer slides in from the right, matching the `animate-slide-in-right`
 * keyframe defined in globals.css.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useBrand } from "@/contexts/BrandContext";
import { getClientAuth, hasFirebaseWebConfig } from "@/lib/firebase";
import { getCurrentAdminAccess } from "@/lib/firestore/admin-queries";
import MerchantSwitcher from "./MerchantSwitcher";
import DateRangePicker from "./DateRangePicker";
import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";
import AuthButton from "./AuthButton";

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/itineraries", label: "Itineraries" },
  { href: "/reviews", label: "Reviews" },
  { href: "/ships", label: "Ships" },
  { href: "/admin", label: "Admin" },
] as const;

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const { showShipsTab } = useBrand();
  const showAuthControls = hasFirebaseWebConfig();

  const [user, setUser] = useState<User | null>(null);
  const [showAdminLink, setShowAdminLink] = useState(false);

  // ── Auth state ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showAuthControls) return;
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        if (!nextUser) setShowAdminLink(false);
      });
    } catch {
      return;
    }
  }, [showAuthControls]);

  // ── Admin-access check ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!showAuthControls || !user) return;
    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setShowAdminLink(
          Boolean(
            access.permissions.sync ||
              access.permissions.manageMappings ||
              access.permissions.manageUsers,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setShowAdminLink(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAuthControls, user]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Filter links to visible tabs — mirrors NavTabs logic, including the
  // async admin-access check so authorized users can reach /admin on mobile.
  const visibleLinks = NAV_LINKS.filter(({ href }) => {
    if (href === "/ships") return showShipsTab;
    if (href === "/admin") return showAdminLink;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="animate-slide-in-right absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
        {/* Header row */}
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <span className="text-sm font-semibold text-text-primary">Menu</span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close menu"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          {/* Nav links */}
          <nav aria-label="Mobile navigation">
            <ul className="space-y-1">
              {visibleLinks.map(({ href, label }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-accent/10 text-text-primary font-semibold"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                    >
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-nav-active-indicator" />
                      )}
                      {!isActive && <span className="h-1.5 w-1.5" />}
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Merchant switcher */}
          <div className="space-y-1.5">
            <p className="px-1 text-xs font-medium text-text-tertiary uppercase tracking-wide">
              View
            </p>
            <MerchantSwitcher tone="neutral" />
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <p className="px-1 text-xs font-medium text-text-tertiary uppercase tracking-wide">
              Date Range
            </p>
            <DateRangePicker tone="neutral" />
          </div>

          {/* Refresh */}
          {showAuthControls ? (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-medium text-text-tertiary uppercase tracking-wide">
                Sync
              </p>
              <RefreshButton tone="neutral" showSyncLabel />
            </div>
          ) : null}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Theme toggle + Auth */}
          <div className="flex items-center justify-between gap-3">
            <ThemeToggle tone="neutral" />
            {showAuthControls ? (
              <AuthButton tone="neutral" showEmail={false} showStatus />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
