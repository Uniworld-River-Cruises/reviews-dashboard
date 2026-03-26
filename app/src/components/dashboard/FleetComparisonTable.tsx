"use client";

import { useState, useMemo } from "react";
import HealthBadge from "./HealthBadge";
import type { EntitySummary } from "@/lib/firestore/queries";

interface FleetComparisonTableProps {
  data: EntitySummary[];
}

type SortKey = "name" | "averageRating" | "reviewCount" | "fiveStarPercent";
type SortDir = "asc" | "desc";

export default function FleetComparisonTable({ data }: FleetComparisonTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("averageRating");
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
      e.name.toLowerCase().includes(search.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, search, sortKey, sortDir]);

  const SortIndicator = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">{"\u2195"}</span>;
    return <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  const columns: { key: SortKey; label: string; align?: string }[] = [
    { key: "name", label: "Name" },
    { key: "averageRating", label: "Avg Rating", align: "text-right" },
    { key: "reviewCount", label: "Reviews", align: "text-right" },
    { key: "fiveStarPercent", label: "5-Star %", align: "text-right" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-[#1B3A5C]">Fleet Comparison</h3>
        <input
          type="text"
          placeholder="Search itineraries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30 w-full sm:w-64"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`pb-3 pt-1 font-medium text-gray-500 cursor-pointer select-none ${col.align ?? "text-left"}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIndicator col={col.key} />
                </th>
              ))}
              <th className="pb-3 pt-1 font-medium text-gray-500 text-left">Ship(s)</th>
              <th className="pb-3 pt-1 font-medium text-gray-500 text-center">Health</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entity) => (
              <tr
                key={entity.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="py-3 pr-4 font-medium text-[#1B3A5C]">{entity.name}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{entity.averageRating.toFixed(2)}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{entity.reviewCount.toLocaleString()}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{entity.fiveStarPercent.toFixed(1)}%</td>
                <td className="py-3 pr-4 text-gray-600">{entity.ships.join(", ")}</td>
                <td className="py-3 text-center">
                  <HealthBadge rating={entity.averageRating} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
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
