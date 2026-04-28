"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import KpiCard from "@/components/dashboard/KpiCard";
import RatingDistributionChart from "@/components/dashboard/RatingDistributionChart";
import ThemeChart from "@/components/dashboard/ThemeChart";
import ReviewPanel from "@/components/dashboard/ReviewPanel";
import QuotesSection from "@/components/dashboard/QuotesSection";
import type { Quote } from "@/components/dashboard/QuotesSection";
import { getReviewsByTheme } from "@/lib/firestore/queries";
import type { ThemeReview } from "@/lib/firestore/queries";
import {
  getItineraryBySlug,
  getItineraryQuotes,
  type ItinerarySummary,
} from "@/lib/firestore/itinerary-queries";

export default function ItineraryDetail({ slug }: { slug: string }) {
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dateField, dataVersion } = useDashboard();
  const [itinerary, setItinerary] = useState<ItinerarySummary | null>(null);
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
    getItineraryBySlug(slug, brand, dateRange, dateField).then(async (data) => {
      if (cancelled) return;
      setItinerary(data);
      if (data) {
        const q = await getItineraryQuotes(
          data.name,
          data.childItineraries,
          data.ships[0],
          brand,
          dateRange,
          dateField
        );
        if (!cancelled) setQuotes(q);
      }
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error("Failed to load itinerary detail", err);
      setError(err instanceof Error ? err.message : "Unable to load itinerary detail right now.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug, brand, dateRange, dateField, dataVersion]);

  const openPanel = useCallback(async (theme: string, type: "positive" | "negative") => {
    setPanelTheme(theme);
    setPanelType(type);
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const reviews = await getReviewsByTheme(brand, theme, type, dateField, dateRange.start, dateRange.end);
      setPanelReviews(reviews);
    } catch (err) {
      console.error("Failed to load theme reviews", err);
      setPanelReviews([]);
    } finally {
      setPanelLoading(false);
    }
  }, [brand, dateRange, dateField]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelReviews([]);
  }, []);

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

  if (!itinerary) {
    return (
      <div className="text-center py-24">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Itinerary Not Found</h1>
        <Link href="/itineraries" className="text-brand-accent hover:underline">Back to Itineraries</Link>
      </div>
    );
  }

  const ratingDelta = itinerary.averageRating - itinerary.fleetAvgRating;
  const fiveStarDelta = itinerary.fiveStarPercent - itinerary.fleetAvgFiveStar;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Link href="/itineraries" className="hover:text-text-primary">Itineraries</Link>
        <span>/</span>
        <span className="text-text-primary">{itinerary.name}</span>
      </div>
      <h1 className="text-2xl font-semibold text-text-primary">{itinerary.name}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Avg Rating" value={itinerary.averageRating.toFixed(2)} trendUp={ratingDelta >= 0} delta={`${ratingDelta >= 0 ? "+" : ""}${ratingDelta.toFixed(2)} vs fleet avg`} />
        <KpiCard title="Total Reviews" value={itinerary.reviewCount.toLocaleString()} />
        <KpiCard title="5-Star %" value={`${itinerary.fiveStarPercent.toFixed(1)}%`} trendUp={fiveStarDelta >= 0} delta={`${fiveStarDelta >= 0 ? "+" : ""}${fiveStarDelta.toFixed(1)}% vs fleet avg`} />
        <KpiCard title="4+ Star %" value={`${itinerary.fourPlusPercent.toFixed(1)}%`} />
      </div>
      <RatingDistributionChart data={itinerary.ratingDistribution} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThemeChart title="Positive Themes" data={itinerary.positiveThemes} type="positive" onBarClick={(theme) => openPanel(theme, "positive")} />
        <ThemeChart title="Negative Themes" data={itinerary.negativeThemes} type="negative" onBarClick={(theme) => openPanel(theme, "negative")} />
      </div>
      <div className="bg-surface rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Ships Operating This Itinerary</h3>
        <div className="flex flex-wrap gap-3">
          {itinerary.ships.map((ship) => (
            <Link key={ship} href={`/ships?slug=${encodeURIComponent(ship.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))}`} className="inline-flex items-center gap-2 bg-surface-alt rounded-lg px-4 py-3 hover:bg-surface-hover transition-colors">
              <svg className="h-5 w-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
              <span className="text-sm font-medium text-text-primary">{ship}</span>
            </Link>
          ))}
        </div>
      </div>
      <QuotesSection positiveQuotes={quotes.positive} negativeQuotes={quotes.negative} />
      {panelOpen && (
        <ReviewPanel
          title={panelTheme}
          subtitle={`Reviews matching the selected ${panelType} theme`}
          accent={panelType}
          reviews={panelReviews}
          loading={panelLoading}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
