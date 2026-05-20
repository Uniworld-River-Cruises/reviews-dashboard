"use client";

import React from "react";

/** Mirrors Feefo's All / Service reviews / Product reviews tabs on their
 * public review pages. "Service" = customer-service / booking-experience
 * reviews; "Product" = reviews of the actual product (the cruise itinerary
 * for Uniworld). */
export type ReviewType = "all" | "service" | "product";

export interface Filters {
  brand: string[];
  rating: number[];
  ship: string[];
  itinerary: string[];
  positiveThemes: string[];
  negativeThemes: string[];
  bookingType: string[];
  region: string[];
  loyalty: string[];
  hasMedia: boolean;
  reviewType: ReviewType;
}

export type FilterSectionKey =
  | "brand"
  | "rating"
  | "ship"
  | "itinerary"
  | "positiveThemes"
  | "negativeThemes"
  | "bookingType"
  | "region"
  | "loyalty";

export type OpenFilterSections = Record<FilterSectionKey, boolean>;

export const defaultOpenFilterSections: OpenFilterSections = {
  brand: true,
  rating: true,
  ship: false,
  itinerary: false,
  positiveThemes: false,
  negativeThemes: false,
  bookingType: false,
  region: false,
  loyalty: false,
};

export const emptyFilters: Filters = {
  brand: [],
  rating: [],
  ship: [],
  itinerary: [],
  positiveThemes: [],
  negativeThemes: [],
  bookingType: [],
  region: [],
  loyalty: [],
  hasMedia: false,
  reviewType: "all",
};

interface FilterSidebarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  openSections: OpenFilterSections;
  onToggleSection: (section: FilterSectionKey) => void;
  options: {
    brands: string[];
    ratings: number[];
    /** Count of reviews per star value, keyed by the star number (1–5). */
    ratingCounts?: Record<number, number>;
    ships: string[];
    itineraries: string[];
    positiveThemes: string[];
    negativeThemes: string[];
    bookingTypes: string[];
    regions: string[];
    loyaltyLevels: string[];
  };
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function FilterSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentId = React.useId();

  return (
    <div className="border-b border-border-light last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-sm font-medium text-text-primary hover:text-text-primary/80"
      >
        {title}
        <ChevronIcon open={open} />
      </button>
      <div id={contentId} hidden={!open} className="pb-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 rounded border-input-border text-text-primary focus:ring-brand-accent/30"
      />
      {label}
    </label>
  );
}

