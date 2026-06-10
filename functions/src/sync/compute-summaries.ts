import { getFirestore } from "firebase-admin/firestore";
import { ReviewDocument, Brand, normalizeItineraryName } from "@feefo/shared";
import { getMappingLookup } from "./itinerary-mappings";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface Summary {
  id: string;
  brand: string;
  scope: "fleet" | "ship" | "itinerary";
  scopeValue: string | null;
  totalReviews: number;
  reviewsWithComments: number;
  /** Average and distribution of PRODUCT ratings (the dashboard's headline). */
  avgRating: number;
  starDistribution: Record<string, number>;
  /** Average and distribution of SERVICE ratings — Feefo splits the two, and
   * the public API's summary endpoint mirrors that split. Reviews without a
   * service rating are simply absent from this distribution. */
  serviceAvgRating: number;
  serviceStarDistribution: Record<string, number>;
  topPositiveThemes: { theme: string; count: number }[];
  topNegativeThemes: { theme: string; count: number }[];
  ships: string[];
  itineraries: string[];
  childItineraries: string[];
  lastUpdated: string;
}

interface MonthlySummary {
  id: string;
  brand: string;
  month: string;
  totalReviews: number;
  avgRating: number;
  starDistribution: Record<string, number>;
}

interface SummaryLogContext {
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

export async function computeSummaries(
  brand: Brand,
  logContext: SummaryLogContext = {}
): Promise<void> {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection("reviews")
      .where("brand", "==", brand)
      .get();

    const reviews = snapshot.docs.map((doc) => doc.data() as ReviewDocument);

    // Fleet-level summary
    const fleetSummary = buildSummary(brand, "fleet", null, reviews);
    await db.collection("summaries").doc(brand).set(fleetSummary);

    // Per-ship summaries
    const byShip = groupBy(reviews, (r) => r.tags.ship);
    for (const [ship, shipReviews] of Object.entries(byShip)) {
      if (!ship) continue;
      const summary = buildSummary(brand, "ship", ship, shipReviews);
      summary.itineraries = [
        ...new Set(shipReviews.map((r) => r.tags.tour).filter(Boolean) as string[]),
      ];
      const docId = `${brand}_ship_${slugify(ship)}`;
      await db.collection("summaries").doc(docId).set(summary);
    }

    // Per-itinerary summaries - group by effective parent name via mappings
    const mappingLookup = await getMappingLookup(brand);
    const resolveParent = (rawTour: string): string =>
      mappingLookup.get(rawTour) ?? normalizeItineraryName(rawTour);

    const byItinerary = groupBy(reviews, (r) => {
      const raw = r.tags.tour ?? r.product.title;
      return raw ? resolveParent(raw) : null;
    });

    for (const [itinerary, itinReviews] of Object.entries(byItinerary)) {
      if (!itinerary) continue;
      const summary = buildSummary(brand, "itinerary", itinerary, itinReviews);
      summary.ships = [
        ...new Set(itinReviews.map((r) => r.tags.ship).filter(Boolean) as string[]),
      ];
      // Track which raw itinerary names rolled up into this parent.
      summary.childItineraries = [
        ...new Set(
          itinReviews.map((r) => r.tags.tour ?? r.product.title).filter(Boolean) as string[]
        ),
      ];
      const docId = `${brand}_itinerary_${slugify(itinerary)}`;
      await db.collection("summaries").doc(docId).set(summary);
    }

    await computeMonthlySummaries(brand, reviews);
    await cleanStaleSummaries(brand, byShip, byItinerary);

    await writeOperationLog({
      type: "summary",
      level: "success",
      action: "recompute",
      message: `Rebuilt ${brand} summaries from ${reviews.length} review(s)`,
      brand,
      source: logContext.source ?? "system",
      actorEmail: logContext.actorEmail ?? null,
      actorUid: logContext.actorUid ?? null,
      details: {
        reviewCount: reviews.length,
        shipCount: Object.keys(byShip).length,
        itineraryCount: Object.keys(byItinerary).length,
      },
    });
  } catch (error) {
    await writeOperationLog({
      type: "summary",
      level: "error",
      action: "recompute",
      message: `Summary recompute failed for ${brand}`,
      brand,
      source: logContext.source ?? "system",
      actorEmail: logContext.actorEmail ?? null,
      actorUid: logContext.actorUid ?? null,
      details: {
        error: String(error),
      },
    });
    throw error;
  }
}

