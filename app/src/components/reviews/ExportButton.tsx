"use client";

import { useState } from "react";
import type { ReviewData } from "./ReviewCard";

/** What `fetchAll` returns. The truncation flag lets the button warn the
 * user instead of silently delivering a partial CSV when the safety cap
 * fires. `scannedCount` is the number of server-fetched docs *before* any
 * client-side filter is applied, so it's the right value to put next to
 * `cap` in the warning ("scanned 10,000 of an estimated N, stopped"). */
export interface ExportFetchResult {
  reviews: ReviewData[];
  truncated: boolean;
  scannedCount: number;
  cap: number;
}

interface ExportButtonProps {
  /** Fetches every review matching the page's current filters (not just
   * the in-memory loaded slice). The page owns the Firestore query, so it
   * knows how to paginate. The button only knows how to turn the resulting
   * array into a CSV. `null` disables the button. */
  fetchAll: (() => Promise<ExportFetchResult>) | null;
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
  const [message, setMessage] = useState<
    { tone: "error" | "warning"; text: string } | null
  >(null);

  async function handleExport() {
    if (!fetchAll) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchAll();
      const csv = buildCsv(result.reviews);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reviews-export-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      if (result.truncated) {
        setMessage({
          tone: "warning",
          text: `Export capped at ${result.cap.toLocaleString()} rows (more matches exist). Narrow the filters and try again to capture the rest.`,
        });
      }
    } catch (err) {
      console.error("Export failed", err);
      setMessage({
        tone: "error",
        text:
          err instanceof Error
            ? `Export failed: ${err.message}`
            : "Export failed. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !fetchAll || totalCount === 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? (
          <>
            <div
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
            />
            Exporting...
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
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
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`max-w-xs text-right text-xs ${
            message.tone === "error" ? "text-red-600" : "text-amber-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
