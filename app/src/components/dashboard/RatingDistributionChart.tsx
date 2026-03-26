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

interface RatingDistributionChartProps {
  data: { star: number; count: number }[];
}

const STAR_COLORS: Record<number, string> = {
  5: "#1B3A5C",
  4: "#2d5a8c",
  3: "#C5A258",
  2: "#e8913a",
  1: "#ef4444",
};

export default function RatingDistributionChart({ data }: RatingDistributionChartProps) {
  const chartData = [...data].sort((a, b) => b.star - a.star).map((d) => ({
    label: `${d.star} Star`,
    count: d.count,
    star: d.star,
  }));

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">Rating Distribution</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={60} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), "Reviews"]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={`cell-${entry.star}`} fill={STAR_COLORS[entry.star]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
