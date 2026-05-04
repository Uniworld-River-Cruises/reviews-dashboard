"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard, type DateField } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import { getClientDb } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
} from "firebase/firestore";
import {
  dateFieldPath,
  getFilterOptions,
  getParentNameLookup,
  type FilterOptions,
} from "@/lib/firestore/queries";
import FilterSidebar, {
  type Filters,
  emptyFilters,
} from "@/components/reviews/FilterSidebar";
import ReviewCard, { type ReviewData } from "@/components/reviews/ReviewCard";
import ExportButton from "@/components/reviews/ExportButton";

// ---------------------------------------------------------------------------
// Firestore → ReviewData mapper
// ---------------------------------------------------------------------------

function mapReviewDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
  dateField: DateField,
  parentLookup?: Map<string, string>
): ReviewData {
  const d = doc.data();
  const rawItinerary = d.tags?.tour || d.product?.title || "";
  const dates = d.dates as { created?: unknown; lastUpdated?: unknown } | undefined;
  const primary = dateField === "lastUpdated" ? dates?.lastUpdated : dates?.created;
  const fallback = dateField === "lastUpdated" ? dates?.created : dates?.lastUpdated;
  const date =
    typeof primary === "string"
      ? primary
      : typeof fallback === "string"
        ? fallback
        : "";
  return {
    id: doc.id,
    customerName: d.customer?.displayName || "Trusted Customer",
    serviceRating: typeof d.ratings?.service === "number" ? d.ratings.service : null,
    productRating: typeof d.ratings?.product === "number" ? d.ratings.product : null,
    ship: d.tags?.ship || "",
    itinerary: rawItinerary,
    parentItinerary: parentLookup?.get(rawItinerary) ?? rawItinerary,
    brand: d.brand || "",
    serviceTitle: d.reviews?.serviceTitle || "",
    serviceReview: d.reviews?.serviceText || "",
    productReview: d.reviews?.productText || "",
    positiveThemes: d.themes?.positive || [],
    negativeThemes: d.themes?.negative || [],
    bookingType: d.tags?.bookingType || "",
    region: d.tags?.region || "",
    loyalty: d.tags?.loyalty || "",
    date,
    media: Array.isArray(d.media) ? d.media : [],
  };
}

// ---------------------------------------------------------------------------
// Empty filter options
// ---------------------------------------------------------------------------

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  brands: [], ratings: [], ratingCounts: {}, ships: [], itineraries: [],
  positiveThemes: [], negativeThemes: [],
  bookingTypes: [], regions: [], loyaltyLevels: [],
};

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortOption = "newest" | "oldest";

function sortReviews(reviews: ReviewData[], sort: SortOption): ReviewData[] {
  const sorted = [...reviews];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.date.localeCompare(a.date));
    case "oldest":
      return sorted.sort((a, b) => a.date.localeCompare(b.date));
  }
}

// ---------------------------------------------------------------------------
// URL serialization helpers
// ---------------------------------------------------------------------------

function filtersToParams(filters: Filters, search: string, sort: SortOption): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (sort !== "newest") params.set("sort", sort);
  for (const [key, values] of Object.entries(filters)) {
    if (key === "hasMedia") {
      if (values) params.set("hasMedia", "true");
    } else if (key === "reviewType") {
      // Default-omitted: only write the param when not "all" so URLs stay
      // clean for the common case.
      if (values !== "all") params.set("reviewType", values as string);
    } else if ((values as Array<string | number>).length > 0) {
      params.set(key, (values as Array<string | number>).join(","));
    }
  }
  return params.toString();
}

