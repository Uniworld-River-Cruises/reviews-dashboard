"use client";

import BrandSwitcher from "./BrandSwitcher";
import DateRangePicker from "./DateRangePicker";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="bg-[#1B3A5C] text-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-3">
              <h1 className="whitespace-nowrap text-lg font-semibold tracking-wide text-white">
                Feefo Reviews
              </h1>
            </div>
            <BrandSwitcher />
          </div>
          <div className="flex items-center justify-end gap-2">
            <DateRangePicker />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
