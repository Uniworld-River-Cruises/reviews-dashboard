import { getFirestore } from "firebase-admin/firestore";
import { fetchReviews, transformReview, Brand, ReviewDocument } from "@feefo/shared";
import { writeOperationLog } from "../ops/operation-logs";

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

  // 1. Acquire sync lock
  const syncMetaRef = db.collection("sync_meta").doc(brand);
  const lockAcquired = await db.runTransaction(async (txn) => {
    const meta = await txn.get(syncMetaRef);
    if (meta.data()?.status === "syncing") {
      return false;
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
      source: "system",
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

      // Write this page to Firestore immediately
      // Use merge so we don't overwrite existing themes/classification data
      const writer = db.bulkWriter();
      for (const doc of pageReviews) {
        // Preserve existing themes if review was already classified
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
    await writeOperationLog({
      type: "sync",
      level: result.errors.length > 0 ? "warning" : "success",
      action: "brand_sync_complete",
      message: `Completed ${brand} sync`,
      brand,
      source: "system",
      details: {
        totalProcessed: result.totalProcessed,
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
      message: `Failed ${brand} sync`,
      brand,
      source: "system",
      details: {
        error: String(err),
      },
    });
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
