"use client";

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

interface RatingDistributionChartProps {
  data: { star: number; count: number }[];
  onBarClick?: (star: number) => void;
}

/**
 * Star rating colours are intentionally semantic (not brand-specific):
 *   5★ → brand primary  (top score = brand colour)
 *   4★ → brand accent   (good score = warm accent)
 *   3★ → amber          (mid score = neutral warning)
 *   2★ → orange         (below-par = warm warning)
 *   1★ → red            (poor = danger)
 *
 * Only the 5-star bar uses the brand token; the rest are semantic.
 */
function buildStarColors(primary: string, accent: string): Record<number, string> {
  return {
    5: primary,
    4: accent,
    3: "#eab308",  // amber-500
    2: "#e8913a",  // orange
    1: "#ef4444",  // red-500
  };
}

export default function RatingDistributionChart({
  data,
  onBarClick,
}: RatingDistributionChartProps) {
  const {
    primary,
    accent,
    tooltipStyle,
    tooltipLabelStyle,
    tooltipItemStyle,
    axisTickFill,
  } = useThemeColors();

  const starColors = buildStarColors(primary, accent);

  const chartData = [...data]
    .sort((a, b) => b.star - a.star)
    .map((d) => ({ label: `${d.star} Star`, count: d.count, star: d.star }));

  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">
        Rating Distribution
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 10, right: 20, top: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: axisTickFill }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={60}
            tick={{ fontSize: 12, fill: axisTickFill }}
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
            cursor={onBarClick ? "pointer" : "default"}
            activeBar={false}
            onClick={(_, index) => {
              if (index >= 0 && chartData[index]) {
                onBarClick?.(chartData[index].star);
              }
            }}
          >
            {chartData.map((entry) => (
              <Cell
                key={`cell-${entry.star}`}
                fill={starColors[entry.star]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
