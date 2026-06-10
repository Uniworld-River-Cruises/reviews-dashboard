import { ReviewDocument } from "../types/review";
import { resolveDisplayName } from "./display-name";

/**
 * Public projections for the reviews API.
 *
 * These mappers are the PII firewall: they are the ONLY code allowed to
 * construct public API output, and they build it field-by-field (never by
 * spreading the raw document), so a field added to ReviewDocument later
 * cannot leak until someone deliberately maps it here.
 *
 * Intentionally omitted from the public shape (see the design doc's open
 * decisions in docs/plans/2026-06-09-public-reviews-api.md):
 *  - customer.name / email / orderRef / customerRef  (PII, never public)
 *  - customer.location                               (the dashboard never
 *    renders customer location, so the API omits it to match the site)
 *  - tags.tourDirector                               (a staff member's name)
 *  - moderationStatus                                (internal)
 */

export interface PublicRating {
  min: number;
  max: number;
  rating: number | null;
}

export interface PublicReviewService {
  rating: PublicRating;
  title: string | null;
  review: string | null;
  created_at: string;
}

export interface PublicReviewProduct {
  rating: PublicRating;
  review: string | null;
  media: { type: string; url: string }[];
  product: {
    title: string;
    sku: string;
    parent_sku: string | null;
    url: string | null;
    image_url: string | null;
  };
  created_at: string;
}

export interface PublicReviewEnrichment {
  themes: {
    positive: string[];
    negative: string[];
    classified_at: string | null;
  };
  attributes: {
    ship: string | null;
    tour: string | null;
    booking_type: string | null;
    region: string | null;
    loyalty: string | null;
    client_type: string | null;
    package: string | null;
  };
  itinerary: {
    raw: string | null;
    group: string | null;
  };
  flags: {
    has_media: boolean;
    has_comment: boolean;
  };
}

export interface PublicReview {
  merchant: { identifier: string };
  id: string;
  url: string;
  customer: { display_name: string };
  service: PublicReviewService | null;
  products: PublicReviewProduct[];
  last_updated_date: string;
  verified: boolean;
  enrichment: PublicReviewEnrichment;
}

export interface ToPublicReviewOptions {
  /**
   * rawName → effectiveParentName lookup from the itinerary_mappings
   * collection. When provided, enrichment.itinerary.group resolves the raw
   * tour name to its parent group exactly like the dashboard does; when
   * absent, group falls back to the raw name.
   */
  itineraryGroupLookup?: Map<string, string>;
}

