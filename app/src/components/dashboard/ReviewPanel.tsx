"use client";

import { useEffect, useState, useCallback } from "react";
import type { ThemeReview } from "@/lib/firestore/queries";

interface ReviewPanelProps {
  title: string;
  subtitle: string;
  accent?: "positive" | "negative" | "neutral";
  reviews: ThemeReview[];
  loading: boolean;
  onClose: () => void;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-[#C5A258]" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? "\u2605" : "\u2606"}</span>
      ))}
    </span>
  );
}

function QuoteCard({
  review,
  accent,
}: {
  review: ThemeReview;
  accent: "positive" | "negative" | "neutral";
}) {
  const [expanded, setExpanded] = useState(false);
  const borderClass =
    accent === "negative"
      ? "border-l-4 border-l-red-400"
      : accent === "positive"
        ? "border-l-4 border-l-[#1B3A5C]"
        : "border-l-4 border-l-[#C5A258]";

  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[#1B3A5C]">{review.guestName}</span>
        <StarRating rating={review.rating} />
      </div>
      <p className="text-xs text-gray-500 mb-2">
        {review.itinerary} &middot; {review.ship}
      </p>
      <p className="text-sm text-gray-700 leading-relaxed">
        {expanded || review.text.length <= 150
          ? review.text
          : `${review.text.slice(0, 150)}...`}
      </p>
      {review.text.length > 150 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-[#1B3A5C] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export default function ReviewPanel({
  title,
  subtitle,
  accent = "neutral",
  reviews,
  loading,
  onClose,
}: ReviewPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-full sm:max-w-md bg-white shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-[#1B3A5C]">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {reviews.length} review{reviews.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Reviews */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No matching reviews were found.</p>
          ) : (
            reviews.map((review) => (
              <QuoteCard key={review.id} review={review} accent={accent} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
