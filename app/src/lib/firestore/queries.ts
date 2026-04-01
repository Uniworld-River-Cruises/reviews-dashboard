"use client";

import { format } from "date-fns";
import { getClientDb } from "@/lib/firebase";
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FleetSummary {
  totalReviews: number;
  averageRating: number;
  fiveStarPercent: number;
  fourPlusPercent: number;
  totalItineraries: number;
  totalShips: number;
  ratingDistribution: { star: number; count: number }[];
  previousPeriodReviews: number;
  previousPeriodRating: number;
  positiveThemes: { theme: string; count: number }[];
  negativeThemes: { theme: string; count: number }[];
}

export interface MonthlySummary {
  month: string; // e.g. "2025-06"
  averageRating: number;
  reviewCount: number;
}

export type TrendGranularity = "day" | "week" | "month";

export interface TrendPoint {
  key: string;
  label: string;
  fullLabel: string;
  averageRating: number | null;
  reviewCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface EntitySummary {
  id: string;
  name: string;
  ships: string[];
  averageRating: number;
  reviewCount: number;
  fiveStarPercent: number;
}

export interface ThemeReview {
  id: string;
  guestName: string;
  rating: number;
  itinerary: string;
  ship: string;
  text: string;
  date: string;
  media: { type: string; url: string }[];
}

export type OverviewSelectionFilter =
  | { kind: "theme"; theme: string; sentiment: "positive" | "negative" }
  | { kind: "rating"; star: number }
  | { kind: "month"; month: string }
  | { kind: "period"; start: string; end: string; label: string };

const PANEL_REVIEW_LIMIT = 100;
const PANEL_REVIEW_BATCH_SIZE = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

const EMPTY_FLEET: FleetSummary = {
  totalReviews: 0,
  averageRating: 0,
  fiveStarPercent: 0,
  fourPlusPercent: 0,
  totalItineraries: 0,
  totalShips: 0,
  ratingDistribution: [
    { star: 5, count: 0 },
    { star: 4, count: 0 },
    { star: 3, count: 0 },
    { star: 2, count: 0 },
    { star: 1, count: 0 },
  ],
  previousPeriodReviews: 0,
  previousPeriodRating: 0,
  positiveThemes: [],
  negativeThemes: [],
};

// ── Query functions ─────────────────────────────────────────────────────────

export async function getFleetSummary(brand: string): Promise<FleetSummary> {
  const db = getClientDb();
  // "combined" means we need to merge both brand summaries
  if (brand === "combined") {
    const snap = await getDocs(
      query(collection(db, "summaries"), where("scope", "==", "fleet"))
    );
    if (snap.empty) return EMPTY_FLEET;

    let totalReviews = 0;
    let ratingSum = 0;
    const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    const positiveCounts: Record<string, number> = {};
    const negativeCounts: Record<string, number> = {};
    const allShips = new Set<string>();
    const allItineraries = new Set<string>();

    for (const d of snap.docs) {
      const data = d.data();
      totalReviews += data.totalReviews || 0;
      ratingSum += (data.avgRating || 0) * (data.totalReviews || 0);
      const sd = data.starDistribution || {};
      for (const star of Object.keys(sd)) {
        starDist[star] = (starDist[star] || 0) + sd[star];
      }
      for (const t of data.topPositiveThemes || []) {
        positiveCounts[t.theme] = (positiveCounts[t.theme] || 0) + t.count;
      }
      for (const t of data.topNegativeThemes || []) {
        negativeCounts[t.theme] = (negativeCounts[t.theme] || 0) + t.count;
      }
      for (const s of data.ships || []) allShips.add(s);
      for (const it of data.itineraries || []) allItineraries.add(it);
    }

    const avgRating = totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 100) / 100 : 0;
    const fiveStar = starDist["5"] || 0;
    const fourPlus = (starDist["5"] || 0) + (starDist["4"] || 0);

    return {
      totalReviews,
      averageRating: avgRating,
      fiveStarPercent: totalReviews > 0 ? Math.round((fiveStar / totalReviews) * 1000) / 10 : 0,
      fourPlusPercent: totalReviews > 0 ? Math.round((fourPlus / totalReviews) * 1000) / 10 : 0,
      totalItineraries: allItineraries.size,
      totalShips: allShips.size,
      ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: starDist[String(star)] || 0 })),
      previousPeriodReviews: 0,
      previousPeriodRating: 0,
      positiveThemes: Object.entries(positiveCounts)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      negativeThemes: Object.entries(negativeCounts)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  // Single brand: doc ID is the brand name (e.g. "uniworld")
  const docRef = doc(db, "summaries", brand);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return EMPTY_FLEET;

  const data = snap.data();
  const totalReviews = data.totalReviews || 0;
  const sd = data.starDistribution || {};
  const fiveStar = sd["5"] || 0;
  const fourPlus = (sd["5"] || 0) + (sd["4"] || 0);

  // Count unique ships and itineraries from sub-summaries
  const subSnap = await getDocs(
    query(collection(db, "summaries"), where("brand", "==", brand), where("scope", "!=", "fleet"))
  );
  const ships = new Set<string>();
  const itineraries = new Set<string>();
  for (const d of subSnap.docs) {
    const sub = d.data();
    if (sub.scope === "ship" && sub.scopeValue) ships.add(sub.scopeValue);
    if (sub.scope === "itinerary" && sub.scopeValue) itineraries.add(sub.scopeValue);
  }

  return {
    totalReviews,
    averageRating: data.avgRating || 0,
    fiveStarPercent: totalReviews > 0 ? Math.round((fiveStar / totalReviews) * 1000) / 10 : 0,
    fourPlusPercent: totalReviews > 0 ? Math.round((fourPlus / totalReviews) * 1000) / 10 : 0,
    totalItineraries: itineraries.size,
    totalShips: ships.size,
    ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: sd[String(star)] || 0 })),
    previousPeriodReviews: 0,
    previousPeriodRating: 0,
    positiveThemes: (data.topPositiveThemes || []).slice(0, 10),
    negativeThemes: (data.topNegativeThemes || []).slice(0, 10),
  };
}

