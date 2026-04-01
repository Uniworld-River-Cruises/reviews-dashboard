"use client";

import AuthButton from "./AuthButton";
import BrandSwitcher from "./BrandSwitcher";
import DateRangePicker from "./DateRangePicker";
import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";
import { hasFirebaseWebConfig } from "@/lib/firebase";

export default function Header() {
  const showAuthControls = hasFirebaseWebConfig();

  return (
    <header className="bg-[#1B3A5C] text-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="whitespace-nowrap text-base font-semibold tracking-wide text-white sm:text-lg">
              Feefo Reviews
            </h1>
            <div className="flex items-center gap-2 md:hidden">
              <DateRangePicker />
              <ThemeToggle />
              {showAuthControls ? (
                <AuthButton tone="inverse" showEmail={false} showStatus={false} />
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <BrandSwitcher />
            {showAuthControls ? (
              <div className="md:hidden">
                <RefreshButton tone="inverse" showSyncLabel={false} />
              </div>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <DateRangePicker />
            <ThemeToggle />
            {showAuthControls ? (
              <>
                <RefreshButton tone="inverse" showSyncLabel />
                <AuthButton tone="inverse" showEmail showStatus={false} />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
