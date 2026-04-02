"use client";

import { useState } from "react";

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
}

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
};

interface FilterSidebarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  options: {
    brands: string[];
    ratings: number[];
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
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-light last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-sm font-medium text-text-primary hover:text-text-primary/80"
      >
        {title}
        <ChevronIcon open={open} />
      </button>
      {open && <div className="pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-input-border text-text-primary focus:ring-brand-accent/30"
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

export default function FilterSidebar({ filters, onChange, options }: FilterSidebarProps) {
  const activeFilterCount = Object.entries(filters).reduce(
    (sum, [key, val]) => sum + (key === "hasMedia" ? (val ? 1 : 0) : (val as unknown[]).length),
    0
  );

  type ArrayFilterKey = Exclude<keyof Filters, "hasMedia">;

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
      <FilterSection title="Brand" defaultOpen>
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
      <FilterSection title="Star Rating" defaultOpen>
        {(options.ratings.length > 0 ? options.ratings : [5, 4, 3, 2, 1]).map((star) => (
          <CheckboxItem
            key={star}
            label={`${"★".repeat(star)}${"☆".repeat(5 - star)} (${star})`}
            checked={filters.rating.includes(star)}
            onChange={() => toggleArrayFilter("rating", star)}
          />
        ))}
      </FilterSection>

      {/* Ship */}
      <FilterSection title="Ship">
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
      <FilterSection title="Itinerary">
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
      <FilterSection title="Positive Themes">
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
      <FilterSection title="Negative Themes">
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
      <FilterSection title="Booking Type">
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
      <FilterSection title="Region">
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
      <FilterSection title="Loyalty">
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
