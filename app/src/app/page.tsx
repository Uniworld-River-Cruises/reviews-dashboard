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
  getFleetSummaryByDateRange,
  getMonthlySummaries,
  getEntitySummaries,
  getEntitySummariesByDateRange,
  getReviewsByTheme,
  type FleetSummary,
  type MonthlySummary,
  type EntitySummary,
  type ThemeReview,
} from "@/lib/firestore/queries";

export default function OverviewPage() {
  const { brand, dateRange } = useDashboard();

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

    // Use date-filtered query for KPIs so numbers change with the date picker
    const isAllTime = dateRange.preset === "All Time";
    const fleetPromise = isAllTime
      ? getFleetSummary(brand)
      : getFleetSummaryByDateRange(brand, dateRange.start, dateRange.end);

    const entityPromise = isAllTime
      ? getEntitySummaries(brand)
      : getEntitySummariesByDateRange(brand, dateRange.start, dateRange.end);

    Promise.all([
      fleetPromise,
      getMonthlySummaries(brand),
      entityPromise,
    ]).then(([f, m, e]) => {
      if (cancelled) return;

      // Filter monthly summaries by date range
      const startMonth = `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth() + 1).padStart(2, "0")}`;
      const endMonth = `${dateRange.end.getFullYear()}-${String(dateRange.end.getMonth() + 1).padStart(2, "0")}`;
      const filteredMonthly = m.filter((ms) => ms.month >= startMonth && ms.month <= endMonth);

      setFleet(f);
      setMonthly(filteredMonthly);
      setEntities(e);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [brand, dateRange]);

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

  // Only show comparison deltas if there is meaningful previous period data
  const hasPreviousPeriod = fleet.previousPeriodReviews > 0;
  const reviewDelta = fleet.totalReviews - fleet.previousPeriodReviews;
  const ratingDiff = fleet.averageRating - fleet.previousPeriodRating;
  const ratingTrendUp = fleet.averageRating >= fleet.previousPeriodRating;

  // Derive ships count from entities if the fleet-level count is 0
  const shipsCount =
    fleet.totalShips > 0
      ? fleet.totalShips
      : new Set(entities.flatMap((e) => e.ships)).size;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[#1B3A5C]">Overview</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <KpiCard
          title="Total Reviews"
          value={fleet.totalReviews.toLocaleString()}
          delta={
            hasPreviousPeriod
              ? `${reviewDelta >= 0 ? "+" : ""}${reviewDelta.toLocaleString()} vs last period`
              : undefined
          }
        />
        <KpiCard
          title="Average Rating"
          value={fleet.averageRating.toFixed(2)}
          trendUp={hasPreviousPeriod ? ratingTrendUp : null}
          delta={
            hasPreviousPeriod
              ? `${ratingTrendUp ? "+" : ""}${ratingDiff.toFixed(2)} vs last period`
              : undefined
          }
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
          value={shipsCount}
        />
      </div>

      {/* Rating Distribution — full width */}
      <RatingDistributionChart data={fleet.ratingDistribution} />

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
