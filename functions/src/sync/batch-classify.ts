import { getFirestore } from "firebase-admin/firestore";
import { POSITIVE_THEMES, NEGATIVE_THEMES, VALID_POSITIVE_NAMES, VALID_NEGATIVE_NAMES } from "@feefo/shared";
import { writeOperationLog } from "../ops/operation-logs";

const BATCH_SIZE = 10000; // Max requests per Anthropic batch
const ACTIVE_BATCH_STATUSES = new Set(["processing", "in_progress", "canceling", "submitting"]);
const SUBMISSION_LOCK_WINDOW_MS = 10 * 60 * 1000;

interface BatchClassifyResult {
  totalUnclassified: number;
  batchId: string | null;
  error: string | null;
  status: string;
}

/**
 * Find all unclassified reviews in Firestore and submit them
 * to the Anthropic Batch API for classification.
 *
 * The Batch API processes asynchronously (usually within minutes to hours)
 * at 50% the cost of real-time calls, with no rate limiting.
 */
export async function submitClassificationBatch(): Promise<BatchClassifyResult> {
  const db = getFirestore();
  const batchMetaRef = db.collection("sync_meta").doc("batch_classify");
  const lockToken = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const lockExpiresAt = new Date(Date.now() + SUBMISSION_LOCK_WINDOW_MS).toISOString();

  const reservation = await db.runTransaction(async (txn) => {
    const meta = await txn.get(batchMetaRef);
    const data = meta.data();
    const currentStatus = typeof data?.status === "string" ? data.status : null;
    const currentBatchId = typeof data?.batchId === "string" ? data.batchId : null;
    const currentLockExpiresAt =
      typeof data?.submissionLockExpiresAt === "string" ? data.submissionLockExpiresAt : null;
    const activeSubmissionLock =
      currentStatus === "submitting" &&
      Boolean(currentLockExpiresAt && new Date(currentLockExpiresAt).getTime() > Date.now());
    const activeBatch =
      Boolean(currentBatchId) && Boolean(currentStatus && ACTIVE_BATCH_STATUSES.has(currentStatus));

    if (activeSubmissionLock || activeBatch) {
      return {
        acquired: false,
        batchId: currentBatchId,
        status: currentStatus ?? (activeSubmissionLock ? "submitting" : "processing"),
      };
    }

    txn.set(
      batchMetaRef,
      {
        status: "submitting",
        submissionLockToken: lockToken,
        submissionLockExpiresAt: lockExpiresAt,
        lastChecked: new Date().toISOString(),
      },
      { merge: true }
    );

    return { acquired: true, batchId: currentBatchId, status: "submitting" };
  });

  if (!reservation.acquired) {
    await writeOperationLog({
      type: "classification",
      level: "info",
      action: "batch_submit_skipped",
      message: "Skipped classification batch submission because another batch is already active",
      source: "system",
      details: {
        batchId: reservation.batchId ?? null,
        status: reservation.status,
      },
    });
    return {
      totalUnclassified: 0,
      batchId: reservation.batchId ?? null,
      error: null,
      status: reservation.status,
    };
  }

  // 1. Find all reviews with comments that haven't been classified.
  // In Firestore, where("field", "==", null) matches both explicit null values
  // AND documents where the field (or parent map) doesn't exist.
  const unclassifiedQuery = db.collection("reviews")
    .where("hasComment", "==", true)
    .where("themes.classifiedAt", "==", null)
    .limit(BATCH_SIZE);

  const snapshot = await unclassifiedQuery.get();

  if (snapshot.empty) {
    await batchMetaRef.set(
      {
        status: "idle",
        submissionLockToken: null,
        submissionLockExpiresAt: null,
        lastChecked: new Date().toISOString(),
      },
      { merge: true }
    );
    await writeOperationLog({
      type: "classification",
      level: "info",
      action: "batch_submit_skipped",
      message: "No unclassified reviews were found for classification",
      source: "system",
    });
    return { totalUnclassified: 0, batchId: null, error: null, status: "idle" };
  }

  console.log(`Found ${snapshot.size} unclassified reviews`);

  // 2. Build batch requests
  const positiveList = POSITIVE_THEMES.map((t) => t.name).join(", ");
  const negativeList = NEGATIVE_THEMES.map((t) => t.name).join(", ");

  const requests = snapshot.docs.map((doc) => {
    const data = doc.data();
    const reviewText = [data.reviews?.serviceText, data.reviews?.productText]
      .filter(Boolean)
      .join("\n\n");

    return {
      custom_id: doc.id,
      params: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user" as const,
            content: `Classify the following guest review into themes. Return ONLY valid JSON with no markdown formatting, no explanation.

Positive themes: ${positiveList}
Negative themes: ${negativeList}

Review:
${reviewText}

Return JSON: {"positive": ["Theme1"], "negative": ["Theme2"]}
Return empty arrays if no themes match. Only use themes from the lists above.`,
          },
        ],
      },
    };
  });

  // 3. Submit to Anthropic Batch API
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const response = await fetch("https://api.anthropic.com/v1/messages/batches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch API error ${response.status}: ${errorText}`);
    }

    const batch = await response.json() as { id: string; processing_status: string };
    console.log(`Batch submitted: ${batch.id} (${batch.processing_status}), ${requests.length} requests`);

    // Store batch ID in Firestore for polling
    await batchMetaRef.set(
      {
        batchId: batch.id,
        submittedAt: new Date().toISOString(),
        totalRequests: requests.length,
        status: batch.processing_status,
        submissionLockToken: null,
        submissionLockExpiresAt: null,
      },
      { merge: true }
    );
    await writeOperationLog({
      type: "classification",
      level: "success",
      action: "batch_submitted",
      message: `Submitted classification batch ${batch.id}`,
      source: "system",
      details: {
        totalRequests: requests.length,
        status: batch.processing_status,
      },
    });

    return {
      totalUnclassified: snapshot.size,
      batchId: batch.id,
      error: null,
      status: batch.processing_status,
    };
  } catch (err) {
    const errorMsg = String(err);
    console.error(`Batch submission failed: ${errorMsg}`);
    await batchMetaRef.set(
      {
        status: "error",
        errorMessage: errorMsg.slice(0, 5000),
        submissionLockToken: null,
        submissionLockExpiresAt: null,
        lastChecked: new Date().toISOString(),
      },
      { merge: true }
    );
    await writeOperationLog({
      type: "classification",
      level: "error",
      action: "batch_submit_failed",
      message: "Failed to submit classification batch",
      source: "system",
      details: {
        error: errorMsg,
        attemptedCount: snapshot.size,
      },
    });
    return { totalUnclassified: snapshot.size, batchId: null, error: errorMsg, status: "error" };
  }
}

