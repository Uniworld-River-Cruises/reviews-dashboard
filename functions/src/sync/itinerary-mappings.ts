import { getFirestore } from "firebase-admin/firestore";
import { normalizeItineraryName, Brand } from "@feefo/shared";

export interface ItineraryMapping {
  rawName: string;
  autoParentName: string;
  manualParentName: string | null;
  effectiveParentName: string;
  brand: string;
  reviewCount: number;
  lastUpdated: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/**
 * Scan all reviews for a brand, compute auto-parent names,
 * and upsert mapping docs (preserving manual overrides).
 */
export async function rebuildMappings(brand: Brand): Promise<{ created: number; updated: number }> {
  const db = getFirestore();

  // 1. Get all unique tour names with counts
  const snapshot = await db.collection("reviews")
    .where("brand", "==", brand)
    .select("tags.tour", "product.title")
    .get();

  const tourCounts: Record<string, number> = {};
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tour = data.tags?.tour ?? data.product?.title ?? null;
    if (tour) {
      tourCounts[tour] = (tourCounts[tour] || 0) + 1;
    }
  }

  console.log(`${brand}: found ${Object.keys(tourCounts).length} unique itineraries`);

  // 2. Read existing mappings to preserve manual overrides
  const existingSnap = await db.collection("itinerary_mappings")
    .where("brand", "==", brand)
    .get();

  const existingByRaw: Record<string, ItineraryMapping> = {};
  for (const doc of existingSnap.docs) {
    const data = doc.data() as ItineraryMapping;
    existingByRaw[data.rawName] = data;
  }

  // 3. Upsert mappings
  const writer = db.bulkWriter();
  let created = 0;
  let updated = 0;

  for (const [rawName, count] of Object.entries(tourCounts)) {
    const autoParentName = normalizeItineraryName(rawName);
    const existing = existingByRaw[rawName];
    const manualParentName = existing?.manualParentName ?? null;
    const effectiveParentName = manualParentName ?? autoParentName;

    const docId = `${brand}_${slugify(rawName)}`;
    const mapping: ItineraryMapping = {
      rawName,
      autoParentName,
      manualParentName,
      effectiveParentName,
      brand,
      reviewCount: count,
      lastUpdated: new Date().toISOString(),
    };

    writer.set(db.collection("itinerary_mappings").doc(docId), mapping);

    if (existing) {
      updated++;
    } else {
      created++;
    }

    // Remove from existing set so we can detect stale ones
    delete existingByRaw[rawName];
  }

  // 4. Delete mappings for itineraries no longer in reviews
  for (const staleRawName of Object.keys(existingByRaw)) {
    const docId = `${brand}_${slugify(staleRawName)}`;
    writer.delete(db.collection("itinerary_mappings").doc(docId));
  }

  await writer.close();

  console.log(`${brand}: ${created} created, ${updated} updated, ${Object.keys(existingByRaw).length} deleted`);
  return { created, updated };
}

/**
 * Set or clear a manual override for one itinerary mapping.
 */
export async function updateMapping(
  brand: Brand,
  rawName: string,
  manualParentName: string | null
): Promise<void> {
  const db = getFirestore();
  const docId = `${brand}_${slugify(rawName)}`;
  const docRef = db.collection("itinerary_mappings").doc(docId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error(`Mapping not found: ${docId}`);
  }

  const data = doc.data() as ItineraryMapping;
  const effectiveParentName = manualParentName ?? data.autoParentName;

  await docRef.update({
    manualParentName,
    effectiveParentName,
    lastUpdated: new Date().toISOString(),
  });

  console.log(`${brand}: mapped "${rawName}" → "${effectiveParentName}"`);
}

/**
 * Build a lookup map from raw itinerary name → effective parent name.
 * Used by compute-summaries to group reviews.
 */
export async function getMappingLookup(brand: Brand): Promise<Map<string, string>> {
  const db = getFirestore();
  const snapshot = await db.collection("itinerary_mappings")
    .where("brand", "==", brand)
    .get();

  const lookup = new Map<string, string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as ItineraryMapping;
    lookup.set(data.rawName, data.effectiveParentName);
  }

  return lookup;
}
