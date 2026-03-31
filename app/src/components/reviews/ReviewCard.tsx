"use client";

import { useState, useRef, useEffect } from "react";
import MediaThumbnails from "./MediaThumbnails";

export interface ReviewData {
  id: string;
  customerName: string;
  rating: number;
  ship: string;
  itinerary: string;
  brand: string;
  serviceReview: string;
  productReview: string;
  positiveThemes: string[];
  negativeThemes: string[];
  bookingType: string;
  region: string;
  loyalty: string;
  date: string;
  media: { type: string; url: string }[];
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

interface ReviewCardProps {
  review: ReviewData;
  onThemeClick?: (theme: string, type: "positive" | "negative") => void;
}

export default function ReviewCard({ review, onThemeClick }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const fullText = [review.serviceReview, review.productReview]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [fullText]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="font-medium text-[#1B3A5C]">
            {review.customerName || "Trusted Customer"}
          </span>
          <span className="ml-2 text-xs text-gray-400">
            {new Date(review.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <StarRating rating={review.rating} />
      </div>

      {/* Meta */}
      <p className="text-xs text-gray-500 mb-3">
        {review.itinerary}
        {review.ship && <> &middot; {review.ship}</>}
        {review.brand && (
          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
            {review.brand}
          </span>
        )}
      </p>

      {/* Review text */}
      <div
        ref={textRef}
        className={`text-sm text-gray-700 leading-relaxed ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {fullText}
      </div>
      {clamped && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-[#1B3A5C] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      {/* Media */}
      {review.media.length > 0 && (
        <div className="mt-3">
          <MediaThumbnails media={review.media} size="md" />
        </div>
      )}

      {/* Theme tags */}
      {(review.positiveThemes.length > 0 || review.negativeThemes.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {review.positiveThemes.map((theme) => (
            <button
              key={`pos-${theme}`}
              onClick={() => onThemeClick?.(theme, "positive")}
              className="rounded-full bg-[#1B3A5C]/10 px-2.5 py-0.5 text-xs font-medium text-[#1B3A5C] hover:bg-[#1B3A5C]/20 transition-colors"
            >
              {theme}
            </button>
          ))}
          {review.negativeThemes.map((theme) => (
            <button
              key={`neg-${theme}`}
              onClick={() => onThemeClick?.(theme, "negative")}
              className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              {theme}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
