import type { ReviewReply } from "../reviews/reply";
import type { WebsiteModeration } from "../reviews/website";

export interface ReviewDocument {
  id: string;
  feedbackUrl: string;
  brand: "uniworld" | "luxury-gold";
  customer: {
    name: string | null;
    displayName: string | null;
    location: string | null;
    email: string | null;
    orderRef: string | null;
    customerRef: string | null;
  };
  product: {
    title: string;
    sku: string;
    parentSku: string | null;
    url: string | null;
    imageUrl: string | null;
  };
  ratings: {
    service: number | null;
    product: number | null;
    /** Product rating, else service rating, rounded (computeHeadlineRating).
     * The API's `rating` filter and highest/lowest sort run on this field.
     * Absent on documents synced before it existed until the summary step
     * backfills it. */
    headline?: number | null;
  };
  reviews: {
    serviceTitle: string | null;
    serviceText: string | null;
    productText: string | null;
  };
  tags: {
    ship: string | null;
    tour: string | null;
    tourDirector: string | null;
    bookingType: string | null;
    region: string | null;
    loyalty: string | null;
    clientType: string | null;
    package: string | null;
  };
  themes: {
    positive: string[];
    negative: string[];
    classifiedAt: string | null;
    /** Model that produced the themes. Absent on reviews classified before
     * this field existed (those were claude-haiku-4-5-20251001). */
    model?: string | null;
    /** Set when the model declined to classify (stop_reason "refusal"); the
     * review is marked classified with empty themes so it isn't resubmitted. */
    refusal?: string | null;
  };
  media: { type: string; url: string }[];
  dates: {
    created: string;
    lastUpdated: string;
    synced: string;
  };
  hasComment: boolean;
  /** Mirror of `media.length > 0`. Persisted as its own boolean so the
   * Reviews Explorer can filter media-bearing reviews server-side —
   * Firestore can't query "array length > 0" directly. */
  hasMedia: boolean;
  moderationStatus: string;
  verified: boolean;
  /** Latest merchant reply from Feefo's thread (`full_thread=include`);
   * null when there is none. Absent on documents not re-synced since replies
   * were collected. */
  reply?: ReviewReply | null;
  /** Website approval state. Never written by the Feefo sync (a re-sync
   * must not undo a decision); set by the candidate rule in the summary step
   * and by the dashboard's approval queue. */
  website?: WebsiteModeration | null;
  /** Itinerary group (resolveItineraryGroup: mapped parent name, else the
   * normalized tour name) and its itinerarySlug. The API's `itinerary` filter
   * matches the slug, so it returns exactly the reviews counted by the
   * `scope=itinerary` summary. Set by the sync and kept in step (including
   * after a mapping edit) by the summary step; absent until then. */
  itineraryGroup?: string | null;
  itineraryGroupKey?: string | null;
}
