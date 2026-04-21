"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import HealthBadge from "./HealthBadge";
import type { EntitySummary } from "@/lib/firestore/queries";

interface FleetComparisonTableProps {
  data: EntitySummary[];
}

type SortKey = "name" | "averageRating" | "reviewCount" | "fiveStarPercent";
type SortDir = "asc" | "desc";

export default function FleetComparisonTable({
  data,
}: FleetComparisonTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reviewCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = data.filter((e) =>
      e.name.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, search, sortKey, sortDir]);

  const SortIndicator = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <span className="ml-1 text-text-tertiary">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const columns: { key: SortKey; label: string; align?: string }[] = [
    { key: "name", label: "Name" },
    { key: "averageRating", label: "Avg Rating", align: "text-right" },
    { key: "reviewCount", label: "Reviews", align: "text-right" },
    { key: "fiveStarPercent", label: "5-Star %", align: "text-right" },
  ];

  const thClass = (col: (typeof columns)[number]) =>
    `pb-3 pt-1 font-medium text-text-secondary cursor-pointer select-none whitespace-nowrap ${
      col.key === "name" ? "pr-6 text-left" : "px-4"
    } ${col.align ?? "text-left"}`;

  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          Itinerary Comparison
        </h3>
        <input
          type="text"
          placeholder="Search itineraries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 sm:w-64"
          style={{ "--tw-ring-color": "var(--brand-accent)" } as React.CSSProperties}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={thClass(col)}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIndicator col={col.key} />
                </th>
              ))}
              <th className="pb-3 pl-6 pt-1 text-left font-medium text-text-secondary whitespace-nowrap">
                Ship(s)
              </th>
              <th className="pb-3 pl-6 pt-1 text-right font-medium text-text-secondary whitespace-nowrap">
                Health
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entity) => (
              <tr
                key={entity.id}
                className="group cursor-pointer border-b border-border transition-colors hover:bg-brand-primary-hover"
              >
                <td className="w-[40%] py-3 pr-6">
                  <Link
                    href={`/itineraries?slug=${encodeURIComponent(entity.id)}`}
                    className="font-medium text-text-primary group-hover:underline"
                  >
                    {entity.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-text-primary">
                  {entity.averageRating.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-text-primary">
                  {entity.reviewCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-text-primary">
                  {entity.fiveStarPercent.toFixed(1)}%
                </td>
                <td className="py-3 pl-6 pr-4 text-text-secondary">
                  {entity.ships.join(", ")}
                </td>
                <td className="py-3 pl-6 text-right">
                  <HealthBadge rating={entity.averageRating} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-text-tertiary"
                >
                  No itineraries match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
