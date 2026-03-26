import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { syncAll } from "./sync/sync-reviews";
import { computeSummaries } from "./sync/compute-summaries";

initializeApp();

// Daily sync at 2am UTC
export const dailySync = onSchedule(
  { schedule: "0 2 * * *", timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const results = await syncAll(false);
    await computeSummaries("uniworld");
    await computeSummaries("luxury-gold");
    console.log("Daily sync complete:", JSON.stringify(results));
  }
);

// On-demand sync with bearer token auth
export const manualSync = onRequest(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.SYNC_API_TOKEN;
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const fullSync = req.body?.fullSync === true;
    const results = await syncAll(fullSync);
    await computeSummaries("uniworld");
    await computeSummaries("luxury-gold");
    res.json({ success: true, results });
  }
);
