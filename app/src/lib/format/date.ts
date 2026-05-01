/**
 * Locale-aware date formatting for review timestamps.
 * Falls back gracefully if `navigator` is unavailable (SSR) or the value
 * isn't a parseable ISO date.
 */
export function formatReviewDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : undefined;

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
