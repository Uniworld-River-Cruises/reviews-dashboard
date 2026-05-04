"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import {
  useDashboard,
  getDateRangeForPreset,
  type DatePreset,
} from "@/contexts/DashboardContext";

// Order mirrors Feefo's date filter (Today first, calendar-aligned options
// grouped together, All Time last). Keep this list in sync with the
// `DatePreset` union in DashboardContext.
const presets: DatePreset[] = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 30 Days",
  "Last 12 Months",
  "Current Calendar Week",
  "Current Calendar Month",
  "Current Calendar Year",
  "Last Calendar Week",
  "Last Calendar Month",
  "Last Calendar Year",
  "All Time",
  "Custom Range",
];

type DateRangePickerProps = {
  /**
   * "inverse" (default) — translucent-white styling for use on the dark
   *   header background.
   * "neutral" — border + bg styling for use on light surfaces (drawer, etc.).
   */
  tone?: "inverse" | "neutral";
};

export default function DateRangePicker({
  tone = "inverse",
}: DateRangePickerProps) {
  const { dateRange, setDateRange } = useDashboard();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isNeutral = tone === "neutral";

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        // Delay closing so native date picker interactions aren't interrupted.
        requestAnimationFrame(() => setOpen(false));
      }
    }
    // Use click (not mousedown) so native date picker popups work.
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  function handlePresetClick(preset: DatePreset) {
    if (preset === "Custom Range") {
      setCustomStart(format(dateRange.start, "yyyy-MM-dd"));
      setCustomEnd(format(dateRange.end, "yyyy-MM-dd"));
      setDateRange({ ...dateRange, preset: "Custom Range" });
      return;
    }
    const { start, end } = getDateRangeForPreset(preset);
    setDateRange({ start, end, preset });
    setOpen(false);
  }

  function handleCustomApply() {
    if (customStart && customEnd) {
      setDateRange({
        start: new Date(customStart + "T00:00:00"),
        end: new Date(customEnd + "T23:59:59"),
        preset: "Custom Range",
      });
      setOpen(false);
    }
  }

  const displayLabel =
    dateRange.preset === "Custom Range"
      ? `${format(dateRange.start, "MMM d, yyyy")} – ${format(dateRange.end, "MMM d, yyyy")}`
      : dateRange.preset;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`cursor-pointer flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium shadow-sm transition-colors sm:min-w-[11.5rem] sm:w-auto ${
          isNeutral
            ? "border border-border bg-surface text-text-primary hover:bg-surface-hover dark:border-border"
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <svg
          className={`h-4 w-4 shrink-0 ${
            isNeutral ? "text-text-secondary" : "text-white/70"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${
            isNeutral ? "text-text-tertiary" : "text-white/50"
          } ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-border bg-surface py-1 shadow-xl"
        >
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`cursor-pointer w-full px-4 py-2 text-left text-sm transition-colors ${
                dateRange.preset === preset
                  ? "bg-brand-accent text-accent-foreground font-semibold"
                  : "text-text-primary hover:bg-surface-hover"
              }`}
            >
              {preset}
            </button>
          ))}

          {dateRange.preset === "Custom Range" && (
            <div className="space-y-2 border-t border-border px-4 py-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm text-text-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm text-text-primary"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="cursor-pointer w-full rounded bg-brand-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:opacity-90"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
