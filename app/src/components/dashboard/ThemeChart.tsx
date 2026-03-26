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

interface ThemeChartProps {
  title: string;
  data: { theme: string; count: number }[];
  type: "positive" | "negative";
  onBarClick: (theme: string) => void;
}

const POSITIVE_COLORS = [
  "#1B3A5C", "#1e4a73", "#22578a", "#2d6aa0", "#3b82f6",
  "#4a8ed9", "#5c9be0", "#71a9e6", "#8ab8ec", "#a3c7f2",
];

const NEGATIVE_COLORS = [
  "#ef4444", "#f05252", "#f16060", "#f27070", "#e8913a",
  "#eba04e", "#edaf62", "#f0be76", "#f2cd8a", "#f5dc9e",
];

export default function ThemeChart({ title, data, type, onBarClick }: ThemeChartProps) {
  const colors = type === "positive" ? POSITIVE_COLORS : NEGATIVE_COLORS;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 20, right: 20, top: 0, bottom: 0 }}
        >
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="theme"
            width={160}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), "Reviews"]}
          />
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
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
