"use client";

import { getClientDb } from "@/lib/firebase";
import type { DateField, DateRange } from "@/contexts/DashboardContext";
import {
  dateFieldPath,
  getFleetSummaryByDateRange,
  REVIEW_PANEL_PAGE_SIZE,
  type ReviewPage,
  type ReviewPageCursor,
  type ThemeReview,
} from "@/lib/firestore/queries";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Quote } from "@/components/dashboard/QuotesSection";

const ITINERARY_REVIEW_BATCH_SIZE = 200;
const TOUR_IN_LIMIT = 30;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ItinerarySummary {
  slug: string;
  name: string;
  ships: string[];
  childItineraries: string[];
  averageRating: number;
  reviewCount: number;
  fiveStarPercent: number;
  fourPlusPercent: number;
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
  endDate: Date,
  dateField: DateField
) {
  const path = dateFieldPath(dateField);
  const constraints = [
    where(path, ">=", startDate.toISOString()),
    where(path, "<=", endDate.toISOString()),
    orderBy(path, "desc"),
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

async function getItinerariesByDateRange(
  brand: string,
  dateRange: SummaryDateRange,
  dateField: DateField
): Promise<ItinerarySummary[]> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const [snap, parentLookup, fleet] = await Promise.all([
    getDocs(query(ref, ...buildDateRangeConstraints(brand, dateRange.start, dateRange.end, dateField))),
    getParentNameLookup(brand),
    getFleetSummaryByDateRange(brand, dateRange.start, dateRange.end, dateField),
  ]);

  if (snap.empty) return [];

  const byName: Record<string, {
    totalReviews: number;
    ratingSum: number;
    starDist: Record<string, number>;
    positiveCounts: Record<string, number>;
    negativeCounts: Record<string, number>;
    ships: Set<string>;
    childItineraries: Set<string>;
  }> = {};

  for (const d of snap.docs) {
    const data = d.data();
    const rawName = data.tags?.tour || data.product?.title || "";
    if (!rawName) continue;

    const name = parentLookup.get(rawName) ?? rawName;

    if (!byName[name]) {
      byName[name] = {
        totalReviews: 0,
        ratingSum: 0,
        starDist: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        positiveCounts: {},
        negativeCounts: {},
        ships: new Set(),
        childItineraries: new Set(),
      };
    }

    const agg = byName[name];
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

    if (data.tags?.ship) {
      agg.ships.add(data.tags.ship);
    }

    agg.childItineraries.add(rawName);
  }

  return Object.entries(byName)
    .map(([name, agg]) => {
      const total = agg.totalReviews;
      const fiveStar = agg.starDist["5"] || 0;
      const fourPlus = (agg.starDist["5"] || 0) + (agg.starDist["4"] || 0);

      return {
        slug: slugify(name),
        name,
        ships: [...agg.ships],
        childItineraries: [...agg.childItineraries],
        averageRating: total > 0 ? Math.round((agg.ratingSum / total) * 100) / 100 : 0,
        reviewCount: total,
        fiveStarPercent: total > 0 ? Math.round((fiveStar / total) * 1000) / 10 : 0,
        fourPlusPercent: total > 0 ? Math.round((fourPlus / total) * 1000) / 10 : 0,
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

export async function getItineraries(
  brand: string = "combined",
  dateRange?: SummaryDateRange,
  dateField: DateField = "created"
): Promise<ItinerarySummary[]> {
  if (dateRange && !usesAllTimeSummaries(dateRange)) {
    return getItinerariesByDateRange(brand, dateRange, dateField);
  }

  const db = getClientDb();
  const ref = collection(db, "summaries");
  const constraints = brand === "combined"
    ? [where("scope", "==", "itinerary")]
    : [where("brand", "==", brand), where("scope", "==", "itinerary")];
  const snap = await getDocs(query(ref, ...constraints));

  if (snap.empty) return [];

  const fleet = await getFleetAverages(brand);

  // Group by itinerary name to handle combined brand case
  const byName: Record<string, {
    totalReviews: number;
    ratingSum: number;
    starDist: Record<string, number>;
    positiveCounts: Record<string, number>;
    negativeCounts: Record<string, number>;
    ships: Set<string>;
    childItineraries: Set<string>;
  }> = {};

  for (const d of snap.docs) {
    const data = d.data();
    const name = data.scopeValue || d.id;
    if (!byName[name]) {
      byName[name] = {
        totalReviews: 0,
        ratingSum: 0,
        starDist: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        positiveCounts: {},
        negativeCounts: {},
        ships: new Set(),
        childItineraries: new Set(),
      };
    }
    const agg = byName[name];
    const tr = data.totalReviews || 0;
    agg.totalReviews += tr;
    agg.ratingSum += (data.avgRating || 0) * tr;
    const sd = data.starDistribution || {};
    for (const star of Object.keys(sd)) {
      agg.starDist[star] = (agg.starDist[star] || 0) + sd[star];
    }
    for (const t of data.topPositiveThemes || []) {
      agg.positiveCounts[t.theme] = (agg.positiveCounts[t.theme] || 0) + t.count;
    }
    for (const t of data.topNegativeThemes || []) {
      agg.negativeCounts[t.theme] = (agg.negativeCounts[t.theme] || 0) + t.count;
    }
    for (const s of data.ships || []) agg.ships.add(s);
    for (const c of data.childItineraries || []) agg.childItineraries.add(c);
  }

  return Object.entries(byName)
    .map(([name, agg]) => {
      const total = agg.totalReviews;
      const avgRating = total > 0 ? Math.round((agg.ratingSum / total) * 100) / 100 : 0;
      const fiveStar = agg.starDist["5"] || 0;
      const fourPlus = (agg.starDist["5"] || 0) + (agg.starDist["4"] || 0);

      return {
        slug: slugify(name),
        name,
        ships: [...agg.ships],
        childItineraries: agg.childItineraries.size > 0 ? [...agg.childItineraries] : [name],
        averageRating: avgRating,
        reviewCount: total,
        fiveStarPercent: total > 0 ? Math.round((fiveStar / total) * 1000) / 10 : 0,
        fourPlusPercent: total > 0 ? Math.round((fourPlus / total) * 1000) / 10 : 0,
        ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: agg.starDist[String(star)] || 0 })),
        positiveThemes: Object.entries(agg.positiveCounts)
          .map(([theme, count]) => ({ theme, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        negativeThemes: Object.entries(agg.negativeCounts)
          .map(([theme, count]) => ({ theme, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        fleetAvgRating: fleet.avgRating,
        fleetAvgFiveStar: fleet.avgFiveStar,
      };
    })
    .sort((a, b) => b.averageRating - a.averageRating);
}

export async function getItineraryBySlug(
  slug: string,
  brand: string = "combined",
  dateRange?: SummaryDateRange,
  dateField: DateField = "created"
): Promise<ItinerarySummary | null> {
  const itineraries = await getItineraries(brand, dateRange, dateField);
  return itineraries.find((it) => it.slug === slug) ?? null;
}

function mapItineraryReviewDoc(
  id: string,
  data: DocumentData,
  dateField: DateField
): ThemeReview {
  const dates = data.dates as { created?: unknown; lastUpdated?: unknown } | undefined;
  const rawValue = dateField === "lastUpdated" ? dates?.lastUpdated : dates?.created;
  const fallback = dateField === "lastUpdated" ? dates?.created : dates?.lastUpdated;
  const date = typeof rawValue === "string" ? rawValue : typeof fallback === "string" ? fallback : "";

  return {
    id,
    guestName: data.customer?.displayName || data.customer?.name || "Trusted Customer",
    rating: data.ratings?.product ?? data.ratings?.service ?? 0,
    itinerary: data.tags?.tour || data.product?.title || "",
    ship: data.tags?.ship || "",
    text: data.reviews?.productText || data.reviews?.serviceText || "",
    date,
    media: Array.isArray(data.media) ? data.media : [],
  };
}

/**
 * Scan reviews scoped to a specific itinerary's child tour names, applying an
 * in-memory predicate (theme membership or star rating). Firestore disallows
 * combining `in` with `array-contains` in one query, so we filter pages
 * client-side.
 */
async function getItineraryReviewsFiltered(
  brand: string,
  childItineraries: string[],
  matcher: (data: DocumentData) => boolean,
  dateField: DateField,
  dateRange: SummaryDateRange | undefined,
  pageSize: number,
  cursor: ReviewPageCursor
): Promise<ReviewPage> {
  const tourNames = (childItineraries.length > 0 ? childItineraries : [])
    .slice(0, TOUR_IN_LIMIT);
  if (tourNames.length === 0) {
    return { reviews: [], cursor: null, hasMore: false };
  }

  const db = getClientDb();
  const ref = collection(db, "reviews");
  const path = dateFieldPath(dateField);
  const constraints: QueryConstraint[] = [];
  if (brand !== "combined") constraints.push(where("brand", "==", brand));
  constraints.push(where("tags.tour", "in", tourNames));
  if (dateRange?.start) constraints.push(where(path, ">=", dateRange.start.toISOString()));
  if (dateRange?.end) constraints.push(where(path, "<=", dateRange.end.toISOString()));
  constraints.push(orderBy(path, "desc"));

  const targetSize = pageSize + 1;
  const reviews: ThemeReview[] = [];
  const matchDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let scanCursor: QueryDocumentSnapshot<DocumentData> | null = cursor;

  outer: while (reviews.length < targetSize) {
    const pageConstraints: QueryConstraint[] = [
      ...constraints,
      limit(ITINERARY_REVIEW_BATCH_SIZE),
    ];
    if (scanCursor) pageConstraints.push(startAfter(scanCursor));

    const snap = await getDocs(query(ref, ...pageConstraints));
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      scanCursor = docSnap;
      const data = docSnap.data();
      if (matcher(data)) {
        reviews.push(mapItineraryReviewDoc(docSnap.id, data, dateField));
        matchDocs.push(docSnap);
        if (reviews.length >= targetSize) break outer;
      }
    }

    if (snap.docs.length < ITINERARY_REVIEW_BATCH_SIZE) break;
  }

  const hasMore = reviews.length > pageSize;
  const pageReviews = reviews.slice(0, pageSize);
  const pageMatchDocs = matchDocs.slice(0, pageSize);

  return {
    reviews: pageReviews,
    cursor: pageMatchDocs[pageMatchDocs.length - 1] ?? scanCursor,
    hasMore,
  };
}

export async function getItineraryReviewsByTheme(
  brand: string,
  childItineraries: string[],
  theme: string,
  type: "positive" | "negative",
  dateField: DateField,
  dateRange: SummaryDateRange | undefined,
  pageSize: number = REVIEW_PANEL_PAGE_SIZE,
  cursor: ReviewPageCursor = null
): Promise<ReviewPage> {
  return getItineraryReviewsFiltered(
    brand,
    childItineraries,
    (data) => {
      const themes = data.themes?.[type];
      return Array.isArray(themes) && themes.includes(theme);
    },
    dateField,
    dateRange,
    pageSize,
    cursor
  );
}

export async function getItineraryReviewsByStar(
  brand: string,
  childItineraries: string[],
  star: number,
  dateField: DateField,
  dateRange: SummaryDateRange | undefined,
  pageSize: number = REVIEW_PANEL_PAGE_SIZE,
  cursor: ReviewPageCursor = null
): Promise<ReviewPage> {
  return getItineraryReviewsFiltered(
    brand,
    childItineraries,
    (data) => {
      const rating = data.ratings?.product ?? data.ratings?.service ?? null;
      return typeof rating === "number" && Math.round(rating) === star;
    },
    dateField,
    dateRange,
    pageSize,
    cursor
  );
}

export async function getItineraryQuotes(
  itineraryName: string,
  childItineraries: string[],
  _ship: string,
  brand: string = "combined",
  dateRange?: SummaryDateRange,
  dateField: DateField = "created"
): Promise<{ positive: Quote[]; negative: Quote[] }> {
  const db = getClientDb();
  const ref = collection(db, "reviews");
  const path = dateFieldPath(dateField);
  // Use childItineraries to match all variant tour names; Firestore "in" supports up to 30
  const tourNames = childItineraries.length > 0 ? childItineraries.slice(0, 30) : [itineraryName];
  const reviewLimit = dateRange && !usesAllTimeSummaries(dateRange) ? 100 : 20;
  const baseConstraints = [
    where("tags.tour", "in", tourNames),
    orderBy(path, "desc"),
    limit(reviewLimit),
  ];
  if (brand !== "combined") {
    baseConstraints.unshift(where("brand", "==", brand));
  }

  const snap = await getDocs(query(ref, ...baseConstraints));

  const positive: Quote[] = [];
  const negative: Quote[] = [];
  const startIso = dateRange?.start.toISOString();
  const endIso = dateRange?.end.toISOString();

  for (const d of snap.docs) {
    const data = d.data();
    const dates = data.dates as { created?: unknown; lastUpdated?: unknown } | undefined;
    const rawValue = dateField === "lastUpdated" ? dates?.lastUpdated : dates?.created;
    const value = typeof rawValue === "string" ? rawValue : "";
    if (
      startIso &&
      endIso &&
      (!value || value < startIso || value > endIso)
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
      ship: data.tags?.ship || "",
      itinerary: data.tags?.tour || data.product?.title || itineraryName,
      text,
      date: value,
    };

    if (rating >= 4 && positive.length < 5) {
      positive.push(quote);
    } else if (rating <= 3 && negative.length < 3) {
      negative.push(quote);
    }
  }

  return { positive, negative };
}
