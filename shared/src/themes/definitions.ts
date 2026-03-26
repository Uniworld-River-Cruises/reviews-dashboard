export const POSITIVE_THEMES = [
  { name: "Staff", description: "Crew, hospitality, professionalism, tour directors" },
  { name: "Service", description: "Attention, responsiveness, quality of service" },
  { name: "Food", description: "Meals, cuisine quality, dining experience" },
  { name: "Excursions", description: "Guided tours, shore excursions, activities" },
  { name: "Ship", description: "Vessel quality, design, amenities, decor" },
  { name: "Accommodation", description: "Cabin quality, rooms, staterooms, comfort" },
  { name: "Wine & Drinks", description: "Beverage selection, quality, inclusion" },
  { name: "Overall Experience", description: "General satisfaction, value, would-recommend" },
  { name: "Destination & Culture", description: "Destination-specific cultural experiences" },
  { name: "Entertainment", description: "Onboard entertainment, live music, events" },
] as const;

export const NEGATIVE_THEMES = [
  { name: "Food Quality", description: "Poor meals, dining issues, dietary needs unmet" },
  { name: "Excursion Quality", description: "Disappointing tours, poor guides, rushed" },
  { name: "Unmet Expectations", description: "Marketing vs reality gaps" },
  { name: "Ship Condition", description: "Maintenance issues, cleanliness, wear" },
  { name: "Space & Size", description: "Small cabins, cramped public areas" },
  { name: "Value", description: "Price vs quality concerns" },
  { name: "Temperature & Comfort", description: "Cabin temp, AC issues, physical comfort" },
  { name: "Noise", description: "Loud decks, mechanical sounds, disturbances" },
  { name: "Itinerary Changes", description: "Schedule alterations, cancelled stops" },
  { name: "Communication", description: "Poor information, language barriers, responsiveness" },
] as const;

export type PositiveTheme = (typeof POSITIVE_THEMES)[number]["name"];
export type NegativeTheme = (typeof NEGATIVE_THEMES)[number]["name"];

export const VALID_POSITIVE_NAMES = new Set(POSITIVE_THEMES.map((t) => t.name));
export const VALID_NEGATIVE_NAMES = new Set(NEGATIVE_THEMES.map((t) => t.name));
