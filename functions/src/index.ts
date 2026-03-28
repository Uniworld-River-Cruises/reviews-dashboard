import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { syncAll } from "./sync/sync-reviews";
import { computeSummaries } from "./sync/compute-summaries";
import { submitClassificationBatch, processBatchResults } from "./sync/batch-classify";
import { rebuildMappings as rebuildItineraryMappings, updateMapping as updateItineraryMapping } from "./sync/itinerary-mappings";

initializeApp();

// Daily sync at 2am UTC — fetch reviews + compute summaries (no classification)
export const dailySync = onSchedule(
  { schedule: "0 2 * * *", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const results = await syncAll(false);
    await computeSummaries("uniworld");
    await computeSummaries("luxury-gold");
    console.log("Daily sync complete:", JSON.stringify(results));
  }
);

// On-demand sync — fetch reviews + tags from Feefo, compute summaries
export const manualSync = onRequest(
  { timeoutSeconds: 3600, memory: "2GiB", invoker: "public" },
  async (req, res) => {
    // Reset stuck sync locks if requested
    if (req.body?.resetLock) {
      const db = getFirestore();
      await db.collection("sync_meta").doc("uniworld").set({ status: "idle" }, { merge: true });
      await db.collection("sync_meta").doc("luxury-gold").set({ status: "idle" }, { merge: true });
      console.log("Sync locks reset");
    }

    const fullSync = req.body?.fullSync === true;
    const results = await syncAll(fullSync);
    await computeSummaries("uniworld");
    await computeSummaries("luxury-gold");
    res.json({ success: true, results });
  }
);

// Submit unclassified reviews to Anthropic Batch API (50% cheaper, no rate limits)
export const batchClassify = onRequest(
  { timeoutSeconds: 300, memory: "1GiB", invoker: "public" },
  async (req, res) => {
    const action = req.body?.action ?? "submit";

    if (action === "submit") {
      const result = await submitClassificationBatch();
      res.json(result);
    } else if (action === "results") {
      const batchId = req.body?.batchId;
      const result = await processBatchResults(batchId);
      res.json(result);
    } else {
      res.status(400).json({ error: "Invalid action. Use 'submit' or 'results'." });
    }
  }
);

// Rebuild itinerary mappings (auto-grouping) — preserves manual overrides
export const itineraryMappings = onRequest(
  { timeoutSeconds: 300, memory: "1GiB", invoker: "public" },
  async (req, res) => {
    const action = req.body?.action ?? "rebuild";
    const brand = req.body?.brand as string | undefined;

    if (action === "rebuild") {
      const results: Record<string, { created: number; updated: number }> = {};
      if (!brand || brand === "uniworld") {
        results.uniworld = await rebuildItineraryMappings("uniworld");
      }
      if (!brand || brand === "luxury-gold") {
        results["luxury-gold"] = await rebuildItineraryMappings("luxury-gold");
      }
      res.json({ success: true, results });
    } else if (action === "update") {
      const { rawName, manualParentName } = req.body;
      if (!brand || !rawName) {
        res.status(400).json({ error: "brand and rawName are required" });
        return;
      }
      await updateItineraryMapping(brand as "uniworld" | "luxury-gold", rawName, manualParentName ?? null);
      res.json({ success: true });
    } else if (action === "recompute") {
      if (!brand || brand === "uniworld") await computeSummaries("uniworld");
      if (!brand || brand === "luxury-gold") await computeSummaries("luxury-gold");
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Invalid action. Use 'rebuild', 'update', or 'recompute'." });
    }
  }
);
