import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
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
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_FLEET_SUMMARY: FleetSummary = {
  totalReviews: 1247,
  averageRating: 4.72,
  fiveStarPercent: 78.3,
  fourPlusPercent: 94.1,
  totalItineraries: 42,
  totalShips: 18,
  ratingDistribution: [
    { star: 5, count: 977 },
    { star: 4, count: 197 },
    { star: 3, count: 48 },
    { star: 2, count: 16 },
    { star: 1, count: 9 },
  ],
  previousPeriodReviews: 1120,
  previousPeriodRating: 4.68,
  positiveThemes: [
    { theme: "Exceptional Crew Service", count: 412 },
    { theme: "Beautiful Itineraries", count: 387 },
    { theme: "Gourmet Dining", count: 341 },
    { theme: "Luxurious Accommodations", count: 298 },
    { theme: "Enriching Excursions", count: 276 },
    { theme: "Stunning Scenery", count: 254 },
    { theme: "Smooth Embarkation", count: 198 },
    { theme: "Cultural Immersion", count: 187 },
    { theme: "Attentive Butler Service", count: 165 },
    { theme: "Onboard Entertainment", count: 142 },
  ],
  negativeThemes: [
    { theme: "Wi-Fi Connectivity", count: 89 },
    { theme: "Cabin Size", count: 67 },
    { theme: "Shore Excursion Pace", count: 54 },
    { theme: "Embarkation Delays", count: 41 },
    { theme: "Noise Levels", count: 38 },
    { theme: "Menu Variety", count: 34 },
    { theme: "Air Conditioning Issues", count: 29 },
    { theme: "Communication Gaps", count: 24 },
    { theme: "Transfer Logistics", count: 19 },
    { theme: "Pool Area Crowding", count: 15 },
  ],
};

const MOCK_MONTHLY_SUMMARIES: MonthlySummary[] = [
  { month: "2025-04", averageRating: 4.65, reviewCount: 87 },
  { month: "2025-05", averageRating: 4.71, reviewCount: 102 },
  { month: "2025-06", averageRating: 4.68, reviewCount: 118 },
  { month: "2025-07", averageRating: 4.74, reviewCount: 134 },
  { month: "2025-08", averageRating: 4.69, reviewCount: 127 },
  { month: "2025-09", averageRating: 4.77, reviewCount: 115 },
  { month: "2025-10", averageRating: 4.73, reviewCount: 98 },
  { month: "2025-11", averageRating: 4.80, reviewCount: 89 },
  { month: "2025-12", averageRating: 4.76, reviewCount: 78 },
  { month: "2026-01", averageRating: 4.72, reviewCount: 104 },
  { month: "2026-02", averageRating: 4.78, reviewCount: 96 },
  { month: "2026-03", averageRating: 4.75, reviewCount: 99 },
];

const MOCK_ENTITY_SUMMARIES: EntitySummary[] = [
  { id: "1", name: "Enchanting Danube", ships: ["S.S. Maria Theresa"], averageRating: 4.89, reviewCount: 142, fiveStarPercent: 87.3 },
  { id: "2", name: "Castles Along the Rhine", ships: ["S.S. Antoinette"], averageRating: 4.82, reviewCount: 128, fiveStarPercent: 83.6 },
  { id: "3", name: "European Jewels", ships: ["S.S. Beatrice"], averageRating: 4.76, reviewCount: 115, fiveStarPercent: 80.0 },
  { id: "4", name: "Brilliant Bordeaux", ships: ["S.S. Bon Voyage"], averageRating: 4.71, reviewCount: 97, fiveStarPercent: 77.3 },
  { id: "5", name: "Treasures of Egypt", ships: ["S.S. Sphinx"], averageRating: 4.68, reviewCount: 89, fiveStarPercent: 74.2 },
  { id: "6", name: "Remarkable Rhine & Historic Holland", ships: ["River Duchess"], averageRating: 4.65, reviewCount: 82, fiveStarPercent: 72.0 },
  { id: "7", name: "Enchanting Mekong", ships: ["Mekong Jewel"], averageRating: 4.58, reviewCount: 76, fiveStarPercent: 68.4 },
  { id: "8", name: "Delightful Douro", ships: ["S.S. São Gabriel"], averageRating: 4.52, reviewCount: 71, fiveStarPercent: 66.2 },
  { id: "9", name: "India's Golden Triangle & Ganges", ships: ["Ganges Voyager II"], averageRating: 4.45, reviewCount: 64, fiveStarPercent: 62.5 },
  { id: "10", name: "Grand China & the Yangtze", ships: ["Century Legend"], averageRating: 4.31, reviewCount: 58, fiveStarPercent: 55.2 },
  { id: "11", name: "Peruvian Amazon", ships: ["Aria Amazon"], averageRating: 4.78, reviewCount: 53, fiveStarPercent: 81.1 },
  { id: "12", name: "Venice & the Gems of Northern Italy", ships: ["S.S. La Venezia"], averageRating: 4.85, reviewCount: 94, fiveStarPercent: 85.1 },
  { id: "13", name: "Splendors of Egypt & the Nile", ships: ["S.S. Sphinx"], averageRating: 4.62, reviewCount: 68, fiveStarPercent: 70.6 },
  { id: "14", name: "Portuguese Passageways", ships: ["S.S. São Gabriel"], averageRating: 4.48, reviewCount: 61, fiveStarPercent: 63.9 },
  { id: "15", name: "Timeless Wonders of Vietnam, Cambodia & Mekong", ships: ["Mekong Jewel"], averageRating: 4.39, reviewCount: 49, fiveStarPercent: 59.2 },
];

