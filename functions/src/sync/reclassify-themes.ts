import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { getClassifierModel } from "@feefo/shared";
import { writeOperationLog, type OperationLogSource } from "../ops/operation-logs";

interface ReclassifyThemesResult {
  model: string;
  dryRun: boolean;
  scanned: number;
  queued: number;
  alreadyCurrent: number;
  pending: number;
  errors: number;
  done: boolean;
  lastScannedId: string | null;
}

interface ReclassifyThemesOptions {
  dryRun?: boolean;
  startAfterId?: string | null;
  maxDocs?: number;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
}

const DEFAULT_MAX_DOCS = 20000;
const PAGE_SIZE = 500;

/**
 * Queue reviews for re-classification on the current classifier model.
 *
 * Resets `themes.classifiedAt` to null on every commented review whose
 * `themes.model` differs from the current model (reviews classified before
 * the field existed have none, and were tagged by Haiku 4.5). The existing
 * positive/negative arrays are left in place, so the dashboard keeps showing
 * them until the scheduled classification cycle (which picks up
 * `classifiedAt == null`) overwrites them.
 *
 * Firestore can't query for a missing field, so this walks commented reviews
 * by document ID and checks each one. Resume with `startAfterId` (the
 * previous call's `lastScannedId`) when `done` is false.
 */
export async function reclassifyThemes(
  options: ReclassifyThemesOptions = {}
): Promise<ReclassifyThemesResult> {
  const db = getFirestore();
  const model = getClassifierModel();
  const dryRun = options.dryRun ?? false;
  const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;

  const result: ReclassifyThemesResult = {
    model,
    dryRun,
    scanned: 0,
    queued: 0,
    alreadyCurrent: 0,
    pending: 0,
    errors: 0,
    done: false,
    lastScannedId: options.startAfterId ?? null,
  };

  while (result.scanned < maxDocs) {
    let q = db
      .collection("reviews")
      .where("hasComment", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (result.lastScannedId) {
      q = q.startAfter(result.lastScannedId);
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
      result.done = true;
      break;
    }

    const writer = dryRun ? null : db.bulkWriter();
    writer?.onWriteError((err) => {
      if (err.failedAttempts < 3) return true;
      result.errors += 1;
      return false;
    });

    for (const doc of snapshot.docs) {
      result.scanned += 1;
      result.lastScannedId = doc.id;

      const themes = doc.get("themes") as { classifiedAt?: unknown; model?: unknown } | undefined;
      if (themes?.model === model) {
        result.alreadyCurrent += 1;
        continue;
      }
      // Already waiting for the classifier (new review, or queued by an
      // earlier call); nothing to reset.
      if (themes?.classifiedAt == null) {
        result.pending += 1;
        continue;
      }

      writer?.update(doc.ref, { "themes.classifiedAt": null });
      result.queued += 1;
    }

    await writer?.close();

    if (snapshot.docs.length < PAGE_SIZE) {
      result.done = true;
      break;
    }
  }

  await writeOperationLog({
    type: "classification",
    level: result.errors > 0 ? "error" : dryRun ? "info" : "success",
    action: dryRun ? "reclassify_dry_run" : "reclassify_queued",
    message: dryRun
      ? `Dry run: ${result.queued} review(s) would be queued for re-classification on ${model}`
      : `Queued ${result.queued} review(s) for re-classification on ${model}`,
    source: options.source ?? "manual",
    actorEmail: options.actorEmail ?? null,
    actorUid: options.actorUid ?? null,
    details: { ...result },
  });

  return result;
}