async function computeMonthlySummaries(brand: Brand, reviews: ReviewDocument[]): Promise<void> {
  const db = getFirestore();
  const byMonth = groupBy(reviews, (r) => {
    const date = new Date(r.dates.created);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  const writer = db.bulkWriter();

  for (const [month, monthReviews] of Object.entries(byMonth)) {
    if (!month) continue;
    const ratings = monthReviews
      .map((r) => r.ratings.product)
      .filter((r): r is number => r !== null);
    const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of ratings) {
      starDist[String(Math.round(r))] = (starDist[String(Math.round(r))] || 0) + 1;
    }

    const doc: MonthlySummary = {
      id: `${brand}_${month}`,
      brand,
      month,
      totalReviews: monthReviews.length,
      avgRating:
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100
            ) / 100
          : 0,
      starDistribution: starDist,
    };

    writer.set(db.collection("monthly_summaries").doc(doc.id), doc);
  }

  await writer.close();
}

async function cleanStaleSummaries(
  brand: Brand,
  byShip: Record<string, ReviewDocument[]>,
  byItinerary: Record<string, ReviewDocument[]>
): Promise<void> {
  const db = getFirestore();
  const existing = await db.collection("summaries").where("brand", "==", brand).get();

  const writer = db.bulkWriter();

  for (const doc of existing.docs) {
    const data = doc.data();
    if (data.scope === "ship" && data.scopeValue && !byShip[data.scopeValue]) {
      writer.delete(doc.ref);
    }
    if (data.scope === "itinerary" && data.scopeValue && !byItinerary[data.scopeValue]) {
      writer.delete(doc.ref);
    }
  }

  await writer.close();
}

function buildSummary(
  brand: Brand,
  scope: Summary["scope"],
  scopeValue: string | null,
  reviews: ReviewDocument[]
): Summary {
  const ratings = reviews.map((r) => r.ratings.product).filter((r): r is number => r !== null);
  const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let ratingSum = 0;

  for (const r of ratings) {
    starDist[String(Math.round(r))] = (starDist[String(Math.round(r))] || 0) + 1;
    ratingSum += r;
  }

  const serviceRatings = reviews
    .map((r) => r.ratings.service)
    .filter((r): r is number => r !== null);
  const serviceStarDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let serviceRatingSum = 0;

  for (const r of serviceRatings) {
    serviceStarDist[String(Math.round(r))] = (serviceStarDist[String(Math.round(r))] || 0) + 1;
    serviceRatingSum += r;
  }

  const positiveCounts: Record<string, number> = {};
  const negativeCounts: Record<string, number> = {};

  for (const r of reviews) {
    const themes = r.themes ?? { positive: [], negative: [] };
    for (const theme of themes.positive ?? []) {
      positiveCounts[theme] = (positiveCounts[theme] || 0) + 1;
    }
    for (const theme of themes.negative ?? []) {
      negativeCounts[theme] = (negativeCounts[theme] || 0) + 1;
    }
  }

  return {
    id: scopeValue ? `${brand}_${scope}_${slugify(scopeValue)}` : brand,
    brand,
    scope,
    scopeValue,
    totalReviews: reviews.length,
    reviewsWithComments: reviews.filter((r) => r.hasComment).length,
    avgRating: ratings.length > 0 ? Math.round((ratingSum / ratings.length) * 100) / 100 : 0,
    starDistribution: starDist,
    serviceAvgRating:
      serviceRatings.length > 0
        ? Math.round((serviceRatingSum / serviceRatings.length) * 100) / 100
        : 0,
    serviceStarDistribution: serviceStarDist,
    topPositiveThemes: Object.entries(positiveCounts)
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topNegativeThemes: Object.entries(negativeCounts)
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    ships: [],
    itineraries: [],
    childItineraries: [],
    lastUpdated: new Date().toISOString(),
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | null): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
  }
  return groups;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