function paramsToFilters(searchParams: URLSearchParams): {
  filters: Filters;
  search: string;
  sort: SortOption;
} {
  const search = searchParams.get("q") || "";
  const rawSort = searchParams.get("sort");
  const sort: SortOption = rawSort === "oldest" ? "oldest" : "newest";

  const parseArray = (key: string) => {
    const val = searchParams.get(key);
    return val ? val.split(",") : [];
  };

  const reviewTypeParam = searchParams.get("reviewType");
  const reviewType: Filters["reviewType"] =
    reviewTypeParam === "service" || reviewTypeParam === "product"
      ? reviewTypeParam
      : "all";

  const filters: Filters = {
    brand: parseArray("brand"),
    rating: parseArray("rating").map(Number).filter((n) => !isNaN(n)),
    ship: parseArray("ship"),
    itinerary: parseArray("itinerary"),
    positiveThemes: parseArray("positiveThemes"),
    negativeThemes: parseArray("negativeThemes"),
    bookingType: parseArray("bookingType"),
    region: parseArray("region"),
    loyalty: parseArray("loyalty"),
    hasMedia: searchParams.get("hasMedia") === "true",
    reviewType,
  };

  return { filters, search, sort };
}

// ---------------------------------------------------------------------------
// Build Firestore constraints from filters (server-side filtering)
// ---------------------------------------------------------------------------

function buildServerConstraints(
  brand: string,
  dateStart: string,
  dateEnd: string,
  filters: Filters,
  dateField: DateField
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  const path = dateFieldPath(dateField);

  if (brand !== "combined") {
    constraints.push(where("brand", "==", brand));
  }

  // Date range
  constraints.push(where(path, ">=", dateStart));
  constraints.push(where(path, "<=", dateEnd));

  // Single-value equality filters (Firestore supports these alongside orderBy)
  // We can only use ONE array-contains or "in" per query, so we pick the most
  // selective single-value filter for each field.

  if (filters.ship.length === 1) {
    constraints.push(where("tags.ship", "==", filters.ship[0]));
  } else if (filters.ship.length > 1 && filters.ship.length <= 30) {
    constraints.push(where("tags.ship", "in", filters.ship));
  }

  if (filters.region.length === 1) {
    constraints.push(where("tags.region", "==", filters.region[0]));
  } else if (filters.region.length > 1 && filters.region.length <= 30) {
    constraints.push(where("tags.region", "in", filters.region));
  }

  if (filters.bookingType.length === 1) {
    constraints.push(where("tags.bookingType", "==", filters.bookingType[0]));
  } else if (filters.bookingType.length > 1 && filters.bookingType.length <= 30) {
    constraints.push(where("tags.bookingType", "in", filters.bookingType));
  }

  if (filters.loyalty.length === 1) {
    constraints.push(where("tags.loyalty", "==", filters.loyalty[0]));
  } else if (filters.loyalty.length > 1 && filters.loyalty.length <= 30) {
    constraints.push(where("tags.loyalty", "in", filters.loyalty));
  }

  if (filters.itinerary.length === 1) {
    constraints.push(where("tags.tour", "==", filters.itinerary[0]));
  } else if (filters.itinerary.length > 1 && filters.itinerary.length <= 30) {
    constraints.push(where("tags.tour", "in", filters.itinerary));
  }

  constraints.push(orderBy(path, "desc"));

  return constraints;
}

// Filters that must be applied client-side (not supported by Firestore composite queries)
function applyClientFilters(reviews: ReviewData[], filters: Filters, search: string): ReviewData[] {
  return reviews.filter((r) => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${r.customerName} ${r.serviceReview} ${r.productReview} ${r.ship} ${r.itinerary}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Brand filter (only if not applied server-side via brand selector)
    if (filters.brand.length && !filters.brand.includes(r.brand)) return false;

    // Rating filter — match against the primary display rating, which falls
    // back from product to service the same way Feefo's "headline" star does.
    if (filters.rating.length) {
      const primary = r.productRating ?? r.serviceRating ?? 0;
      if (!filters.rating.includes(primary)) return false;
    }

    // Theme filters (array-contains can only be used once per Firestore query)
    if (
      filters.positiveThemes.length &&
      !filters.positiveThemes.some((t) => r.positiveThemes.includes(t))
    )
      return false;
    if (
      filters.negativeThemes.length &&
      !filters.negativeThemes.some((t) => r.negativeThemes.includes(t))
    )
      return false;

    // These may already be filtered server-side, but double-check for multi-value "in" overflow
    if (filters.ship.length > 30 && !filters.ship.includes(r.ship)) return false;
    if (filters.region.length > 30 && !filters.region.includes(r.region)) return false;
    if (filters.bookingType.length > 30 && !filters.bookingType.includes(r.bookingType)) return false;
    if (filters.loyalty.length > 30 && !filters.loyalty.includes(r.loyalty)) return false;
    if (filters.itinerary.length > 30 && !filters.itinerary.includes(r.itinerary)) return false;

    // Media filter
    if (filters.hasMedia && r.media.length === 0) return false;

    // Review type — exclude reviews that don't have text of the active type.
    if (filters.reviewType === "service" && !r.serviceReview) return false;
    if (filters.reviewType === "product" && !r.productReview) return false;

    return true;
  });
}

