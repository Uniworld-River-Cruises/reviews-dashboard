"use client";

import type { ReviewData } from "./ReviewCard";

interface ExportButtonProps {
  reviews: ReviewData[];
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function ExportButton({ reviews }: ExportButtonProps) {
  function handleExport() {
    const headers = [
      "Name",
      "Rating",
      "Ship",
      "Itinerary",
      "Service Review",
      "Product Review",
      "Themes",
      "Date",
    ];

    const rows = reviews.map((r) => [
      escapeCsv(r.customerName || "Trusted Customer"),
      String(r.rating),
      escapeCsv(r.ship),
      escapeCsv(r.itinerary),
      escapeCsv(r.serviceReview),
      escapeCsv(r.productReview),
      escapeCsv([...r.positiveThemes, ...r.negativeThemes].join("; ")),
      r.date,
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reviews-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      disabled={reviews.length === 0}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
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
    </button>
  );
}
