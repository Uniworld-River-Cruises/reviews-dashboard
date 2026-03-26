"use client";

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
}

function formatMonth(month: string): string {
  try {
    return format(parseISO(`${month}-01`), "MMM yy");
  } catch {
    return month;
  }
}

export default function TrendChart({ data }: TrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatMonth(d.month),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Rating Trend */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">
          Rating Trend Over Time
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[4.0, 5.0]} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(2), "Avg Rating"]}
            />
            <Line
              type="monotone"
              dataKey="averageRating"
              stroke="#1B3A5C"
              strokeWidth={2}
              dot={{ r: 4, fill: "#1B3A5C" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Volume Trend */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">
          Review Volume Over Time
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString(), "Reviews"]}
            />
            <Bar dataKey="reviewCount" fill="#C5A258" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
