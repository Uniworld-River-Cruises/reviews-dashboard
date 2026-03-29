import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { syncAll } from "./sync/sync-reviews";
import { computeSummaries } from "./sync/compute-summaries";
import { submitClassificationBatch, processBatchResults } from "./sync/batch-classify";
import {
  deleteAdminUser,
  getAdminUserByEmail,
  getOwnerCount,
  hasPermission,
  listAdminUsers,
  listKnownUsers,
  normalizeEmail,
  upsertKnownUser,
  upsertAdminUser,
  type AccessPermission,
  type AdminRole,
} from "./auth/access-control";
import {
  rebuildMappings as rebuildItineraryMappings,
  updateMapping as updateItineraryMapping,
} from "./sync/itinerary-mappings";
import {
  listOperationLogs,
  writeOperationLog,
} from "./ops/operation-logs";

initializeApp();

interface AuthorizedCaller {
  uid: string;
  email: string | null;
  source: "firebase" | "shared-token";
  role: AdminRole | "service";
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

async function authorizeRequest(
  req: any,
  res: any,
  permission: AccessPermission
): Promise<AuthorizedCaller | null> {
  const sharedToken = process.env.SYNC_API_TOKEN;
  const suppliedSharedToken = getSharedTokenHeader(req);
  if (sharedToken && suppliedSharedToken === sharedToken) {
    return { uid: "shared-token", email: null, source: "shared-token", role: "service" };
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
    const adminUser = await getAdminUserByEmail(email);
    const allowedByLegacyEmailList =
      allowedEmails.size > 0 && Boolean(email && allowedEmails.has(email));
    const allowedByDatabase = hasPermission(adminUser, permission);

    if (!allowedByLegacyEmailList && !allowedByDatabase) {
      res.status(403).json({
        error:
          "Forbidden for this account. Ask an owner to add your email to the admin_users collection.",
      });
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
      role: adminUser?.role ?? "admin",
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

function getEffectivePermissions(
  allowedByLegacyEmailList: boolean,
  adminUser: Awaited<ReturnType<typeof getAdminUserByEmail>>
) {
  return {
    sync: allowedByLegacyEmailList || hasPermission(adminUser, "sync"),
    batchClassify:
      allowedByLegacyEmailList || hasPermission(adminUser, "batchClassify"),
    manageMappings:
      allowedByLegacyEmailList || hasPermission(adminUser, "manageMappings"),
    manageUsers:
      allowedByLegacyEmailList || hasPermission(adminUser, "manageUsers"),
  };
}

const ACTIVE_CLASSIFICATION_STATUSES = new Set(["processing", "in_progress", "canceling"]);

interface ClassificationAutomationResult {
  processed: number;
  polledStatus: string | null;
  submittedBatchId: string | null;
  submittedCount: number;
  themesUpdated: boolean;
  skippedReason: string | null;
  error: string | null;
}

async function runClassificationAutomation(): Promise<ClassificationAutomationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      processed: 0,
      polledStatus: null,
      submittedBatchId: null,
      submittedCount: 0,
      themesUpdated: false,
      skippedReason: "ANTHROPIC_API_KEY not set",
      error: null,
    };
  }

  try {
    const db = getFirestore();
    const batchMeta = (await db.collection("sync_meta").doc("batch_classify").get()).data();
    const currentBatchId = typeof batchMeta?.batchId === "string" ? batchMeta.batchId : null;
    const currentStatus = typeof batchMeta?.status === "string" ? batchMeta.status : null;

    let processed = 0;
    let polledStatus = currentStatus;
    let themesUpdated = false;

    if (
      currentBatchId &&
      (!currentStatus || ACTIVE_CLASSIFICATION_STATUSES.has(currentStatus))
    ) {
      const batchResult = await processBatchResults(currentBatchId);
      processed = batchResult.processed;
      polledStatus = batchResult.status;

      if (batchResult.status === "complete" && batchResult.processed > 0) {
        themesUpdated = true;
      }

      if (
        batchResult.status !== "complete" &&
        batchResult.status !== "ended_no_results" &&
        batchResult.status !== "no_batch"
      ) {
        return {
          processed,
          polledStatus,
          submittedBatchId: null,
          submittedCount: 0,
          themesUpdated,
          skippedReason: "Existing classification batch still in progress",
          error: null,
        };
      }
    }

    const submission = await submitClassificationBatch();
    return {
      processed,
      polledStatus,
      submittedBatchId: submission.batchId,
      submittedCount: submission.totalUnclassified,
      themesUpdated,
      skippedReason: submission.totalUnclassified === 0 ? "No unclassified reviews found" : null,
      error: submission.error,
    };
  } catch (error) {
    console.error("Automatic classification cycle failed:", error);
    await writeOperationLog({
      type: "classification",
      level: "error",
      action: "automation_failed",
      message: "Automatic classification cycle failed",
      source: "system",
      details: {
        error: String(error),
      },
    });
    return {
      processed: 0,
      polledStatus: null,
      submittedBatchId: null,
      submittedCount: 0,
      themesUpdated: false,
      skippedReason: null,
      error: String(error),
    };
  }
}

// Scheduled sync every 2 hours in UTC - fetch reviews, recompute summaries, and advance theme classification.
export const dailySync = onSchedule(
  { schedule: "0 */2 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    await writeOperationLog({
      type: "sync",
      level: "info",
      action: "cycle_started",
      message: "Scheduled sync cycle started",
      source: "scheduled",
    });

