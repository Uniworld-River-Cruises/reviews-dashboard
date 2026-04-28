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
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { subMonths, subYears, startOfMonth, startOfYear, startOfWeek } from "date-fns";
import { usePersistedState } from "@/hooks/usePersistedState";

export type DateField = "lastUpdated" | "created";

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  lastUpdated: "Review Updated Date",
  created: "Review Created Date",
};

export type DatePreset =
  | "This Week"
  | "This Month"
  | "Last Quarter"
  | "Last 6 Months"
  | "YTD"
  | "Last 12 Months"
  | "Last 2 Years"
  | "Last 5 Years"
  | "Last 10 Years"
  | "All Time"
  | "Custom Range";

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
  const end = now;

  switch (preset) {
    case "This Week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end };
    case "This Month":
      return { start: startOfMonth(now), end };
    case "Last Quarter":
      return { start: subMonths(startOfMonth(now), 3), end };
    case "Last 6 Months":
      return { start: subMonths(now, 6), end };
    case "YTD":
      return { start: startOfYear(now), end };
    case "Last 12 Months":
      return { start: subMonths(now, 12), end };
    case "Last 2 Years":
      return { start: subYears(now, 2), end };
    case "Last 5 Years":
      return { start: subYears(now, 5), end };
    case "Last 10 Years":
      return { start: subYears(now, 10), end };
    case "All Time":
      return { start: new Date(2015, 0, 1), end };
    case "Custom Range":
      return { start: subMonths(now, 12), end };
    default:
      return { start: subMonths(now, 12), end };
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

    const preset = JSON.parse(stored) as DatePreset;
    if (preset === "Custom Range") {
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
  const [dateField, setDateField] = usePersistedState<DateField>(
    "pref:dateField",
    "created"
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