export async function getMonthlySummaries(brand: string): Promise<MonthlySummary[]> {
  const db = getClientDb();
  const ref = collection(db, "monthly_summaries");
  const constraints = brand === "combined"
    ? [orderBy("month", "asc")]
    : [where("brand", "==", brand), orderBy("month", "asc")];
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) return [];

  if (brand === "combined") {
    // Aggregate by month across brands
    const byMonth: Record<string, { totalReviews: number; ratingSum: number }> = {};
    for (const d of snap.docs) {
      const data = d.data();
      const month = data.month;
      if (!byMonth[month]) byMonth[month] = { totalReviews: 0, ratingSum: 0 };
      byMonth[month].totalReviews += data.totalReviews || 0;
      byMonth[month].ratingSum += (data.avgRating || 0) * (data.totalReviews || 0);
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, agg]) => ({
        month,
        averageRating: agg.totalReviews > 0 ? Math.round((agg.ratingSum / agg.totalReviews) * 100) / 100 : 0,
        reviewCount: agg.totalReviews,
      }));
  }

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      month: data.month,
      averageRating: data.avgRating || 0,
      reviewCount: data.totalReviews || 0,
    };
  });
}

export async function getTrendSeries(
  brand: string,
  startDate: Date,
  endDate: Date
): Promise<{ granularity: TrendGranularity; points: TrendPoint[] }> {
  const rangeDays = getRangeLengthInDays(startDate, endDate);
  const granularity: TrendGranularity =
    rangeDays <= 45 ? "day" : rangeDays <= 366 ? "week" : "month";

  if (granularity === "month") {
    const monthly = await getMonthlySummaries(brand);
    return {
      granularity,
      points: buildMonthlyTrendPoints(monthly, startDate, endDate),
    };
  }

  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints = [
    ...buildDateRangeConstraints(brand, startDate.toISOString(), endDate.toISOString()),
  ];
  const snap = await getDocs(query(ref, ...constraints));

  return {
    granularity,
    points: buildAdaptiveTrendPoints(snap.docs.map((docSnap) => docSnap.data()), startDate, endDate, granularity),
  };
}

