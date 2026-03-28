import { getFirestore } from "firebase-admin/firestore";
import { POSITIVE_THEMES, NEGATIVE_THEMES, VALID_POSITIVE_NAMES, VALID_NEGATIVE_NAMES } from "@feefo/shared";

const BATCH_SIZE = 10000; // Max requests per Anthropic batch

interface BatchClassifyResult {
  totalUnclassified: number;
  batchId: string | null;
  error: string | null;
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

  // 1. Find all reviews with comments that haven't been classified
  const unclassifiedQuery = db.collection("reviews")
    .where("hasComment", "==", true)
    .where("themes.classifiedAt", "==", null)
    .limit(BATCH_SIZE);

  const snapshot = await unclassifiedQuery.get();

  if (snapshot.empty) {
    return { totalUnclassified: 0, batchId: null, error: null };
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
    await db.collection("sync_meta").doc("batch_classify").set({
      batchId: batch.id,
      submittedAt: new Date().toISOString(),
      totalRequests: requests.length,
      status: "processing",
    });

    return { totalUnclassified: snapshot.size, batchId: batch.id, error: null };
  } catch (err) {
    const errorMsg = String(err);
    console.error(`Batch submission failed: ${errorMsg}`);
    return { totalUnclassified: snapshot.size, batchId: null, error: errorMsg };
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

      if (classification) {
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
