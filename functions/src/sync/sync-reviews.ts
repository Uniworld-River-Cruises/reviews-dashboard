import { getFirestore } from "firebase-admin/firestore";
import { fetchReviews, transformReview, Brand, ReviewDocument } from "@feefo/shared";

interface SyncResult {
  brand: Brand;
  totalProcessed: number;
  errors: string[];
  maxSourceUpdatedAt: string | null;
}

export async function syncBrand(brand: Brand, fullSync: boolean = false): Promise<SyncResult> {
  const db = getFirestore();
  const result: SyncResult = {
    brand,
    totalProcessed: 0,
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

      // Write this page to Firestore immediately.
      // Use merge to preserve existing themes on already-classified reviews.
      // Include the default themes in the write — merge: true will NOT overwrite
      // nested fields that already exist if we use dot-notation updates instead.
      // Strategy: write all non-theme fields with merge, then for each doc also
      // set a default themes.classifiedAt=null only if the doc is new (create).
      const writer = db.bulkWriter();
      for (const doc of pageReviews) {
        const { themes, ...docWithoutThemes } = doc;
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
  } catch (err) {
    result.errors.push(`Sync failed for ${brand}: ${err}`);
    await syncMetaRef.set(
      { status: "error", errorMessage: String(err).slice(0, 5000) },
      { merge: true }
    );
  }

  return result;
}

export async function syncAll(fullSync: boolean = false): Promise<SyncResult[]> {
  const brands: Brand[] = ["uniworld", "luxury-gold"];
  const results: SyncResult[] = [];

  for (const brand of brands) {
    console.log(`Starting sync for ${brand}...`);
    const result = await syncBrand(brand, fullSync);
    console.log(
      `${brand}: ${result.totalProcessed} processed, ${result.errors.length} errors`
    );
    results.push(result);
  }

  return results;
}
