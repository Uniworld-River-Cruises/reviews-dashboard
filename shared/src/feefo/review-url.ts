/**
 * Helpers for matching a Feefo review across URL spellings. Feefo's review
 * URL carries the review's 24-hex id (also our document id since PR #44) and
 * a locale segment whose spelling has changed over time (/en_US/ -> /en-US/).
 */

const REVIEW_ID = /[0-9a-f]{24}/;
const LOCALE_SEGMENT = /^(https?:\/\/[^/]+\/)([a-z]{2})[-_]([A-Z]{2})(\/.*)$/;

/** The review's 24-hex id from its URL, or the URL itself when it has none. */
export function feefoReviewKey(url: string): string {
  return url.match(REVIEW_ID)?.[0] ?? url;
}

/** The URL in both locale spellings (hyphen first), or just the URL when it
 * has no locale segment. */
export function feefoUrlLocaleVariants(url: string): string[] {
  const m = url.match(LOCALE_SEGMENT);
  if (!m) return [url];
  const [, origin, lang, region, rest] = m;
  return [`${origin}${lang}-${region}${rest}`, `${origin}${lang}_${region}${rest}`];
}
