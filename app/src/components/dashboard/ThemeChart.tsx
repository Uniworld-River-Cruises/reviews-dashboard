"use client";

import { useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ThemeChartProps {
  title: string;
  data: { theme: string; count: number }[];
  type: "positive" | "negative";
  onBarClick: (theme: string) => void;
}

/**
 * Generates a 10-step palette blending from colorA (darkest) to colorB (lightest).
 * Used to give each bar a distinct shade while staying on-brand.
 */
function buildPalette(colorA: string, colorB: string, steps = 10): string[] {
  // We do the blend in CSS so we don't need hex parsing in JS.
  // Use color-mix where supported, fall back to a static default.
  return Array.from({ length: steps }, (_, i) => {
    const pct = Math.round((i / (steps - 1)) * 60); // 0% → 60% blend
    // color-mix is available in all modern browsers and Safari 16.2+.
    return `color-mix(in srgb, ${colorB} ${pct}%, ${colorA})`;
  });
}

// Negative sentiment: fixed warm-red palette (these are semantic, not branded).
const NEGATIVE_COLORS = [
  "#ef4444", "#f05252", "#f16060", "#f27070", "#e8913a",
  "#eba04e", "#edaf62", "#f0be76", "#f2cd8a", "#f5dc9e",
];

function useIsMobile(breakpoint = 640) {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      const handler = () => callback();
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    },
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
    () => false,
  );
}

export default function ThemeChart({
  title,
  data,
  type,
  onBarClick,
}: ThemeChartProps) {
  const isMobile = useIsMobile();
  const {
    primary,
    accentLight,
    tooltipStyle,
    tooltipLabelStyle,
    tooltipItemStyle,
    axisTickFill,
  } = useThemeColors();

  const positiveColors = buildPalette(primary, accentLight);
  const colors = type === "positive" ? positiveColors : NEGATIVE_COLORS;

  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={isMobile ? 280 : 360}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: axisTickFill }}
          />
          <YAxis
            type="category"
            dataKey="theme"
            width={isMobile ? 100 : 160}
            tick={{ fontSize: isMobile ? 10 : 11, fill: axisTickFill }}
          />
          <Tooltip
            cursor={false}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
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
