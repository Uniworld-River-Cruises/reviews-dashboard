"use client";

import { getClientDb } from "@/lib/firebase";
import type { DateRange } from "@/contexts/DashboardContext";
import { getFleetSummaryByDateRange } from "@/lib/firestore/queries";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import type { Quote } from "@/components/dashboard/QuotesSection";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ShipItinerary {
  slug: string;
  name: string;
  averageRating: number;
  reviewCount: number;
  fiveStarPercent: number;
}

export interface ShipSummary {
  slug: string;
  name: string;
  averageRating: number;
  reviewCount: number;
  fiveStarPercent: number;
  fourPlusPercent: number;
  itineraryCount: number;
  itineraries: ShipItinerary[];
  ratingDistribution: { star: number; count: number }[];
  positiveThemes: { theme: string; count: number }[];
  negativeThemes: { theme: string; count: number }[];
  fleetAvgRating: number;
  fleetAvgFiveStar: number;
}

type SummaryDateRange = Pick<DateRange, "start" | "end" | "preset">;

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function usesAllTimeSummaries(dateRange?: SummaryDateRange): boolean {
  return !dateRange || dateRange.preset === "All Time";
}

function getReviewRating(data: Record<string, unknown>): number {
  const ratings = data.ratings as { product?: number; service?: number } | undefined;
  const fallback = typeof data.rating === "number" ? data.rating : 0;
  return ratings?.product ?? ratings?.service ?? fallback;
}

function buildDateRangeConstraints(
  brand: string,
  startDate: Date,
  endDate: Date
) {
  const constraints = [
    where("dates.created", ">=", startDate.toISOString()),
    where("dates.created", "<=", endDate.toISOString()),
    orderBy("dates.created", "desc"),
  ];

  if (brand !== "combined") {
    constraints.unshift(where("brand", "==", brand));
  }

  return constraints;
}

async function getParentNameLookup(brand: string): Promise<Map<string, string>> {
  const db = getClientDb();
  const ref = collection(db, "itinerary_mappings");
  const constraints = brand === "combined" ? [] : [where("brand", "==", brand)];
  const snap = await getDocs(query(ref, ...constraints));
  const lookup = new Map<string, string>();

  for (const d of snap.docs) {
    const mapping = d.data();
    if (mapping.rawName && mapping.effectiveParentName) {
      lookup.set(mapping.rawName, mapping.effectiveParentName);
    }
  }

  return lookup;
}

