"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import { getClientAuth, getClientDb } from "@/lib/firebase";
import { dateFieldPath } from "@/lib/firestore/queries";
import { collection, query, where, getDocs, orderBy, QueryConstraint } from "firebase/firestore";
import {
  getCurrentAdminAccess,
  listAdminUsers,
  listKnownUsers,
  listOperationalLogs,
  removeAdminUser,
  resolveDuplicateReviews,
  runDuplicateReviewAudit,
  getItineraryMappings,
  upsertAdminUser,
  saveManualMapping,
  triggerRebuildMappings,
  triggerRecomputeSummaries,
  type AdminRole,
  type CurrentAdminAccess,
  type AdminUserAccess,
  type DuplicateAuditReport,
  type ItineraryMapping,
  type KnownUser,
  type OperationLogEntry,
} from "@/lib/firestore/admin-queries";
import OperationLogsTable from "@/components/admin/OperationLogsTable";

type StatusFilter = "all" | "auto" | "manual" | "unchanged";
type SortKey = "rawName" | "effectiveParentName" | "reviewCount" | "status";
type SortDir = "asc" | "desc";
type LogsRangeHours = 1 | 6 | 12 | 24;

const LOG_RANGE_OPTIONS: Array<{ value: LogsRangeHours; label: string }> = [
  { value: 1, label: "Last hour" },
  { value: 6, label: "Last 6 hours" },
  { value: 12, label: "Last 12 hours" },
  { value: 24, label: "Last 24 hours" },
];

function getLogsRangeLabel(hours: LogsRangeHours) {
  if (hours === 1) {
    return "Last hour";
  }

  return `Last ${hours} hours`;
}

function StatusBadge({ mapping }: { mapping: ItineraryMapping }) {
  if (mapping.manualParentName) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        Manual
      </span>
    );
  }
  if (mapping.autoParentName !== mapping.rawName) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Auto
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-secondary">
      Unchanged
    </span>
  );
}

function getStatus(m: ItineraryMapping): "auto" | "manual" | "unchanged" {
  if (m.manualParentName) return "manual";
  if (m.autoParentName !== m.rawName) return "auto";
  return "unchanged";
}

