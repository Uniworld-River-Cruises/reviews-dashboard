import { getFirestore } from "firebase-admin/firestore";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface BackfillThemesResult {
  scanned: number;
  repaired: number;
  alreadyOk: number;
  errors: number;
  done: boolean;
  lastScannedId: string | null;
}

interface BackfillThemesOptions {
  since?: string | null;
  maxDocs?: number;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

const DEFAULT_MAX_DOCS = 5000;
const PAGE_SIZE = 500;

/**
 * Re-add the default `themes` map to review documents that are missing it.
 *
 * Between the 2026-03-28 sync change and the follow-up fix, new reviews were
 * written without a `themes` field. The classifier query
 * `where("themes.classifiedAt", "==", null)` does not match documents where
 * the field is absent, so those reviews never reached the classifier and
 * never received theme tags.
 *
 * This backfill walks reviews in sync order and re-seeds the default themes
 * map (`{ positive: [], negative: [], classifiedAt: null }`) wherever it is
 * missing, so the next classifier run will pick them up.
 */
export async function backfillMissingThemes(
  options: BackfillThemesOptions = {}
): Promise<BackfillThemesResult> {
  const db = getFirestore();
  const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
  const since = options.since ?? null;

  const result: BackfillThemesResult = {
    scanned: 0,
    repaired: 0,
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

    if (since) {
      q = q.where("dates.synced", ">=", since) as typeof q;
    }
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
      const themes = data.themes as
        | {
            positive?: unknown;
            negative?: unknown;
            classifiedAt?: unknown;
          }
        | undefined;

      const positiveOk = Array.isArray(themes?.positive);
      const negativeOk = Array.isArray(themes?.negative);
      const classifiedAtOk =
        themes !== undefined && "classifiedAt" in themes;

      if (themes && positiveOk && negativeOk && classifiedAtOk) {
        result.alreadyOk += 1;
        continue;
      }

      const repaired = {
        positive: positiveOk ? (themes!.positive as string[]) : [],
        negative: negativeOk ? (themes!.negative as string[]) : [],
        classifiedAt: classifiedAtOk ? themes!.classifiedAt : null,
      };

      writer.set(doc.ref, { themes: repaired }, { merge: true });
      result.repaired += 1;
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
    action: "themes_backfill",
    message: `Backfilled missing themes on ${result.repaired} review(s)`,
    source: options.source ?? "manual",
    actorEmail: options.actorEmail ?? null,
    actorUid: options.actorUid ?? null,
    details: {
      scanned: result.scanned,
      repaired: result.repaired,
      alreadyOk: result.alreadyOk,
      errors: result.errors,
      done: result.done,
      since,
    },
  });

  return result;
}
