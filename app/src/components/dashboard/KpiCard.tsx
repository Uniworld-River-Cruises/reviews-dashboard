"use client";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: string;
  trendUp?: boolean | null;
}

export default function KpiCard({ title, value, delta, trendUp }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl sm:text-4xl font-bold text-[#1B3A5C]">{value}</p>
        {trendUp !== undefined && trendUp !== null && (
          <span className={`text-lg font-semibold ${trendUp ? "text-emerald-500" : "text-red-500"}`}>
            {trendUp ? "\u2191" : "\u2193"}
          </span>
        )}
      </div>
      {delta && (
        <p className="mt-2 text-sm text-gray-400">{delta}</p>
      )}
    </div>
  );
}
