"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import SearchFilter from "@/components/dashboard/SearchFilter";
import HealthBadge from "@/components/dashboard/HealthBadge";
import ItineraryDetail from "@/components/itineraries/ItineraryDetail";
import { getItineraries, type ItinerarySummary } from "@/lib/firestore/itinerary-queries";

type SortOption = "rating" | "reviewCount" | "name";
type ViewMode = "cards" | "table";

export default function ItinerariesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
        </div>
      }
    >
      <ItinerariesContent />
    </Suspense>
  );
}

function ItinerariesContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");

  if (slug) {
    return <ItineraryDetail slug={slug} />;
  }

  return <ItineraryList />;
}

function ItineraryList() {
  const { brand, dataVersion } = useDashboard();
  const [itineraries, setItineraries] = useState<ItinerarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("reviewCount");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  useEffect(() => {
    setLoading(true);
    setError(null);
    getItineraries(brand).then((data) => {
      setItineraries(data);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load itineraries", err);
      setError(err instanceof Error ? err.message : "Unable to load itineraries right now.");
      setLoading(false);
    });
  }, [brand, dataVersion]);

  const filtered = useMemo(() => {
    const result = itineraries.filter((it) =>
      it.name.toLowerCase().includes(search.toLowerCase())
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
  }, [itineraries, search, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#1B3A5C]">Itineraries</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SearchFilter value={search} onChange={setSearch} placeholder="Search itineraries..." />
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
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
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-2 transition-colors ${viewMode === "cards" ? "bg-[#1B3A5C] text-white" : "bg-white text-gray-400 hover:text-gray-600"}`}
              title="Card view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 transition-colors ${viewMode === "table" ? "bg-[#1B3A5C] text-white" : "bg-white text-gray-400 hover:text-gray-600"}`}
              title="Table view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {viewMode === "cards" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((it) => (
              <Link
                key={it.slug}
                href={`/itineraries?slug=${encodeURIComponent(it.slug)}`}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-base font-semibold text-[#1B3A5C] mb-2">{it.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{it.ships.join(", ")}</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-400">Avg Rating</p>
                    <p className="text-lg font-semibold text-[#1B3A5C]">{it.averageRating.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Reviews</p>
                    <p className="text-lg font-semibold text-[#1B3A5C]">{it.reviewCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">5-Star %</p>
                    <p className="text-lg font-semibold text-[#1B3A5C]">{it.fiveStarPercent.toFixed(1)}%</p>
                  </div>
                </div>
                <HealthBadge rating={it.averageRating} />
              </Link>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-12">No itineraries match your search.</p>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-3 pt-1 pr-6 font-medium text-gray-500 text-left whitespace-nowrap">Name</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-gray-500 text-right whitespace-nowrap">Avg Rating</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-gray-500 text-right whitespace-nowrap">Reviews</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-gray-500 text-right whitespace-nowrap">5-Star %</th>
                  <th className="pb-3 pt-1 pl-6 font-medium text-gray-500 text-left whitespace-nowrap">Ship(s)</th>
                  <th className="pb-3 pt-1 pl-6 font-medium text-gray-500 text-right whitespace-nowrap">Health</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.slug} className="border-b border-gray-100 hover:bg-[#1B3A5C]/5 transition-colors group">
                    <td className="py-3 pr-6 w-[40%]">
                      <Link href={`/itineraries?slug=${encodeURIComponent(it.slug)}`} className="font-medium text-[#1B3A5C] group-hover:underline">
                        {it.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.averageRating.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.reviewCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.fiveStarPercent.toFixed(1)}%</td>
                    <td className="py-3 pl-6 pr-4 text-gray-600">{it.ships.join(", ")}</td>
                    <td className="py-3 pl-6 text-right">
                      <HealthBadge rating={it.averageRating} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
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
      )}
    </div>
  );
}