export async function getEntitySummaries(
  brand: string,
  scope: "ship" | "itinerary" = "itinerary"
): Promise<EntitySummary[]> {
  const db = getClientDb();
  const ref = collection(db, "summaries");
  const constraints = brand === "combined"
    ? [where("scope", "==", scope)]
    : [where("brand", "==", brand), where("scope", "==", scope)];
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) return [];

  // When combined, aggregate duplicate scope values across brands
  if (brand === "combined") {
    const byName: Record<string, { totalReviews: number; ratingSum: number; fiveStar: number; ships: Set<string> }> = {};
    for (const d of snap.docs) {
      const data = d.data();
      const name = data.scopeValue || d.id;
      if (!byName[name]) byName[name] = { totalReviews: 0, ratingSum: 0, fiveStar: 0, ships: new Set() };
      byName[name].totalReviews += data.totalReviews || 0;
      byName[name].ratingSum += (data.avgRating || 0) * (data.totalReviews || 0);
      byName[name].fiveStar += (data.starDistribution?.["5"] || 0);
      for (const s of data.ships || []) byName[name].ships.add(s);
    }
    return Object.entries(byName).map(([name, agg]) => ({
      id: slugify(name),
      name,
      ships: [...agg.ships],
      averageRating: agg.totalReviews > 0 ? Math.round((agg.ratingSum / agg.totalReviews) * 100) / 100 : 0,
      reviewCount: agg.totalReviews,
      fiveStarPercent: agg.totalReviews > 0 ? Math.round((agg.fiveStar / agg.totalReviews) * 1000) / 10 : 0,
    }));
  }

  return snap.docs.map((d) => {
    const data = d.data();
    const total = data.totalReviews || 0;
    const fiveStar = data.starDistribution?.["5"] || 0;
    const name = data.scopeValue || d.id;
    return {
      id: slugify(name),
      name,
      ships: data.ships || [],
      averageRating: data.avgRating || 0,
      reviewCount: total,
      fiveStarPercent: total > 0 ? Math.round((fiveStar / total) * 1000) / 10 : 0,
    };
  });
}

/**
 * Compute fleet summary directly from reviews filtered by date range.
 * Used when the user selects a date range other than "All Time".
 */
export async function getFleetSummaryByDateRange(
  brand: string,
  startDate: Date,
  endDate: Date
): Promise<FleetSummary> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints: QueryConstraint[] = [
    where("dates.created", ">=", startDate.toISOString()),
    where("dates.created", "<=", endDate.toISOString()),
  ];
  if (brand !== "combined") {
    constraints.push(where("brand", "==", brand));
  }
  constraints.push(orderBy("dates.created", "desc"));
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) return EMPTY_FLEET;

  let ratingSum = 0;
  const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const positiveCounts: Record<string, number> = {};
  const negativeCounts: Record<string, number> = {};
  const ships = new Set<string>();
  const itineraries = new Set<string>();

  for (const d of snap.docs) {
    const data = d.data();
    const rating = data.rating || data.ratings?.product || data.ratings?.service || 0;
    ratingSum += rating;
    const starKey = String(Math.round(rating));
    starDist[starKey] = (starDist[starKey] || 0) + 1;

    if (data.ship) ships.add(data.ship);
    if (data.tags?.ship) ships.add(data.tags.ship);
    if (data.tags?.tour) itineraries.add(data.tags.tour);

    for (const t of data.themes?.positive || []) {
      positiveCounts[t] = (positiveCounts[t] || 0) + 1;
    }
    for (const t of data.themes?.negative || []) {
      negativeCounts[t] = (negativeCounts[t] || 0) + 1;
    }
  }

  const total = snap.docs.length;
  const avgRating = total > 0 ? Math.round((ratingSum / total) * 100) / 100 : 0;
  const fiveStar = starDist["5"] || 0;
  const fourPlus = (starDist["5"] || 0) + (starDist["4"] || 0);

  return {
    totalReviews: total,
    averageRating: avgRating,
    fiveStarPercent: total > 0 ? Math.round((fiveStar / total) * 1000) / 10 : 0,
    fourPlusPercent: total > 0 ? Math.round((fourPlus / total) * 1000) / 10 : 0,
    totalItineraries: itineraries.size,
    totalShips: ships.size,
    ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: starDist[String(star)] || 0 })),
    previousPeriodReviews: 0,
    previousPeriodRating: 0,
    positiveThemes: Object.entries(positiveCounts)
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    negativeThemes: Object.entries(negativeCounts)
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

/**
 * Get all filter options (ships, itineraries, themes) from reviews within the date range.
 * Queries the reviews collection so results reflect the selected time period.
 */