function generateMockReviews(theme: string, type: "positive" | "negative"): ThemeReview[] {
  const positiveTexts = [
    `The ${theme.toLowerCase()} on this cruise was absolutely outstanding. Every detail was carefully considered and the experience exceeded all our expectations.`,
    `We were so impressed with the ${theme.toLowerCase()}. The staff went above and beyond to ensure everything was perfect. Would definitely recommend!`,
    `${theme} was the highlight of our journey. The attention to detail was remarkable and truly set this cruise apart from others we have taken.`,
    `Cannot say enough about the ${theme.toLowerCase()}. From start to finish, it was a five-star experience that we will cherish forever.`,
    `The ${theme.toLowerCase()} made our trip unforgettable. We have cruised many times but this was truly special and unique.`,
  ];
  const negativeTexts = [
    `Unfortunately, the ${theme.toLowerCase()} was disappointing. We expected better given the premium price point of this cruise.`,
    `The ${theme.toLowerCase()} needs improvement. While the rest of the experience was good, this area let us down significantly.`,
    `We were let down by the ${theme.toLowerCase()}. For a luxury cruise, this should have been handled much better.`,
    `${theme} was the weakest aspect of our cruise. The crew tried their best but the issue persisted throughout our voyage.`,
    `Had issues with ${theme.toLowerCase()} during our trip. Management acknowledged the problem but could not resolve it in time.`,
  ];
  const names = ["Margaret W.", "Robert T.", "Susan K.", "James P.", "Patricia H."];
  const itineraries = ["Enchanting Danube", "Castles Along the Rhine", "European Jewels", "Brilliant Bordeaux", "Treasures of Egypt"];
  const ships = ["S.S. Maria Theresa", "S.S. Antoinette", "S.S. Beatrice", "S.S. Bon Voyage", "S.S. Sphinx"];
  const texts = type === "positive" ? positiveTexts : negativeTexts;

  return texts.map((text, i) => ({
    id: `${type}-${theme}-${i}`,
    guestName: names[i],
    rating: type === "positive" ? (i < 3 ? 5 : 4) : (i < 2 ? 2 : 3),
    itinerary: itineraries[i],
    ship: ships[i],
    text,
    date: `2026-0${(i % 3) + 1}-${10 + i}`,
  }));
}

// ── Query functions (Firestore with mock fallback) ─────────────────────────

const USE_MOCK = true; // Toggle when Firestore is ready

export async function getFleetSummary(brand: string): Promise<FleetSummary> {
  if (USE_MOCK) return MOCK_FLEET_SUMMARY;

  const ref = collection(db, "fleet_summaries");
  const q = query(ref, where("brand", "==", brand), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) return MOCK_FLEET_SUMMARY;
  return snap.docs[0].data() as FleetSummary;
}

export async function getMonthlySummaries(brand: string): Promise<MonthlySummary[]> {
  if (USE_MOCK) return MOCK_MONTHLY_SUMMARIES;

  const ref = collection(db, "monthly_summaries");
  const q = query(ref, where("brand", "==", brand), orderBy("month", "asc"));
  const snap = await getDocs(q);

  if (snap.empty) return MOCK_MONTHLY_SUMMARIES;
  return snap.docs.map((d) => d.data() as MonthlySummary);
}

export async function getEntitySummaries(
  brand: string,
  scope: "ship" | "itinerary" = "itinerary"
): Promise<EntitySummary[]> {
  if (USE_MOCK) return MOCK_ENTITY_SUMMARIES;

  const ref = collection(db, "entity_summaries");
  const q = query(ref, where("brand", "==", brand), where("scope", "==", scope));
  const snap = await getDocs(q);

  if (snap.empty) return MOCK_ENTITY_SUMMARIES;
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntitySummary);
}

export async function getReviewsByTheme(
  brand: string,
  theme: string,
  type: "positive" | "negative"
): Promise<ThemeReview[]> {
  if (USE_MOCK) return generateMockReviews(theme, type);

  const ref = collection(db, "reviews");
  const q = query(
    ref,
    where("brand", "==", brand),
    where(`themes.${type}`, "array-contains", theme),
    limit(20)
  );
  const snap = await getDocs(q);

  if (snap.empty) return generateMockReviews(theme, type);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeReview);
}
