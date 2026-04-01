"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth, hasFirebaseWebConfig } from "@/lib/firebase";
import { getCurrentAdminAccess } from "@/lib/firestore/admin-queries";
import { brandHasShips, useDashboard } from "@/contexts/DashboardContext";

const baseTabs = [
  { href: "/", label: "Overview" },
  { href: "/itineraries", label: "Itineraries" },
  { href: "/reviews", label: "Reviews" },
];

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { brand } = useDashboard();
  const showAuthControls = hasFirebaseWebConfig();
  const [user, setUser] = useState<User | null>(null);
  const [showAdminTab, setShowAdminTab] = useState(false);
  const [checkingAdminAccess, setCheckingAdminAccess] = useState(showAuthControls);
  const showShipsTab = brandHasShips(brand);

  useEffect(() => {
    if (!showAuthControls) {
      return;
    }

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

  useEffect(() => {
    let cancelled = false;

    if (!showAuthControls || !user) {
      return;
    }

    queueMicrotask(() => setCheckingAdminAccess(true));

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setShowAdminTab(
          Boolean(
            access.permissions.sync ||
              access.permissions.manageMappings ||
              access.permissions.manageUsers
          )
        );
      })
      .catch(() => {
        if (cancelled) return;
        setShowAdminTab(false);
      })
      .finally(() => {
        if (cancelled) return;
        setCheckingAdminAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showAuthControls, user]);

  const tabs = [...baseTabs];
  if (showShipsTab) {
    tabs.splice(2, 0, { href: "/ships", label: "Ships" });
  }
  if (showAdminTab || (pathname.startsWith("/admin") && checkingAdminAccess)) {
    tabs.push({ href: "/admin", label: "Admin" });
  }

  useEffect(() => {
    if (!showShipsTab && pathname.startsWith("/ships")) {
      router.replace("/itineraries");
    }
  }, [pathname, router, showShipsTab]);

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm dark:bg-[#111927] dark:border-[#1e2d44]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-1.5 sm:py-2.5">
          <div className="flex items-center gap-0.5 sm:gap-1">
            {tabs.map(({ href, label }) => {
              const isActive =
                href === "/" ? pathname === "/" : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2.5 sm:text-sm ${
                    isActive
                      ? "font-semibold text-[#1B3A5C] dark:text-white"
                      : "text-gray-500 hover:text-[#1B3A5C] dark:text-white/60 dark:hover:text-white"
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C5A258]" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
