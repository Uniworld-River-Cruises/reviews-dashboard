"use client";

import { useState, useRef, useEffect } from "react";

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
    <span className="text-[#C5A258]" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? "\u2605" : "\u2606"}</span>
      ))}
    </span>
  );
}

function QuoteCard({ quote, type }: { quote: Quote; type: "positive" | "negative" }) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const borderClass = type === "negative" ? "border-l-4 border-l-red-400" : "border-l-4 border-l-[#1B3A5C]";

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
    }
  }, []);

  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[#1B3A5C]">{quote.guestName}</span>
        <StarRating rating={quote.rating} />
      </div>
      <p className="text-xs text-gray-500 mb-2">
        {quote.itinerary} &middot; {quote.ship}
      </p>
      <p
        ref={textRef}
        className={`text-sm text-gray-700 leading-relaxed ${!expanded ? "line-clamp-4" : ""}`}
      >
        {quote.text}
      </p>
      {needsClamp && (
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

export default function QuotesSection({ positiveQuotes, negativeQuotes }: QuotesSectionProps) {
  const [activeTab, setActiveTab] = useState<"positive" | "negative">("positive");
  const quotes = activeTab === "positive" ? positiveQuotes : negativeQuotes;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-[#1B3A5C] mb-4">Guest Quotes</h3>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("positive")}
          className={`relative pb-3 text-sm font-medium transition-colors ${
            activeTab === "positive"
              ? "text-[#1B3A5C]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Positive
          {activeTab === "positive" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C5A258]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("negative")}
          className={`relative pb-3 text-sm font-medium transition-colors ${
            activeTab === "negative"
              ? "text-[#1B3A5C]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Needs Improvement
          {activeTab === "negative" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C5A258]" />
          )}
        </button>
      </div>

      {/* Quote Cards */}
      <div className="space-y-4">
        {quotes.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No quotes available.</p>
        ) : (
          quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} type={activeTab} />
          ))
        )}
      </div>
    </div>
  );
}
