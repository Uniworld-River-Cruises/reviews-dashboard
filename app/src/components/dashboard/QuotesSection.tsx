"use client";

import { useState, useRef, useEffect } from "react";
import { formatReviewDate } from "@/lib/format/date";

export interface Quote {
  id: string;
  guestName: string;
  rating: number;
  ship: string;
  itinerary: string;
  text: string;
  date: string;
}

interface QuotesSectionProps {
  positiveQuotes: Quote[];
  negativeQuotes: Quote[];
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

function QuoteCard({
  quote,
  type,
}: {
  quote: Quote;
  type: "positive" | "negative";
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const borderClass =
    type === "negative"
      ? "border-l-4 border-l-red-400"
      : "border-l-4 border-l-brand-accent";

  useEffect(() => {
    const el = textRef.current;
    if (el) setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
  }, []);

  return (
    <div className={`rounded-lg bg-surface-alt p-4 ${borderClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {quote.guestName}
        </span>
        <StarRating rating={quote.rating} />
      </div>
      <p className="mb-2 text-xs text-text-secondary">
        {quote.itinerary} · {quote.ship}
        {quote.date && ` · ${formatReviewDate(quote.date)}`}
      </p>
      <p
        ref={textRef}
        className={`text-sm leading-relaxed text-text-primary ${
          !expanded ? "line-clamp-4" : ""
        }`}
      >
        {quote.text}
      </p>
      {needsClamp && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 cursor-pointer text-xs font-medium text-brand-accent hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export default function QuotesSection({
  positiveQuotes,
  negativeQuotes,
}: QuotesSectionProps) {
  const [activeTab, setActiveTab] = useState<"positive" | "negative">(
    "positive",
  );
  const quotes = activeTab === "positive" ? positiveQuotes : negativeQuotes;

  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-text-primary">
        Guest Quotes
      </h3>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-6 border-b border-border">
        {(["positive", "negative"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative cursor-pointer pb-3 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab === "positive" ? "Positive" : "Needs Improvement"}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-nav-active-indicator" />
            )}
          </button>
        ))}
      </div>

      {/* Quote cards */}
      <div className="space-y-4">
        {quotes.length === 0 ? (
          <p className="py-8 text-center text-text-tertiary">
            No quotes available.
          </p>
        ) : (
          quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} type={activeTab} />
          ))
        )}
      </div>
    </div>
  );
}
