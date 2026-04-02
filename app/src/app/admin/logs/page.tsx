"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getClientAuth } from "@/lib/firebase";
import {
  getCurrentAdminAccess,
  listOperationalLogs,
  type CurrentAdminAccess,
  type OperationLogEntry,
  type OperationLogType,
} from "@/lib/firestore/admin-queries";
import OperationLogsTable from "@/components/admin/OperationLogsTable";

type RangeFilter = "24h" | "7d" | "30d" | "all";
type TypeFilter = "all" | OperationLogType;

const RANGE_TO_HOURS: Record<Exclude<RangeFilter, "all">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export default function AdminLogsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<CurrentAdminAccess | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [logs, setLogs] = useState<OperationLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [range, setRange] = useState<RangeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const canViewLogs = Boolean(currentAccess?.permissions.sync);

  const loadLogs = useCallback(async (nextRange: RangeFilter) => {
    setLoadingLogs(true);
    try {
      const hours = nextRange === "all" ? null : RANGE_TO_HOURS[nextRange];
      const data = await listOperationalLogs(hours);
      setLogs(data);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to load logs");
    }
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthResolved(true);
      });
    } catch {
      queueMicrotask(() => setAuthResolved(true));
      router.replace("/");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    if (!user) {
      queueMicrotask(() => {
        setCurrentAccess(null);
        setCheckingAccess(false);
      });
      router.replace("/");
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setCheckingAccess(true));

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setCurrentAccess(access);
        if (!access.permissions.sync) {
          router.replace("/");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentAccess(null);
        router.replace("/");
      })
      .finally(() => {
        if (cancelled) return;
        setCheckingAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authResolved, router, user]);

  useEffect(() => {
    if (checkingAccess || !canViewLogs) {
      return;
    }
    Promise.resolve().then(() => loadLogs(range));
  }, [canViewLogs, checkingAccess, loadLogs, range]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const filteredLogs = useMemo(() => {
    if (typeFilter === "all") {
      return logs;
    }
    return logs.filter((log) => log.type === typeFilter);
  }, [logs, typeFilter]);

  if (!authResolved || checkingAccess) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 text-sm font-medium text-text-secondary">
            <Link href="/admin" className="hover:text-text-primary hover:underline">
              Admin
            </Link>
            <span className="mx-2 text-text-tertiary">/</span>
            Logs
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">Operational Logs</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Review sync, classification, and summary activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as RangeFilter)}
            className="rounded-lg border border-input-border bg-surface px-3 py-2 text-sm"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All logs</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            className="rounded-lg border border-input-border bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
            <option value="sync">Sync</option>
            <option value="classification">Classification</option>
            <option value="summary">Summary</option>
          </select>
          <button
            onClick={() => loadLogs(range)}
            className="inline-flex items-center rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover"
          >
            Refresh Logs
          </button>
        </div>
      </div>

      <OperationLogsTable
        logs={filteredLogs}
        loading={loadingLogs}
        emptyMessage="No operational logs matched the current filter."
      />

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
