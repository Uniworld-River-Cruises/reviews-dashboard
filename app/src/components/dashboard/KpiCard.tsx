"use client";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: string;
  trendUp?: boolean | null;
}

export default function KpiCard({ title, value, delta, trendUp }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl sm:text-3xl font-semibold text-[#1B3A5C]">{value}</p>
        {trendUp !== undefined && trendUp !== null && (
          <span className={trendUp ? "text-green-500" : "text-red-500"}>
            {trendUp ? "\u2191" : "\u2193"}
          </span>
        )}
      </div>
      {delta && (
        <p className="mt-1 text-sm text-gray-400">{delta}</p>
      )}
    </div>
  );
}
