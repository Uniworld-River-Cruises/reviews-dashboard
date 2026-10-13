import { getFirestore } from "firebase-admin/firestore";
import {
  ReviewDocument,
  Brand,
  fetchSummary,
  rawItineraryName,
  resolveItineraryGroup,
} from "@feefo/shared";
import { getMappingLookup } from "./itinerary-mappings";
import { syncDerivedReviewFields } from "./derived-fields";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface Summary {
  id: string;
  brand: string;
  /** "product" = one trip, keyed by Feefo parent_product_sku. */
  scope: "fleet" | "ship" | "itinerary" | "product";
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
  /** Feefo's own merchant rating/count (fleet docs only). Kept from the
   * previous doc when Feefo can't be reached, so a blip never blanks them. */
  feefoRating?: number | null;
  feefoCount?: number | null;
  feefoFetchedAt?: string | null;
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

    // Fleet-level summary, carrying Feefo's own headline numbers.
    const fleetSummary = buildSummary(brand, "fleet", null, reviews);
    Object.assign(fleetSummary, await getFeefoHeadline(brand));
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

    // Per-itinerary summaries - group by effective parent name via mappings.
    // syncDerivedReviewFields stores the same group on each review for the
    // API's `itinerary` filter, so both must use resolveItineraryGroup.
    const mappingLookup = await getMappingLookup(brand);
    const byItinerary = groupBy(reviews, (r) => resolveItineraryGroup(r, mappingLookup));

    for (const [itinerary, itinReviews] of Object.entries(byItinerary)) {
      if (!itinerary) continue;
      const summary = buildSummary(brand, "itinerary", itinerary, itinReviews);
      summary.ships = [
        ...new Set(itinReviews.map((r) => r.tags.ship).filter(Boolean) as string[]),
      ];
      // Track which raw itinerary names rolled up into this parent.
      summary.childItineraries = [
        ...new Set(itinReviews.map(rawItineraryName).filter(Boolean) as string[]),
      ];
      const docId = `${brand}_itinerary_${slugify(itinerary)}`;
      await db.collection("summaries").doc(docId).set(summary);
    }

    // Per-trip summaries, keyed by Feefo parent_product_sku (the website's
    // itinerary code) rather than by itinerary name.
    const byProduct = groupBy(reviews, (r) => r.product?.parentSku?.trim() || null);
    const productWriter = db.bulkWriter();
    for (const [parentSku, productReviews] of Object.entries(byProduct)) {
      const summary = buildSummary(brand, "product", parentSku, productReviews);
      summary.ships = [
        ...new Set(productReviews.map((r) => r.tags.ship).filter(Boolean) as string[]),
      ].sort();
      // Trip names (product titles) that share this parent sku.
      summary.itineraries = [
        ...new Set(productReviews.map((r) => r.product.title).filter(Boolean)),
      ].sort();
      productWriter.set(db.collection("summaries").doc(summary.id), summary);
    }
    await productWriter.close();

    await computeMonthlySummaries(brand, reviews);
    await cleanStaleSummaries(brand, byShip, byItinerary, byProduct);

    const derived = await syncDerivedReviewFields(snapshot.docs, mappingLookup);

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
        productCount: Object.keys(byProduct).length,
        feefoRating: fleetSummary.feefoRating ?? null,
        feefoCount: fleetSummary.feefoCount ?? null,
        ...derived,
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

/**
 * Feefo's own merchant rating and count (what Feefo publishes, e.g. 4.8 from
 * 24,888 reviews). On failure, keep the previously stored values.
 */
async function getFeefoHeadline(
  brand: Brand
): Promise<Pick<Summary, "feefoRating" | "feefoCount" | "feefoFetchedAt">> {
  try {
    const feefo = await fetchSummary(brand);
    const rating = feefo.rating?.rating;
    const count = feefo.meta?.count;
    if (typeof rating === "number" && typeof count === "number") {
      return { feefoRating: rating, feefoCount: count, feefoFetchedAt: new Date().toISOString() };
    }
    console.warn(`Feefo summary for ${brand} had no rating/count; keeping previous values`);
  } catch (error) {
    console.warn(`Feefo summary fetch failed for ${brand}; keeping previous values`, error);
  }
  const previous = (await getFirestore().collection("summaries").doc(brand).get()).data();
  return {
    feefoRating: typeof previous?.feefoRating === "number" ? previous.feefoRating : null,
    feefoCount: typeof previous?.feefoCount === "number" ? previous.feefoCount : null,
    feefoFetchedAt: typeof previous?.feefoFetchedAt === "string" ? previous.feefoFetchedAt : null,
  };
}

async function cleanStaleSummaries(
  brand: Brand,
  byShip: Record<string, ReviewDocument[]>,
  byItinerary: Record<string, ReviewDocument[]>,
  byProduct: Record<string, ReviewDocument[]>
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
    if (data.scope === "product" && data.scopeValue && !byProduct[data.scopeValue]) {
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
