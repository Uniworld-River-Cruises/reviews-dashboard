import { getFirestore } from "firebase-admin/firestore";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface BackfillHasMediaResult {
  scanned: number;
  patched: number;
  alreadyOk: number;
  errors: number;
  done: boolean;
  lastScannedId: string | null;
}

interface BackfillHasMediaOptions {
  maxDocs?: number;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

const DEFAULT_MAX_DOCS = 30000;
const PAGE_SIZE = 500;

/**
 * One-shot repair: derive the `hasMedia` boolean from the existing `media`
 * array on every review document. Run once after the schema change so the
 * Reviews Explorer's server-side "Has media" filter has the field to query.
 *
 * Subsequent syncs maintain `hasMedia` automatically via `transformReview`,
 * so this only ever needs to run during the rollout.
 */
export async function backfillHasMedia(
  options: BackfillHasMediaOptions = {}
): Promise<BackfillHasMediaResult> {
  const db = getFirestore();
  const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;

  const result: BackfillHasMediaResult = {
    scanned: 0,
    patched: 0,
    alreadyOk: 0,
    errors: 0,
    done: false,
    lastScannedId: null,
  };

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (result.scanned < maxDocs) {
    let q = db
      .collection("reviews")
      .orderBy("dates.synced", "desc")
      .limit(PAGE_SIZE);

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
      result.done = true;
      break;
    }

    const writer = db.bulkWriter();
    writer.onWriteError((err) => {
      if (err.failedAttempts < 3) return true;
      result.errors += 1;
      return false;
    });

    for (const doc of snapshot.docs) {
      result.scanned += 1;
      result.lastScannedId = doc.id;

      const data = doc.data() as Record<string, unknown>;
      const media = Array.isArray(data.media) ? data.media : [];
      const expected = media.length > 0;
      const stored = data.hasMedia;

      if (typeof stored === "boolean" && stored === expected) {
        result.alreadyOk += 1;
        continue;
      }

      writer.set(doc.ref, { hasMedia: expected }, { merge: true });
      result.patched += 1;
    }

    await writer.close();

    if (snapshot.docs.length < PAGE_SIZE) {
      result.done = true;
      break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  await writeOperationLog({
    type: "sync",
    level: result.errors > 0 ? "error" : "success",
    action: "has_media_backfill",
    message: `Set hasMedia on ${result.patched} review(s)`,
    source: options.source ?? "manual",
    actorEmail: options.actorEmail ?? null,
    actorUid: options.actorUid ?? null,
    details: {
      scanned: result.scanned,
      patched: result.patched,
      alreadyOk: result.alreadyOk,
      errors: result.errors,
      done: result.done,
    },
  });

  return result;
}