    try {
      const results = await syncAll(false);
      const classification = await runClassificationAutomation();
      await computeSummaries("uniworld");
      await computeSummaries("luxury-gold");
      await writeOperationLog({
        type: "sync",
        level: "success",
        action: "cycle_complete",
        message: "Scheduled sync cycle completed",
        source: "scheduled",
        details: {
          brands: results.map((result) => ({
            brand: result.brand,
            totalProcessed: result.totalProcessed,
            errorCount: result.errors.length,
          })),
          classification,
        },
      });
      console.log(
        "Scheduled sync complete:",
        JSON.stringify({ syncResults: results, classification })
      );
    } catch (error) {
      await writeOperationLog({
        type: "sync",
        level: "error",
        action: "cycle_failed",
        message: "Scheduled sync cycle failed",
        source: "scheduled",
        details: {
          error: String(error),
        },
      });
      throw error;
    }
  }
);

// On-demand sync - fetch reviews + tags from Feefo, compute summaries
export const manualSync = onRequest(
  { timeoutSeconds: 3600, memory: "2GiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res, "sync");
    if (!caller) return;

    if (req.body?.resetLock) {
      const db = getFirestore();
      await db.collection("sync_meta").doc("uniworld").set({ status: "idle" }, { merge: true });
      await db.collection("sync_meta").doc("luxury-gold").set({ status: "idle" }, { merge: true });
      console.log("Sync locks reset");
    }

    const fullSync = req.body?.fullSync === true;
    await writeOperationLog({
      type: "sync",
      level: "info",
      action: "cycle_started",
      message: "Manual sync cycle started",
      source: "manual",
      actorEmail: caller.email,
      actorUid: caller.uid,
      details: {
        fullSync,
      },
    });

    try {
      const results = await syncAll(fullSync);
      const classification = await runClassificationAutomation();
      await computeSummaries("uniworld");
      await computeSummaries("luxury-gold");
      await writeOperationLog({
        type: "sync",
        level: "success",
        action: "cycle_complete",
        message: "Manual sync cycle completed",
        source: "manual",
        actorEmail: caller.email,
        actorUid: caller.uid,
        details: {
          brands: results.map((result) => ({
            brand: result.brand,
            totalProcessed: result.totalProcessed,
            errorCount: result.errors.length,
          })),
          classification,
        },
      });
      console.log(`manualSync triggered by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true, results, classification });
    } catch (error) {
      await writeOperationLog({
        type: "sync",
        level: "error",
        action: "cycle_failed",
        message: "Manual sync cycle failed",
        source: "manual",
        actorEmail: caller.email,
        actorUid: caller.uid,
        details: {
          error: String(error),
          fullSync,
        },
      });
      throw error;
    }
  }
);

// Submit unclassified reviews to Anthropic Batch API (50% cheaper, no rate limits)
export const batchClassify = onRequest(
  { timeoutSeconds: 300, memory: "1GiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res, "batchClassify");
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
    const caller = await authorizeRequest(req, res, "manageMappings");
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
      await writeOperationLog({
        type: "summary",
        level: "info",
        action: "manual_recompute_requested",
        message: "Manual summary recompute completed",
        brand: brand ?? "combined",
        source: "manual",
        actorEmail: caller.email,
        actorUid: caller.uid,
      });
      console.log(`itineraryMappings recompute by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true });
      return;
    }

    res.status(400).json({ error: "Invalid action. Use 'rebuild', 'update', or 'recompute'." });
  }
);

