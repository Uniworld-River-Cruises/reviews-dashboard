/**
 * Website approval queue: a rule proposes candidates, a person approves or
 * rejects them in the dashboard, and the public API serves the approved ones
 * (`website=approved`, optionally `placement=`).
 */

export type WebsiteStatus = "candidate" | "approved" | "rejected";

/** Where an approved review may be used on the website. A fixed list so the
 * site can rely on the values; add a tag here (and in the docs) to extend. */
export const WEBSITE_PLACEMENTS = [
  "guest-stories",
  "culinary",
  "ships",
  "travel-that-gives-back",
] as const;

export type WebsitePlacement = (typeof WEBSITE_PLACEMENTS)[number];

export function isWebsitePlacement(value: unknown): value is WebsitePlacement {
  return typeof value === "string" && (WEBSITE_PLACEMENTS as readonly string[]).includes(value);
}

export interface WebsiteModeration {
  status: WebsiteStatus;
  placements: WebsitePlacement[];
  /** Email of the person who approved/rejected; null for rule-proposed
   * candidates. Internal only: never exposed by the public API. */
  decidedBy: string | null;
  decidedAt: string | null;
  /** When the rule first proposed the review. */
  proposedAt: string | null;
}

/**
 * The candidate rule's thresholds. Change these to change which reviews the
 * queue proposes; the next summary recompute (every sync) re-evaluates every
 * review that nobody has decided on yet.
 */
export const WEBSITE_CANDIDATE_RULE = {
  /** Product AND service rating must both equal this. */
  rating: 5,
  /** At least this many positive themes from the classifier. */
  minPositiveThemes: 2,
  /** Service review text length (trimmed), inclusive. */
  minServiceTextLength: 150,
  maxServiceTextLength: 600,
  /** Only reviews created within this many days. Undecided candidates that
   * age past it drop out of the queue; decisions are never touched. */
  maxAgeDays: 730,
} as const;
// Matt chose this rule on 2026-10-13 (option E). The first rule (5 on either
// rating, 1+ theme, 60-600 chars, any age) proposed ~half of all reviews
// (12,401 Uniworld, 2,031 Luxury Gold); this one proposes ~619 and ~187.

/** The fields the candidate rule reads. */
export interface WebsiteCandidateInput {
  ratings?: { service?: number | null; product?: number | null } | null;
  reviews?: { serviceText?: string | null } | null;
  themes?: { positive?: string[] | null } | null;
  hasComment?: boolean;
  dates?: { created?: string | null } | null;
}

export function isWebsiteCandidate(
  review: WebsiteCandidateInput,
  rule: typeof WEBSITE_CANDIDATE_RULE = WEBSITE_CANDIDATE_RULE,
  now: number = Date.now()
): boolean {
  const ratings = review.ratings ?? {};
  if (ratings.product !== rule.rating || ratings.service !== rule.rating) return false;
  if (review.hasComment !== true) return false;
  const created = Date.parse(review.dates?.created ?? "");
  if (!Number.isFinite(created) || now - created > rule.maxAgeDays * 86_400_000) return false;
  const positive = review.themes?.positive;
  if (!Array.isArray(positive) || positive.length < rule.minPositiveThemes) return false;
  const serviceText = review.reviews?.serviceText?.trim() ?? "";
  return (
    serviceText.length >= rule.minServiceTextLength &&
    serviceText.length <= rule.maxServiceTextLength
  );
}

/**
 * The single rating a review is filtered and sorted by: the product rating,
 * else the service rating, rounded to a whole star. Persisted as
 * `ratings.headline` so the API can filter and sort on it server-side.
 */
export function computeHeadlineRating(
  ratings: { service?: number | null; product?: number | null } | null | undefined
): number | null {
  const value = ratings?.product ?? ratings?.service ?? null;
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}
