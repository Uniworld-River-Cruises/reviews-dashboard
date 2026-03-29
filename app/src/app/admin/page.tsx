"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/contexts/DashboardContext";
import { getClientAuth, getClientDb } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, QueryConstraint } from "firebase/firestore";
import {
  getCurrentAdminAccess,
  listAdminUsers,
  removeAdminUser,
  getItineraryMappings,
  upsertAdminUser,
  saveManualMapping,
  triggerRebuildMappings,
  triggerRecomputeSummaries,
  type AdminRole,
  type CurrentAdminAccess,
  type AdminUserAccess,
  type ItineraryMapping,
} from "@/lib/firestore/admin-queries";

type StatusFilter = "all" | "auto" | "manual" | "unchanged";
type SortKey = "rawName" | "effectiveParentName" | "reviewCount" | "status";
type SortDir = "asc" | "desc";

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
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
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
  if (!active) return <span className="ml-1 text-gray-300">{"\u2195"}</span>;
  return <span className="ml-1">{dir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export default function AdminPage() {
  const router = useRouter();
  const { brand, dateRange, dataVersion } = useDashboard();
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<CurrentAdminAccess | null>(null);
  const [checkingPageAccess, setCheckingPageAccess] = useState(true);
  const [adminUsers, setAdminUsers] = useState<AdminUserAccess[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(true);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessRole, setAccessRole] = useState<AdminRole>("sync");
  const [savingAccess, setSavingAccess] = useState(false);
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

  const dateStart = dateRange.start.toISOString();
  const dateEnd = dateRange.end.toISOString();
  const canManageUsers = Boolean(currentAccess?.permissions.manageUsers);

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

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      // Load all mappings
      const allMappings = await getItineraryMappings(brand);

      // Query reviews within date range for tour counts
      const db = getClientDb();
      const ref = collection(db, "reviews");
      const constraints: QueryConstraint[] = [
        where("dates.created", ">=", dateStart),
        where("dates.created", "<=", dateEnd),
        orderBy("dates.created", "desc"),
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
  }, [brand, dateStart, dateEnd, dataVersion]);

  useEffect(() => {
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthResolved(true);
      });
    } catch {
      setAuthResolved(true);
      router.replace("/");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    if (!user) {
      setCurrentAccess(null);
      setCheckingPageAccess(false);
      router.replace("/");
      return;
    }

    let cancelled = false;
    setCheckingPageAccess(true);

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setCurrentAccess(access);
        const canUseAdminPage =
          access.permissions.manageMappings || access.permissions.manageUsers;
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

    if (currentAccess.permissions.manageUsers) {
      loadAdminAccess();
      return;
    }

    setAdminUsers([]);
    setAdminUsersLoading(false);
  }, [checkingPageAccess, currentAccess, loadAdminAccess]);

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
      </div>
    );
  }

  return (
    <div>
      {canManageUsers ? (
      <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-[#1B3A5C]">Access Control</h2>
          <p className="mt-1 text-sm text-gray-500">
            Owners can add or remove who is allowed to sync data and use protected admin
            actions.
          </p>
        </div>
        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Current Access
            </h3>
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
              {adminUsersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
                </div>
              ) : adminUsers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">
                  No admin users are configured yet. Add your first owner in Firestore or
                  after bootstrap use the form on the right.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.email} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-900">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-[#1B3A5C]/10 px-2 py-0.5 text-xs font-medium capitalize text-[#1B3A5C]">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {user.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
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
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Grant Access
            </h3>
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={accessEmail}
                    onChange={(e) => setAccessEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    value={accessRole}
                    onChange={(e) => setAccessRole(e.target.value as AdminRole)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
                  >
                    <option value="sync">Sync Operator</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div className="rounded-lg bg-white p-3 text-xs leading-5 text-gray-500">
                  <p>
                    <strong className="text-gray-700">Sync Operator</strong>: can run
                    data syncs and classification.
                  </p>
                  <p className="mt-2">
                    <strong className="text-gray-700">Admin</strong>: can sync data and
                    manage itinerary grouping tools.
                  </p>
                  <p className="mt-2">
                    <strong className="text-gray-700">Owner</strong>: full access,
                    including managing who else gets access.
                  </p>
                </div>
                <button
                  onClick={handleGrantAccess}
                  disabled={savingAccess}
                  className="inline-flex items-center rounded-lg bg-[#1B3A5C] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1B3A5C]/90 disabled:opacity-50"
                >
                  {savingAccess ? "Saving..." : "Grant Access"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1B3A5C]">Itinerary Grouping</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage how itinerary variants are grouped into parent itineraries
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-2xl font-bold text-[#1B3A5C]">{stats.total}</div>
          <div className="text-xs text-gray-500">Raw Itineraries</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-2xl font-bold text-[#1B3A5C]">{stats.grouped}</div>
          <div className="text-xs text-gray-500">Parent Groups</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-2xl font-bold text-green-600">{stats.auto}</div>
          <div className="text-xs text-gray-500">Auto-Grouped</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.manual}</div>
          <div className="text-xs text-gray-500">Manual Overrides</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {rebuilding ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
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
          className="inline-flex items-center gap-2 rounded-lg bg-[#1B3A5C] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1B3A5C]/90 disabled:opacity-50"
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
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="auto">Auto-grouped</option>
          <option value="manual">Manual overrides</option>
          <option value="unchanged">Unchanged</option>
        </select>
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filtered.length} of {mappings.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-500">No mappings found. Click &ldquo;Rebuild Mappings&rdquo; to scan reviews.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-medium text-gray-500 cursor-pointer select-none whitespace-nowrap ${col.align}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIndicator active={sortKey === col.key} dir={sortDir} />
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={`${m.brand}-${m.rawName}`} className="border-b border-gray-100 hover:bg-gray-50">
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-gray-900">{m.rawName}</div>
                        {m.autoParentName !== m.rawName && !m.manualParentName && (
                          <div className="text-xs text-gray-400 mt-0.5">auto: {m.autoParentName}</div>
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
                          className="flex-1 rounded border border-[#1B3A5C] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
                        />
                        <button
                          onClick={() => saveEdit(m.rawName)}
                          disabled={saving}
                          className="rounded bg-[#1B3A5C] px-2 py-1 text-xs text-white hover:bg-[#1B3A5C]/90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRaw(null)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(m)}
                        className="text-left text-[#1B3A5C] hover:underline cursor-pointer"
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
    </div>
  );
}