export const adminLogs = onRequest(
  { timeoutSeconds: 120, memory: "512MiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const caller = await authorizeRequest(req, res, "sync");
    if (!caller) return;

    const hours =
      typeof req.body?.hours === "number" && req.body.hours > 0 ? req.body.hours : null;
    const limit =
      typeof req.body?.limit === "number" && req.body.limit > 0 ? req.body.limit : undefined;

    const logs = await listOperationLogs({ hours, limit });
    res.json({ logs });
  }
);

// Manage runtime admin access stored in Firestore.
export const adminUsers = onRequest(
  { timeoutSeconds: 120, memory: "512MiB", invoker: "public", cors: true },
  async (req, res) => {
    if (!ensurePost(req, res)) return;
    const action = req.body?.action ?? "list";

    if (action === "current") {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing bearer token." });
        return;
      }

      const token = authHeader.slice("Bearer ".length).trim();

      try {
        const decoded = await getAuth().verifyIdToken(token);
        const email = decoded.email?.toLowerCase() ?? null;
        const allowedEmails = parseAllowedEmails();
        const adminUser = await getAdminUserByEmail(email);
        const allowedByLegacyEmailList =
          allowedEmails.size > 0 && Boolean(email && allowedEmails.has(email));
        const permissions = getEffectivePermissions(
          allowedByLegacyEmailList,
          adminUser
        );

        if (email) {
          await upsertKnownUser({
            email,
            uid: decoded.uid,
            displayName:
              typeof decoded.name === "string" ? decoded.name : null,
            photoURL:
              typeof decoded.picture === "string" ? decoded.picture : null,
          });
        }

        res.json({
          access: {
            email,
            role: adminUser?.role ?? (allowedByLegacyEmailList ? "admin" : null),
            active: adminUser?.active ?? allowedByLegacyEmailList,
            allowed: Object.values(permissions).some(Boolean),
            permissions,
          },
        });
      } catch {
        res.status(401).json({ error: "Invalid bearer token." });
      }
      return;
    }

    const caller = await authorizeRequest(req, res, "manageUsers");
    if (!caller) return;

    if (action === "list") {
      const users = await listAdminUsers();
      res.json({ users });
      return;
    }

    if (action === "known") {
      const users = await listAdminUsers();
      const byEmail = new Map(users.map((user) => [user.email, user]));
      const knownUsers = (await listKnownUsers()).map((knownUser) => {
        const currentAccess = byEmail.get(knownUser.email);
        return {
          ...knownUser,
          role: currentAccess?.role ?? null,
          active: currentAccess?.active ?? null,
        };
      });
      res.json({ knownUsers });
      return;
    }

    if (action === "upsert") {
      const email = req.body?.email;
      const role = req.body?.role;
      const active = req.body?.active !== false;

      if (typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "A valid email is required." });
        return;
      }

      if (role !== "owner" && role !== "admin" && role !== "sync") {
        res.status(400).json({ error: "role must be owner, admin, or sync." });
        return;
      }

      const record = await upsertAdminUser({
        email,
        role,
        active,
        updatedBy: caller.email ?? caller.uid,
      });
      console.log(`adminUsers upsert by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true, user: record });
      return;
    }

    if (action === "remove") {
      const email = req.body?.email;

      if (typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "A valid email is required." });
        return;
      }

      const normalizedTarget = normalizeEmail(email);
      const target = await getAdminUserByEmail(normalizedTarget);
      if (!target) {
        res.json({ success: true });
        return;
      }

      if (target.role === "owner") {
        const ownerCount = await getOwnerCount();
        if (ownerCount <= 1) {
          res.status(400).json({ error: "You cannot remove the last active owner." });
          return;
        }
      }

      await deleteAdminUser(normalizedTarget);
      console.log(`adminUsers remove by ${caller.source}:${caller.email ?? caller.uid}`);
      res.json({ success: true });
      return;
    }

    res
      .status(400)
      .json({
        error: "Invalid action. Use 'current', 'list', 'known', 'upsert', or 'remove'.",
      });
  }
);
