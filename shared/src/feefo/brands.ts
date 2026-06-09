import { Brand } from "./types";

/**
 * Single source of truth for valid Feefo merchant identifiers.
 *
 * `ReviewDocument.brand` stores exactly these values and the public reviews
 * API's `merchant_identifier` parameter accepts exactly these values, so the
 * three layers (Feefo API, Firestore, public API) need no translation.
 *
 * Previously both functions/src/index.ts and feefo/transform.ts kept their
 * own private VALID_BRANDS sets; this constant replaces them so a new
 * merchant is added in one place.
 */
export const MERCHANT_IDENTIFIERS = ["uniworld", "luxury-gold"] as const satisfies readonly Brand[];

export function isMerchantIdentifier(value: unknown): value is Brand {
  return (
    typeof value === "string" &&
    (MERCHANT_IDENTIFIERS as readonly string[]).includes(value)
  );
}