function wrapRating(rating: number | null | undefined): PublicRating {
  return {
    min: 1,
    max: 5,
    rating: typeof rating === "number" && Number.isFinite(rating) ? rating : null,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function toPublicReview(
  d: ReviewDocument,
  options: ToPublicReviewOptions = {}
): PublicReview {
  const serviceRating = d.ratings?.service ?? null;
  const serviceTitle = nonEmpty(d.reviews?.serviceTitle);
  const serviceText = nonEmpty(d.reviews?.serviceText);
  const hasServiceSection =
    serviceRating !== null || serviceTitle !== null || serviceText !== null;

  const rawItinerary = nonEmpty(d.tags?.tour) ?? nonEmpty(d.product?.title);
  const group = rawItinerary
    ? options.itineraryGroupLookup?.get(rawItinerary) ?? rawItinerary
    : null;

  return {
    merchant: { identifier: d.brand },
    id: d.id,
    url: d.feedbackUrl,
    customer: {
      display_name: resolveDisplayName(d.customer),
    },
    service: hasServiceSection
      ? {
          rating: wrapRating(serviceRating),
          title: serviceTitle,
          review: serviceText,
          created_at: d.dates?.created ?? "",
        }
      : null,
    products: [
      {
        rating: wrapRating(d.ratings?.product ?? null),
        review: nonEmpty(d.reviews?.productText),
        media: Array.isArray(d.media)
          ? d.media.map((m) => ({ type: m.type, url: m.url }))
          : [],
        product: {
          title: d.product?.title ?? "Unknown",
          sku: d.product?.sku ?? "",
          parent_sku: d.product?.parentSku ?? null,
          url: d.product?.url ?? null,
          image_url: d.product?.imageUrl ?? null,
        },
        created_at: d.dates?.created ?? "",
      },
    ],
    last_updated_date: d.dates?.lastUpdated ?? "",
    verified: d.verified === true,
    enrichment: {
      themes: {
        positive: Array.isArray(d.themes?.positive) ? [...d.themes.positive] : [],
        negative: Array.isArray(d.themes?.negative) ? [...d.themes.negative] : [],
        classified_at: d.themes?.classifiedAt ?? null,
      },
      attributes: {
        ship: d.tags?.ship ?? null,
        tour: d.tags?.tour ?? null,
        booking_type: d.tags?.bookingType ?? null,
        region: d.tags?.region ?? null,
        loyalty: d.tags?.loyalty ?? null,
        client_type: d.tags?.clientType ?? null,
        package: d.tags?.package ?? null,
      },
      itinerary: {
        raw: rawItinerary,
        group,
      },
      flags: {
        has_media: d.hasMedia === true,
        has_comment: d.hasComment === true,
      },
    },
  };
}

// ── Summary projection ──────────────────────────────────────────────────────

/** The subset of a `summaries` collection document the public mapper reads.
 * Matches the Summary interface in functions/src/sync/compute-summaries.ts;
 * also accepts merged synthetic input for merchant_identifier=all. */
export interface SummaryDocLike {
  scope: "fleet" | "ship" | "itinerary";
  scopeValue: string | null;
  totalReviews: number;
  reviewsWithComments: number;
  avgRating: number;
  starDistribution: Record<string, number>;
  /** Present on summaries computed since the sync started tracking service
   * ratings separately; older documents lack it (and the API emits
   * rating.service: null for them rather than faking a distribution). */
  serviceStarDistribution?: Record<string, number>;
  topPositiveThemes: { theme: string; count: number }[];
  topNegativeThemes: { theme: string; count: number }[];
  ships: string[];
  itineraries: string[];
  lastUpdated?: string;
}

export interface PublicStarDistribution {
  count: number;
  "5_star": number;
  "4_star": number;
  "3_star": number;
  "2_star": number;
  "1_star": number;
}

export interface PublicSummary {
  merchant: { identifier: string; name: string };
  meta: { count: number };
  rating: {
    min: number;
    max: number;
    rating: number;
    product: PublicStarDistribution;
    /** Service-rating distribution when the summary document carries one
     * (serviceStarDistribution, computed by the sync since Phase 4); null
     * for older documents — never faked. */
    service: PublicStarDistribution | null;
  };
  enrichment: {
    scope: "fleet" | "ship" | "itinerary";
    scope_value: string | null;
    reviews_with_comments: number;
    top_positive_themes: { theme: string; count: number }[];
    top_negative_themes: { theme: string; count: number }[];
    ships: string[];
    itineraries: string[];
    last_updated: string | null;
  };
}

function toStarDistribution(
  dist: Record<string, number> | undefined
): PublicStarDistribution | null {
  if (!dist || typeof dist !== "object") return null;
  const star = (key: string): number =>
    typeof dist[key] === "number" ? dist[key] : 0;
  return {
    count: star("1") + star("2") + star("3") + star("4") + star("5"),
    "5_star": star("5"),
    "4_star": star("4"),
    "3_star": star("3"),
    "2_star": star("2"),
    "1_star": star("1"),
  };
}

export function toPublicSummary(
  doc: SummaryDocLike,
  merchant: { identifier: string; name: string }
): PublicSummary {
  const product = toStarDistribution(doc.starDistribution) ?? {
    count: 0,
    "5_star": 0,
    "4_star": 0,
    "3_star": 0,
    "2_star": 0,
    "1_star": 0,
  };

  return {
    merchant: { identifier: merchant.identifier, name: merchant.name },
    meta: { count: doc.totalReviews ?? 0 },
    rating: {
      min: 1,
      max: 5,
      rating: doc.avgRating ?? 0,
      product,
      service: toStarDistribution(doc.serviceStarDistribution),
    },
    enrichment: {
      scope: doc.scope,
      scope_value: doc.scopeValue ?? null,
      reviews_with_comments: doc.reviewsWithComments ?? 0,
      top_positive_themes: Array.isArray(doc.topPositiveThemes)
        ? doc.topPositiveThemes.map((t) => ({ theme: t.theme, count: t.count }))
        : [],
      top_negative_themes: Array.isArray(doc.topNegativeThemes)
        ? doc.topNegativeThemes.map((t) => ({ theme: t.theme, count: t.count }))
        : [],
      ships: Array.isArray(doc.ships) ? [...doc.ships] : [],
      itineraries: Array.isArray(doc.itineraries) ? [...doc.itineraries] : [],
      last_updated: doc.lastUpdated ?? null,
    },
  };
}