// Serialize server-side filter values to a stable string for useEffect deps
function serverFilterKey(filters: Filters): string {
  return [
    filters.ship.join("|"),
    filters.region.join("|"),
    filters.bookingType.join("|"),
    filters.loyalty.join("|"),
    filters.itinerary.join("|"),
  ].join("~");
}

// ---------------------------------------------------------------------------
// Page content (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const DISPLAY_PAGE_SIZE = 10;

function ReviewsContent() {
  const searchParams = useSearchParams();
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dateField, dataVersion } = useDashboard();

  // Parse initial state from URL
  const initial = paramsToFilters(searchParams);
  const [search, setSearch] = useState(initial.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sort, setSort] = useState<SortOption>(initial.sort);
  const [visibleCount, setVisibleCount] = useState(DISPLAY_PAGE_SIZE);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Firestore data
  const [allReviews, setAllReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreFirestore, setHasMoreFirestore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter options derived from reviews within the date range
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);

  // Serialize dateRange to stable strings for dependency tracking
  const dateStart = dateRange.start.toISOString();
  const dateEnd = dateRange.end.toISOString();
  const srvFilterKey = serverFilterKey(filters);

  // Load filter options scoped to the selected date range
  useEffect(() => {
    getFilterOptions(brand, dateStart, dateEnd, dateField)
      .then(setFilterOptions)
      .catch(() => {});
  }, [brand, dateStart, dateEnd, dateField, dataVersion]);

  // Main query — re-fetch when brand, date range, or server-side filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAllReviews([]);
    setLastDoc(null);
    setHasMoreFirestore(true);
    setVisibleCount(DISPLAY_PAGE_SIZE);

    const db = getClientDb();
    const ref = collection(db, "reviews");
    const constraints = buildServerConstraints(brand, dateStart, dateEnd, filters, dateField);
    constraints.push(limit(PAGE_SIZE));
    const q = query(ref, ...constraints);

    Promise.all([getDocs(q), getParentNameLookup(brand)]).then(([snap, parentLookup]) => {
      if (cancelled) return;
      const reviews = snap.docs.map((d) => mapReviewDoc(d, dateField, parentLookup));
      setAllReviews(reviews);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMoreFirestore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;

      console.error("Failed to load reviews", err);
      setError(
        err instanceof Error ? err.message : "Unable to load reviews right now."
      );
      setHasMoreFirestore(false);
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, dateStart, dateEnd, dateField, srvFilterKey, dataVersion]);

  // Load more from Firestore
  const loadMoreFromFirestore = useCallback(async () => {
    if (!lastDoc || !hasMoreFirestore || loadingMore) return;
    setLoadingMore(true);

    const db = getClientDb();
    const ref = collection(db, "reviews");
    const constraints = buildServerConstraints(brand, dateStart, dateEnd, filters, dateField);
    constraints.push(startAfter(lastDoc), limit(PAGE_SIZE));
    const q = query(ref, ...constraints);
    try {
      const snap = await getDocs(q);

      const parentLookup = await getParentNameLookup(brand);
      const newReviews = snap.docs.map((d) => mapReviewDoc(d, dateField, parentLookup));
      setAllReviews((prev) => [...prev, ...newReviews]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMoreFirestore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more reviews", err);
      setError(
        err instanceof Error ? err.message : "Unable to load more reviews right now."
      );
      setHasMoreFirestore(false);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDoc, hasMoreFirestore, loadingMore, brand, dateStart, dateEnd, dateField, srvFilterKey]);

  // Sync state to URL using history API directly to avoid Next.js router re-render cycles
  useEffect(() => {
    const qs = filtersToParams(filters, search, sort);
    const newUrl = qs ? `/reviews?${qs}` : "/reviews";
    window.history.replaceState(null, "", newUrl);
  }, [filters, search, sort]);

  // Reset visible count when filters/search/sort change
  useEffect(() => {
    setVisibleCount(DISPLAY_PAGE_SIZE);
  }, [filters, search, sort]);

  const options = filterOptions;

  // Client-side filtering (text search, themes, rating, brand sub-filter)
  const filtered = useMemo(() => {
    return applyClientFilters(allReviews, filters, search);
  }, [search, filters, allReviews]);

  const sorted = useMemo(() => sortReviews(filtered, sort), [filtered, sort]);
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length || hasMoreFirestore;

  const handleLoadMore = useCallback(() => {
    if (visibleCount < sorted.length) {
      setVisibleCount((c) => c + DISPLAY_PAGE_SIZE);
    } else if (hasMoreFirestore) {
      loadMoreFromFirestore();
    }
  }, [visibleCount, sorted.length, hasMoreFirestore, loadMoreFromFirestore]);

  const handleThemeClick = useCallback(
    (theme: string, type: "positive" | "negative") => {
      const key = type === "positive" ? "positiveThemes" : "negativeThemes";
      const current = filters[key];
      if (!current.includes(theme)) {
        setFilters({ ...filters, [key]: [...current, theme] });
      }
    },
    [filters]
  );

  const activeFilterCount = Object.values(filters).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Reviews Explorer</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Search and filter guest reviews across all cruises
        </p>
      </div>

      {/* Search bar row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews..."
            className="w-full border border-input-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/30"
          />
        </div>
        <div className="flex items-center gap-3">
          <ExportButton reviews={sorted} />
          <span className="text-sm text-text-secondary whitespace-nowrap">
            {sorted.length} review{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Sort + mobile filter toggle */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden inline-flex items-center gap-2 rounded-lg border border-input-border bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-header-bg px-1.5 py-0.5 text-xs text-header-text">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="flex items-center ml-auto" role="group" aria-label="Sort order">
          <button
            type="button"
            onClick={() => setSort("newest")}
            aria-pressed={sort === "newest"}
            className={`cursor-pointer rounded-l-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              sort === "newest"
                ? "border-brand-accent bg-brand-accent text-accent-foreground font-semibold"
                : "border-input-border bg-surface text-text-primary hover:bg-surface-hover"
            }`}
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setSort("oldest")}
            aria-pressed={sort === "oldest"}
            className={`cursor-pointer -ml-px rounded-r-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              sort === "oldest"
                ? "border-brand-accent bg-brand-accent text-accent-foreground font-semibold"
                : "border-input-border bg-surface text-text-primary hover:bg-surface-hover"
            }`}
          >
            Oldest
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + results */}
      <div className="relative flex gap-6">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen
              ? "fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-surface p-4 shadow-xl lg:static lg:z-auto lg:w-64 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden"
          } lg:block lg:w-64 shrink-0`}
        >
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm sticky top-4">
            <div className="flex items-center justify-between lg:hidden mb-3">
              <span className="text-sm font-semibold text-text-primary">Filters</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-1 hover:bg-surface-hover text-text-tertiary"
                aria-label="Close filters"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              options={options}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {sorted.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-12 text-center">
              <p className="text-text-secondary">
                No reviews match your search and filters.
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setFilters(emptyFilters);
                }}
                className="mt-3 text-sm font-medium text-text-primary hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {visible.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    onThemeClick={handleThemeClick}
                    reviewTypeFilter={filters.reviewType}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-lg bg-header-bg px-6 py-2.5 text-sm font-medium text-header-text shadow-sm hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load more reviews
                        {visibleCount < sorted.length && (
                          <span className="text-white/70">
                            ({sorted.length - visibleCount} remaining)
                          </span>
                        )}
                      </>
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

// ---------------------------------------------------------------------------
// Page export — wraps content in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
              <div
                className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent"
              />
        </div>
      }
    >
      <ReviewsContent />
    </Suspense>
  );
}
