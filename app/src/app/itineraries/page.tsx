"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import { usePersistedState } from "@/hooks/usePersistedState";
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
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
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
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dataVersion } = useDashboard();
  const [itineraries, setItineraries] = useState<ItinerarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = usePersistedState<SortOption>("pref:itineraries:sort", "reviewCount");
  const [viewMode, setViewMode] = usePersistedState<ViewMode>("pref:listViewMode", "cards");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    getItineraries(brand, dateRange).then((data) => {
      if (cancelled) return;
      setItineraries(data);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error("Failed to load itineraries", err);
      setError(err instanceof Error ? err.message : "Unable to load itineraries right now.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [brand, dateRange, dataVersion]);

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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
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
      <h1 className="text-2xl font-semibold text-text-primary">Itineraries</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SearchFilter value={search} onChange={setSearch} placeholder="Search itineraries..." />
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm text-text-secondary">Sort by:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="border border-input-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            >
              <option value="rating">Rating</option>
              <option value="reviewCount">Review Count</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="flex rounded-lg border border-input-border overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-2 transition-colors ${viewMode === "cards" ? "bg-header-bg text-header-text" : "bg-surface text-text-tertiary hover:text-text-secondary"}`}
              title="Card view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 transition-colors ${viewMode === "table" ? "bg-header-bg text-header-text" : "bg-surface text-text-tertiary hover:text-text-secondary"}`}
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
                className="bg-surface rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-base font-semibold text-text-primary mb-2">{it.name}</h3>
                <p className="text-xs text-text-secondary mb-4">{it.ships.join(", ")}</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-text-tertiary">Avg Rating</p>
                    <p className="text-lg font-semibold text-text-primary">{it.averageRating.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">Reviews</p>
                    <p className="text-lg font-semibold text-text-primary">{it.reviewCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">5-Star %</p>
                    <p className="text-lg font-semibold text-text-primary">{it.fiveStarPercent.toFixed(1)}%</p>
                  </div>
                </div>
                <HealthBadge rating={it.averageRating} />
              </Link>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-center text-text-tertiary py-12">No itineraries match your search.</p>
          )}
        </>
      ) : (
        <div className="bg-surface rounded-lg shadow-sm p-4 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 pt-1 pr-6 font-medium text-text-secondary text-left whitespace-nowrap">Name</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-text-secondary text-right whitespace-nowrap">Avg Rating</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-text-secondary text-right whitespace-nowrap">Reviews</th>
                  <th className="pb-3 pt-1 px-4 font-medium text-text-secondary text-right whitespace-nowrap">5-Star %</th>
                  <th className="pb-3 pt-1 pl-6 font-medium text-text-secondary text-left whitespace-nowrap">Ship(s)</th>
                  <th className="pb-3 pt-1 pl-6 font-medium text-text-secondary text-right whitespace-nowrap">Health</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.slug} className="border-b border-border-light hover:bg-brand-primary-hover transition-colors group">
                    <td className="py-3 pr-6 w-[40%]">
                      <Link href={`/itineraries?slug=${encodeURIComponent(it.slug)}`} className="font-medium text-text-primary group-hover:underline">
                        {it.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.averageRating.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.reviewCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">{it.fiveStarPercent.toFixed(1)}%</td>
                    <td className="py-3 pl-6 pr-4 text-text-secondary">{it.ships.join(", ")}</td>
                    <td className="py-3 pl-6 text-right">
                      <HealthBadge rating={it.averageRating} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text-tertiary">
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
