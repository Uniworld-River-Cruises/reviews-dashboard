"use client";

import { useState, useEffect } from "react";
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
import { format, parseISO } from "date-fns";

interface TrendChartProps {
  data: { month: string; averageRating: number; reviewCount: number }[];
  onSelectMonth?: (month: string) => void;
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

function formatMonth(month: string): string {
  try {
    return format(parseISO(`${month}-01`), "MMM yy");
  } catch {
    return month;
  }
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function TrendChart({ data, onSelectMonth }: TrendChartProps) {
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 200 : 260;
  const chartData = data.map((d) => ({
    ...d,
    label: formatMonth(d.month),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Rating Trend */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">
          Rating Trend Over Time
        </h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11 }} />
            <YAxis domain={[4.0, 5.0]} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "#36506f", strokeWidth: 1, strokeDasharray: "3 3" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [Number(value).toFixed(2), "Avg Rating"]}
            />
            <Line
              type="monotone"
              dataKey="averageRating"
              stroke="#1B3A5C"
              strokeWidth={2}
              dot={(dotProps) => (
                <circle
                  cx={dotProps.cx}
                  cy={dotProps.cy}
                  r={isMobile ? 3 : 4}
                  fill="#1B3A5C"
                  className={onSelectMonth ? "cursor-pointer" : undefined}
                  onClick={() => {
                    if (onSelectMonth && typeof dotProps.payload?.month === "string") {
                      onSelectMonth(dotProps.payload.month);
                    }
                  }}
                />
              )}
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

      {/* Volume Trend */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">
          Review Volume Over Time
        </h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={false}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [Number(value).toLocaleString(), "Reviews"]}
            />
            <Bar
              dataKey="reviewCount"
              fill="#C5A258"
              radius={[4, 4, 0, 0]}
              cursor={onSelectMonth ? "pointer" : "default"}
              activeBar={false}
              onClick={(_, index) => {
                if (onSelectMonth && index >= 0 && chartData[index]) {
                  onSelectMonth(chartData[index].month);
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
