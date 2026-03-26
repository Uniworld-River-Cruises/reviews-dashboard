import { getFirestore } from "firebase-admin/firestore";
import { ReviewDocument, Brand } from "@feefo/shared";

interface Summary {
  id: string;
  brand: string;
  scope: "fleet" | "ship" | "itinerary";
  scopeValue: string | null;
  totalReviews: number;
  reviewsWithComments: number;
  avgRating: number;
  starDistribution: Record<string, number>;
  topPositiveThemes: { theme: string; count: number }[];
  topNegativeThemes: { theme: string; count: number }[];
  ships: string[];
  itineraries: string[];
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

export async function computeSummaries(brand: Brand): Promise<void> {
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
    summary.itineraries = [...new Set(shipReviews.map((r) => r.tags.tour).filter(Boolean) as string[])];
    const docId = `${brand}_ship_${slugify(ship)}`;
    await db.collection("summaries").doc(docId).set(summary);
  }

  // Per-itinerary summaries (using tags.tour, NOT product.title)
  const byItinerary = groupBy(reviews, (r) => r.tags.tour ?? r.product.title);
  for (const [itinerary, itinReviews] of Object.entries(byItinerary)) {
    if (!itinerary) continue;
    const summary = buildSummary(brand, "itinerary", itinerary, itinReviews);
    summary.ships = [...new Set(itinReviews.map((r) => r.tags.ship).filter(Boolean) as string[])];
    const docId = `${brand}_itinerary_${slugify(itinerary)}`;
    await db.collection("summaries").doc(docId).set(summary);
  }

  // Monthly summaries for trend charts
  await computeMonthlySummaries(brand, reviews);

  // Clean stale summaries
  await cleanStaleSummaries(brand, byShip, byItinerary);
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
    const ratings = monthReviews.map((r) => r.ratings.product).filter((r): r is number => r !== null);
    const starDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of ratings) {
      starDist[String(Math.round(r))] = (starDist[String(Math.round(r))] || 0) + 1;
    }

    const doc: MonthlySummary = {
      id: `${brand}_${month}`,
      brand,
      month,
      totalReviews: monthReviews.length,
      avgRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0,
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
  const existing = await db.collection("summaries")
    .where("brand", "==", brand)
    .get();

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

  const positiveCounts: Record<string, number> = {};
  const negativeCounts: Record<string, number> = {};

  for (const r of reviews) {
    for (const theme of r.themes.positive) {
      positiveCounts[theme] = (positiveCounts[theme] || 0) + 1;
    }
    for (const theme of r.themes.negative) {
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