/**
 * Compute entity summaries (itinerary or ship) from reviews within a date range.
 */
/**
 * Build a rawName → effectiveParentName lookup from the itinerary_mappings collection.
 * Used to resolve raw tour names to their grouped parent names on the client side.
 */
export async function getParentNameLookup(brand: string): Promise<Map<string, string>> {
  const db = getClientDb();
  const ref = collection(db, "itinerary_mappings");
  const constraints = brand === "combined"
    ? []
    : [where("brand", "==", brand)];
  const snap = await getDocs(query(ref, ...constraints));
  const lookup = new Map<string, string>();
  for (const d of snap.docs) {
    const m = d.data();
    if (m.rawName && m.effectiveParentName) {
      lookup.set(m.rawName, m.effectiveParentName);
    }
  }
  return lookup;
}

export async function getEntitySummariesByDateRange(
  brand: string,
  startDate: Date,
  endDate: Date,
  scope: "ship" | "itinerary" = "itinerary"
): Promise<EntitySummary[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints: QueryConstraint[] = [
    where("dates.created", ">=", startDate.toISOString()),
    where("dates.created", "<=", endDate.toISOString()),
    orderBy("dates.created", "desc"),
  ];
  if (brand !== "combined") {
    constraints.unshift(where("brand", "==", brand));
  }

  // Fetch reviews and parent-name mappings in parallel
  const [snap, parentLookup] = await Promise.all([
    getDocs(query(ref, ...constraints)),
    scope === "itinerary" ? getParentNameLookup(brand) : Promise.resolve(new Map<string, string>()),
  ]);

  if (snap.empty) return [];

  const byName: Record<string, { totalReviews: number; ratingSum: number; fiveStar: number; ships: Set<string> }> = {};

  for (const d of snap.docs) {
    const data = d.data();
    const rawName = scope === "ship"
      ? (data.tags?.ship || "")
      : (data.tags?.tour || data.product?.title || "");
    if (!rawName) continue;

    // Resolve raw itinerary names to their parent group name
    const name = scope === "itinerary"
      ? (parentLookup.get(rawName) ?? rawName)
      : rawName;

    if (!byName[name]) byName[name] = { totalReviews: 0, ratingSum: 0, fiveStar: 0, ships: new Set() };
    byName[name].totalReviews++;
    const rating = data.ratings?.product ?? data.ratings?.service ?? 0;
    byName[name].ratingSum += rating;
    if (Math.round(rating) === 5) byName[name].fiveStar++;
    if (data.tags?.ship) byName[name].ships.add(data.tags.ship);
  }

  return Object.entries(byName)
    .map(([name, agg]) => ({
      id: slugify(name),
      name,
      ships: [...agg.ships],
      averageRating: agg.totalReviews > 0 ? Math.round((agg.ratingSum / agg.totalReviews) * 100) / 100 : 0,
      reviewCount: agg.totalReviews,
      fiveStarPercent: agg.totalReviews > 0 ? Math.round((agg.fiveStar / agg.totalReviews) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.reviewCount - a.reviewCount);
}

export interface FilterOptions {
  brands: string[];
  ratings: number[];
  ships: string[];
  itineraries: string[];
  positiveThemes: string[];
  negativeThemes: string[];
  bookingTypes: string[];
  regions: string[];
  loyaltyLevels: string[];
}

/**
 * Get all filter options from reviews within the date range.
 * Queries the reviews collection so results reflect the selected time period.
 */
export async function getFilterOptions(
  brand: string,
  startDate: string,
  endDate: string
): Promise<FilterOptions> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints: QueryConstraint[] = [
    where("dates.created", ">=", startDate),
    where("dates.created", "<=", endDate),
    orderBy("dates.created", "desc"),
  ];
  if (brand !== "combined") {
    constraints.unshift(where("brand", "==", brand));
  }
  const snap = await getDocs(query(ref, ...constraints));

  const brands = new Set<string>();
  const ratings = new Set<number>();
  const ships = new Set<string>();
  const itineraries = new Set<string>();
  const positiveThemes = new Set<string>();
  const negativeThemes = new Set<string>();
  const bookingTypes = new Set<string>();
  const regions = new Set<string>();
  const loyaltyLevels = new Set<string>();

  for (const d of snap.docs) {
    const data = d.data();
    if (data.brand) brands.add(data.brand);
    const rating = data.ratings?.product ?? data.ratings?.service;
    if (rating != null) ratings.add(Math.round(rating));
    if (data.tags?.ship) ships.add(data.tags.ship);
    if (data.tags?.tour) itineraries.add(data.tags.tour);
    if (data.tags?.bookingType) bookingTypes.add(data.tags.bookingType);
    if (data.tags?.region) regions.add(data.tags.region);
    if (data.tags?.loyalty) loyaltyLevels.add(data.tags.loyalty);
    for (const t of data.themes?.positive || []) positiveThemes.add(t);
    for (const t of data.themes?.negative || []) negativeThemes.add(t);
  }

  return {
    brands: [...brands].sort(),
    ratings: [...ratings].sort((a, b) => b - a),
    ships: [...ships].sort(),
    itineraries: [...itineraries].sort(),
    positiveThemes: [...positiveThemes].sort(),
    negativeThemes: [...negativeThemes].sort(),
    bookingTypes: [...bookingTypes].sort(),
    regions: [...regions].sort(),
    loyaltyLevels: [...loyaltyLevels].sort(),
  };
}

export async function getReviewsByTheme(
  brand: string,
  theme: string,
  type: "positive" | "negative",
  startDate?: Date,
  endDate?: Date
): Promise<ThemeReview[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const fetchLimit = startDate && endDate ? 100 : 20;
  const constraints = [
    where(`themes.${type}`, "array-contains", theme),
    orderBy("dates.created", "desc"),
    limit(fetchLimit),
  ];
  if (brand !== "combined") {
    constraints.unshift(where("brand", "==", brand));
  }
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) return [];

  const filteredDocs =
    startDate && endDate
      ? snap.docs.filter((docSnap) => {
          const created = docSnap.data().dates?.created;
          return (
            typeof created === "string" &&
            created >= startDate.toISOString() &&
            created <= endDate.toISOString()
          );
        })
      : snap.docs;

  return filteredDocs.slice(0, 20).map((docSnap) =>
    mapReviewDoc({ id: docSnap.id, data: docSnap.data() })
  );
}

export async function getReviewsForOverviewSelection(
  brand: string,
  startDate: Date,
  endDate: Date,
  filter: OverviewSelectionFilter
): Promise<ThemeReview[]> {
  if (filter.kind === "theme") {
    return getThemeSelectionReviews(brand, startDate, endDate, filter);
  }

  if (filter.kind === "period") {
    return getPeriodSelectionReviews(brand, filter.start, filter.end);
  }

  if (filter.kind === "month") {
    return getMonthSelectionReviews(brand, filter.month);
  }

  return getRatingSelectionReviews(brand, startDate, endDate, filter.star);
}

function mapReviewDoc(
  review: { id: string; data: DocumentData }
): ThemeReview {
  const data = review.data;
  return {
    id: review.id,
    guestName: data.customer?.displayName || "Trusted Customer",
    rating: data.ratings?.product ?? data.ratings?.service ?? 0,
    itinerary: data.tags?.tour || data.product?.title || "",
    ship: data.tags?.ship || "",
    text: data.reviews?.productText || data.reviews?.serviceText || "",
    date: data.dates?.created || "",
    media: Array.isArray(data.media) ? data.media : [],
  };
}

function matchesOverviewSelection(data: DocumentData, filter: OverviewSelectionFilter): boolean {
  if (filter.kind === "theme") {
    const values = data.themes?.[filter.sentiment] || [];
    return Array.isArray(values) && values.includes(filter.theme);
  }

  if (filter.kind === "rating") {
    const rating = data.ratings?.product ?? data.ratings?.service ?? null;
    return rating !== null && Math.round(rating) === filter.star;
  }

  const created = typeof data.dates?.created === "string" ? data.dates.created : "";
  if (filter.kind === "period") {
    return created >= filter.start && created < filter.end;
  }
  return created.startsWith(filter.month);
}

function getMonthBounds(month: string): { start: string; end: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getRangeLengthInDays(startDate: Date, endDate: Date): number {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate()
  );
  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  );

  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function toUtcDayKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function parseUtcDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function addUtcDays(dayKey: string, amount: number): string {
  const date = parseUtcDayKey(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return toUtcDayKey(date);
}

function getUtcWeekStartKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utcDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + offset);
  return toUtcDayKey(utcDate);
}

