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

// ── Mock data ──────────────────────────────────────────────────────────────

const FLEET_AVG_RATING = 4.72;
const FLEET_AVG_FIVE_STAR = 78.3;

const MOCK_SHIPS: ShipSummary[] = [
  {
    slug: "ss-maria-theresa",
    name: "S.S. Maria Theresa",
    averageRating: 4.89,
    reviewCount: 186,
    fiveStarPercent: 87.6,
    fourPlusPercent: 96.2,
    itineraryCount: 3,
    itineraries: [
      { slug: "enchanting-danube", name: "Enchanting Danube", averageRating: 4.89, reviewCount: 142, fiveStarPercent: 87.3 },
      { slug: "european-jewels", name: "European Jewels", averageRating: 4.76, reviewCount: 28, fiveStarPercent: 82.1 },
      { slug: "remarkable-rhine-historic-holland", name: "Remarkable Rhine & Historic Holland", averageRating: 4.81, reviewCount: 16, fiveStarPercent: 81.3 },
    ],
    ratingDistribution: [
      { star: 5, count: 163 },
      { star: 4, count: 16 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Exceptional Crew Service", count: 89 },
      { theme: "Gourmet Dining", count: 74 },
      { theme: "Luxurious Accommodations", count: 62 },
      { theme: "Attentive Butler Service", count: 55 },
      { theme: "Beautiful Ship Design", count: 48 },
    ],
    negativeThemes: [
      { theme: "Wi-Fi Connectivity", count: 14 },
      { theme: "Cabin Size", count: 9 },
      { theme: "Noise Levels", count: 6 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "river-tosca",
    name: "River Tosca",
    averageRating: 4.64,
    reviewCount: 112,
    fiveStarPercent: 71.4,
    fourPlusPercent: 91.1,
    itineraryCount: 2,
    itineraries: [
      { slug: "splendors-of-egypt", name: "Splendors of Egypt & the Nile", averageRating: 4.62, reviewCount: 78, fiveStarPercent: 70.5 },
      { slug: "enchanting-mekong", name: "Treasures of the Nile", averageRating: 4.68, reviewCount: 34, fiveStarPercent: 73.5 },
    ],
    ratingDistribution: [
      { star: 5, count: 80 },
      { star: 4, count: 22 },
      { star: 3, count: 7 },
      { star: 2, count: 2 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Egyptologist Guides", count: 58 },
      { theme: "Ancient Temple Visits", count: 49 },
      { theme: "Nile Sunset Views", count: 41 },
      { theme: "Friendly Crew", count: 35 },
      { theme: "Comfortable Cabins", count: 28 },
    ],
    negativeThemes: [
      { theme: "Extreme Heat", count: 16 },
      { theme: "Air Conditioning Issues", count: 10 },
      { theme: "Shore Excursion Pace", count: 8 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "ss-joie-de-vivre",
    name: "S.S. Joie de Vivre",
    averageRating: 4.83,
    reviewCount: 145,
    fiveStarPercent: 84.1,
    fourPlusPercent: 95.2,
    itineraryCount: 2,
    itineraries: [
      { slug: "brilliant-bordeaux", name: "Brilliant Bordeaux", averageRating: 4.71, reviewCount: 97, fiveStarPercent: 77.3 },
      { slug: "rhine-holiday-markets", name: "Paris & Normandy", averageRating: 4.88, reviewCount: 48, fiveStarPercent: 87.5 },
    ],
    ratingDistribution: [
      { star: 5, count: 122 },
      { star: 4, count: 16 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "French Cuisine Excellence", count: 72 },
      { theme: "Wine Pairing Events", count: 61 },
      { theme: "Chic Ship Interiors", count: 53 },
      { theme: "Exceptional Crew Service", count: 45 },
      { theme: "Charming Port Towns", count: 38 },
    ],
    negativeThemes: [
      { theme: "Transfer Logistics", count: 11 },
      { theme: "Wi-Fi Connectivity", count: 9 },
      { theme: "Menu Repetition", count: 6 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "ss-antoinette",
    name: "S.S. Antoinette",
    averageRating: 4.84,
    reviewCount: 162,
    fiveStarPercent: 84.6,
    fourPlusPercent: 95.1,
    itineraryCount: 2,
    itineraries: [
      { slug: "castles-along-the-rhine", name: "Castles Along the Rhine", averageRating: 4.82, reviewCount: 128, fiveStarPercent: 83.6 },
      { slug: "rhine-holiday-markets", name: "Rhine Holiday Markets", averageRating: 4.86, reviewCount: 34, fiveStarPercent: 88.2 },
    ],
    ratingDistribution: [
      { star: 5, count: 137 },
      { star: 4, count: 17 },
      { star: 3, count: 5 },
      { star: 2, count: 2 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Rhine Gorge Scenery", count: 78 },
      { theme: "Exceptional Crew Service", count: 65 },
      { theme: "Gourmet Dining", count: 54 },
      { theme: "Luxurious Accommodations", count: 47 },
      { theme: "Wine Tasting Events", count: 39 },
    ],
    negativeThemes: [
      { theme: "Noise Levels", count: 12 },
      { theme: "Cabin Size", count: 8 },
      { theme: "Embarkation Delays", count: 6 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "river-queen",
    name: "River Queen",
    averageRating: 4.58,
    reviewCount: 89,
    fiveStarPercent: 68.5,
    fourPlusPercent: 89.9,
    itineraryCount: 2,
    itineraries: [
      { slug: "remarkable-rhine-historic-holland", name: "Remarkable Rhine & Historic Holland", averageRating: 4.65, reviewCount: 62, fiveStarPercent: 72.0 },
      { slug: "european-jewels", name: "European Jewels", averageRating: 4.48, reviewCount: 27, fiveStarPercent: 63.0 },
    ],
    ratingDistribution: [
      { star: 5, count: 61 },
      { star: 4, count: 19 },
      { star: 3, count: 6 },
      { star: 2, count: 2 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Friendly Crew", count: 42 },
      { theme: "Comfortable Cabins", count: 35 },
      { theme: "Good Value", count: 29 },
      { theme: "Smooth Embarkation", count: 23 },
      { theme: "Cultural Excursions", count: 18 },
    ],
    negativeThemes: [
      { theme: "Dated Interiors", count: 12 },
      { theme: "Wi-Fi Connectivity", count: 9 },
      { theme: "Menu Variety", count: 7 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "ss-la-venezia",
    name: "S.S. La Venezia",
    averageRating: 4.85,
    reviewCount: 94,
    fiveStarPercent: 85.1,
    fourPlusPercent: 95.7,
    itineraryCount: 1,
    itineraries: [
      { slug: "venice-gems-of-northern-italy", name: "Venice & the Gems of Northern Italy", averageRating: 4.85, reviewCount: 94, fiveStarPercent: 85.1 },
    ],
    ratingDistribution: [
      { star: 5, count: 80 },
      { star: 4, count: 10 },
      { star: 3, count: 3 },
      { star: 2, count: 1 },
      { star: 1, count: 0 },
    ],
    positiveThemes: [
      { theme: "Italian Cuisine", count: 52 },
      { theme: "Venetian Excursions", count: 45 },
      { theme: "Stunning Ship Design", count: 38 },
      { theme: "Art and Architecture", count: 31 },
      { theme: "Exceptional Crew Service", count: 26 },
    ],
    negativeThemes: [
      { theme: "Crowded Venice Areas", count: 9 },
      { theme: "Shore Excursion Pace", count: 6 },
      { theme: "Noise Levels", count: 4 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "ss-bon-voyage",
    name: "S.S. Bon Voyage",
    averageRating: 4.73,
    reviewCount: 108,
    fiveStarPercent: 78.7,
    fourPlusPercent: 93.5,
    itineraryCount: 2,
    itineraries: [
      { slug: "brilliant-bordeaux", name: "Brilliant Bordeaux", averageRating: 4.71, reviewCount: 76, fiveStarPercent: 77.6 },
      { slug: "delightful-douro", name: "Delightful Douro", averageRating: 4.52, reviewCount: 32, fiveStarPercent: 68.8 },
    ],
    ratingDistribution: [
      { star: 5, count: 85 },
      { star: 4, count: 16 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Vineyard Excursions", count: 54 },
      { theme: "French & Portuguese Cuisine", count: 46 },
      { theme: "Wine Pairings", count: 39 },
      { theme: "Beautiful Ship Interiors", count: 32 },
      { theme: "Attentive Butler Service", count: 26 },
    ],
    negativeThemes: [
      { theme: "Transfer Logistics", count: 10 },
      { theme: "Wi-Fi Connectivity", count: 8 },
      { theme: "Cabin Size", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
];

function generateShipQuotes(shipName: string): { positive: Quote[]; negative: Quote[] } {
  const positiveQuotes: Quote[] = [
    {
      id: `${shipName}-pos-1`,
      guestName: "Eleanor B.",
      rating: 5,
      ship: shipName,
      itinerary: "Enchanting Danube",
      text: `The ${shipName} is an absolute jewel of a ship. From the moment we stepped aboard, we were treated like royalty. The attention to detail in the design and decor is extraordinary, and the crew is among the finest we have ever encountered on any cruise line. Every meal was a culinary masterpiece and the butler service was impeccable. We cannot wait to sail on this beautiful ship again.`,
      date: "2026-02-12",
    },
    {
      id: `${shipName}-pos-2`,
      guestName: "Charles D.",
      rating: 5,
      ship: shipName,
      itinerary: "Castles Along the Rhine",
      text: `This was our second cruise on the ${shipName} and it was even better than the first. The ship is beautifully maintained, the food is outstanding, and the service is second to none. The sun deck offers breathtaking views of the passing scenery.`,
      date: "2026-01-28",
    },
    {
      id: `${shipName}-pos-3`,
      guestName: "Dorothy F.",
      rating: 5,
      ship: shipName,
      itinerary: "European Jewels",
      text: `The ${shipName} exceeded all expectations. The cabins are luxuriously appointed, the public spaces are elegant yet inviting, and the crew makes every guest feel special. A truly five-star experience from embarkation to disembarkation.`,
      date: "2026-03-02",
    },
    {
      id: `${shipName}-pos-4`,
      guestName: "Harold G.",
      rating: 4,
      ship: shipName,
      itinerary: "Brilliant Bordeaux",
      text: `A very enjoyable cruise on a well-run ship. The dining room serves excellent food and the bar staff make wonderful cocktails. The enrichment lectures were fascinating and informative.`,
      date: "2026-02-05",
    },
    {
      id: `${shipName}-pos-5`,
      guestName: "Beatrice N.",
      rating: 5,
      ship: shipName,
      itinerary: "Enchanting Danube",
      text: `Every aspect of the ${shipName} is designed for comfort and elegance. The spa is wonderful, the pool area is serene, and the fitness center is well-equipped. We loved every minute aboard this magnificent vessel.`,
      date: "2026-01-20",
    },
  ];

  const negativeQuotes: Quote[] = [
    {
      id: `${shipName}-neg-1`,
      guestName: "Richard J.",
      rating: 3,
      ship: shipName,
      itinerary: "European Jewels",
      text: `While the ${shipName} is a lovely ship overall, we were disappointed with the cabin size. For a luxury cruise at this price point, we expected more spacious accommodations. The closet space was particularly inadequate for a 10-day voyage. The bathroom was compact and the shower area could use improvement. Other guests we spoke with had similar concerns about the room dimensions.`,
      date: "2026-02-18",
    },
    {
      id: `${shipName}-neg-2`,
      guestName: "Janet L.",
      rating: 2,
      ship: shipName,
      itinerary: "Castles Along the Rhine",
      text: `The Wi-Fi on the ${shipName} was frustratingly unreliable throughout our cruise. In this day and age, even while on vacation, we need reliable internet access. This was a significant letdown for a ship that markets itself as a luxury experience.`,
      date: "2026-01-25",
    },
    {
      id: `${shipName}-neg-3`,
      guestName: "George S.",
      rating: 3,
      ship: shipName,
      itinerary: "Enchanting Danube",
      text: `Noise from the engine room was noticeable in our lower-deck cabin throughout the night. The front desk acknowledged the issue but could not offer a room change as the ship was fully booked. This affected our sleep quality significantly.`,
      date: "2026-03-10",
    },
  ];

  return { positive: positiveQuotes, negative: negativeQuotes };
}

// ── Query functions ─────────────────────────────────────────────────────────

export async function getShips(): Promise<ShipSummary[]> {
  return MOCK_SHIPS;
}

export async function getShipBySlug(slug: string): Promise<ShipSummary | null> {
  return MOCK_SHIPS.find((s) => s.slug === slug) ?? null;
}

export async function getShipQuotes(
  shipName: string
): Promise<{ positive: Quote[]; negative: Quote[] }> {
  return generateShipQuotes(shipName);
}
