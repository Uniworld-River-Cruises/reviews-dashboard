"use client";

import BrandSwitcher from "./BrandSwitcher";
import DateRangePicker from "./DateRangePicker";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="bg-[#1B3A5C] text-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex items-center justify-between gap-3 md:gap-4">
          <h1 className="whitespace-nowrap text-base font-semibold tracking-wide text-white sm:text-lg">
            Feefo Reviews
          </h1>
          <div className="flex items-center gap-2">
            <DateRangePicker />
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-2">
          <BrandSwitcher />
        </div>
      </div>
    </header>
  );
}