function addUtcWeeks(dayKey: string, amount: number): string {
  return addUtcDays(dayKey, amount * 7);
}

function toUtcMonthKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseUtcMonthKey(monthKey: string): Date {
  return new Date(`${monthKey}-01T00:00:00.000Z`);
}

function addUtcMonths(monthKey: string, amount: number): string {
  const date = parseUtcMonthKey(monthKey);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toUtcMonthKey(date);
}

function formatPeriodLabel(
  granularity: TrendGranularity,
  periodStart: string,
  periodEnd: string
): { label: string; fullLabel: string } {
  if (granularity === "day") {
    const start = parseUtcDayKey(periodStart);
    return {
      label: format(start, "MMM d"),
      fullLabel: format(start, "MMM d, yyyy"),
    };
  }

  if (granularity === "week") {
    const start = parseUtcDayKey(periodStart);
    const exclusiveEnd = parseUtcDayKey(periodEnd);
    const inclusiveEnd = new Date(exclusiveEnd);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
    return {
      label: format(start, "MMM d"),
      fullLabel: `${format(start, "MMM d")} - ${format(inclusiveEnd, "MMM d, yyyy")}`,
    };
  }

  const start = parseUtcMonthKey(periodStart);
  return {
    label: format(start, "MMM yy"),
    fullLabel: format(start, "MMMM yyyy"),
  };
}

