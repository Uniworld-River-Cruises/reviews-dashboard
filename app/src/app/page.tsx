"use client";

import { useEffect, useState, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import KpiCard from "@/components/dashboard/KpiCard";
import RatingDistributionChart from "@/components/dashboard/RatingDistributionChart";
import TrendChart from "@/components/dashboard/TrendChart";
import ThemeChart from "@/components/dashboard/ThemeChart";
import ReviewPanel from "@/components/dashboard/ReviewPanel";
import FleetComparisonTable from "@/components/dashboard/FleetComparisonTable";
import {
  getFleetSummary,
  getFleetSummaryByDateRange,
  getTrendSeries,
  getEntitySummaries,
  getEntitySummariesByDateRange,
  getReviewsForOverviewSelection,
  type OverviewSelectionFilter,
  type FleetSummary,
  type EntitySummary,
  type ThemeReview,
  type TrendPoint,
  type TrendGranularity,
} from "@/lib/firestore/queries";

export default function OverviewPage() {
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dataVersion } = useDashboard();

  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("month");
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState("");
  const [panelSubtitle, setPanelSubtitle] = useState("");
  const [panelAccent, setPanelAccent] = useState<"positive" | "negative" | "neutral">("neutral");
  const [panelReviews, setPanelReviews] = useState<ThemeReview[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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
      getTrendSeries(brand, dateRange.start, dateRange.end),
      entityPromise,
    ]).then(([f, trend, e]) => {
      if (cancelled) return;

      setFleet(f);
      setTrendPoints(trend.points);
      setTrendGranularity(trend.granularity);
      setEntities(e);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;

      console.error("Failed to load overview data", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard data right now."
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [brand, dateRange, dataVersion]);

  const openPanel = useCallback(
    async (selection: {
      title: string;
      subtitle: string;
      accent: "positive" | "negative" | "neutral";
      filter: OverviewSelectionFilter;
    }) => {
      setPanelTitle(selection.title);
      setPanelSubtitle(selection.subtitle);
      setPanelAccent(selection.accent);
      setPanelOpen(true);
      setPanelReviews([]);
      setPanelLoading(true);
      try {
        const reviews = await getReviewsForOverviewSelection(
          brand,
          dateRange.start,
          dateRange.end,
          selection.filter
        );
        setPanelReviews(reviews);
      } catch (err) {
        console.error("Failed to load overview panel reviews", err);
        setPanelReviews([]);
      } finally {
        setPanelLoading(false);
      }
    },
    [brand, dateRange.end, dateRange.start]
  );

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

  if (!fleet) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-sm text-text-secondary">
        No overview data is available yet.
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
      <h1 className="text-2xl font-bold text-text-primary">Overview</h1>

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
      <RatingDistributionChart
        data={fleet.ratingDistribution}
        onBarClick={(star) =>
          openPanel({
            title: `${star} Star Reviews`,
            subtitle: `Reviews matching the ${star}-star rating selection`,
            accent: "neutral",
            filter: { kind: "rating", star },
          })
        }
      />

      {/* Trend Charts (rating + volume side by side) */}
      <TrendChart
        data={trendPoints}
        granularity={trendGranularity}
        onSelectPeriod={(period) =>
          openPanel({
            title: `Reviews from ${period.fullLabel}`,
            subtitle: `Reviews included in the selected ${trendGranularity} range`,
            accent: "neutral",
            filter: {
              kind: "period",
              start: period.periodStart,
              end: period.periodEnd,
              label: period.fullLabel,
            },
          })
        }
      />

      {/* Theme Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThemeChart
          title="Top 10 Positive Themes"
          data={fleet.positiveThemes}
          type="positive"
          onBarClick={(theme) =>
            openPanel({
              title: theme,
              subtitle: "Reviews matching the selected positive theme",
              accent: "positive",
              filter: { kind: "theme", theme, sentiment: "positive" },
            })
          }
        />
        <ThemeChart
          title="Top 10 Negative Themes"
          data={fleet.negativeThemes}
          type="negative"
          onBarClick={(theme) =>
            openPanel({
              title: theme,
              subtitle: "Reviews matching the selected negative theme",
              accent: "negative",
              filter: { kind: "theme", theme, sentiment: "negative" },
            })
          }
        />
      </div>

      {/* Fleet Comparison Table */}
      <FleetComparisonTable data={entities} />

      {/* Review Slide-out Panel */}
      {panelOpen && (
        <ReviewPanel
          title={panelTitle}
          subtitle={panelSubtitle}
          accent={panelAccent}
          reviews={panelReviews}
          loading={panelLoading}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
