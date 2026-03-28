"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";
import RefreshButton from "./RefreshButton";
import { hasFirebaseWebConfig } from "@/lib/firebase";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/itineraries", label: "Itineraries" },
  { href: "/ships", label: "Ships" },
  { href: "/reviews", label: "Reviews" },
  { href: "/admin", label: "Admin" },
];

export default function Navigation() {
  const pathname = usePathname();
  const showAuthControls = hasFirebaseWebConfig();

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm dark:bg-[#111927] dark:border-[#1e2d44]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              {tabs.map(({ href, label }) => {
                const isActive =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`relative whitespace-nowrap rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:px-5 ${
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

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {showAuthControls ? <RefreshButton tone="neutral" showSyncLabel /> : null}
            {showAuthControls ? (
              <AuthButton tone="neutral" showEmail={false} showStatus={false} />
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
