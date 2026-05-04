"use client";

/**
 * DashboardContext — date range and data-version state.
 *
 * Brand / merchant selection has moved to BrandContext.
 * All page components that previously read `brand` from here should
 * now read `merchantQueryId` from `useBrand()` instead.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { usePersistedState } from "@/hooks/usePersistedState";

export type DateField = "lastUpdated" | "created";

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  lastUpdated: "Review Updated Date",
  created: "Review Created Date",
};

const VALID_DATE_FIELDS: readonly DateField[] = ["lastUpdated", "created"];

function isDateField(value: unknown): value is DateField {
  return typeof value === "string" && (VALID_DATE_FIELDS as readonly string[]).includes(value);
}

// Preset names mirror Feefo's date filter exactly so the dashboard's filter
// vocabulary matches the source system reviewers are already used to.
export type DatePreset =
  | "Today"
  | "Yesterday"
  | "Last 7 Days"
  | "Last 30 Days"
  | "Last 12 Months"
  | "Current Calendar Week"
  | "Current Calendar Month"
  | "Current Calendar Year"
  | "Last Calendar Week"
  | "Last Calendar Month"
  | "Last Calendar Year"
  | "All Time"
  | "Custom Range";

const VALID_PRESETS: readonly DatePreset[] = [
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

function isDatePreset(value: unknown): value is DatePreset {
  return typeof value === "string" && (VALID_PRESETS as readonly string[]).includes(value);
}

// Map old (pre-Feefo-alignment) preset names to their nearest equivalent so a
// returning user keeps working without being thrown back to the default. The
// removed presets (Last Quarter, Last 6 Months, Last 2/5/10 Years) collapse to
// "Last 12 Months", which is the closest survivor on Feefo's list.
const LEGACY_PRESET_MIGRATION: Record<string, DatePreset> = {
  "This Week": "Current Calendar Week",
  "This Month": "Current Calendar Month",
  YTD: "Current Calendar Year",
  "Last Quarter": "Last 12 Months",
  "Last 6 Months": "Last 12 Months",
  "Last 2 Years": "Last 12 Months",
  "Last 5 Years": "Last 12 Months",
  "Last 10 Years": "Last 12 Months",
};

export interface DateRange {
  start: Date;
  end: Date;
  preset: DatePreset;
}

interface DashboardContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  dateField: DateField;
  setDateField: (field: DateField) => void;
  lastSynced: string | null;
  setLastSynced: (value: string | null) => void;
  dataVersion: number;
  bumpDataVersion: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const DEFAULT_PRESET: DatePreset = "Last 12 Months";

export function getDateRangeForPreset(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();

  switch (preset) {
    case "Today":
      return { start: startOfDay(now), end: now };
    case "Yesterday": {
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case "Last 7 Days":
      return { start: subDays(now, 7), end: now };
    case "Last 30 Days":
      return { start: subDays(now, 30), end: now };
    case "Last 12 Months":
      return { start: subMonths(now, 12), end: now };
    case "Current Calendar Week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    case "Current Calendar Month":
      return { start: startOfMonth(now), end: now };
    case "Current Calendar Year":
      return { start: startOfYear(now), end: now };
    case "Last Calendar Week": {
      const lastWeek = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
      };
    }
    case "Last Calendar Month": {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case "Last Calendar Year": {
      const lastYear = subYears(now, 1);
      return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
    }
    case "All Time":
      return { start: new Date(2015, 0, 1), end: now };
    case "Custom Range":
      return { start: subMonths(now, 12), end: now };
    default: {
      // Exhaustiveness guard — adding a new preset to the union without
      // handling it here will fail to compile.
      const _exhaustive: never = preset;
      void _exhaustive;
      return { start: subMonths(now, 12), end: now };
    }
  }
}

function getDefaultDateRange(): DateRange {
  const { start, end } = getDateRangeForPreset(DEFAULT_PRESET);
  return { start, end, preset: DEFAULT_PRESET };
}

function getInitialDateRange(): DateRange {
  if (typeof window === "undefined") {
    return getDefaultDateRange();
  }

  try {
    const stored = localStorage.getItem("pref:datePreset");
    if (!stored) {
      return getDefaultDateRange();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return getDefaultDateRange();
    }

    if (typeof parsed !== "string") {
      return getDefaultDateRange();
    }

    if (parsed === "Custom Range") {
      // Custom dates aren't persisted alongside the preset, so we can't
      // reconstruct the range. Fall back to the default.
      return getDefaultDateRange();
    }

    // One-time rename: returning users with a pre-Feefo-alignment preset
    // ("This Week", "YTD", etc.) get mapped to the current equivalent and
    // their localStorage entry is upgraded so the migration only happens once.
    const migrated = LEGACY_PRESET_MIGRATION[parsed];
    let preset: DatePreset;
    if (migrated) {
      preset = migrated;
      try {
        localStorage.setItem("pref:datePreset", JSON.stringify(migrated));
      } catch {
        // Ignore storage errors
      }
    } else if (isDatePreset(parsed)) {
      preset = parsed;
    } else {
      return getDefaultDateRange();
    }

    const { start, end } = getDateRangeForPreset(preset);
    return { start, end, preset };
  } catch {
    return getDefaultDateRange();
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRange>(getInitialDateRange);
  const [storedDateField, setStoredDateField] = usePersistedState<DateField>(
    "pref:dateField",
    "created"
  );
  // Guard against a corrupted localStorage value: anything outside our enum
  // gets coerced back to "created" and the bad value is wiped from storage.
  const dateField: DateField = isDateField(storedDateField) ? storedDateField : "created";

  useEffect(() => {
    if (!isDateField(storedDateField)) {
      setStoredDateField("created");
    }
  }, [storedDateField, setStoredDateField]);

  const setDateField = useCallback(
    (next: DateField) => {
      if (isDateField(next)) {
        setStoredDateField(next);
      }
    },
    [setStoredDateField]
  );
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const handleSetDateRange = useCallback((range: DateRange) => {
    setDateRangeState(range);
    try {
      if (range.preset === "Custom Range") {
        localStorage.removeItem("pref:datePreset");
      } else {
        localStorage.setItem("pref:datePreset", JSON.stringify(range.preset));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSetLastSynced = useCallback((value: string | null) => {
    setLastSynced(value);
  }, []);

  const bumpDataVersion = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        dateRange,
        setDateRange: handleSetDateRange,
        dateField,
        setDateField,
        lastSynced,
        setLastSynced: handleSetLastSynced,
        dataVersion,
        bumpDataVersion,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
