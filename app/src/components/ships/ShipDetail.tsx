"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import KpiCard from "@/components/dashboard/KpiCard";
import HealthBadge from "@/components/dashboard/HealthBadge";
import RatingDistributionChart from "@/components/dashboard/RatingDistributionChart";
import ThemeChart from "@/components/dashboard/ThemeChart";
import ReviewPanel from "@/components/dashboard/ReviewPanel";
import QuotesSection from "@/components/dashboard/QuotesSection";
import type { Quote } from "@/components/dashboard/QuotesSection";
import { getReviewsByTheme } from "@/lib/firestore/queries";
import type { ThemeReview } from "@/lib/firestore/queries";
import {
  getShipBySlug,
  getShipQuotes,
  type ShipSummary,
} from "@/lib/firestore/ship-queries";

export default function ShipDetail({ slug }: { slug: string }) {
  const { brand, dataVersion } = useDashboard();
  const [ship, setShip] = useState<ShipSummary | null>(null);
  const [quotes, setQuotes] = useState<{ positive: Quote[]; negative: Quote[] }>({
    positive: [],
    negative: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTheme, setPanelTheme] = useState("");
  const [panelType, setPanelType] = useState<"positive" | "negative">("positive");
  const [panelReviews, setPanelReviews] = useState<ThemeReview[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getShipBySlug(slug, brand).then(async (data) => {
      if (cancelled) return;
      setShip(data);
      if (data) {
        const q = await getShipQuotes(data.name, brand);
        if (!cancelled) setQuotes(q);
      }
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error("Failed to load ship detail", err);
      setError(err instanceof Error ? err.message : "Unable to load ship detail right now.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug, brand, dataVersion]);

  const openPanel = useCallback(async (theme: string, type: "positive" | "negative") => {
    setPanelTheme(theme);
    setPanelType(type);
    setPanelOpen(true);
    setPanelLoading(true);
    const reviews = await getReviewsByTheme(brand, theme, type);
    setPanelReviews(reviews);
    setPanelLoading(false);
  }, [brand]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelReviews([]);
  }, []);

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

  if (!ship) {
    return (
      <div className="text-center py-24">
        <h1 className="text-2xl font-semibold text-[#1B3A5C] mb-4">Ship Not Found</h1>
        <Link href="/ships" className="text-[#C5A258] hover:underline">Back to Ships</Link>
      </div>
    );
  }

  const ratingDelta = ship.averageRating - ship.fleetAvgRating;
  const fiveStarDelta = ship.fiveStarPercent - ship.fleetAvgFiveStar;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/ships" className="hover:text-[#1B3A5C]">Ships</Link>
        <span>/</span>
        <span className="text-[#1B3A5C]">{ship.name}</span>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B3A5C]">{ship.name}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Avg Rating" value={ship.averageRating.toFixed(2)} trendUp={ratingDelta >= 0} delta={`${ratingDelta >= 0 ? "+" : ""}${ratingDelta.toFixed(2)} vs fleet avg`} />
        <KpiCard title="Total Reviews" value={ship.reviewCount.toLocaleString()} />
        <KpiCard title="5-Star %" value={`${ship.fiveStarPercent.toFixed(1)}%`} trendUp={fiveStarDelta >= 0} delta={`${fiveStarDelta >= 0 ? "+" : ""}${fiveStarDelta.toFixed(1)}% vs fleet avg`} />
        <KpiCard title="4+ Star %" value={`${ship.fourPlusPercent.toFixed(1)}%`} />
      </div>
      <RatingDistributionChart data={ship.ratingDistribution} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThemeChart title="Positive Themes" data={ship.positiveThemes} type="positive" onBarClick={(theme) => openPanel(theme, "positive")} />
        <ThemeChart title="Negative Themes" data={ship.negativeThemes} type="negative" onBarClick={(theme) => openPanel(theme, "negative")} />
      </div>
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">Itineraries on This Ship</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ship.itineraries.map((it) => (
            <Link key={it.slug} href={`/itineraries?slug=${encodeURIComponent(it.slug)}`} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
              <h4 className="text-sm font-semibold text-[#1B3A5C] mb-3">{it.name}</h4>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><p className="text-xs text-gray-400">Rating</p><p className="text-sm font-semibold text-[#1B3A5C]">{it.averageRating.toFixed(2)}</p></div>
                <div><p className="text-xs text-gray-400">Reviews</p><p className="text-sm font-semibold text-[#1B3A5C]">{it.reviewCount}</p></div>
                <div><p className="text-xs text-gray-400">5-Star</p><p className="text-sm font-semibold text-[#1B3A5C]">{it.fiveStarPercent.toFixed(1)}%</p></div>
              </div>
              <HealthBadge rating={it.averageRating} />
            </Link>
          ))}
        </div>
      </div>
      <QuotesSection positiveQuotes={quotes.positive} negativeQuotes={quotes.negative} />
      {panelOpen && <ReviewPanel theme={panelTheme} type={panelType} reviews={panelReviews} loading={panelLoading} onClose={closePanel} />}
    </div>
  );
}
