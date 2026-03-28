import { FeefoReview } from "./types";
import { ReviewDocument } from "../types/review";
import { parseTags } from "./parse-tags";

export function transformReview(raw: FeefoReview): ReviewDocument {
  const product = raw.products[0];
  const tags = parseTags(raw.tags, product?.product?.tags);

  // Use service.id (feedback ID) as primary ID, fall back to product.id
  const id = raw.service?.id ?? product?.id ?? extractIdFromUrl(raw.url);

  const serviceText = raw.service?.review ?? null;
  const productText = product?.review ?? null;
  const hasComment = Boolean(
    (serviceText && serviceText.trim().length > 0) ||
      (productText && productText.trim().length > 0)
  );

  return {
    id,
    feedbackUrl: raw.url,
    brand: raw.merchant.identifier as ReviewDocument["brand"],
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
    media: (product?.media ?? []).map((m) => ({ type: m.type, url: m.url })),
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

function extractIdFromUrl(url: string): string {
  const parts = url.split("/");
  const hexPart = parts.find((p) => /^[0-9a-f]{24}$/.test(p));
  return hexPart ?? `url-${Date.now()}`;
}
