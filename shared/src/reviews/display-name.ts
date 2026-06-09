/**
 * Resolve the customer name we are allowed to display publicly.
 *
 * The ONLY name we ever surface is Feefo's `display_name` — the value the
 * reviewer consented to show publicly. We deliberately do NOT fall back to
 * `customer.name` (the unmasked full name), which is PII and must never reach
 * a rendered surface or the public API.
 *
 * This mirrors app/src/lib/format/customer.ts (PR #60) exactly. The two
 * copies exist because the app does not consume the shared package; the
 * public API uses this one so the API can never display a name the website
 * wouldn't.
 *
 * @param customer  The review's customer object (loosely typed; may be absent).
 * @param fallback  Placeholder shown when no consented display name exists.
 */
export function resolveDisplayName(
  customer: { displayName?: string | null } | null | undefined,
  fallback = "Trusted Customer"
): string {
  const name = customer?.displayName;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}