/**
 * Check if a batch is complete and write results back to Firestore.
 */
export async function processBatchResults(batchId?: string): Promise<{ processed: number; status: string }> {
  const db = getFirestore();

  // Get batch ID from Firestore if not provided
  if (!batchId) {
    const meta = await db.collection("sync_meta").doc("batch_classify").get();
    batchId = meta.data()?.batchId;
    if (!batchId) {
      return { processed: 0, status: "no_batch" };
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // 1. Check batch status
  const statusResponse = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!statusResponse.ok) {
    throw new Error(`Status check failed: ${statusResponse.status}`);
  }

  const batchStatus = await statusResponse.json() as {
    id: string;
    processing_status: string;
    results_url?: string;
    request_counts: { succeeded: number; errored: number; expired: number; canceled: number; processing: number };
  };

  console.log(`Batch ${batchId}: ${batchStatus.processing_status}`, JSON.stringify(batchStatus.request_counts));

  if (batchStatus.processing_status !== "ended") {
    await db.collection("sync_meta").doc("batch_classify").set(
      { status: batchStatus.processing_status, lastChecked: new Date().toISOString() },
      { merge: true }
    );
    await writeOperationLog({
      type: "classification",
      level: "info",
      action: "batch_poll_in_progress",
      message: `Classification batch ${batchId} is still ${batchStatus.processing_status}`,
      source: "system",
      details: {
        batchId,
        requestCounts: batchStatus.request_counts as unknown as Record<string, unknown>,
      },
    });
    return { processed: 0, status: batchStatus.processing_status };
  }

  // 2. Fetch results
  if (!batchStatus.results_url) {
    return { processed: 0, status: "ended_no_results" };
  }

  const resultsResponse = await fetch(batchStatus.results_url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!resultsResponse.ok) {
    throw new Error(`Results fetch failed: ${resultsResponse.status}`);
  }

  // Results are JSONL (one JSON object per line)
  const resultsText = await resultsResponse.text();
  const lines = resultsText.trim().split("\n").filter(Boolean);

  // 3. Parse and write to Firestore
  const writer = db.bulkWriter();
  let processed = 0;

  for (const line of lines) {
    try {
      const result = JSON.parse(line) as {
        custom_id: string;
        result: {
          type: string;
          message?: { content: Array<{ type: string; text: string }> };
          error?: { message: string };
        };
      };

      if (result.result.type !== "succeeded" || !result.result.message) {
        console.warn(`Classification failed for ${result.custom_id}: ${result.result.error?.message}`);
        continue;
      }

      const text = result.result.message.content[0]?.text ?? "";
      const classification = parseClassification(text);

      if (!classification) {
        console.warn(`Could not parse classification for ${result.custom_id} (response length: ${text.length})`);
      } else {
        writer.update(db.collection("reviews").doc(result.custom_id), {
          "themes.positive": classification.positive,
          "themes.negative": classification.negative,
          "themes.classifiedAt": new Date().toISOString(),
        });
        processed++;
      }
    } catch (err) {
      console.warn(`Failed to parse result line: ${err}`);
    }
  }

  await writer.close();

  // Update meta
  await db.collection("sync_meta").doc("batch_classify").set({
    batchId,
    status: "complete",
    completedAt: new Date().toISOString(),
    processed,
    total: lines.length,
  });
  await writeOperationLog({
    type: "classification",
    level: "success",
    action: "batch_complete",
    message: `Completed classification batch ${batchId}`,
    source: "system",
    details: {
      batchId,
      processed,
      total: lines.length,
    },
  });

  console.log(`Batch ${batchId}: wrote ${processed}/${lines.length} classifications to Firestore`);

  return { processed, status: "complete" };
}

function parseClassification(text: string): { positive: string[]; negative: string[] } | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed.positive) && Array.isArray(parsed.negative)) {
      // Validate themes against known lists
      const validPositive = parsed.positive.filter((t: string) =>
        (VALID_POSITIVE_NAMES as Set<string>).has(t)
      );
      const validNegative = parsed.negative.filter((t: string) =>
        (VALID_NEGATIVE_NAMES as Set<string>).has(t)
      );
      return { positive: validPositive, negative: validNegative };
    }
  } catch {
    // Failed to parse
  }
  return null;
}