function buildAdaptiveTrendPoints(
  docs: DocumentData[],
  startDate: Date,
  endDate: Date,
  granularity: Extract<TrendGranularity, "day" | "week">
): TrendPoint[] {
  const bucketStats = new Map<string, { ratingSum: number; ratingCount: number; reviewCount: number }>();
  const rangeStartKey = granularity === "day" ? toUtcDayKey(startDate) : getUtcWeekStartKey(startDate);
  const rangeEndKey = granularity === "day" ? toUtcDayKey(endDate) : getUtcWeekStartKey(endDate);
  const selectedStartIso = startDate.toISOString();
  const selectedEndExclusiveIso = `${addUtcDays(toUtcDayKey(endDate), 1)}T00:00:00.000Z`;

  for (const data of docs) {
    const created = typeof data.dates?.created === "string" ? data.dates.created : null;
    if (!created) continue;

    const bucketKey = granularity === "day" ? toUtcDayKey(created) : getUtcWeekStartKey(created);
    const current = bucketStats.get(bucketKey) ?? { ratingSum: 0, ratingCount: 0, reviewCount: 0 };
    const rating = data.ratings?.product ?? data.ratings?.service ?? null;

    current.reviewCount += 1;
    if (typeof rating === "number" && Number.isFinite(rating)) {
      current.ratingSum += rating;
      current.ratingCount += 1;
    }
    bucketStats.set(bucketKey, current);
  }

  const points: TrendPoint[] = [];
  let bucketKey = rangeStartKey;
  while (bucketKey <= rangeEndKey) {
    const stats = bucketStats.get(bucketKey) ?? { ratingSum: 0, ratingCount: 0, reviewCount: 0 };
    const nextBucketKey = granularity === "day" ? addUtcDays(bucketKey, 1) : addUtcWeeks(bucketKey, 1);
    const rawPeriodStart = `${bucketKey}T00:00:00.000Z`;
    const rawPeriodEnd = `${nextBucketKey}T00:00:00.000Z`;
    const periodStart = rawPeriodStart < selectedStartIso ? selectedStartIso : rawPeriodStart;
    const periodEnd = rawPeriodEnd > selectedEndExclusiveIso ? selectedEndExclusiveIso : rawPeriodEnd;
    const labels = formatPeriodLabel(
      granularity,
      toUtcDayKey(periodStart),
      toUtcDayKey(periodEnd)
    );

    points.push({
      key: bucketKey,
      label: labels.label,
      fullLabel: labels.fullLabel,
      averageRating:
        stats.ratingCount > 0
          ? Math.round((stats.ratingSum / stats.ratingCount) * 100) / 100
          : null,
      reviewCount: stats.reviewCount,
      periodStart,
      periodEnd,
    });

    bucketKey = nextBucketKey;
  }

  return points;
}

