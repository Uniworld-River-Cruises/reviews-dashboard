"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import SearchFilter from "@/components/dashboard/SearchFilter";
import HealthBadge from "@/components/dashboard/HealthBadge";
import ShipDetail from "@/components/ships/ShipDetail";
import { getShips, type ShipSummary } from "@/lib/firestore/ship-queries";

type SortOption = "rating" | "reviewCount" | "name";

export default function ShipsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
        </div>
      }
    >
      <ShipsContent />
    </Suspense>
  );
}

function ShipsContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");

  if (slug) {
    return <ShipDetail slug={slug} />;
  }

  return <ShipList />;
}

function ShipList() {
  const { brand } = useDashboard();
  const [ships, setShips] = useState<ShipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("reviewCount");

  useEffect(() => {
    setLoading(true);
    getShips(brand).then((data) => {
      setShips(data);
      setLoading(false);
    });
  }, [brand]);

  const filtered = useMemo(() => {
    const result = ships.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase())
    );
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return b.averageRating - a.averageRating;
        case "reviewCount":
          return b.reviewCount - a.reviewCount;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [ships, search, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#1B3A5C]">Ships</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SearchFilter value={search} onChange={setSearch} placeholder="Search ships..." />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-gray-500">Sort by:</label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
          >
            <option value="rating">Rating</option>
            <option value="reviewCount">Review Count</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ship) => (
          <Link
            key={ship.slug}
            href={`/ships?slug=${encodeURIComponent(ship.slug)}`}
            className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
          >
            <h3 className="text-base font-semibold text-[#1B3A5C] mb-2">{ship.name}</h3>
            <p className="text-xs text-gray-500 mb-4">
              {ship.itineraryCount} itinerar{ship.itineraryCount === 1 ? "y" : "ies"}
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-400">Avg Rating</p>
                <p className="text-lg font-semibold text-[#1B3A5C]">{ship.averageRating.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Reviews</p>
                <p className="text-lg font-semibold text-[#1B3A5C]">{ship.reviewCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">5-Star %</p>
                <p className="text-lg font-semibold text-[#1B3A5C]">{ship.fiveStarPercent.toFixed(1)}%</p>
              </div>
            </div>
            <HealthBadge rating={ship.averageRating} />
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-400 py-12">No ships match your search.</p>
      )}
    </div>
  );
}
