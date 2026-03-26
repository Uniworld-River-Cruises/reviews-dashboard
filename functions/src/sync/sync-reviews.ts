import { getFirestore } from "firebase-admin/firestore";
import { fetchReviews, transformReview, classifyBatch, Brand, ReviewDocument } from "@feefo/shared";

interface SyncResult {
  brand: Brand;
  newReviews: number;
  updatedReviews: number;
  classified: number;
  totalProcessed: number;
  errors: string[];
  maxSourceUpdatedAt: string | null;
}

export async function syncBrand(brand: Brand, fullSync: boolean = false): Promise<SyncResult> {
  const db = getFirestore();
  const result: SyncResult = {
    brand,
    newReviews: 0,
    updatedReviews: 0,
    classified: 0,
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
    return result;
  }

  try {
    // 2. Paginate through Feefo reviews
    let page = 1;
    const allTransformed: ReviewDocument[] = [];
    let maxUpdated = "";

    while (true) {
      const response = await fetchReviews(brand, {
        page,
        pageSize: 100,
        sincePeriod: fullSync ? "all" : undefined,
        sinceUpdatedPeriod: fullSync ? undefined : "month",
      });

      for (const raw of response.reviews) {
        try {
          const doc = transformReview(raw);
          allTransformed.push(doc);
          if (doc.dates.lastUpdated > maxUpdated) {
            maxUpdated = doc.dates.lastUpdated;
          }
        } catch (err) {
          result.errors.push(`Transform error: ${err}`);
        }
      }

      console.log(`${brand}: page ${page}/${response.summary.meta.pages} (${allTransformed.length} reviews)`);
      if (page >= response.summary.meta.pages) break;
      page++;
    }

    // 3. Classify themes in batches (only reviews with text)
    const reviewsToClassify = allTransformed
      .filter((r) => r.hasComment)
      .map((r) => ({
        id: r.id,
        text: [r.reviews.serviceText, r.reviews.productText].filter(Boolean).join("\n\n"),
      }));

    let classifications = new Map<string, { positive: string[]; negative: string[] }>();
    try {
      classifications = await classifyBatch(reviewsToClassify);
      result.classified = classifications.size;
    } catch (err) {
      console.warn(`Classification failed, skipping: ${err}`);
      result.errors.push(`Classification skipped: ${err}`);
    }

    // 4. Write to Firestore using BulkWriter
    const writer = db.bulkWriter();

    for (const doc of allTransformed) {
      const classification = classifications.get(doc.id);
      if (classification) {
        doc.themes = {
          positive: classification.positive,
          negative: classification.negative,
          classifiedAt: new Date().toISOString(),
        };
      }

      const ref = db.collection("reviews").doc(doc.id);
      writer.set(ref, doc, { merge: true });
    }

    await writer.close();
    result.totalProcessed = allTransformed.length;
    result.newReviews = allTransformed.length;
    result.maxSourceUpdatedAt = maxUpdated || null;

    // 5. Update sync meta
    await syncMetaRef.set({
      lastSyncAt: new Date().toISOString(),
      maxSourceUpdatedAt: maxUpdated || null,
      lastSyncReviewCount: result.totalProcessed,
      lastSyncClassified: result.classified,
      status: "success",
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
    });
  } catch (err) {
    result.errors.push(`Sync failed for ${brand}: ${err}`);
    await syncMetaRef.set(
      { status: "error", errorMessage: String(err) },
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
      `${brand}: ${result.totalProcessed} processed, ${result.classified} classified, ${result.errors.length} errors`
    );
    results.push(result);
  }

  return results;
}
