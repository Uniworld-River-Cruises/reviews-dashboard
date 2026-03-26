"use client";

import BrandSwitcher from "./BrandSwitcher";
import DateRangePicker from "./DateRangePicker";
import RefreshButton from "./RefreshButton";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <h1 className="text-lg font-semibold text-[#1B3A5C] whitespace-nowrap">
              Feefo Reviews
            </h1>
            <BrandSwitcher />
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker />
            <RefreshButton />
          </div>
        </div>
      </div>
    </header>
  );
}
