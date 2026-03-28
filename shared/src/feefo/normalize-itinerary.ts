/**
 * Normalize an itinerary name by stripping direction codes, year suffixes,
 * ship name suffixes, and other modifiers to produce a canonical parent name.
 *
 * Examples:
 *   "A Portrait of Majestic France (BOD-CDG) 19" → "A Portrait of Majestic France"
 *   "Enchanting Danube (PAS-BUD) 25"             → "Enchanting Danube"
 *   "Splendors of Egypt & the Nile on the River Tosca (CAI-CAI) 24"
 *                                                 → "Splendors of Egypt & the Nile"
 */
export function normalizeItineraryName(raw: string): string {
  let name = raw.trim();

  // 1. Remove " on the S.S. ..." or " on the River ..." suffix (before or without codes)
  name = name.replace(/\s+on the (?:S\.?\s*S\.?|River)\s+\S+(?:\s+\S+)?(?=\s*\(|$)/i, "");

  // 2. Remove parenthesized 3-letter codes (e.g., (BOD-CDG), (CAI-CAI), (LIS-BOD-OPO))
  //    with optional trailing year
  name = name.replace(/\s*\([A-Z]{3}(?:-[A-Z]{3})*\)\s*\d{0,2}\s*$/, "");

  // 3. Remove bare trailing 2-digit year (19-29)
  name = name.replace(/\s+(?:19|2[0-9])$/, "");

  // 4. Remove trailing "W/Out"
  name = name.replace(/\s+W\/Out$/i, "");

  return name.trim();
}
