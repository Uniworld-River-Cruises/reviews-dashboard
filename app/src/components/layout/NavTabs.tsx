"use client";

/**
 * NavTabs — horizontal tab bar for the primary app navigation.
 *
 * Extracted from Navigation.tsx so it can be embedded directly in the
 * consolidated Header bar.  Uses BrandContext for the showShipsTab flag
 * instead of the legacy DashboardContext.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth, hasFirebaseWebConfig } from "@/lib/firebase";
import { getCurrentAdminAccess } from "@/lib/firestore/admin-queries";
import { useBrand } from "@/contexts/BrandContext";

const BASE_TABS = [
  { href: "/", label: "Overview" },
  { href: "/itineraries", label: "Itineraries" },
  { href: "/reviews", label: "Reviews" },
] as const;

export default function NavTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const { showShipsTab } = useBrand();
  const showAuthControls = hasFirebaseWebConfig();

  const [user, setUser] = useState<User | null>(null);
  const [showAdminTab, setShowAdminTab] = useState(false);
  const [checkingAdminAccess, setCheckingAdminAccess] =
    useState(showAuthControls);

  // ── Auth state ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showAuthControls) return;
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        if (!nextUser) {
          setShowAdminTab(false);
          setCheckingAdminAccess(false);
        } else {
          setCheckingAdminAccess(true);
        }
      });
    } catch {
      return;
    }
  }, [showAuthControls]);

  // ── Admin-access check ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!showAuthControls || !user) return;

    queueMicrotask(() => setCheckingAdminAccess(true));

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setShowAdminTab(
          Boolean(
            access.permissions.sync ||
              access.permissions.manageMappings ||
              access.permissions.manageUsers,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setShowAdminTab(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingAdminAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showAuthControls, user]);

  // ── Guard: redirect off /ships when tab is not available ────────────────
  useEffect(() => {
    if (!showShipsTab && pathname.startsWith("/ships")) {
      router.replace("/itineraries");
    }
  }, [pathname, router, showShipsTab]);

  // ── Build tab list ───────────────────────────────────────────────────────
  const tabs = [...BASE_TABS] as { href: string; label: string }[];
  if (showShipsTab) tabs.splice(2, 0, { href: "/ships", label: "Ships" });
  if (showAdminTab || (pathname.startsWith("/admin") && checkingAdminAccess)) {
    tabs.push({ href: "/admin", label: "Admin" });
  }

  return (
    <nav aria-label="Main navigation" className="flex items-stretch gap-0.5 sm:gap-1">
      {tabs.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
              isActive
                ? "font-semibold text-header-text"
                : "text-nav-inactive-text hover:text-header-text"
            }`}
          >
            {label}
            {isActive && (
              <span
                aria-hidden
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-nav-active-indicator sm:left-3 sm:right-3"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