function formatBrandName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function FilterSidebar({
  filters,
  onChange,
  openSections,
  onToggleSection,
  options,
}: FilterSidebarProps) {
  const activeFilterCount = Object.entries(filters).reduce((sum, [key, val]) => {
    if (key === "hasMedia") return sum + (val ? 1 : 0);
    if (key === "reviewType") return sum + (val !== "all" ? 1 : 0);
    return sum + (val as unknown[]).length;
  }, 0);

  type ArrayFilterKey = Exclude<keyof Filters, "hasMedia" | "reviewType">;

  function toggleArrayFilter<K extends ArrayFilterKey>(
    key: K,
    value: Filters[K][number]
  ) {
    const current = filters[key] as Array<Filters[K][number]>;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  function removeChip(key: keyof Filters, value: string | number | boolean) {
    if (key === "hasMedia") {
      onChange({ ...filters, hasMedia: false });
    } else if (key === "reviewType") {
      onChange({ ...filters, reviewType: "all" });
    } else {
      const current = filters[key] as Array<string | number>;
      onChange({ ...filters, [key]: current.filter((v) => v !== value) });
    }
  }

  function clearAll() {
    onChange(emptyFilters);
  }

  const chipLabel = (key: keyof Filters, value: string | number) => {
    if (key === "rating") return `${value} star${Number(value) !== 1 ? "s" : ""}`;
    if (key === "brand") return formatBrandName(String(value));
    return String(value);
  };

  // Collect all active chips
  const chips: { key: keyof Filters; value: string | number | boolean; label: string }[] = [];
  for (const [key, values] of Object.entries(filters)) {
    if (key === "hasMedia") {
      if (values) chips.push({ key: "hasMedia", value: true, label: "Has media" });
    } else if (key === "reviewType") {
      if (values !== "all") {
        const label = values === "service" ? "Service reviews" : "Product reviews";
        chips.push({ key: "reviewType", value: values as string, label });
      }
    } else {
      for (const value of values as Array<string | number>) {
        chips.push({ key: key as keyof Filters, value, label: chipLabel(key as keyof Filters, value) });
      }
    }
  }

  return (
    <aside className="w-full">
      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Active filters ({activeFilterCount})
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={`${chip.key}-${chip.value}`}
                className="inline-flex items-center gap-1 rounded-full bg-brand-primary-light px-2.5 py-1 text-xs font-medium text-text-primary"
              >
                {chip.label}
                <button
                  onClick={() => removeChip(chip.key, chip.value)}
                  className="ml-0.5 hover:text-red-500"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Review type — mirrors Feefo's All / Service / Product tabs */}
      <div className="border-b border-border-light py-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Review type
        </div>
        <div
          role="tablist"
          aria-label="Review type"
          className="grid grid-cols-3 gap-1 rounded-full bg-surface-alt p-1"
        >
          {(["all", "service", "product"] as ReviewType[]).map((rt) => {
            const active = filters.reviewType === rt;
            return (
              <button
                key={rt}
                role="tab"
                aria-selected={active}
                onClick={() => onChange({ ...filters, reviewType: rt })}
                className={
                  active
                    ? "rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
                    : "rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                }
              >
                {rt === "all" ? "All" : rt === "service" ? "Service" : "Product"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Media toggle */}
      <div className="border-b border-border-light py-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-text-primary">
          <input
            type="checkbox"
            checked={filters.hasMedia}
            onChange={(e) => onChange({ ...filters, hasMedia: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-input-border text-text-primary focus:ring-brand-accent/30"
          />
          Only reviews with photos or videos
        </label>
      </div>

      {/* Brand */}
      <FilterSection
        title="Brand"
        open={openSections.brand}
        onToggle={() => onToggleSection("brand")}
      >
        {options.brands.map((brand) => (
          <CheckboxItem
            key={brand}
            label={formatBrandName(brand)}
            checked={filters.brand.includes(brand)}
            onChange={() => toggleArrayFilter("brand", brand)}
          />
        ))}
      </FilterSection>

      {/* Star Rating */}
      <FilterSection
        title="Star Rating"
        open={openSections.rating}
        onToggle={() => onToggleSection("rating")}
      >
        {(options.ratings.length > 0 ? options.ratings : [5, 4, 3, 2, 1]).map((star) => {
          const count = options.ratingCounts?.[star];
          return (
            <CheckboxItem
              key={star}
              checked={filters.rating.includes(star)}
              onChange={() => toggleArrayFilter("rating", star)}
              label={
                <span className="flex items-center gap-1.5">
                  {/* Fixed-width digit so stars always start in the same column */}
                  <span className="w-3 shrink-0 text-right tabular-nums">{star}</span>
                  {/* Each star occupies the same fixed width to prevent glyph-width drift */}
                  <span className="flex">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className="inline-block w-[1em] text-center leading-none">
                        {i < star ? "★" : "☆"}
                      </span>
                    ))}
                  </span>
                  {count !== undefined && (
                    <span className="text-text-tertiary">({count.toLocaleString()})</span>
                  )}
                </span>
              }
            />
          );
        })}
      </FilterSection>

      {/* Ship */}
      <FilterSection
        title="Ship"
        open={openSections.ship}
        onToggle={() => onToggleSection("ship")}
      >
        {options.ships.map((ship) => (
          <CheckboxItem
            key={ship}
            label={ship}
            checked={filters.ship.includes(ship)}
            onChange={() => toggleArrayFilter("ship", ship)}
          />
        ))}
      </FilterSection>

      {/* Itinerary */}
      <FilterSection
        title="Itinerary"
        open={openSections.itinerary}
        onToggle={() => onToggleSection("itinerary")}
      >
        {options.itineraries.map((itin) => (
          <CheckboxItem
            key={itin}
            label={itin}
            checked={filters.itinerary.includes(itin)}
            onChange={() => toggleArrayFilter("itinerary", itin)}
          />
        ))}
      </FilterSection>

      {/* Positive Themes */}
      <FilterSection
        title="Positive Themes"
        open={openSections.positiveThemes}
        onToggle={() => onToggleSection("positiveThemes")}
      >
        {options.positiveThemes.map((theme) => (
          <CheckboxItem
            key={theme}
            label={theme}
            checked={filters.positiveThemes.includes(theme)}
            onChange={() => toggleArrayFilter("positiveThemes", theme)}
          />
        ))}
      </FilterSection>

      {/* Negative Themes */}
      <FilterSection
        title="Negative Themes"
        open={openSections.negativeThemes}
        onToggle={() => onToggleSection("negativeThemes")}
      >
        {options.negativeThemes.map((theme) => (
          <CheckboxItem
            key={theme}
            label={theme}
            checked={filters.negativeThemes.includes(theme)}
            onChange={() => toggleArrayFilter("negativeThemes", theme)}
          />
        ))}
      </FilterSection>

      {/* Booking Type */}
      <FilterSection
        title="Booking Type"
        open={openSections.bookingType}
        onToggle={() => onToggleSection("bookingType")}
      >
        {options.bookingTypes.map((bt) => (
          <CheckboxItem
            key={bt}
            label={bt}
            checked={filters.bookingType.includes(bt)}
            onChange={() => toggleArrayFilter("bookingType", bt)}
          />
        ))}
      </FilterSection>

      {/* Region */}
      <FilterSection
        title="Region"
        open={openSections.region}
        onToggle={() => onToggleSection("region")}
      >
        {options.regions.map((region) => (
          <CheckboxItem
            key={region}
            label={region}
            checked={filters.region.includes(region)}
            onChange={() => toggleArrayFilter("region", region)}
          />
        ))}
      </FilterSection>

      {/* Loyalty */}
      <FilterSection
        title="Loyalty"
        open={openSections.loyalty}
        onToggle={() => onToggleSection("loyalty")}
      >
        {options.loyaltyLevels.map((level) => (
          <CheckboxItem
            key={level}
            label={level}
            checked={filters.loyalty.includes(level)}
            onChange={() => toggleArrayFilter("loyalty", level)}
          />
        ))}
      </FilterSection>
    </aside>
  );
}
