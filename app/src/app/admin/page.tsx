"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, QueryConstraint } from "firebase/firestore";
import {
  getItineraryMappings,
  saveManualMapping,
  triggerRebuildMappings,
  triggerRecomputeSummaries,
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
  const { brand, dateRange } = useDashboard();
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

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      // Load all mappings
      const allMappings = await getItineraryMappings(brand);

      // Query reviews within date range for tour counts
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
  }, [brand, dateStart, dateEnd]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

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

  return (
    <div>
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
