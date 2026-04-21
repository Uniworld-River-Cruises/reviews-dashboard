"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import {
  useDashboard,
  getDateRangeForPreset,
  type DatePreset,
} from "@/contexts/DashboardContext";

const presets: DatePreset[] = [
  "This Week",
  "This Month",
  "Last Quarter",
  "Last 6 Months",
  "YTD",
  "Last 12 Months",
  "Last 2 Years",
  "Last 5 Years",
  "Last 10 Years",
  "All Time",
  "Custom Range",
];

type DateRangePickerProps = {
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
        // Delay closing so native date picker interactions aren't interrupted
        requestAnimationFrame(() => setOpen(false));
      }
    }
    // Use click (not mousedown) so native date picker popups work
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
      ? `${format(dateRange.start, "MMM d, yyyy")} - ${format(dateRange.end, "MMM d, yyyy")}`
      : dateRange.preset;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`cursor-pointer flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-sm transition-colors sm:min-w-[11.5rem] sm:w-auto ${
          isNeutral
            ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <svg
          className={`h-4 w-4 shrink-0 ${
            isNeutral ? "text-slate-500 dark:text-white/70" : "text-white/70"
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
            isNeutral ? "text-slate-400 dark:text-white/50" : "text-white/50"
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

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#111927]">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`cursor-pointer w-full px-4 py-2 text-left text-sm transition-colors ${
                dateRange.preset === preset
                  ? "bg-[var(--brand-gold)] text-[#1B3A5C] dark:text-[#0F1A2E] font-semibold"
                  : "text-slate-700 hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/5"
              }`}
            >
              {preset}
            </button>
          ))}

          {dateRange.preset === "Custom Range" && (
            <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-white/10">
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-white/60">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-white/60">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="cursor-pointer w-full rounded bg-[var(--brand-gold)] px-3 py-1.5 text-sm font-semibold text-[#1B3A5C] dark:text-[#0F1A2E] hover:opacity-90 transition-colors"
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
