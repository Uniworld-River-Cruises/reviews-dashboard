"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ThemeChartProps {
  title: string;
  data: { theme: string; count: number }[];
  type: "positive" | "negative";
  onBarClick: (theme: string) => void;
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

const POSITIVE_COLORS = [
  "#1B3A5C", "#1e4a73", "#22578a", "#2d6aa0", "#3b82f6",
  "#4a8ed9", "#5c9be0", "#71a9e6", "#8ab8ec", "#a3c7f2",
];

const NEGATIVE_COLORS = [
  "#ef4444", "#f05252", "#f16060", "#f27070", "#e8913a",
  "#eba04e", "#edaf62", "#f0be76", "#f2cd8a", "#f5dc9e",
];

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function ThemeChart({ title, data, type, onBarClick }: ThemeChartProps) {
  const colors = type === "positive" ? POSITIVE_COLORS : NEGATIVE_COLORS;
  const isMobile = useIsMobile();

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={isMobile ? 280 : 360}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
        >
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="theme"
            width={isMobile ? 100 : 160}
            tick={{ fontSize: isMobile ? 10 : 11 }}
          />
          <Tooltip
            cursor={false}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [Number(value).toLocaleString(), "Reviews"]}
          />
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            activeBar={false}
            onClick={(_, index) => {
              if (index >= 0 && data[index]) onBarClick(data[index].theme);
            }}
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
