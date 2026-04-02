"use client";

import { useSyncExternalStore } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TrendGranularity, TrendPoint } from "@/lib/firestore/queries";
import { useThemeColors } from "@/hooks/useThemeColors";

interface TrendChartProps {
  data: TrendPoint[];
  granularity: TrendGranularity;
  onSelectPeriod?: (period: TrendPoint) => void;
}

function useIsMobile(breakpoint = 640) {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      const handler = () => callback();
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    },
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
    () => false
  );
}

function granularityLabel(granularity: TrendGranularity): string {
  if (granularity === "day") return "Daily";
  if (granularity === "week") return "Weekly";
  return "Monthly";
}

export default function TrendChart({
  data,
  granularity,
  onSelectPeriod,
}: TrendChartProps) {
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 200 : 260;
  const {
    primary,
    accent,
    accentLight,
    tooltipStyle,
    tooltipLabelStyle,
    tooltipItemStyle,
    axisTickFill,
    gridStroke,
  } = useThemeColors();

  const tickStyle = { fontSize: isMobile ? 9 : 11, fill: axisTickFill };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Rating Trend */}
      <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">
            Rating Trend Over Time
          </h3>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: `color-mix(in srgb, var(--brand-accent) 15%, transparent)`,
              color: "var(--text-primary)",
            }}
          >
            {granularityLabel(granularity)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={data}
            margin={{ left: 0, right: 10, top: 5, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              minTickGap={isMobile ? 18 : 24}
            />
            <YAxis domain={[4.0, 5.0]} tick={{ fontSize: 11, fill: axisTickFill }} />
            <Tooltip
              cursor={{ stroke: primary, strokeWidth: 1, strokeDasharray: "3 3" }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullLabel ?? ""
              }
              formatter={(value) => [
                value == null ? "No ratings" : Number(value).toFixed(2),
                "Avg Rating",
              ]}
            />
            <Line
              type="monotone"
              dataKey="averageRating"
              stroke={primary}
              strokeWidth={2}
              connectNulls={false}
              dot={(dotProps) => {
                const payload = dotProps.payload as TrendPoint | undefined;
                if (!payload || payload.averageRating === null) return null;
                return (
                  <circle
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    r={isMobile ? 3 : 4}
                    fill={primary}
                    className={onSelectPeriod ? "cursor-pointer" : undefined}
                    onClick={() => {
                      if (onSelectPeriod) onSelectPeriod(payload);
                    }}
                  />
                );
              }}
              activeDot={{
                r: isMobile ? 4 : 6,
                fill: accentLight,
                stroke: primary,
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Review Volume */}
      <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">
            Review Volume Over Time
          </h3>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: `color-mix(in srgb, var(--brand-accent) 15%, transparent)`,
              color: "var(--text-secondary)",
            }}
          >
            {granularityLabel(granularity)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            margin={{ left: 0, right: 10, top: 5, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              minTickGap={isMobile ? 18 : 24}
            />
            <YAxis tick={{ fontSize: 11, fill: axisTickFill }} />
            <Tooltip
              cursor={false}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullLabel ?? ""
              }
              formatter={(value) => [
                Number(value ?? 0).toLocaleString(),
                "Reviews",
              ]}
            />
            <Bar
              dataKey="reviewCount"
              fill={accent}
              radius={[4, 4, 0, 0]}
              cursor={onSelectPeriod ? "pointer" : "default"}
              activeBar={false}
              onClick={(_, index) => {
                if (onSelectPeriod && index >= 0 && data[index]) {
                  onSelectPeriod(data[index]);
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
