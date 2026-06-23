"use client";

import { useState } from "react";
import type { ReviewData } from "./ReviewCard";

interface ExportButtonProps {
  /** Fetches every review matching the page's current filters (not just
   * the in-memory loaded slice). The page owns the Firestore query, so it
   * knows how to paginate. The button only knows how to turn the resulting
   * array into a CSV. `null` disables the button. */
  fetchAll: (() => Promise<ReviewData[]>) | null;
  /** Total match count for the disabled-state / cosmetic label. Lets the
   * button stay disabled when there's nothing to export without making
   * the page wait on the (possibly slow) fetch. */
  totalCount: number | null;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(reviews: ReviewData[]): string {
  const headers = [
    "Name",
    "Service Rating",
    "Product Rating",
    "Ship",
    "Itinerary",
    "Title",
    "Service Review",
    "Product Review",
    "Themes",
    "Date",
  ];

  const rows = reviews.map((r) => [
    escapeCsv(r.customerName || "Trusted Customer"),
    r.serviceRating == null ? "" : String(r.serviceRating),
    r.productRating == null ? "" : String(r.productRating),
    escapeCsv(r.ship),
    escapeCsv(r.itinerary),
    escapeCsv(r.serviceTitle),
    escapeCsv(r.serviceReview),
    escapeCsv(r.productReview),
    escapeCsv([...r.positiveThemes, ...r.negativeThemes].join("; ")),
    r.date,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export default function ExportButton({ fetchAll, totalCount }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!fetchAll) return;
    setBusy(true);
    try {
      const reviews = await fetchAll();
      const csv = buildCsv(reviews);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reviews-export-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !fetchAll || totalCount === 0;

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
          Exporting...
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export CSV
        </>
      )}
    </button>
  );
}
