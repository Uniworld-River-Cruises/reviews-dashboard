"use client";

import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { onAuthStateChanged } from "firebase/auth";
import { useDashboard, type Brand } from "@/contexts/DashboardContext";
import { getClientAuth, getClientDb } from "@/lib/firebase";
import { postFunction } from "@/lib/functions-client";
import { doc, getDoc } from "firebase/firestore";

type RefreshButtonProps = {
  tone?: "inverse" | "neutral";
  showSyncLabel?: boolean;
};

type SyncMetaState = {
  status: string | null;
  lastSyncAt: string | null;
  startedAt: string | null;
};

const SYNC_BRANDS: Exclude<Brand, "combined">[] = ["uniworld", "luxury-gold"];

function getBrandsToLoad(brand: Brand): Exclude<Brand, "combined">[] {
  return brand === "combined" ? SYNC_BRANDS : [brand];
}

function getMostStaleTimestamp(syncStates: SyncMetaState[]): string | null {
  const timestamps = syncStates
    .map((state) => state.lastSyncAt)
    .filter((value): value is string => Boolean(value));

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.reduce((oldest, current) =>
    current.localeCompare(oldest) < 0 ? current : oldest
  );
}

function buildSyncTitle(
  brand: Brand,
  syncStates: Record<string, SyncMetaState>
): string {
  const labels = getBrandsToLoad(brand).map((currentBrand) => {
    const state = syncStates[currentBrand];

    if (!state?.lastSyncAt) {
      return `${currentBrand}: not synced yet`;
    }

    return `${currentBrand}: ${format(new Date(state.lastSyncAt), "PPp")}`;
  });

  return labels.join(" | ");
}

export default function RefreshButton({
  tone = "neutral",
  showSyncLabel = true,
}: RefreshButtonProps) {
  const { brand, lastSynced, setLastSynced, bumpDataVersion } = useDashboard();
  const [syncing, setSyncing] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncTitle, setSyncTitle] = useState("Sync status unavailable");
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const isNeutral = tone === "neutral";

  async function loadSyncState(selectedBrand: Brand): Promise<string | null> {
    const db = getClientDb();
    const brands = getBrandsToLoad(selectedBrand);
    const entries = await Promise.all(
      brands.map(async (currentBrand) => {
        const snapshot = await getDoc(doc(db, "sync_meta", currentBrand));
        const data = snapshot.data();
        return [
          currentBrand,
          {
            status: typeof data?.status === "string" ? data.status : null,
            lastSyncAt: typeof data?.lastSyncAt === "string" ? data.lastSyncAt : null,
            startedAt: typeof data?.startedAt === "string" ? data.startedAt : null,
          } satisfies SyncMetaState,
        ] as const;
      })
    );

    const syncStates = Object.fromEntries(entries) as Record<string, SyncMetaState>;
    const anySyncing = Object.values(syncStates).some(
      (state) => state.status === "syncing"
    );
    const displayTimestamp = getMostStaleTimestamp(Object.values(syncStates));

    setIsSyncInProgress(anySyncing);
    setSyncTitle(buildSyncTitle(selectedBrand, syncStates));
    setLastSynced(displayTimestamp);

    return displayTimestamp;
  }

  useEffect(() => {
    loadSyncState(brand).catch(() => {
      setSyncTitle("Sync status unavailable");
      setIsSyncInProgress(false);
      setLastSynced(null);
    });
  }, [brand, setLastSynced]);

  const syncLabel =
    syncing || isSyncInProgress
      ? "Sync in progress"
      : lastSynced
        ? `Updated ${formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}`
        : "Not synced";

  useEffect(() => {
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (user) => {
        setIsSignedIn(Boolean(user));
      });
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Auth is unavailable in this environment."
      );
      setIsSignedIn(false);
      return;
    }
  }, []);

  async function handleSync() {
    if (!isSignedIn) {
      setMessage("Sign in to trigger a sync.");
      return;
    }

    setSyncing(true);
    setMessage(null);
    try {
      await postFunction("manualSync", { fullSync: false });
      await loadSyncState(brand);
      bumpDataVersion();
      setMessage("Sync complete.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to trigger sync.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {showSyncLabel ? (
        <span
          title={syncTitle}
          className={`hidden text-xs md:inline ${
            isNeutral ? "text-slate-500 dark:text-white/60" : "text-white/70"
          }`}
        >
          {syncLabel}
        </span>
      ) : null}
      <button
        onClick={handleSync}
        disabled={syncing || !isSignedIn}
        className={`cursor-pointer flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          isNeutral
            ? "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
        }`}
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
        <span className="hidden sm:inline">{syncing ? "Syncing..." : "Refresh"}</span>
      </button>
      {message ? (
        <span
          className={`hidden max-w-[220px] truncate text-xs xl:inline ${
            isNeutral ? "text-slate-500 dark:text-white/60" : "text-white/70"
          }`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
