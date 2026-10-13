import { getFirestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  ReviewDocument,
  WebsiteModeration,
  computeHeadlineRating,
  isWebsiteCandidate,
  itinerarySlug,
  resolveItineraryGroup,
} from "@feefo/shared";

export interface DerivedFieldsResult {
  headlineUpdated: number;
  itineraryGroupUpdated: number;
  candidatesAdded: number;
  candidatesRemoved: number;
  /** Updates skipped because the document changed after it was read. */
  skippedChanged: number;
}

/**
 * Keep the review fields derived from other fields in step, over the full
 * set of a brand's reviews (the summary step already loads them all):
 *
 *  - `ratings.headline`: written by the sync for every review it touches;
 *    this pass backfills documents synced before the field existed and so
 *    keeps the API's `rating` filter and highest/lowest sort complete.
 *  - `itineraryGroup` / `itineraryGroupKey`: the group the itinerary
 *    summaries use, from the same mapping lookup. Recomputing here backfills
 *    old documents and regroups a mapping's reviews after its parent name is
 *    edited, so the API's `itinerary` filter always matches the summaries.
 *  - `website`: the candidate rule. Themes arrive after the sync (from the
 *    batch classifier), so the rule can't run at sync time; evaluating it
 *    here means a review becomes a candidate on the first summary recompute
 *    after it is classified. Reviews a person approved or rejected are never
 *    touched; candidates that stop matching the rule (e.g. the review was
 *    edited, or the rule changed) go back to null.
 */
export async function syncDerivedReviewFields(
  docs: QueryDocumentSnapshot[],
  mappingLookup: ReadonlyMap<string, string>,
  now: string = new Date().toISOString()
): Promise<DerivedFieldsResult> {
  const result: DerivedFieldsResult = {
    headlineUpdated: 0,
    itineraryGroupUpdated: 0,
    candidatesAdded: 0,
    candidatesRemoved: 0,
    skippedChanged: 0,
  };
  const writer = getFirestore().bulkWriter();
  // Every update is conditional on the document being unchanged since it was
  // read, so a decision made in the dashboard (or a sync write) while this
  // pass runs is never overwritten from the stale snapshot. A failed
  // precondition is simply skipped; the next recompute re-evaluates it.
  writer.onWriteError(() => false);

  for (const doc of docs) {
    const review = doc.data() as ReviewDocument;
    const update: Record<string, unknown> = {};

    const headline = computeHeadlineRating(review.ratings);
    if (review.ratings?.headline !== headline) {
      update["ratings.headline"] = headline;
      result.headlineUpdated += 1;
    }

    const group = resolveItineraryGroup(review, mappingLookup);
    const groupKey = group ? itinerarySlug(group) : null;
    if ((review.itineraryGroup ?? null) !== group || (review.itineraryGroupKey ?? null) !== groupKey) {
      update.itineraryGroup = group;
      update.itineraryGroupKey = groupKey;
      result.itineraryGroupUpdated += 1;
    }

    const status = review.website?.status ?? null;
    if (status !== "approved" && status !== "rejected") {
      const qualifies = isWebsiteCandidate(review);
      if (qualifies && status !== "candidate") {
        const website: WebsiteModeration = {
          status: "candidate",
          placements: [],
          decidedBy: null,
          decidedAt: null,
          proposedAt: now,
        };
        update.website = website;
        result.candidatesAdded += 1;
      } else if (!qualifies && status === "candidate") {
        update.website = null;
        result.candidatesRemoved += 1;
      }
    }

    if (Object.keys(update).length > 0) {
      writer
        .update(doc.ref, update, { lastUpdateTime: doc.updateTime })
        .catch(() => {
          result.skippedChanged += 1;
        });
    }
  }

  await writer.close();
  return result;
}
