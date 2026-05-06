import { getFirestore } from "firebase-admin/firestore";
import { fetchMediaByUrl, Brand } from "@feefo/shared";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface BackfillMediaResult {
  brand: Brand;
  mediaReviewsFetched: number;
  matched: number;
  unmatched: number;
  patched: number;
  errors: number;
}

interface BackfillMediaOptions {
  brand: Brand;
  /**
   * `since_period` to forward to Feefo. Defaults to "all" so every
   * media-bearing review (regardless of age) gets a chance to repair.
   */
  sincePeriod?: "month" | "year" | "all";
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

const URL_CHUNK = 30; // Firestore "in" filter cap.

/**
 * One-shot repair: fetch every review with media for the given brand
 * (using `media=ONLY`) and patch the matching Firestore review documents.
 *
 * Why this is needed: between Feefo's behavior change that stopped
 * surfacing media on the default `/reviews/all` response and our sync's
 * `merge: true` writes, the Firestore `media` field has been silently
 * wiped on most reviews that were re-synced. The going-forward fix
 * (fetching media in a separate pass during the main sync) heals reviews
 * as they're re-synced — but reviews that aren't due for a re-sync would
 * stay broken. This backfill re-asserts media on all matching docs in one
 * shot.
 *
 * The match key is `feedbackUrl`, which is stable for a review's lifetime
 * (the same one used by the duplicate-doc fix in PR #44).
 */
export async function backfillMissingMedia(
  options: BackfillMediaOptions
): Promise<BackfillMediaResult> {
  const db = getFirestore();
  const sincePeriod = options.sincePeriod ?? "all";

  const result: BackfillMediaResult = {
    brand: options.brand,
    mediaReviewsFetched: 0,
    matched: 0,
    unmatched: 0,
    patched: 0,
    errors: 0,
  };

  // 1. Pull every media-bearing review for the brand.
  const mediaByUrl = await fetchMediaByUrl(options.brand, sincePeriod);
  result.mediaReviewsFetched = mediaByUrl.size;

  if (mediaByUrl.size === 0) {
    await writeOperationLog({
      type: "sync",
      level: "info",
      action: "media_backfill_no_media",
      message: `No media-bearing reviews returned by Feefo for ${options.brand}`,
      brand: options.brand,
      source: options.source ?? "manual",
      actorEmail: options.actorEmail ?? null,
      actorUid: options.actorUid ?? null,
    });
    return result;
  }

  // 2. Look up matching Firestore docs by feedbackUrl. Firestore's `in`
  // filter is capped at 30 values, so chunk the URLs.
  const urls = Array.from(mediaByUrl.keys());
  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    if (err.failedAttempts < 3) return true;
    result.errors += 1;
    return false;
  });

  for (let i = 0; i < urls.length; i += URL_CHUNK) {
    const chunk = urls.slice(i, i + URL_CHUNK);
    const snapshot = await db
      .collection("reviews")
      .where("feedbackUrl", "in", chunk)
      .where("brand", "==", options.brand)
      .get();

    const matchedUrls = new Set<string>();
    for (const doc of snapshot.docs) {
      const url = doc.get("feedbackUrl") as string | undefined;
      if (!url) continue;
      const media = mediaByUrl.get(url);
      if (!media) continue; // Defensive — should be impossible given the `in` filter.
      matchedUrls.add(url);
      writer.set(doc.ref, { media }, { merge: true });
      result.patched += 1;
    }

    for (const url of chunk) {
      if (matchedUrls.has(url)) {
        result.matched += 1;
      } else {
        result.unmatched += 1;
      }
    }
  }

  await writer.close();

  await writeOperationLog({
    type: "sync",
    level: result.errors > 0 ? "error" : "success",
    action: "media_backfill",
    message: `Backfilled media on ${result.patched} ${options.brand} review(s)`,
    brand: options.brand,
    source: options.source ?? "manual",
    actorEmail: options.actorEmail ?? null,
    actorUid: options.actorUid ?? null,
    details: {
      mediaReviewsFetched: result.mediaReviewsFetched,
      matched: result.matched,
      unmatched: result.unmatched,
      patched: result.patched,
      errors: result.errors,
      sincePeriod,
    },
  });

  return result;
}