const STATUS_ORDER = { manual: 0, auto: 1, unchanged: 2 };

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-text-tertiary">{"\u2195"}</span>;
  return <span className="ml-1">{dir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export default function AdminPage() {
  const router = useRouter();
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dateField, dataVersion } = useDashboard();
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<CurrentAdminAccess | null>(null);
  const [checkingPageAccess, setCheckingPageAccess] = useState(true);
  const [adminUsers, setAdminUsers] = useState<AdminUserAccess[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(true);
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([]);
  const [knownUsersLoading, setKnownUsersLoading] = useState(true);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessRole, setAccessRole] = useState<AdminRole>("sync");
  const [savingAccess, setSavingAccess] = useState(false);
  const [operationLogs, setOperationLogs] = useState<OperationLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logsRangeHours, setLogsRangeHours] = useState<LogsRangeHours>(24);
  const [mappings, setMappings] = useState<ItineraryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("reviewCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rebuilding, setRebuilding] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [editingRaw, setEditingRaw] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renamingRaw, setRenamingRaw] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateReport, setDuplicateReport] = useState<DuplicateAuditReport | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateResolving, setDuplicateResolving] = useState(false);
  const [duplicateBrand, setDuplicateBrand] = useState<"" | "uniworld" | "luxury-gold">("");
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(false);

  const dateStart = dateRange.start.toISOString();
  const dateEnd = dateRange.end.toISOString();
  const canManageUsers = Boolean(currentAccess?.permissions.manageUsers);
  const canManageMappings = Boolean(currentAccess?.permissions.manageMappings);
  const canViewLogs = Boolean(currentAccess?.permissions.sync);

  const loadAdminAccess = useCallback(async () => {
    setAdminUsersLoading(true);
    try {
      const users = await listAdminUsers();
      setAdminUsers(users);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to load admin access");
    }
    setAdminUsersLoading(false);
  }, []);

  const loadKnownUsers = useCallback(async () => {
    setKnownUsersLoading(true);
    try {
      const users = await listKnownUsers();
      setKnownUsers(users);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to load signed-in users");
    }
    setKnownUsersLoading(false);
  }, []);

  const loadOperationLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const logs = await listOperationalLogs(logsRangeHours, 100);
      setOperationLogs(logs);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to load operational logs");
    }
    setLogsLoading(false);
  }, [logsRangeHours]);

  const runDuplicateAudit = useCallback(async () => {
    setDuplicateLoading(true);
    setDuplicatesExpanded(true);
    try {
      const report = await runDuplicateReviewAudit(duplicateBrand || null);
      setDuplicateReport(report);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to run duplicate audit");
    }
    setDuplicateLoading(false);
  }, [duplicateBrand]);

  const removeDuplicates = useCallback(async () => {
    if (!duplicateReport || duplicateReport.duplicateGroups === 0) return;
    const summary =
      `${duplicateReport.duplicateGroups} duplicate group(s) (${duplicateReport.extraDocs} extra doc(s))`;
    const confirmed = window.confirm(
      `Remove duplicates?\n\nThis will delete ${duplicateReport.extraDocs} document(s) across ${summary}, keeping the document with the most recent Last Updated timestamp in each group. This cannot be undone.`
    );
    if (!confirmed) return;

    setDuplicateResolving(true);
    try {
      const result = await resolveDuplicateReviews(duplicateBrand || null);
      setToast(
        `Removed ${result.docsDeleted} duplicate doc(s) across ${result.groupsResolved} group(s).`
      );
      // Re-run the audit so the table reflects the new state.
      const report = await runDuplicateReviewAudit(duplicateBrand || null);
      setDuplicateReport(report);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to remove duplicates");
    }
    setDuplicateResolving(false);
  }, [duplicateBrand, duplicateReport]);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      // Load all mappings
      const allMappings = await getItineraryMappings(brand);

      // Query reviews within date range for tour counts
      const db = getClientDb();
      const ref = collection(db, "reviews");
      const path = dateFieldPath(dateField);
      const constraints: QueryConstraint[] = [
        where(path, ">=", dateStart),
        where(path, "<=", dateEnd),
        orderBy(path, "desc"),
      ];
      if (brand !== "combined") {
        constraints.unshift(where("brand", "==", brand));
      }
      const snap = await getDocs(query(ref, ...constraints));

      // Count reviews per raw tour name
      const tourCounts: Record<string, number> = {};
      for (const d of snap.docs) {
        const tour = d.data().tags?.tour;
        if (tour) tourCounts[tour] = (tourCounts[tour] || 0) + 1;
      }

      // Override review counts with date-scoped counts and filter to only tours in range
      const scoped = allMappings
        .map((m) => ({ ...m, reviewCount: tourCounts[m.rawName] || 0 }))
        .filter((m) => m.reviewCount > 0);

      setMappings(scoped);
    } catch {
      setToast("Failed to load mappings");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataVersion is intentional to force reload after sync
  }, [brand, dateStart, dateEnd, dateField, dataVersion]);

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
        setCheckingPageAccess(false);
      });
      router.replace("/");
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setCheckingPageAccess(true));

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setCurrentAccess(access);
        const canUseAdminPage =
          access.permissions.sync ||
          access.permissions.manageMappings ||
          access.permissions.manageUsers;
        if (!canUseAdminPage) {
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
        setCheckingPageAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authResolved, router, user]);

  useEffect(() => {
    if (checkingPageAccess || !currentAccess) {
      return;
    }

    if (currentAccess.permissions.sync) {
      loadOperationLogs();
      return;
    }

    setOperationLogs([]);
    setLogsLoading(false);
  }, [checkingPageAccess, currentAccess, loadOperationLogs]);

  useEffect(() => {
    if (checkingPageAccess || !currentAccess) {
      return;
    }

    if (currentAccess.permissions.manageUsers) {
      loadAdminAccess();
      loadKnownUsers();
      return;
    }

    setAdminUsers([]);
    setAdminUsersLoading(false);
    setKnownUsers([]);
    setKnownUsersLoading(false);
  }, [checkingPageAccess, currentAccess, loadAdminAccess, loadKnownUsers]);

  useEffect(() => {
    if (checkingPageAccess || !currentAccess) {
      return;
    }

    if (!currentAccess.permissions.manageMappings) {
      return;
    }

    loadMappings();
  }, [checkingPageAccess, currentAccess, loadMappings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Unique parent names for autocomplete
  const parentNames = useMemo(() => {
    const names = new Set(mappings.map((m) => m.effectiveParentName));
    return [...names].sort();
  }, [mappings]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "reviewCount" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    let result = mappings.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !m.rawName.toLowerCase().includes(q) &&
          !m.effectiveParentName.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter !== "all" && getStatus(m) !== statusFilter) return false;
      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rawName":
          cmp = a.rawName.localeCompare(b.rawName);
          break;
        case "effectiveParentName":
          cmp = a.effectiveParentName.localeCompare(b.effectiveParentName);
          break;
        case "reviewCount":
          cmp = a.reviewCount - b.reviewCount;
          break;
        case "status":
          cmp = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [mappings, search, statusFilter, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = mappings.length;
    const grouped = new Set(mappings.map((m) => m.effectiveParentName)).size;
    const manual = mappings.filter((m) => m.manualParentName).length;
    const auto = mappings.filter((m) => !m.manualParentName && m.autoParentName !== m.rawName).length;
    return { total, grouped, manual, auto };
  }, [mappings]);

  async function handleGrantAccess() {
    const email = accessEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setToast("Enter a valid company email");
      return;
    }

    setSavingAccess(true);
    try {
      await upsertAdminUser(email, accessRole, true);
      setAccessEmail("");
      setAccessRole("sync");
      await loadAdminAccess();
      await loadKnownUsers();
      setToast("Access saved");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to save access");
    }
    setSavingAccess(false);
  }

  async function handleRemoveAccess(email: string) {
    setSavingAccess(true);
    try {
      await removeAdminUser(email);
      await loadAdminAccess();
      await loadKnownUsers();
      setToast("Access removed");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to remove access");
    }
    setSavingAccess(false);
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      await triggerRebuildMappings(brand === "combined" ? undefined : brand);
      await loadMappings();
      setToast("Mappings rebuilt successfully");
    } catch {
      setToast("Failed to rebuild mappings");
    }
    setRebuilding(false);
  }

  async function handleRecompute() {
    setRecomputing(true);
    try {
      await triggerRecomputeSummaries(brand === "combined" ? undefined : brand);
      setToast("Summaries recomputed \u2014 changes are now live");
    } catch {
      setToast("Failed to recompute summaries");
    }
    setRecomputing(false);
  }

  function startEdit(m: ItineraryMapping) {
    setEditingRaw(m.rawName);
    setEditValue(m.effectiveParentName);
    setRenamingRaw(null);
  }

  async function saveEdit(rawName: string) {
    setSaving(true);
    const mapping = mappings.find((m) => m.rawName === rawName);
    if (!mapping) return;

    // If value matches auto parent, clear manual override
    const manualParentName = editValue === mapping.autoParentName ? null : editValue;

    try {
      await saveManualMapping(mapping.brand, rawName, manualParentName);
      setMappings((prev) =>
        prev.map((m) =>
          m.rawName === rawName
            ? {
                ...m,
                manualParentName: manualParentName,
                effectiveParentName: editValue,
              }
            : m
        )
      );
      setToast("Mapping saved. Recompute summaries to apply.");
    } catch {
      setToast("Failed to save mapping");
    }
    setSaving(false);
    setEditingRaw(null);
  }

  async function resetMapping(m: ItineraryMapping) {
    try {
      await saveManualMapping(m.brand, m.rawName, null);
      setMappings((prev) =>
        prev.map((item) =>
          item.rawName === m.rawName
            ? {
                ...item,
                manualParentName: null,
                effectiveParentName: item.autoParentName,
              }
            : item
        )
      );
      setToast("Reset to auto-grouping. Recompute to apply.");
    } catch {
      setToast("Failed to reset mapping");
    }
  }

  function startRename(m: ItineraryMapping) {
    setRenamingRaw(m.rawName);
    setRenameValue(m.effectiveParentName);
    setEditingRaw(null);
  }

  async function saveRename(rawName: string) {
    setSaving(true);
    const mapping = mappings.find((m) => m.rawName === rawName);
    if (!mapping || !renameValue.trim()) {
      setSaving(false);
      return;
    }

    const newName = renameValue.trim();
    try {
      await saveManualMapping(mapping.brand, rawName, newName);
      setMappings((prev) =>
        prev.map((m) =>
          m.rawName === rawName
            ? { ...m, manualParentName: newName, effectiveParentName: newName }
            : m
        )
      );
      setToast(`Renamed to "${newName}". Recompute to apply.`);
    } catch {
      setToast("Failed to rename");
    }
    setSaving(false);
    setRenamingRaw(null);
  }

  const columns: { key: SortKey; label: string; align: string }[] = [
    { key: "rawName", label: "Raw Itinerary Name", align: "text-left" },
    { key: "effectiveParentName", label: "Effective Parent", align: "text-left" },
    { key: "reviewCount", label: "Reviews", align: "text-right" },
    { key: "status", label: "Status", align: "text-center" },
  ];

  if (!authResolved || checkingPageAccess) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
      </div>
    );
  }

  return (
    <div>
      {canManageUsers ? (
      <div className="mb-8 rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <h2 className="text-xl font-semibold text-text-primary">Access Control</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Owners can promote people who have signed in and manage who is allowed to sync
            data and use protected admin actions.
          </p>
        </div>
        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Current Access
            </h3>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              {adminUsersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
                </div>
              ) : adminUsers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-text-secondary">
                  No admin users are configured yet. Add your first owner in Firestore or
                  after bootstrap use the form on the right.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-alt text-left text-text-secondary">
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.email} className="border-t border-border">
                        <td className="px-4 py-3 text-text-primary">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-brand-primary-light px-2 py-0.5 text-xs font-medium capitalize text-text-primary">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-surface-alt text-text-secondary"
                            }`}
                          >
                            {user.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {user.updatedAt
                            ? new Date(user.updatedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveAccess(user.email)}
                            disabled={savingAccess}
                            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Grant Or Update Access
            </h3>
            <div className="mt-4 rounded-lg border border-border bg-surface-alt p-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-primary">
                    Signed-in users
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const email = e.target.value;
                      if (!email) return;
                      const selected = knownUsers.find((user) => user.email === email);
                      setAccessEmail(email);
                      setAccessRole(selected?.role ?? "sync");
                      e.target.value = "";
                    }}
                    className="w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                  >
                    <option value="">Choose a user who has already signed in</option>
                    {knownUsers.map((knownUser) => {
                      const label = knownUser.displayName
                        ? `${knownUser.displayName} (${knownUser.email})`
                        : knownUser.email;
                      return (
                        <option key={knownUser.email} value={knownUser.email}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-2 text-xs text-text-secondary">
                    {knownUsersLoading
                      ? "Loading signed-in users..."
                      : knownUsers.length > 0
                        ? "Pick a signed-in user to prefill the form and update their role."
                        : "Known users will appear here after they sign in at least once."}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-primary">
                    Email
                  </label>
                  <input
                    type="email"
                    value={accessEmail}
                    onChange={(e) => setAccessEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                  />
                </div>
                {knownUsers.length > 0 ? (
                  <div className="rounded-lg bg-surface p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Recent Sign-Ins
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {knownUsers.slice(0, 8).map((knownUser) => (
                        <button
                          key={knownUser.email}
                          type="button"
                          onClick={() => {
                            setAccessEmail(knownUser.email);
                            setAccessRole(knownUser.role ?? "sync");
                          }}
                          className="rounded-full border border-border bg-surface-alt px-3 py-1.5 text-xs text-text-primary hover:bg-surface-alt"
                          title={
                            knownUser.lastSeenAt
                              ? `Last seen ${new Date(knownUser.lastSeenAt).toLocaleString()}`
                              : knownUser.email
                          }
                        >
                          {knownUser.email}
                          {knownUser.role ? ` • ${knownUser.role}` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-primary">
                    Role
                  </label>
                  <select
                    value={accessRole}
                    onChange={(e) => setAccessRole(e.target.value as AdminRole)}
                    className="w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                  >
                    <option value="sync">Sync Operator</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div className="rounded-lg bg-surface p-3 text-xs leading-5 text-text-secondary">
                  <p>
                    <strong className="text-text-primary">Sync Operator</strong>: can run
                    data syncs and classification.
                  </p>
                  <p className="mt-2">
                    <strong className="text-text-primary">Admin</strong>: can sync data and
                    manage itinerary grouping tools.
                  </p>
                  <p className="mt-2">
                    <strong className="text-text-primary">Owner</strong>: full access,
                    including managing who else gets access.
                  </p>
                </div>
                <button
                  onClick={handleGrantAccess}
                  disabled={savingAccess}
                  className="inline-flex items-center rounded-lg bg-header-bg px-4 py-2 text-sm font-medium text-header-text shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {savingAccess ? "Saving..." : "Save Access"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {canViewLogs ? (
        <div className="mb-8 rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => setLogsExpanded((value) => !value)}
                aria-expanded={logsExpanded}
                className="min-w-0 flex-1 text-left"
              >
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Operational Logs</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {getLogsRangeLabel(logsRangeHours)} of sync, classification, and
                    summary activity.
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Range
                  </span>
                  <select
                    value={logsRangeHours}
                    onChange={(event) =>
                      setLogsRangeHours(Number(event.target.value) as LogsRangeHours)
                    }
                    className="bg-transparent text-sm font-medium text-text-primary focus:outline-none"
                  >
                    {LOG_RANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => loadOperationLogs()}
                  className="inline-flex items-center rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover"
                >
                  Refresh Logs
                </button>
                <Link
                  href="/admin/logs"
                  className="inline-flex items-center rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover"
                >
                  View All Logs
                </Link>
                <button
                  type="button"
                  onClick={() => setLogsExpanded((value) => !value)}
                  aria-expanded={logsExpanded}
                  aria-label={logsExpanded ? "Collapse operational logs" : "Expand operational logs"}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-input-border bg-surface text-text-secondary shadow-sm transition-transform hover:bg-surface-hover ${
                    logsExpanded ? "rotate-180" : ""
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {logsExpanded ? (
            <div className="px-6 py-5">
              <OperationLogsTable
                logs={operationLogs}
                loading={logsLoading}
                emptyMessage={`No operational logs were recorded in the ${getLogsRangeLabel(logsRangeHours).toLowerCase()}.`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {canViewLogs ? (
        <div className="mb-8 rounded-lg border border-border bg-surface shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Duplicate Review Audit</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Read-only check that groups review documents by their stable Feefo URL and lists any URL with more than one document. Useful for finding duplicates created when a review&apos;s service/product IDs shift over its lifecycle.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Brand
                  </span>
                  <select
                    value={duplicateBrand}
                    onChange={(event) =>
                      setDuplicateBrand(event.target.value as "" | "uniworld" | "luxury-gold")
                    }
                    className="bg-transparent text-sm font-medium text-text-primary focus:outline-none"
                  >
                    <option value="">All brands</option>
                    <option value="uniworld">Uniworld</option>
                    <option value="luxury-gold">Luxury Gold</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={runDuplicateAudit}
                  disabled={duplicateLoading || duplicateResolving}
                  className="inline-flex items-center rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {duplicateLoading ? "Running…" : "Run audit"}
                </button>
                {duplicateReport && duplicateReport.duplicateGroups > 0 ? (
                  <button
                    type="button"
                    onClick={removeDuplicates}
                    disabled={duplicateResolving || duplicateLoading}
                    className="inline-flex items-center rounded-lg border border-red-500 bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
                  >
                    {duplicateResolving
                      ? "Removing…"
                      : `Remove duplicates (${duplicateReport.extraDocs})`}
                  </button>
                ) : null}
                {duplicateReport ? (
                  <button
                    type="button"
                    onClick={() => setDuplicatesExpanded((value) => !value)}
                    aria-expanded={duplicatesExpanded}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-input-border bg-surface text-text-secondary shadow-sm transition-transform hover:bg-surface-hover ${
                      duplicatesExpanded ? "rotate-180" : ""
                    }`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {duplicateReport && duplicatesExpanded ? (
            <div className="px-6 py-5">
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">{duplicateReport.scannedDocs}</div>
                  <div className="text-xs text-text-secondary">Scanned docs</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">{duplicateReport.duplicateGroups}</div>
                  <div className="text-xs text-text-secondary">Duplicate groups</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">{duplicateReport.extraDocs}</div>
                  <div className="text-xs text-text-secondary">Extra docs</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-sm font-medium text-text-primary">
                    {duplicateReport.scannedBrand ?? "All brands"}
                  </div>
                  <div className="text-xs text-text-secondary">Scope</div>
                </div>
              </div>
              {duplicateReport.groups.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  No duplicates found. Every review document has a unique Feefo URL.
                </p>
              ) : (
                <div className="space-y-3">
                  {duplicateReport.groups.map((group) => (
                    <details
                      key={group.feedbackUrl}
                      className="rounded-lg border border-border bg-surface-alt"
                    >
                      <summary className="cursor-pointer px-4 py-3 text-sm">
                        <span className="font-medium text-text-primary">
                          {group.members.length} docs
                        </span>
                        <span className="ml-2 text-text-secondary break-all">
                          {group.feedbackUrl}
                        </span>
                      </summary>
                      <div className="px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-text-tertiary">
                              <th className="py-1 pr-3">Doc ID</th>
                              <th className="py-1 pr-3">Brand</th>
                              <th className="py-1 pr-3">Service ID</th>
                              <th className="py-1 pr-3">Product ID</th>
                              <th className="py-1 pr-3">Order Ref</th>
                              <th className="py-1 pr-3">Created</th>
                              <th className="py-1 pr-3">Last Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.members.map((member) => (
                              <tr key={member.id} className="border-t border-border/50 text-text-primary">
                                <td className="py-1 pr-3 font-mono">{member.id}</td>
                                <td className="py-1 pr-3">{member.brand ?? "—"}</td>
                                <td className="py-1 pr-3 font-mono">{member.serviceId ?? "—"}</td>
                                <td className="py-1 pr-3 font-mono">{member.productId ?? "—"}</td>
                                <td className="py-1 pr-3">{member.orderRef ?? "—"}</td>
                                <td className="py-1 pr-3">{member.created ?? "—"}</td>
                                <td className="py-1 pr-3">{member.lastUpdated ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {canManageMappings ? (
      <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Itinerary Grouping</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage how itinerary variants are grouped into parent itineraries
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
          <div className="text-xs text-text-secondary">Raw Itineraries</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-2xl font-bold text-text-primary">{stats.grouped}</div>
          <div className="text-xs text-text-secondary">Parent Groups</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-2xl font-bold text-green-600">{stats.auto}</div>
          <div className="text-xs text-text-secondary">Auto-Grouped</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.manual}</div>
          <div className="text-xs text-text-secondary">Manual Overrides</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="inline-flex items-center gap-2 rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover disabled:opacity-50"
        >
          {rebuilding ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-input-border border-t-text-secondary" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Rebuild Mappings
        </button>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="inline-flex items-center gap-2 rounded-lg bg-header-bg px-4 py-2 text-sm font-medium text-header-text shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {recomputing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
          Recompute Summaries
        </button>
      </div>

      {/* Search and filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search itineraries..."
          className="flex-1 rounded-lg border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-input-border bg-surface px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="auto">Auto-grouped</option>
          <option value="manual">Manual overrides</option>
          <option value="unchanged">Unchanged</option>
        </select>
        <span className="text-sm text-text-secondary whitespace-nowrap">
          {filtered.length} of {mappings.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-text-secondary">No mappings found. Click &ldquo;Rebuild Mappings&rdquo; to scan reviews.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-medium text-text-secondary cursor-pointer select-none whitespace-nowrap ${col.align}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIndicator active={sortKey === col.key} dir={sortDir} />
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={`${m.brand}-${m.rawName}`} className="border-b border-border hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    {renamingRaw === m.rawName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(m.rawName);
                            if (e.key === "Escape") setRenamingRaw(null);
                          }}
                          list="parent-names"
                          autoFocus
                          className="flex-1 rounded border border-amber-500 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <button
                          onClick={() => saveRename(m.rawName)}
                          disabled={saving}
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setRenamingRaw(null)}
                          className="rounded border border-input-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-text-primary">{m.rawName}</div>
                        {m.autoParentName !== m.rawName && !m.manualParentName && (
                          <div className="text-xs text-text-tertiary mt-0.5">auto: {m.autoParentName}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingRaw === m.rawName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(m.rawName);
                            if (e.key === "Escape") setEditingRaw(null);
                          }}
                          list="parent-names"
                          autoFocus
                          className="flex-1 rounded border border-brand-accent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                        />
                        <button
                          onClick={() => saveEdit(m.rawName)}
                          disabled={saving}
                          className="rounded bg-header-bg px-2 py-1 text-xs text-header-text hover:opacity-90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRaw(null)}
                          className="rounded border border-input-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(m)}
                        className="text-left text-text-primary hover:underline cursor-pointer"
                        title="Click to edit"
                      >
                        {m.effectiveParentName}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.reviewCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge mapping={m} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => startRename(m)}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                        title="Rename this itinerary's display name"
                      >
                        Rename
                      </button>
                      {m.manualParentName && (
                        <button
                          onClick={() => resetMapping(m)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Autocomplete datalist */}
      <datalist id="parent-names">
        {parentNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      </>
      ) : null}

      {!canManageMappings && toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
