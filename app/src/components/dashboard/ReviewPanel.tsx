"use client";

import { useEffect, useState, useCallback } from "react";
import type { ThemeReview } from "@/lib/firestore/queries";
import MediaThumbnails from "@/components/reviews/MediaThumbnails";
import { formatReviewDate } from "@/lib/format/date";

interface ReviewPanelProps {
  title: string;
  subtitle: string;
  accent?: "positive" | "negative" | "neutral";
  reviews: ThemeReview[];
  loading: boolean;
  onClose: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      className="text-brand-accent"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? "★" : "☆"}</span>
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
        ? "border-l-4 border-l-brand-accent"
        : "border-l-4 border-l-brand-accent-light";

  return (
    <div className={`rounded-lg bg-surface-alt p-4 ${borderClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {review.guestName}
        </span>
        <StarRating rating={review.rating} />
      </div>
      <p className="mb-2 text-xs text-text-secondary">
        {review.itinerary} · {review.ship}
        {review.date && ` · ${formatReviewDate(review.date)}`}
      </p>
      <p className="text-sm leading-relaxed text-text-primary">
        {expanded || review.text.length <= 150
          ? review.text
          : `${review.text.slice(0, 150)}...`}
      </p>
      {review.text.length > 150 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-brand-accent hover:underline cursor-pointer"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      {review.media.length > 0 && (
        <div className="mt-2">
          <MediaThumbnails media={review.media} size="sm" />
        </div>
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
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: ReviewPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
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
      <div className="animate-slide-in-right relative flex w-full max-w-full flex-col bg-surface shadow-xl sm:max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {hasMore
                ? `Showing ${reviews.length}+ reviews`
                : `${reviews.length} review${reviews.length !== 1 ? "s" : ""}`}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close panel"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Reviews */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="py-12 text-center text-text-secondary">
              No matching reviews were found.
            </p>
          ) : (
            <>
              {reviews.map((review) => (
                <QuoteCard key={review.id} review={review} accent={accent} />
              ))}
              {hasMore && onLoadMore && (
                <div className="pt-2 text-center">
                  <button
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-lg bg-header-bg px-6 py-2.5 text-sm font-medium text-header-text shadow-sm transition-colors hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Loading...
                      </>
                    ) : (
                      "Show more"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
