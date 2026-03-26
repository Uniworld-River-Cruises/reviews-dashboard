import type { Quote } from "@/components/dashboard/QuotesSection";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ItinerarySummary {
  slug: string;
  name: string;
  ships: string[];
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

// ── Mock data ──────────────────────────────────────────────────────────────

const FLEET_AVG_RATING = 4.72;
const FLEET_AVG_FIVE_STAR = 78.3;

const MOCK_ITINERARIES: ItinerarySummary[] = [
  {
    slug: "rhine-holiday-markets",
    name: "Rhine Holiday Markets",
    ships: ["S.S. Antoinette"],
    averageRating: 4.86,
    reviewCount: 134,
    fiveStarPercent: 85.8,
    fourPlusPercent: 95.5,
    ratingDistribution: [
      { star: 5, count: 115 },
      { star: 4, count: 13 },
      { star: 3, count: 4 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Christmas Market Excursions", count: 78 },
      { theme: "Festive Onboard Atmosphere", count: 65 },
      { theme: "Exceptional Crew Service", count: 54 },
      { theme: "Gourmet Holiday Dining", count: 48 },
      { theme: "Beautiful Scenery", count: 41 },
    ],
    negativeThemes: [
      { theme: "Cold Weather Preparation", count: 12 },
      { theme: "Crowded Markets", count: 9 },
      { theme: "Wi-Fi Connectivity", count: 7 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "splendors-of-egypt",
    name: "Splendors of Egypt & the Nile",
    ships: ["S.S. Sphinx"],
    averageRating: 4.62,
    reviewCount: 98,
    fiveStarPercent: 70.4,
    fourPlusPercent: 91.8,
    ratingDistribution: [
      { star: 5, count: 69 },
      { star: 4, count: 21 },
      { star: 3, count: 5 },
      { star: 2, count: 2 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Ancient Temple Visits", count: 62 },
      { theme: "Egyptologist Guides", count: 51 },
      { theme: "Luxurious Ship Amenities", count: 43 },
      { theme: "Nile Sunset Views", count: 38 },
      { theme: "Cultural Immersion", count: 32 },
    ],
    negativeThemes: [
      { theme: "Extreme Heat", count: 14 },
      { theme: "Shore Excursion Pace", count: 11 },
      { theme: "Air Conditioning Issues", count: 8 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "enchanting-danube",
    name: "Enchanting Danube",
    ships: ["S.S. Maria Theresa"],
    averageRating: 4.89,
    reviewCount: 142,
    fiveStarPercent: 87.3,
    fourPlusPercent: 96.5,
    ratingDistribution: [
      { star: 5, count: 124 },
      { star: 4, count: 13 },
      { star: 3, count: 3 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Exceptional Crew Service", count: 72 },
      { theme: "Gourmet Dining", count: 63 },
      { theme: "Historic City Tours", count: 55 },
      { theme: "Luxurious Accommodations", count: 48 },
      { theme: "Stunning River Views", count: 41 },
    ],
    negativeThemes: [
      { theme: "Wi-Fi Connectivity", count: 10 },
      { theme: "Cabin Size", count: 7 },
      { theme: "Embarkation Delays", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "castles-along-the-rhine",
    name: "Castles Along the Rhine",
    ships: ["S.S. Antoinette"],
    averageRating: 4.82,
    reviewCount: 128,
    fiveStarPercent: 83.6,
    fourPlusPercent: 94.5,
    ratingDistribution: [
      { star: 5, count: 107 },
      { star: 4, count: 14 },
      { star: 3, count: 4 },
      { star: 2, count: 2 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Castle Excursions", count: 68 },
      { theme: "Rhine Gorge Scenery", count: 59 },
      { theme: "Wine Tasting Events", count: 47 },
      { theme: "Attentive Butler Service", count: 41 },
      { theme: "Gourmet Dining", count: 36 },
    ],
    negativeThemes: [
      { theme: "Noise Levels", count: 11 },
      { theme: "Shore Excursion Pace", count: 8 },
      { theme: "Menu Variety", count: 6 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "brilliant-bordeaux",
    name: "Brilliant Bordeaux",
    ships: ["S.S. Bon Voyage"],
    averageRating: 4.71,
    reviewCount: 97,
    fiveStarPercent: 77.3,
    fourPlusPercent: 93.8,
    ratingDistribution: [
      { star: 5, count: 75 },
      { star: 4, count: 16 },
      { star: 3, count: 4 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Vineyard Excursions", count: 56 },
      { theme: "French Cuisine", count: 48 },
      { theme: "Wine Pairings", count: 41 },
      { theme: "Charming Villages", count: 35 },
      { theme: "Exceptional Crew Service", count: 29 },
    ],
    negativeThemes: [
      { theme: "Transfer Logistics", count: 9 },
      { theme: "Wi-Fi Connectivity", count: 7 },
      { theme: "Cabin Size", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "european-jewels",
    name: "European Jewels",
    ships: ["S.S. Beatrice"],
    averageRating: 4.76,
    reviewCount: 115,
    fiveStarPercent: 80.0,
    fourPlusPercent: 93.9,
    ratingDistribution: [
      { star: 5, count: 92 },
      { star: 4, count: 16 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Multi-Country Experience", count: 61 },
      { theme: "Exceptional Crew Service", count: 52 },
      { theme: "Historic City Tours", count: 44 },
      { theme: "Gourmet Dining", count: 38 },
      { theme: "Onboard Entertainment", count: 31 },
    ],
    negativeThemes: [
      { theme: "Long Port Days", count: 10 },
      { theme: "Embarkation Delays", count: 8 },
      { theme: "Communication Gaps", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "venice-gems-of-northern-italy",
    name: "Venice & the Gems of Northern Italy",
    ships: ["S.S. La Venezia"],
    averageRating: 4.85,
    reviewCount: 94,
    fiveStarPercent: 85.1,
    fourPlusPercent: 95.7,
    ratingDistribution: [
      { star: 5, count: 80 },
      { star: 4, count: 10 },
      { star: 3, count: 3 },
      { star: 2, count: 1 },
      { star: 1, count: 0 },
    ],
    positiveThemes: [
      { theme: "Venetian Excursions", count: 54 },
      { theme: "Italian Cuisine", count: 47 },
      { theme: "Art and Architecture", count: 39 },
      { theme: "Luxurious Ship Amenities", count: 34 },
      { theme: "Stunning Scenery", count: 28 },
    ],
    negativeThemes: [
      { theme: "Crowded Venice Areas", count: 8 },
      { theme: "Shore Excursion Pace", count: 6 },
      { theme: "Noise Levels", count: 4 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "delightful-douro",
    name: "Delightful Douro",
    ships: ["S.S. Sao Gabriel"],
    averageRating: 4.52,
    reviewCount: 71,
    fiveStarPercent: 66.2,
    fourPlusPercent: 90.1,
    ratingDistribution: [
      { star: 5, count: 47 },
      { star: 4, count: 17 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Port Wine Tastings", count: 38 },
      { theme: "Terraced Vineyards", count: 31 },
      { theme: "Friendly Crew", count: 26 },
      { theme: "Relaxed Pace", count: 21 },
      { theme: "Portuguese Culture", count: 17 },
    ],
    negativeThemes: [
      { theme: "Limited Excursion Options", count: 8 },
      { theme: "Wi-Fi Connectivity", count: 6 },
      { theme: "Menu Variety", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "remarkable-rhine-historic-holland",
    name: "Remarkable Rhine & Historic Holland",
    ships: ["River Duchess"],
    averageRating: 4.65,
    reviewCount: 82,
    fiveStarPercent: 72.0,
    fourPlusPercent: 92.7,
    ratingDistribution: [
      { star: 5, count: 59 },
      { star: 4, count: 17 },
      { star: 3, count: 4 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Dutch Windmill Tours", count: 42 },
      { theme: "Exceptional Crew Service", count: 35 },
      { theme: "Tulip Season Beauty", count: 29 },
      { theme: "Cultural Immersion", count: 24 },
      { theme: "Smooth Embarkation", count: 19 },
    ],
    negativeThemes: [
      { theme: "Cabin Size", count: 9 },
      { theme: "Noise Levels", count: 6 },
      { theme: "Transfer Logistics", count: 4 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
  {
    slug: "enchanting-mekong",
    name: "Enchanting Mekong",
    ships: ["Mekong Jewel"],
    averageRating: 4.58,
    reviewCount: 76,
    fiveStarPercent: 68.4,
    fourPlusPercent: 90.8,
    ratingDistribution: [
      { star: 5, count: 52 },
      { star: 4, count: 17 },
      { star: 3, count: 5 },
      { star: 2, count: 1 },
      { star: 1, count: 1 },
    ],
    positiveThemes: [
      { theme: "Cultural Immersion", count: 41 },
      { theme: "Floating Market Visits", count: 34 },
      { theme: "Friendly Local Guides", count: 28 },
      { theme: "Unique Experiences", count: 23 },
      { theme: "Gourmet Asian Cuisine", count: 18 },
    ],
    negativeThemes: [
      { theme: "Extreme Heat", count: 10 },
      { theme: "Wi-Fi Connectivity", count: 7 },
      { theme: "Transfer Logistics", count: 5 },
    ],
    fleetAvgRating: FLEET_AVG_RATING,
    fleetAvgFiveStar: FLEET_AVG_FIVE_STAR,
  },
];

function generateItineraryQuotes(itineraryName: string, ship: string): { positive: Quote[]; negative: Quote[] } {
  const positiveQuotes: Quote[] = [
    {
      id: `${itineraryName}-pos-1`,
      guestName: "Margaret W.",
      rating: 5,
      ship,
      itinerary: itineraryName,
      text: `The ${itineraryName} was an absolutely magical experience from start to finish. Every port of call was carefully curated and the excursions provided deep cultural insight. The crew on the ${ship} went above and beyond to make every guest feel special. I have traveled extensively and this was one of the most memorable journeys of my life. The attention to detail in every aspect of the trip was simply outstanding.`,
      date: "2026-02-15",
    },
    {
      id: `${itineraryName}-pos-2`,
      guestName: "Robert T.",
      rating: 5,
      ship,
      itinerary: itineraryName,
      text: `We chose the ${itineraryName} for our anniversary and it exceeded every expectation. The ${ship} is beautifully maintained and the dining was world-class. Our butler anticipated our every need. The daily excursions were well-paced and informative.`,
      date: "2026-01-22",
    },
    {
      id: `${itineraryName}-pos-3`,
      guestName: "Susan K.",
      rating: 5,
      ship,
      itinerary: itineraryName,
      text: `Third time cruising with Uniworld and the ${itineraryName} might be my favorite yet. The combination of stunning scenery, gourmet meals, and enriching shore excursions creates an unbeatable travel experience. Already planning our next voyage!`,
      date: "2026-03-08",
    },
    {
      id: `${itineraryName}-pos-4`,
      guestName: "James P.",
      rating: 4,
      ship,
      itinerary: itineraryName,
      text: `A wonderful journey through some of the most beautiful regions. The crew was attentive and the ship was impeccably clean. Highly recommend this itinerary to anyone considering a river cruise.`,
      date: "2026-02-01",
    },
    {
      id: `${itineraryName}-pos-5`,
      guestName: "Patricia H.",
      rating: 5,
      ship,
      itinerary: itineraryName,
      text: `The ${itineraryName} offered the perfect blend of relaxation and exploration. Every day brought new discoveries and the onboard entertainment was delightful. The sommelier curated excellent wine pairings for each dinner.`,
      date: "2026-01-18",
    },
  ];

  const negativeQuotes: Quote[] = [
    {
      id: `${itineraryName}-neg-1`,
      guestName: "David M.",
      rating: 3,
      ship,
      itinerary: itineraryName,
      text: `While the ${itineraryName} was generally enjoyable, I felt some of the shore excursions were too rushed. We barely had time to appreciate the major sites before being hurried back to the bus. For the premium price point, I expected a more leisurely pace with more free time to explore independently. The ship itself was lovely but the Wi-Fi was almost unusable throughout the trip.`,
      date: "2026-02-20",
    },
    {
      id: `${itineraryName}-neg-2`,
      guestName: "Linda C.",
      rating: 2,
      ship,
      itinerary: itineraryName,
      text: `Disappointed with the cabin size on the ${ship}. For a luxury cruise, the room felt cramped and storage was insufficient. The bathroom was particularly small. Other aspects of the trip were fine but this significantly impacted our comfort.`,
      date: "2026-01-30",
    },
    {
      id: `${itineraryName}-neg-3`,
      guestName: "Thomas R.",
      rating: 3,
      ship,
      itinerary: itineraryName,
      text: `The itinerary itself was beautiful but the embarkation process was chaotic and took much longer than expected. Communication about schedule changes was also lacking. The crew was friendly but seemed understaffed during peak times.`,
      date: "2026-03-05",
    },
  ];

  return { positive: positiveQuotes, negative: negativeQuotes };
}

// ── Query functions ─────────────────────────────────────────────────────────

export async function getItineraries(): Promise<ItinerarySummary[]> {
  return MOCK_ITINERARIES;
}

export async function getItineraryBySlug(slug: string): Promise<ItinerarySummary | null> {
  return MOCK_ITINERARIES.find((it) => it.slug === slug) ?? null;
}

export async function getItineraryQuotes(
  itineraryName: string,
  ship: string
): Promise<{ positive: Quote[]; negative: Quote[] }> {
  return generateItineraryQuotes(itineraryName, ship);
}
