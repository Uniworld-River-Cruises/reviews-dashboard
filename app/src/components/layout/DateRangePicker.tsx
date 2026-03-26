"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import {
  useDashboard,
  getDateRangeForPreset,
  type DatePreset,
} from "@/contexts/DashboardContext";

const presets: DatePreset[] = [
  "This Month",
  "Last Quarter",
  "Last 6 Months",
  "YTD",
  "Last 12 Months",
  "All Time",
  "Custom Range",
];

export default function DateRangePicker() {
  const { dateRange, setDateRange } = useDashboard();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors w-full sm:w-auto"
      >
        <svg
          className="h-4 w-4 text-gray-500"
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
        {displayLabel}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
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
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                dateRange.preset === preset
                  ? "bg-[#1B3A5C] text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {preset}
            </button>
          ))}

          {dateRange.preset === "Custom Range" && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="w-full rounded bg-[#C5A258] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#b3913e] transition-colors"
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
