import { FeefoReview, Brand, FeefoMedia } from "./types";
import { ReviewDocument } from "../types/review";
import { parseTags } from "./parse-tags";

const VALID_BRANDS: Set<string> = new Set(["uniworld", "luxury-gold"]);

/** What `transformReview` actually consumes from each media item. The full
 * `FeefoMedia` type also has an `id` (which we drop on the way to Firestore),
 * so the override accepts either a slim object or a full FeefoMedia. */
export type MediaOverrideItem = Pick<FeefoMedia, "type" | "url">;

/**
 * @param mediaOverride - When provided, replaces whatever (if anything) is on
 *   `raw.products[0].media`. Use this when fetching reviews from an endpoint
 *   that omits the media field (the default `/reviews/all` response no longer
 *   includes media; the sync now does a separate `media=ONLY` pass and feeds
 *   the result back in here).
 */
export function transformReview(
  raw: FeefoReview,
  mediaOverride?: MediaOverrideItem[]
): ReviewDocument {
  const product = raw.products[0];
  const tags = parseTags(raw.tags, product?.product?.tags);

  // Doc ID comes from the URL hash first, because the URL never changes for
  // a given review; service.id and product.id can shift over a review's
  // lifecycle and previously caused duplicate documents. URL hash falls back
  // to service.id, then product.id, then a timestamp-only fallback as a
  // last-resort so we never throw.
  const id =
    extractIdFromUrl(raw.url) ??
    raw.service?.id ??
    product?.id ??
    `url-${Date.now()}`;

  const merchantId = raw.merchant.identifier;
  if (!VALID_BRANDS.has(merchantId)) {
    throw new Error(`Unknown merchant identifier: ${merchantId}`);
  }
  const brand = merchantId as Brand;

  const serviceText = raw.service?.review ?? null;
  const productText = product?.review ?? null;
  const hasComment = Boolean(
    (serviceText && serviceText.trim().length > 0) ||
      (productText && productText.trim().length > 0)
  );

  return {
    id,
    feedbackUrl: raw.url,
    brand,
    customer: {
      name: raw.customer.name ?? null,
      displayName: raw.customer.display_name ?? null,
      location: raw.customer.display_location ?? null,
      email: raw.customer.email ?? null,
      orderRef: raw.customer.order_ref ?? null,
      customerRef: raw.customer.customer_ref ?? null,
    },
    product: {
      title: product?.product.title ?? "Unknown",
      sku: product?.product.sku ?? "",
      parentSku: product?.product.parent_sku ?? null,
      url: product?.product.url ?? null,
      imageUrl: product?.product.image_url ?? null,
    },
    ratings: {
      service: raw.service?.rating.rating ?? null,
      product: product?.rating.rating ?? null,
    },
    reviews: {
      serviceTitle: raw.service?.title ?? null,
      serviceText,
      productText,
    },
    tags,
    themes: {
      positive: [],
      negative: [],
      classifiedAt: null,
    },
    media: (mediaOverride ?? product?.media ?? []).map((m) => ({
      type: m.type,
      url: m.url,
    })),
    dates: {
      created:
        product?.created_at ?? raw.service?.created_at ?? raw.last_updated_date,
      lastUpdated: raw.last_updated_date,
      synced: new Date().toISOString(),
    },
    hasComment,
    moderationStatus: "published",
    verified: true,
  };
}

function extractIdFromUrl(url: string): string | null {
  const parts = url.split("/");
  const hexPart = parts.find((p) => /^[0-9a-f]{24}$/.test(p));
  return hexPart ?? null;
}
