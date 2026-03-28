"use client";

import BrandSwitcher from "./BrandSwitcher";
import DateRangePicker from "./DateRangePicker";
import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="bg-[#1B3A5C] text-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <h1 className="text-lg font-semibold text-white whitespace-nowrap tracking-wide">
              Feefo Reviews
            </h1>
            <span className="hidden sm:block h-5 w-px bg-white/30" />
            <BrandSwitcher />
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker />
            <ThemeToggle />
            <RefreshButton />
          </div>
        </div>
      </div>
    </header>
  );
}
