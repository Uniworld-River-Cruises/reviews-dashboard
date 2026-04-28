"use client";

/**
 * DateFieldSelector — toggles which date field on a review document drives
 * the date-range filter across the app.
 *
 * Mirrors Feefo's hub UI, which lets users filter by either "Review Updated
 * Date" (default) or "Review Created Date". The selection is persisted in
 * localStorage via `pref:dateField` and read by `useDashboard()`.
 */

import { useState, useRef, useEffect } from "react";
import {
  useDashboard,
  DATE_FIELD_LABELS,
  type DateField,
} from "@/contexts/DashboardContext";

const options: DateField[] = ["lastUpdated", "created"];

type DateFieldSelectorProps = {
  tone?: "inverse" | "neutral";
};

export default function DateFieldSelector({
  tone = "inverse",
}: DateFieldSelectorProps) {
  const { dateField, setDateField } = useDashboard();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isNeutral = tone === "neutral";

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title="Date field used to filter reviews"
        className={`cursor-pointer flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-sm transition-colors sm:w-auto ${
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
            d="M3 6h18M6 12h12M10 18h4"
          />
        </svg>
        <span className="truncate">{DATE_FIELD_LABELS[dateField]}</span>
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
        <div
          className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-border bg-surface py-1 shadow-xl"
        >
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                setDateField(option);
                setOpen(false);
              }}
              className={`cursor-pointer w-full px-4 py-2 text-left text-sm transition-colors ${
                dateField === option
                  ? "bg-brand-accent/10 text-text-primary font-semibold"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`}
            >
              {DATE_FIELD_LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
