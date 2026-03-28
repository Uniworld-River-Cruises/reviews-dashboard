"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "@/contexts/DashboardContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function RefreshButton() {
  const { lastSynced, setLastSynced } = useDashboard();
  const [syncing, setSyncing] = useState(false);

  // Load last sync time from Firestore on mount
  useEffect(() => {
    if (lastSynced) return;
    getDoc(doc(db, "sync_meta", "uniworld")).then((snap) => {
      const data = snap.data();
      if (data?.lastSyncAt) {
        setLastSynced(data.lastSyncAt);
      } else if (data?.startedAt) {
        setLastSynced(data.startedAt);
      }
    }).catch(() => {});
  }, [lastSynced, setLastSynced]);

  const syncLabel = lastSynced
    ? `Synced ${formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}`
    : "Not synced";

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        setLastSynced(new Date().toISOString());
      }
    } catch {
      // Sync endpoint may not be available yet
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-gray-500 sm:inline dark:text-white/60">
        {syncLabel}
      </span>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 dark:bg-white/10 dark:border-white/20 dark:text-white dark:hover:bg-white/20"
      >
        <svg
          className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.015 4.356v4.992"
          />
        </svg>
        {syncing ? "Syncing..." : "Refresh"}
      </button>
    </div>
  );
}
