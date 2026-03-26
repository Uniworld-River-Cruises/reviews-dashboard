"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/itineraries", label: "Itineraries" },
  { href: "/ships", label: "Ships" },
  { href: "/reviews", label: "Reviews" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {tabs.map(({ href, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "text-[#1B3A5C]"
                  : "text-gray-500 hover:text-gray-700"
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
    </nav>
  );
}
