"use client";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: string;
  trendUp?: boolean | null;
}

export default function KpiCard({ title, value, delta, trendUp }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-text-primary sm:text-4xl">{value}</p>
        {trendUp !== undefined && trendUp !== null && (
          <span
            className={`text-lg font-semibold ${
              trendUp ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {trendUp ? "↑" : "↓"}
          </span>
        )}
      </div>
      {delta && (
        <p className="mt-2 text-sm text-text-tertiary">{delta}</p>
      )}
    </div>
  );
}