async function getShipsByDateRange(
  brand: string,
  dateRange: SummaryDateRange
): Promise<ShipSummary[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const [snap, parentLookup, fleet] = await Promise.all([
    getDocs(query(ref, ...buildDateRangeConstraints(brand, dateRange.start, dateRange.end))),
    getParentNameLookup(brand),
    getFleetSummaryByDateRange(brand, dateRange.start, dateRange.end),
  ]);

  if (snap.empty) return [];

  const byShip: Record<string, {
    totalReviews: number;
    ratingSum: number;
    starDist: Record<string, number>;
    positiveCounts: Record<string, number>;
    negativeCounts: Record<string, number>;
    itineraries: Record<string, { totalReviews: number; ratingSum: number; fiveStar: number }>;
  }> = {};

  for (const d of snap.docs) {
    const data = d.data();
    const shipName = data.tags?.ship || "";
    if (!shipName) continue;

    if (!byShip[shipName]) {
      byShip[shipName] = {
        totalReviews: 0,
        ratingSum: 0,
        starDist: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        positiveCounts: {},
        negativeCounts: {},
        itineraries: {},
      };
    }

    const agg = byShip[shipName];
    const rating = getReviewRating(data);
    const roundedRating = Math.min(5, Math.max(1, Math.round(rating)));

    agg.totalReviews += 1;
    agg.ratingSum += rating;
    agg.starDist[String(roundedRating)] = (agg.starDist[String(roundedRating)] || 0) + 1;

    for (const theme of data.themes?.positive || []) {
      agg.positiveCounts[theme] = (agg.positiveCounts[theme] || 0) + 1;
    }

    for (const theme of data.themes?.negative || []) {
      agg.negativeCounts[theme] = (agg.negativeCounts[theme] || 0) + 1;
    }

    const rawItinerary = data.tags?.tour || data.product?.title || "";
    if (rawItinerary) {
      const itineraryName = parentLookup.get(rawItinerary) ?? rawItinerary;
      if (!agg.itineraries[itineraryName]) {
        agg.itineraries[itineraryName] = { totalReviews: 0, ratingSum: 0, fiveStar: 0 };
      }

      agg.itineraries[itineraryName].totalReviews += 1;
      agg.itineraries[itineraryName].ratingSum += rating;
      if (roundedRating === 5) {
        agg.itineraries[itineraryName].fiveStar += 1;
      }
    }
  }

  return Object.entries(byShip)
    .map(([name, agg]) => {
      const total = agg.totalReviews;
      const fiveStar = agg.starDist["5"] || 0;
      const fourPlus = (agg.starDist["5"] || 0) + (agg.starDist["4"] || 0);
      const itineraries = Object.entries(agg.itineraries)
        .map(([itineraryName, itineraryAgg]) => ({
          slug: slugify(itineraryName),
          name: itineraryName,
          averageRating:
            itineraryAgg.totalReviews > 0
              ? Math.round((itineraryAgg.ratingSum / itineraryAgg.totalReviews) * 100) / 100
              : 0,
          reviewCount: itineraryAgg.totalReviews,
          fiveStarPercent:
            itineraryAgg.totalReviews > 0
              ? Math.round((itineraryAgg.fiveStar / itineraryAgg.totalReviews) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.reviewCount - a.reviewCount);

      return {
        slug: slugify(name),
        name,
        averageRating: total > 0 ? Math.round((agg.ratingSum / total) * 100) / 100 : 0,
        reviewCount: total,
        fiveStarPercent: total > 0 ? Math.round((fiveStar / total) * 1000) / 10 : 0,
        fourPlusPercent: total > 0 ? Math.round((fourPlus / total) * 1000) / 10 : 0,
        itineraryCount: itineraries.length,
        itineraries,
        ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({
          star,
          count: agg.starDist[String(star)] || 0,
        })),
        positiveThemes: Object.entries(agg.positiveCounts)
          .map(([theme, count]) => ({ theme, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        negativeThemes: Object.entries(agg.negativeCounts)
          .map(([theme, count]) => ({ theme, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        fleetAvgRating: fleet.averageRating,
        fleetAvgFiveStar: fleet.fiveStarPercent,
      };
    })
    .sort((a, b) => b.averageRating - a.averageRating);
}

function buildShipSummaryFromDocs(
  shipDocs: Array<{ scope: string; scopeValue: string; brand: string; [key: string]: unknown }>,
  fleetAvgRating: number,
  fleetAvgFiveStar: number
): ShipSummary[] {
  // Group ship summary docs by scopeValue (ship name)
  const byShip: Record<string, typeof shipDocs> = {};
  for (const d of shipDocs) {
    const name = d.scopeValue;
    if (!name) continue;
    if (!byShip[name]) byShip[name] = [];
    byShip[name].push(d);
  }

  return Object.entries(byShip).map(([name, docs]) => {
    // Aggregate across brands if multiple docs for same ship
    let totalReviews = 0;
    let ratingSum = 0;
    const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    const positiveCounts: Record<string, number> = {};
    const negativeCounts: Record<string, number> = {};
    const itinerarySet = new Set<string>();

    for (const d of docs) {
      const tr = (d.totalReviews as number) || 0;
      totalReviews += tr;
      ratingSum += ((d.avgRating as number) || 0) * tr;
      const sd = (d.starDistribution as Record<string, number>) || {};
      for (const star of Object.keys(sd)) {
        starDist[star] = (starDist[star] || 0) + sd[star];
      }
      for (const t of (d.topPositiveThemes as { theme: string; count: number }[]) || []) {
        positiveCounts[t.theme] = (positiveCounts[t.theme] || 0) + t.count;
      }
      for (const t of (d.topNegativeThemes as { theme: string; count: number }[]) || []) {
        negativeCounts[t.theme] = (negativeCounts[t.theme] || 0) + t.count;
      }
      for (const it of (d.itineraries as string[]) || []) itinerarySet.add(it);
    }

    const avgRating = totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 100) / 100 : 0;
    const fiveStar = starDist["5"] || 0;
    const fourPlus = (starDist["5"] || 0) + (starDist["4"] || 0);

    // Build itinerary sub-items (we don't have per-itinerary stats here, just names)
    const itineraries: ShipItinerary[] = [...itinerarySet].map((itName) => ({
      slug: slugify(itName),
      name: itName,
      averageRating: 0,
      reviewCount: 0,
      fiveStarPercent: 0,
    }));

    return {
      slug: slugify(name),
      name,
      averageRating: avgRating,
      reviewCount: totalReviews,
      fiveStarPercent: totalReviews > 0 ? Math.round((fiveStar / totalReviews) * 1000) / 10 : 0,
      fourPlusPercent: totalReviews > 0 ? Math.round((fourPlus / totalReviews) * 1000) / 10 : 0,
      itineraryCount: itinerarySet.size,
      itineraries,
      ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: starDist[String(star)] || 0 })),
      positiveThemes: Object.entries(positiveCounts)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      negativeThemes: Object.entries(negativeCounts)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      fleetAvgRating,
      fleetAvgFiveStar,
    };
  });
}

async function getFleetAverages(brand: string): Promise<{ avgRating: number; avgFiveStar: number }> {
  const db = getClientDb();
  const ref = collection(db, "summaries");
  const constraints = brand === "combined"
    ? [where("scope", "==", "fleet")]
    : [where("brand", "==", brand), where("scope", "==", "fleet")];
  const snap = await getDocs(query(ref, ...constraints));

  if (snap.empty) return { avgRating: 0, avgFiveStar: 0 };

  let totalReviews = 0;
  let ratingSum = 0;
  let fiveStarTotal = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const tr = data.totalReviews || 0;
    totalReviews += tr;
    ratingSum += (data.avgRating || 0) * tr;
    fiveStarTotal += data.starDistribution?.["5"] || 0;
  }

  return {
    avgRating: totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 100) / 100 : 0,
    avgFiveStar: totalReviews > 0 ? Math.round((fiveStarTotal / totalReviews) * 1000) / 10 : 0,
  };
}

// ── Query functions ─────────────────────────────────────────────────────────

export async function getShips(
  brand: string = "combined",
  dateRange?: SummaryDateRange
): Promise<ShipSummary[]> {
  if (dateRange && !usesAllTimeSummaries(dateRange)) {
    return getShipsByDateRange(brand, dateRange);
  }

  const db = getClientDb();
  const ref = collection(db, "summaries");
  const constraints = brand === "combined"
    ? [where("scope", "==", "ship")]
    : [where("brand", "==", brand), where("scope", "==", "ship")];
  const snap = await getDocs(query(ref, ...constraints));

  if (snap.empty) return [];

  const fleet = await getFleetAverages(brand);
  const docs = snap.docs.map((d) => {
    const data = d.data();
    return { ...data, id: d.id } as unknown as { scope: string; scopeValue: string; brand: string; [key: string]: unknown };
  });

  return buildShipSummaryFromDocs(docs, fleet.avgRating, fleet.avgFiveStar)
    .sort((a, b) => b.averageRating - a.averageRating);
}

export async function getShipBySlug(
  slug: string,
  brand: string = "combined",
  dateRange?: SummaryDateRange
): Promise<ShipSummary | null> {
  const ships = await getShips(brand, dateRange);
  return ships.find((s) => s.slug === slug) ?? null;
}

export async function getShipQuotes(
  shipName: string,
  brand: string = "combined",
  dateRange?: SummaryDateRange
): Promise<{ positive: Quote[]; negative: Quote[] }> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const reviewLimit = dateRange && !usesAllTimeSummaries(dateRange) ? 100 : 20;
  const baseConstraints = [
    where("tags.ship", "==", shipName),
    orderBy("dates.created", "desc"),
  ];
  if (brand !== "combined") {
    baseConstraints.unshift(where("brand", "==", brand));
  }

  // Firestore doesn't allow multiple inequality filters on different fields,
  // so we fetch recent reviews and split them by rating
  const allQ = query(ref, ...baseConstraints, limit(reviewLimit));
  const snap = await getDocs(allQ);

  const positive: Quote[] = [];
  const negative: Quote[] = [];
  const startIso = dateRange?.start.toISOString();
  const endIso = dateRange?.end.toISOString();

  for (const d of snap.docs) {
    const data = d.data();
    const created = data.dates?.created;
    if (
      startIso &&
      endIso &&
      (typeof created !== "string" || created < startIso || created > endIso)
    ) {
      continue;
    }

    const rating = data.ratings?.product ?? data.ratings?.service ?? 0;
    const text = data.reviews?.productText || data.reviews?.serviceText || "";
    if (!text) continue;

    const quote: Quote = {
      id: d.id,
      guestName: data.customer?.displayName || data.customer?.name || "Guest",
      rating,
      ship: data.tags?.ship || shipName,
      itinerary: data.tags?.tour || data.product?.title || "",
      text,
      date: data.dates?.created || "",
    };

    if (rating >= 4 && positive.length < 5) {
      positive.push(quote);
    } else if (rating <= 3 && negative.length < 3) {
      negative.push(quote);
    }
  }

  return { positive, negative };
}
