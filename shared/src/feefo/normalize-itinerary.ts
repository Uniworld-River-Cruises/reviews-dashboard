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

/**
 * The raw itinerary name a review is grouped by: its Feefo tour tag, else its
 * product title (some reviews, e.g. older Luxury Gold ones, carry no tour tag).
 */
export function rawItineraryName(review: {
  tags?: { tour?: string | null } | null;
  product?: { title?: string | null } | null;
}): string | null {
  return review.tags?.tour ?? review.product?.title ?? null;
}

/**
 * The itinerary group a review belongs to: the effective parent name from the
 * itinerary mappings (a manual override, else the auto name), falling back to
 * normalizeItineraryName for raw names that have no mapping yet. This is what
 * `scope=itinerary` summaries group by and what the API's `itinerary` filter
 * matches, so both must call it.
 */
export function resolveItineraryGroup(
  review: Parameters<typeof rawItineraryName>[0],
  mappingLookup: ReadonlyMap<string, string>
): string | null {
  const raw = rawItineraryName(review);
  if (!raw) return null;
  return (mappingLookup.get(raw) ?? normalizeItineraryName(raw)) || null;
}

/**
 * Lookup key for an itinerary group (also the suffix of its summary doc id).
 * The API matches `itinerary` and `scope_value` on this key, so the list and
 * the summary agree regardless of case or punctuation ("&" vs "-").
 */
export function itinerarySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
