"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import MediaThumbnails from "./MediaThumbnails";
import type { ReviewType } from "./FilterSidebar";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export interface ReviewData {
  id: string;
  customerName: string;
  /** Star rating attached to the service review (the merchant's customer
   * service / booking experience). `null` when the customer left no service
   * rating. */
  serviceRating: number | null;
  /** Star rating attached to the product review (the actual product — for
   * Uniworld, the cruise itinerary). `null` when the customer left no
   * product rating. */
  productRating: number | null;
  ship: string;
  itinerary: string;
  brand: string;
  serviceTitle: string;
  serviceReview: string;
  productReview: string;
  positiveThemes: string[];
  negativeThemes: string[];
  bookingType: string;
  region: string;
  loyalty: string;
  date: string;
  media: { type: string; url: string }[];
  parentItinerary: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-brand-accent" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

/** A single labelled review section — "Service" or "Product" — with its own
 * star rating header above the review text. */
function ReviewSection({
  kind,
  rating,
  text,
  expanded,
  onMeasureClamp,
}: {
  kind: "service" | "product";
  rating: number | null;
  text: string;
  expanded: boolean;
  onMeasureClamp: (clamped: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      onMeasureClamp(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text, onMeasureClamp]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          {kind === "service" ? "Service review" : "Product review"}
        </span>
        {rating != null && rating > 0 && <StarRating rating={rating} />}
      </div>
      <div
        ref={ref}
        className={`text-sm text-text-primary leading-relaxed ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

interface ReviewCardProps {
  review: ReviewData;
  onThemeClick?: (theme: string, type: "positive" | "negative") => void;
  /** When set, hides the off-type section so the card reflects the active
   * "All / Service / Product" filter. Undefined or "all" shows both sections
   * if their text is present. */
  reviewTypeFilter?: ReviewType;
}

export default function ReviewCard({ review, onThemeClick, reviewTypeFilter }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [serviceClamped, setServiceClamped] = useState(false);
  const [productClamped, setProductClamped] = useState(false);

  // Decide which sections render. A section needs both non-empty text AND no
  // off-type filter excluding it.
  const showService =
    Boolean(review.serviceReview) &&
    (reviewTypeFilter !== "product");
  const showProduct =
    Boolean(review.productReview) &&
    (reviewTypeFilter !== "service");

  const clamped = (showService && serviceClamped) || (showProduct && productClamped);

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      {/* Header */}
      <div className="mb-2">
        <span className="font-medium text-text-primary">
          {review.customerName || "Trusted Customer"}
        </span>
        <span className="ml-2 text-xs text-text-tertiary">
          {new Date(review.date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Service title — Feefo lets reviewers add a short headline */}
      {review.serviceTitle && (
        <h3 className="mb-2 text-base font-semibold text-text-primary">
          {review.serviceTitle}
        </h3>
      )}

      {/* Meta — clickable itinerary and ship links */}
      <div className="text-xs text-text-secondary mb-3 space-y-0.5">
        {review.parentItinerary && (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/itineraries?slug=${encodeURIComponent(slugify(review.parentItinerary))}`}
              className="text-text-primary/70 hover:text-text-primary hover:underline"
            >
              {review.parentItinerary}
            </Link>
            {review.brand && (
              <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-secondary uppercase">
                {review.brand}
              </span>
            )}
          </div>
        )}
        {review.ship && (
          <div>
            <Link
              href={`/ships?slug=${encodeURIComponent(slugify(review.ship))}`}
              className="text-text-primary/70 hover:text-text-primary hover:underline"
            >
              {review.ship}
            </Link>
          </div>
        )}
      </div>

      {/* Review sections — Service and/or Product, each labelled with its own
       * star rating. Mirrors how Feefo's public review pages tag each card by
       * type. When only one is present, only one renders. */}
      <div className="space-y-3">
        {showService && (
          <ReviewSection
            kind="service"
            rating={review.serviceRating}
            text={review.serviceReview}
            expanded={expanded}
            onMeasureClamp={setServiceClamped}
          />
        )}
        {showProduct && (
          <ReviewSection
            kind="product"
            rating={review.productRating}
            text={review.productReview}
            expanded={expanded}
            onMeasureClamp={setProductClamped}
          />
        )}
      </div>
      {clamped && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-text-primary hover:underline"
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
              className="rounded-full bg-brand-primary-light px-2.5 py-0.5 text-xs font-medium text-text-primary hover:bg-brand-primary-light/50 transition-colors"
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