function buildMonthlyTrendPoints(
  monthly: MonthlySummary[],
  startDate: Date,
  endDate: Date
): TrendPoint[] {
  const statsByMonth = new Map(monthly.map((entry) => [entry.month, entry]));
  const points: TrendPoint[] = [];
  let monthKey = toUtcMonthKey(startDate);
  const endMonthKey = toUtcMonthKey(endDate);

  while (monthKey <= endMonthKey) {
    const stats = statsByMonth.get(monthKey);
    const nextMonthKey = addUtcMonths(monthKey, 1);
    const labels = formatPeriodLabel("month", monthKey, nextMonthKey);

    points.push({
      key: monthKey,
      label: labels.label,
      fullLabel: labels.fullLabel,
      averageRating: stats ? stats.averageRating : null,
      reviewCount: stats?.reviewCount ?? 0,
      periodStart: `${monthKey}-01T00:00:00.000Z`,
      periodEnd: `${nextMonthKey}-01T00:00:00.000Z`,
    });

    monthKey = nextMonthKey;
  }

  return points;
}

function buildDateRangeConstraints(
  brand: string,
  start: string,
  end: string,
  endOperator: "<" | "<=" = "<="
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [
    where("dates.created", ">=", start),
    where("dates.created", endOperator, end),
  ];

  if (brand !== "combined") {
    constraints.push(where("brand", "==", brand));
  }

  constraints.push(orderBy("dates.created", "desc"));
  return constraints;
}

async function getThemeSelectionReviews(
  brand: string,
  startDate: Date,
  endDate: Date,
  filter: Extract<OverviewSelectionFilter, { kind: "theme" }>
): Promise<ThemeReview[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints = [
    ...buildDateRangeConstraints(brand, startDate.toISOString(), endDate.toISOString()),
    where(`themes.${filter.sentiment}`, "array-contains", filter.theme),
    limit(PANEL_REVIEW_LIMIT),
  ];

  try {
    const snap = await getDocs(query(ref, ...constraints));
    return snap.docs.map((docSnap) =>
      mapReviewDoc({ id: docSnap.id, data: docSnap.data() })
    );
  } catch (error) {
    console.warn("Falling back to paged theme filtering for overview selection", error);
    return getFilteredPagedReviews(brand, startDate, endDate, filter);
  }
}

async function getMonthSelectionReviews(brand: string, month: string): Promise<ThemeReview[]> {
  const bounds = getMonthBounds(month);
  return getPeriodSelectionReviews(brand, bounds.start, bounds.end);
}

async function getPeriodSelectionReviews(
  brand: string,
  periodStart: string,
  periodEnd: string
): Promise<ThemeReview[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints = [
    ...buildDateRangeConstraints(brand, periodStart, periodEnd, "<"),
    limit(PANEL_REVIEW_LIMIT),
  ];
  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs.map((docSnap) =>
    mapReviewDoc({ id: docSnap.id, data: docSnap.data() })
  );
}

async function getRatingSelectionReviews(
  brand: string,
  startDate: Date,
  endDate: Date,
  star: number
): Promise<ThemeReview[]> {
  return getFilteredPagedReviews(brand, startDate, endDate, {
    kind: "rating",
    star,
  });
}

async function getFilteredPagedReviews(
  brand: string,
  startDate: Date,
  endDate: Date,
  filter: OverviewSelectionFilter
): Promise<ThemeReview[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const constraints = buildDateRangeConstraints(
    brand,
    startDate.toISOString(),
    endDate.toISOString()
  );
  const reviews: ThemeReview[] = [];
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  while (reviews.length < PANEL_REVIEW_LIMIT) {
    const pageConstraints = [...constraints, limit(PANEL_REVIEW_BATCH_SIZE)];
    if (lastDoc) {
      pageConstraints.push(startAfter(lastDoc));
    }

    const snap = await getDocs(query(ref, ...pageConstraints));
    if (snap.empty) {
      break;
    }

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (matchesOverviewSelection(data, filter)) {
        reviews.push(mapReviewDoc({ id: docSnap.id, data }));
        if (reviews.length >= PANEL_REVIEW_LIMIT) {
          break;
        }
      }
    }

    if (snap.docs.length < PANEL_REVIEW_BATCH_SIZE) {
      break;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return reviews;
}
