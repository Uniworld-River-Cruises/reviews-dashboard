import { getFirestore } from "firebase-admin/firestore";
import { fetchReviews, transformReview, Brand, ReviewDocument } from "@feefo/shared";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface SyncResult {
  brand: Brand;
  totalProcessed: number;
  newReviews: number;
  updatedReviews: number;
  unchangedReviews: number;
  writtenReviews: number;
  errors: string[];
  maxSourceUpdatedAt: string | null;
}

interface SyncLogContext {
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

export async function syncBrand(
  brand: Brand,
  fullSync: boolean = false,
  logContext: SyncLogContext = {}
): Promise<SyncResult> {
  const db = getFirestore();
  const result: SyncResult = {
    brand,
    totalProcessed: 0,
    newReviews: 0,
    updatedReviews: 0,
    unchangedReviews: 0,
    writtenReviews: 0,
    errors: [],
    maxSourceUpdatedAt: null,
  };

  // 1. Acquire sync lock (with 30-minute TTL to auto-release stale locks)
  const LOCK_TTL_MS = 30 * 60 * 1000;
  const syncMetaRef = db.collection("sync_meta").doc(brand);
  const lockAcquired = await db.runTransaction(async (txn) => {
    const meta = await txn.get(syncMetaRef);
    const data = meta.data();
    if (data?.status === "syncing") {
      const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
      if (Date.now() - startedAt < LOCK_TTL_MS) {
        return false;
      }
      console.warn(`Stale sync lock for ${brand} (started ${data.startedAt}) — auto-releasing`);
    }
    txn.set(syncMetaRef, { status: "syncing", startedAt: new Date().toISOString() }, { merge: true });
    return true;
  });

  if (!lockAcquired) {
    result.errors.push(`Sync already in progress for ${brand}`);
    await writeOperationLog({
      type: "sync",
      level: "warning",
      action: "brand_skipped_locked",
      message: `Skipped ${brand} sync because another run is already in progress`,
      brand,
      source: logContext.source ?? "system",
      actorEmail: logContext.actorEmail ?? null,
      actorUid: logContext.actorUid ?? null,
    });
    return result;
  }

  try {
    // 2. Paginate through Feefo reviews — fetch, transform, write per page
    let page = 1;
    let maxUpdated = "";

    while (true) {
      const response = await fetchReviews(brand, {
        page,
        pageSize: 100,
        sincePeriod: fullSync ? "all" : undefined,
        sinceUpdatedPeriod: fullSync ? undefined : "month",
      });

      // Transform this page's reviews
      const pageReviews: ReviewDocument[] = [];
      for (const raw of response.reviews) {
        try {
          const doc = transformReview(raw);
          pageReviews.push(doc);
          if (doc.dates.lastUpdated > maxUpdated) {
            maxUpdated = doc.dates.lastUpdated;
          }
        } catch (err) {
          result.errors.push(`Transform error: ${err}`);
        }
      }

      // Re-target each doc's ID to any existing doc that already represents
      // the same Feefo review. Without this, a review whose service/product
      // ID has shifted since the last sync would be written to a brand-new
      // document, leaving the original behind as a duplicate. The lookup is
      // by feedbackUrl, which is stable for the lifetime of the review.
      const URL_CHUNK = 30; // Firestore "in" filter caps at 30 values.
      const incomingUrls = pageReviews
        .map((doc) => doc.feedbackUrl)
        .filter((url): url is string => Boolean(url));
      const urlToExistingId = new Map<string, string>();
      for (let i = 0; i < incomingUrls.length; i += URL_CHUNK) {
        const chunk = incomingUrls.slice(i, i + URL_CHUNK);
        const lookup = await db
          .collection("reviews")
          .where("feedbackUrl", "in", chunk)
          .get();
        for (const docSnap of lookup.docs) {
          const url = docSnap.get("feedbackUrl") as string | undefined;
          // First match wins; if there are pre-existing duplicates for the
          // same URL, the audit/cleanup tooling on the admin page handles
          // them rather than this sync.
          if (url && !urlToExistingId.has(url)) {
            urlToExistingId.set(url, docSnap.id);
          }
        }
      }
      for (const doc of pageReviews) {
        const existingId = urlToExistingId.get(doc.feedbackUrl);
        if (existingId && existingId !== doc.id) {
          doc.id = existingId;
        }
      }

      // Write this page to Firestore immediately.
      // We intentionally strip `themes` and only merge the remaining fields
      // so that any existing theme/classification data on a review is preserved
      // and managed by the batch-classify pipeline, not overwritten by sync.
      const reviewRefs = pageReviews.map((doc) => db.collection("reviews").doc(doc.id));
      const existingSnapshots =
        reviewRefs.length > 0 ? await db.getAll(...reviewRefs) : [];
      const existingById = new Map(existingSnapshots.map((snapshot) => [snapshot.id, snapshot]));

      const writer = db.bulkWriter();
      for (const doc of pageReviews) {
        const { themes, ...docWithoutThemes } = doc;
        const existingSnapshot = existingById.get(doc.id);
        const existingData = existingSnapshot?.data() as Partial<ReviewDocument> | undefined;
        const existingLastUpdated =
          typeof existingData?.dates?.lastUpdated === "string"
            ? existingData.dates.lastUpdated
            : null;

        if (!existingSnapshot?.exists) {
          result.newReviews += 1;
        } else if (isIncomingReviewNewer(existingLastUpdated, doc.dates.lastUpdated)) {
          result.updatedReviews += 1;
        } else {
          result.unchangedReviews += 1;
        }

        result.writtenReviews += 1;
        writer.set(db.collection("reviews").doc(doc.id), docWithoutThemes, { merge: true });
      }
      await writer.close();

      result.totalProcessed += pageReviews.length;

      console.log(
        `${brand}: page ${page}/${response.summary.meta.pages} (${result.totalProcessed} reviews)`
      );

      if (page >= response.summary.meta.pages) break;
      page++;
    }

    result.maxSourceUpdatedAt = maxUpdated || null;

    // Update sync meta
    await syncMetaRef.set({
      lastSyncAt: new Date().toISOString(),
      maxSourceUpdatedAt: maxUpdated || null,
      lastSyncReviewCount: result.totalProcessed,
      status: "success",
      errorMessage: result.errors.length > 0 ? result.errors.join("; ").slice(0, 5000) : null,
    });
    await writeOperationLog({
      type: "sync",
      level: result.errors.length > 0 ? "warning" : "success",
      action: "brand_sync_complete",
      message: `Finished ${brand} Feefo sync`,
      brand,
      source: logContext.source ?? "system",
      actorEmail: logContext.actorEmail ?? null,
      actorUid: logContext.actorUid ?? null,
      details: {
        totalProcessed: result.totalProcessed,
        newReviews: result.newReviews,
        updatedReviews: result.updatedReviews,
        unchangedReviews: result.unchangedReviews,
        writtenReviews: result.writtenReviews,
        errorCount: result.errors.length,
        maxSourceUpdatedAt: result.maxSourceUpdatedAt,
      },
    });
  } catch (err) {
    result.errors.push(`Sync failed for ${brand}: ${err}`);
    await syncMetaRef.set(
      { status: "error", errorMessage: String(err).slice(0, 5000) },
      { merge: true }
    );
    await writeOperationLog({
      type: "sync",
      level: "error",
      action: "brand_sync_failed",
      message: `Feefo sync failed for ${brand}`,
      brand,
      source: logContext.source ?? "system",
      actorEmail: logContext.actorEmail ?? null,
      actorUid: logContext.actorUid ?? null,
      details: {
        totalProcessed: result.totalProcessed,
        newReviews: result.newReviews,
        updatedReviews: result.updatedReviews,
        unchangedReviews: result.unchangedReviews,
        writtenReviews: result.writtenReviews,
        error: String(err),
      },
    });
  }

  return result;
}

export async function syncAll(
  fullSync: boolean = false,
  logContext: SyncLogContext = {}
): Promise<SyncResult[]> {
  const brands: Brand[] = ["uniworld", "luxury-gold"];
  const results: SyncResult[] = [];

  for (const brand of brands) {
    console.log(`Starting sync for ${brand}...`);
    const result = await syncBrand(brand, fullSync, logContext);
    console.log(
      `${brand}: ${result.totalProcessed} processed, ${result.errors.length} errors`
    );
    results.push(result);
  }

  return results;
}

function isIncomingReviewNewer(
  existingLastUpdated: string | null,
  incomingLastUpdated: string
): boolean {
  if (!existingLastUpdated) {
    return true;
  }

  const incomingTime = Date.parse(incomingLastUpdated);
  const existingTime = Date.parse(existingLastUpdated);

  if (Number.isFinite(incomingTime) && Number.isFinite(existingTime)) {
    return incomingTime > existingTime;
  }

  return incomingLastUpdated !== existingLastUpdated;
}
