"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { subMonths, subYears, startOfMonth, startOfYear, startOfWeek } from "date-fns";

export type Brand = "uniworld" | "luxury-gold" | "combined";

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
  brand: Brand;
  setBrand: (brand: Brand) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  lastSynced: string | null;
  setLastSynced: (value: string | null) => void;
  dataVersion: number;
  bumpDataVersion: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

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
  const preset: DatePreset = "Last 12 Months";
  const { start, end } = getDateRangeForPreset(preset);
  return { start, end, preset };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Brand>("uniworld");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const handleSetDateRange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  const handleSetBrand = useCallback((b: Brand) => {
    setBrand(b);
  }, []);

  const handleSetLastSynced = useCallback((value: string | null) => {
    setLastSynced(value);
  }, []);

  const bumpDataVersion = useCallback(() => {
    setDataVersion((value) => value + 1);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        brand,
        setBrand: handleSetBrand,
        dateRange,
        setDateRange: handleSetDateRange,
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
