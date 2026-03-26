"use client";

import { useEffect, useState, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import KpiCard from "@/components/dashboard/KpiCard";
import RatingDistributionChart from "@/components/dashboard/RatingDistributionChart";
import TrendChart from "@/components/dashboard/TrendChart";
import ThemeChart from "@/components/dashboard/ThemeChart";
import ReviewPanel from "@/components/dashboard/ReviewPanel";
import FleetComparisonTable from "@/components/dashboard/FleetComparisonTable";
import {
  getFleetSummary,
  getMonthlySummaries,
  getEntitySummaries,
  getReviewsByTheme,
  type FleetSummary,
  type MonthlySummary,
  type EntitySummary,
  type ThemeReview,
} from "@/lib/firestore/queries";

export default function OverviewPage() {
  const { brand } = useDashboard();

  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Review panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTheme, setPanelTheme] = useState("");
  const [panelType, setPanelType] = useState<"positive" | "negative">("positive");
  const [panelReviews, setPanelReviews] = useState<ThemeReview[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getFleetSummary(brand),
      getMonthlySummaries(brand),
      getEntitySummaries(brand),
    ]).then(([f, m, e]) => {
      if (cancelled) return;
      setFleet(f);
      setMonthly(m);
      setEntities(e);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [brand]);

  const openPanel = useCallback(
    async (theme: string, type: "positive" | "negative") => {
      setPanelTheme(theme);
      setPanelType(type);
      setPanelOpen(true);
      setPanelLoading(true);
      const reviews = await getReviewsByTheme(brand, theme, type);
      setPanelReviews(reviews);
      setPanelLoading(false);
    },
    [brand]
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelReviews([]);
  }, []);

  if (loading || !fleet) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
      </div>
    );
  }

  const reviewDelta = fleet.totalReviews - fleet.previousPeriodReviews;
  const ratingTrendUp = fleet.averageRating >= fleet.previousPeriodRating;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#1B3A5C]">Overview</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          title="Total Reviews"
          value={fleet.totalReviews.toLocaleString()}
          delta={`${reviewDelta >= 0 ? "+" : ""}${reviewDelta} vs last period`}
        />
        <KpiCard
          title="Average Rating"
          value={fleet.averageRating.toFixed(2)}
          trendUp={ratingTrendUp}
          delta={`${ratingTrendUp ? "+" : ""}${(fleet.averageRating - fleet.previousPeriodRating).toFixed(2)} vs last period`}
        />
        <KpiCard
          title="5-Star %"
          value={`${fleet.fiveStarPercent.toFixed(1)}%`}
        />
        <KpiCard
          title="4+ Star %"
          value={`${fleet.fourPlusPercent.toFixed(1)}%`}
        />
        <KpiCard
          title="Itineraries Reviewed"
          value={fleet.totalItineraries}
        />
        <KpiCard
          title="Ships Reviewed"
          value={fleet.totalShips}
        />
      </div>

      {/* Rating Distribution + Rating Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RatingDistributionChart data={fleet.ratingDistribution} />
      </div>

      {/* Trend Charts (rating + volume side by side) */}
      <TrendChart data={monthly} />

      {/* Theme Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThemeChart
          title="Top 10 Positive Themes"
          data={fleet.positiveThemes}
          type="positive"
          onBarClick={(theme) => openPanel(theme, "positive")}
        />
        <ThemeChart
          title="Top 10 Negative Themes"
          data={fleet.negativeThemes}
          type="negative"
          onBarClick={(theme) => openPanel(theme, "negative")}
        />
      </div>

      {/* Fleet Comparison Table */}
      <FleetComparisonTable data={entities} />

      {/* Review Slide-out Panel */}
      {panelOpen && (
        <ReviewPanel
          theme={panelTheme}
          type={panelType}
          reviews={panelReviews}
          loading={panelLoading}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
