import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { syncAll } from "./sync/sync-reviews";
import { computeSummaries } from "./sync/compute-summaries";
import { submitClassificationBatch, processBatchResults } from "./sync/batch-classify";
import {
  rebuildMappings as rebuildItineraryMappings,
  updateMapping as updateItineraryMapping,
} from "./sync/itinerary-mappings";

initializeApp();

interface AuthorizedCaller {
  uid: string;
  email: string | null;
  source: "firebase" | "shared-token";
}

function parseAllowedEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getSharedTokenHeader(req: any): string | null {
  const raw = req.headers["x-sync-token"];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

async function authorizeRequest(req: any, res: any): Promise<AuthorizedCaller | null> {
  const sharedToken = process.env.SYNC_API_TOKEN;
  const suppliedSharedToken = getSharedTokenHeader(req);
  if (sharedToken && suppliedSharedToken === sharedToken) {
    return { uid: "shared-token", email: null, source: "shared-token" };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token." });
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase() ?? null;

    const allowedEmails = parseAllowedEmails();
    if (allowedEmails.size > 0 && (!email || !allowedEmails.has(email))) {
      res.status(403).json({ error: "Forbidden for this account." });
      return null;
    }

    const requireAdminClaim = process.env.REQUIRE_ADMIN_CLAIM === "true";
    if (requireAdminClaim && decoded.admin !== true) {
      res.status(403).json({ error: "Admin claim required." });
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      source: "firebase",
    };
  } catch {
    res.status(401).json({ error: "Invalid bearer token." });
    return null;
  }
}

function ensurePost(req: any, res: any): boolean {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return false;
  }
  return true;
}

// Daily sync at 2am UTC - fetch reviews + compute summaries (no classification)
export const dailySync = onSchedule(
  { schedule: "0 2 * * *", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const results = await syncAll(false);
    await computeSummaries("uniworld");
    await computeSummaries("luxury-gold");
    console.log("Daily sync complete:", JSON.stringify(results));
  }
);

// On-demand sync - fetch reviews + tags from Feefo, compute summaries
export const manualSync = onRequest(
  { timeoutSeconds: 3600, memory: "2GiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res);
    if (!caller) return;

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
    console.log(`manualSync triggered by ${caller.source}:${caller.email ?? caller.uid}`);
    res.json({ success: true, results });
  }
);

// Submit unclassified reviews to Anthropic Batch API (50% cheaper, no rate limits)
export const batchClassify = onRequest(
  { timeoutSeconds: 300, memory: "1GiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res);
    if (!caller) return;

    const action = req.body?.action ?? "submit";

    if (action === "submit") {
      const result = await submitClassificationBatch();
      console.log(`batchClassify submit by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json(result);
      return;
    }

    if (action === "results") {
      const batchId = req.body?.batchId;
      const result = await processBatchResults(batchId);
      console.log(`batchClassify results by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json(result);
      return;
    }

    res.status(400).json({ error: "Invalid action. Use 'submit' or 'results'." });
  }
);

// Rebuild itinerary mappings (auto-grouping) - preserves manual overrides
export const itineraryMappings = onRequest(
  { timeoutSeconds: 300, memory: "1GiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res);
    if (!caller) return;

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
      console.log(`itineraryMappings rebuild by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true, results });
      return;
    }

    if (action === "update") {
      const { rawName, manualParentName } = req.body;
      if (!brand || !rawName) {
        res.status(400).json({ error: "brand and rawName are required" });
        return;
      }
      await updateItineraryMapping(
        brand as "uniworld" | "luxury-gold",
        rawName,
        manualParentName ?? null
      );
      console.log(`itineraryMappings update by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true });
      return;
    }

    if (action === "recompute") {
      if (!brand || brand === "uniworld") await computeSummaries("uniworld");
      if (!brand || brand === "luxury-gold") await computeSummaries("luxury-gold");
      console.log(`itineraryMappings recompute by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true });
      return;
    }

    res.status(400).json({ error: "Invalid action. Use 'rebuild', 'update', or 'recompute'." });
  }
);
