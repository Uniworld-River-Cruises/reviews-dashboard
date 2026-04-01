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

interface TrendChartProps {
  data: TrendPoint[];
  granularity: TrendGranularity;
  onSelectPeriod?: (period: TrendPoint) => void;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#172338",
  border: "1px solid #2d3b58",
  borderRadius: "12px",
  color: "#f8fafc",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
};

const TOOLTIP_LABEL_STYLE = {
  color: "#f8fafc",
  fontWeight: 600,
};

const TOOLTIP_ITEM_STYLE = {
  color: "#cbd5e1",
};

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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#1B3A5C]">
            Rating Trend Over Time
          </h3>
          <span className="rounded-full bg-[#1B3A5C]/10 px-2.5 py-1 text-xs font-medium text-[#1B3A5C]">
            {granularityLabel(granularity)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 9 : 11 }}
              minTickGap={isMobile ? 18 : 24}
            />
            <YAxis domain={[4.0, 5.0]} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "#36506f", strokeWidth: 1, strokeDasharray: "3 3" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
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
              stroke="#1B3A5C"
              strokeWidth={2}
              connectNulls={false}
              dot={(dotProps) => {
                const payload = dotProps.payload as TrendPoint | undefined;
                if (!payload || payload.averageRating === null) {
                  return null;
                }

                return (
                  <circle
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    r={isMobile ? 3 : 4}
                    fill="#1B3A5C"
                    className={onSelectPeriod ? "cursor-pointer" : undefined}
                    onClick={() => {
                      if (onSelectPeriod) {
                        onSelectPeriod(payload);
                      }
                    }}
                  />
                );
              }}
              activeDot={{
                r: isMobile ? 4 : 6,
                fill: "#7CC0FF",
                stroke: "#1B3A5C",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#1B3A5C]">
            Review Volume Over Time
          </h3>
          <span className="rounded-full bg-[#C5A258]/15 px-2.5 py-1 text-xs font-medium text-[#8B6C29]">
            {granularityLabel(granularity)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 9 : 11 }}
              minTickGap={isMobile ? 18 : 24}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={false}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullLabel ?? ""
              }
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "Reviews"]}
            />
            <Bar
              dataKey="reviewCount"
              fill="#C5A258"
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
