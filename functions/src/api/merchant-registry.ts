import { Brand, MERCHANT_IDENTIFIERS, isMerchantIdentifier } from "@feefo/shared";
import { ApiError } from "./http";

/**
 * Resolves a public `merchant_identifier` to where that merchant's data
 * lives. Today every merchant maps to the top-level collections; after the
 * multi-tenant migration only this resolver changes (orgId + collection
 * paths), keeping the /v1 contract stable.
 */

export interface MerchantInfo {
  identifier: Brand;
  label: string;
  reviewsCollection: string;
  summariesCollection: string;
  mappingsCollection: string;
}

const REGISTRY: Record<Brand, MerchantInfo> = {
  uniworld: {
    identifier: "uniworld",
    label: "Uniworld",
    reviewsCollection: "reviews",
    summariesCollection: "summaries",
    mappingsCollection: "itinerary_mappings",
  },
  "luxury-gold": {
    identifier: "luxury-gold",
    label: "Luxury Gold",
    reviewsCollection: "reviews",
    summariesCollection: "summaries",
    mappingsCollection: "itinerary_mappings",
  },
};

export function listMerchants(): MerchantInfo[] {
  return MERCHANT_IDENTIFIERS.map((id) => REGISTRY[id]);
}

export function getMerchant(identifier: string): MerchantInfo | null {
  return isMerchantIdentifier(identifier) ? REGISTRY[identifier] : null;
}

function isAllowed(identifier: string, allowedMerchants: string[]): boolean {
  return allowedMerchants.includes("*") || allowedMerchants.includes(identifier);
}

/** Merchants visible to a credential (for /v1/meta/merchants). */
export function listMerchantsForScope(allowedMerchants: string[]): MerchantInfo[] {
  return listMerchants().filter((m) => isAllowed(m.identifier, allowedMerchants));
}

/**
 * Resolve the `merchant_identifier` request parameter against the caller's
 * credential scope. `all` (or an omitted parameter) fans out to every
 * merchant the credential may read; a comma list selects specific merchants.
 *
 * Unknown identifier → 400. Known but outside the credential's scope → 403.
 */
export function resolveMerchants(
  param: string | undefined,
  allowedMerchants: string[]
): MerchantInfo[] {
  const value = (param ?? "all").trim();

  if (value === "all" || value === "") {
    const merchants = listMerchantsForScope(allowedMerchants);
    if (merchants.length === 0) {
      throw new ApiError(403, "merchant_not_allowed", "This credential has no merchant access.");
    }
    return merchants;
  }

  const identifiers = [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
  if (identifiers.length === 0) {
    throw new ApiError(400, "invalid_merchant", "merchant_identifier must not be empty.");
  }

  return identifiers.map((id) => {
    const merchant = getMerchant(id);
    if (!merchant) {
      throw new ApiError(400, "invalid_merchant", `Unknown merchant_identifier: ${id}`);
    }
    if (!isAllowed(id, allowedMerchants)) {
      throw new ApiError(
        403,
        "merchant_not_allowed",
        `This credential cannot access merchant_identifier: ${id}`
      );
    }
    return merchant;
  });
}
