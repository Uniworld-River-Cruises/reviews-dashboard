"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard, type DateField } from "@/contexts/DashboardContext";
import { useBrand } from "@/contexts/BrandContext";
import { getClientDb } from "@/lib/firebase";
import { resolveDisplayName } from "@/lib/format/customer";
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
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
  type FilterSectionKey,
  defaultOpenFilterSections,
  emptyFilters,
} from "@/components/reviews/FilterSidebar";
import ReviewCard, { type ReviewData } from "@/components/reviews/ReviewCard";
import ExportButton, { type ExportFetchResult } from "@/components/reviews/ExportButton";

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
    customerName: resolveDisplayName(d.customer),
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
  dateField: DateField,
  sort: SortOption = "newest"
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

  // hasMedia is a persisted boolean (mirror of `media.length > 0`) so the
  // filter runs server-side. Doing it client-side meant the filter only
  // saw whatever first 50 the page had loaded — when those happened to be
  // media-less (the common case for the newest reviews), the filter
  // returned 0 even though hundreds of media-bearing reviews existed
  // within the date range.
  if (filters.hasMedia) {
    constraints.push(where("hasMedia", "==", true));
  }

  // Sort direction lives on the Firestore query so picking "Oldest" reorders
  // the *whole* match set (refetching from the beginning), not just the page
  // that's already in memory. Indexes on (dates.created, dates.lastUpdated)
  // are direction-agnostic, so this needs no new index work.
  constraints.push(orderBy(path, sort === "oldest" ? "asc" : "desc"));

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

    // Note: hasMedia filter is applied server-side via the `hasMedia`
    // boolean (see buildServerConstraints) so it correctly returns matches
    // across the whole date range, not just the first page.

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
    filters.hasMedia ? "media" : "",
  ].join("~");
}

// ---------------------------------------------------------------------------
// Page content (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function ReviewsContent() {
  const searchParams = useSearchParams();
  const { merchantQueryId: brand } = useBrand();
  const { dateRange, dateField, dataVersion } = useDashboard();
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const hasLoadedReviewsRef = useRef(false);
  /** Monotonically incremented on every server-filter / sort change so an
   * in-flight `loadMoreFromFirestore` can detect that its result is stale
   * and refuse to append. Without this, picking a new sort or filter
   * while a Load more was already running would splice the old page on
   * top of the freshly-refetched first page. */
  const queryGenerationRef = useRef(0);

  // Parse initial state from URL
  const initial = paramsToFilters(searchParams);
  const [search, setSearch] = useState(initial.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sort, setSort] = useState<SortOption>(initial.sort);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filterPanelStickyTop, setFilterPanelStickyTop] = useState(16);
  const [openFilterSections, setOpenFilterSections] = useState(defaultOpenFilterSections);

  // Firestore data
  const [allReviews, setAllReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedReviews, setHasLoadedReviews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreFirestore, setHasMoreFirestore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Total number of reviews matching the active server-side filters
   * (date range + brand + ship/region/etc + hasMedia). Populated by a
   * separate `getCountFromServer` aggregate call on the same constraints,
   * minus the LIMIT/orderBy. Lets us show the user the real match count
   * up front instead of just "loaded so far". `null` while in flight.
   */
  const [totalMatching, setTotalMatching] = useState<number | null>(null);

  // Filter options derived from reviews within the date range
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);

  // Serialize dateRange to stable strings for dependency tracking
  const dateStart = dateRange.start.toISOString();
  const dateEnd = dateRange.end.toISOString();
  const srvFilterKey = serverFilterKey(filters);

  useEffect(() => {
    const panel = filterPanelRef.current;
    if (!panel) return;

    const stickyGutter = 16;
    const updateStickyTop = () => {
      const panelHeight = panel.getBoundingClientRect().height;
      const nextTop = Math.min(stickyGutter, window.innerHeight - panelHeight - stickyGutter);
      setFilterPanelStickyTop(Math.round(nextTop));
    };

    updateStickyTop();

    const resizeObserver = new ResizeObserver(updateStickyTop);
    resizeObserver.observe(panel);
    window.addEventListener("resize", updateStickyTop);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateStickyTop);
    };
  }, [loading, error]);

  // Load filter options scoped to the selected date range
  useEffect(() => {
    getFilterOptions(brand, dateStart, dateEnd, dateField)
      .then(setFilterOptions)
      .catch(() => {});
  }, [brand, dateStart, dateEnd, dateField, dataVersion]);

  // Main query — re-fetch when brand, date range, or server-side filters change
  useEffect(() => {
    let cancelled = false;
    // Bump the generation so any in-flight loadMoreFromFirestore knows its
    // result belongs to a stale query and won't append to the new first page.
    queryGenerationRef.current += 1;
    const isInitialLoad = !hasLoadedReviewsRef.current;
    setLoading(true);
    setError(null);
    if (isInitialLoad) {
      setAllReviews([]);
    }
    setLastDoc(null);
    setHasMoreFirestore(true);
    setTotalMatching(null);

    const db = getClientDb();
    const ref = collection(db, "reviews");
    const constraints = buildServerConstraints(brand, dateStart, dateEnd, filters, dateField, sort);
    const countQuery = query(ref, ...constraints);
    const pagedQuery = query(ref, ...constraints, limit(PAGE_SIZE));

    // Aggregate count runs in parallel with the first page fetch — the count
    // request is cheap and resolves a UX gap (the header was previously
    // showing the loaded-so-far count instead of the true match total).
    getCountFromServer(countQuery)
      .then((snap) => { if (!cancelled) setTotalMatching(snap.data().count); })
      .catch(() => { /* fall back to loaded-count display */ });

    Promise.all([getDocs(pagedQuery), getParentNameLookup(brand)]).then(([snap, parentLookup]) => {
      if (cancelled) return;
      const reviews = snap.docs.map((d) => mapReviewDoc(d, dateField, parentLookup));
      setAllReviews(reviews);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMoreFirestore(snap.docs.length === PAGE_SIZE);
      hasLoadedReviewsRef.current = true;
      setHasLoadedReviews(true);
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
  }, [brand, dateStart, dateEnd, dateField, srvFilterKey, sort, dataVersion]);

  // Load more from Firestore
  const loadMoreFromFirestore = useCallback(async () => {
    if (!lastDoc || !hasMoreFirestore || loadingMore) return;
    setLoadingMore(true);

    // Snapshot the generation at request time. If the user changes a
    // server filter or sort before this resolves, the main useEffect
    // bumps the generation and the comparison below stops us appending
    // a stale page on top of the freshly-refetched first page.
    const startedAt = queryGenerationRef.current;

    const db = getClientDb();
    const ref = collection(db, "reviews");
    const constraints = buildServerConstraints(brand, dateStart, dateEnd, filters, dateField, sort);
    constraints.push(startAfter(lastDoc), limit(PAGE_SIZE));
    const q = query(ref, ...constraints);
    try {
      const snap = await getDocs(q);
      if (queryGenerationRef.current !== startedAt) {
        // Filters/sort changed mid-flight. The main effect already
        // reset allReviews / lastDoc / hasMoreFirestore; this page
        // belongs to the previous query and must be discarded.
        return;
      }

      const parentLookup = await getParentNameLookup(brand);
      if (queryGenerationRef.current !== startedAt) return;
      const newReviews = snap.docs.map((d) => mapReviewDoc(d, dateField, parentLookup));
      setAllReviews((prev) => [...prev, ...newReviews]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMoreFirestore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      if (queryGenerationRef.current !== startedAt) return;
      console.error("Failed to load more reviews", err);
      setError(
        err instanceof Error ? err.message : "Unable to load more reviews right now."
      );
      setHasMoreFirestore(false);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDoc, hasMoreFirestore, loadingMore, brand, dateStart, dateEnd, dateField, srvFilterKey, sort]);

  // Sync state to URL using history API directly to avoid Next.js router re-render cycles
  useEffect(() => {
    const qs = filtersToParams(filters, search, sort);
    const newUrl = qs ? `/reviews?${qs}` : "/reviews";
    window.history.replaceState(null, "", newUrl);
  }, [filters, search, sort]);

  const options = filterOptions;

  // Client-side filtering (text search, themes, rating, brand sub-filter)
  const filtered = useMemo(() => {
    return applyClientFilters(allReviews, filters, search);
  }, [search, filters, allReviews]);

  const sorted = useMemo(() => sortReviews(filtered, sort), [filtered, sort]);
  // Render every loaded-and-client-filtered review at once. Each "Load
  // more" click pulls the next Firestore page directly, so 287 matches
  // takes 6 clicks (PAGE_SIZE chunks) instead of 30 with the previous
  // 10-at-a-time display pagination.
  const visible = sorted;
  const hasMore = hasMoreFirestore && !loading;

  const handleLoadMore = useCallback(() => {
    if (hasMoreFirestore) loadMoreFromFirestore();
  }, [hasMoreFirestore, loadMoreFromFirestore]);

  /**
   * Paginate through every review matching the current server-side filters
   * (date range + brand + ship/region/etc + hasMedia, in the active sort
   * direction) and return the full list — for the "Export CSV" button.
   * The page render only ever holds the loaded slice; this runs on demand
   * so the CSV reflects every match, not just whatever's in memory.
   *
   * Stops at MAX_EXPORT_ROWS as a safety net against accidentally pulling
   * tens of thousands of docs into one CSV download. When the cap is hit,
   * the returned envelope carries `truncated: true` so the button can
   * warn the user instead of silently delivering a partial CSV.
   */
  const MAX_EXPORT_ROWS = 10000;
  const EXPORT_PAGE_SIZE = 500;
  const fetchAllForExport = useCallback(async (): Promise<ExportFetchResult> => {
    const db = getClientDb();
    const ref = collection(db, "reviews");
    const constraints = buildServerConstraints(brand, dateStart, dateEnd, filters, dateField, sort);
    const parentLookup = await getParentNameLookup(brand);
    const collected: ReviewData[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    let truncated = false;

    while (collected.length < MAX_EXPORT_ROWS) {
      const pageConstraints: QueryConstraint[] = [...constraints];
      if (cursor) pageConstraints.push(startAfter(cursor));
      pageConstraints.push(limit(EXPORT_PAGE_SIZE));
      const snap = await getDocs(query(ref, ...pageConstraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        if (collected.length >= MAX_EXPORT_ROWS) {
          truncated = true;
          break;
        }
        collected.push(mapReviewDoc(d, dateField, parentLookup));
      }

      if (truncated) break;
      if (snap.docs.length < EXPORT_PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    // The page applies brand sub-filter, ratings, themes, and free-text
    // search on the client. The export should respect those too — if the
    // user filtered to "5 stars" on the page, they expect the CSV to
    // contain only 5-star reviews. Sort runs server-side so the array is
    // already in the right order.
    const filtered = applyClientFilters(collected, filters, search);
    return { reviews: filtered, truncated, scannedCount: collected.length, cap: MAX_EXPORT_ROWS };
  }, [brand, dateStart, dateEnd, dateField, sort, filters, search]);

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

  const handleToggleFilterSection = useCallback((section: FilterSectionKey) => {
    setOpenFilterSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const activeFilterCount = Object.entries(filters).reduce((sum, [key, val]) => {
    if (key === "hasMedia") return sum + (val ? 1 : 0);
    if (key === "reviewType") return sum + (val !== "all" ? 1 : 0);
    return sum + (val as unknown[]).length;
  }, 0);

  if (loading && !hasLoadedReviews) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent"
        />
      </div>
    );
  }

  if (error && !hasLoadedReviews) {
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
          <ExportButton fetchAll={fetchAllForExport} totalCount={totalMatching} />
          {loading && hasLoadedReviews && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-spinner-track border-t-spinner-accent" />
              Updating
            </span>
          )}
          <span className="text-sm text-text-secondary whitespace-nowrap" aria-live="polite">
            {/* Total comes from a getCountFromServer aggregate on the same
             * server-side constraints, so it reflects every match in the
             * collection — not just the docs we've paged in. Falls back to
             * the loaded count if the aggregate is still in flight or fails. */}
            {totalMatching != null
              ? `${totalMatching.toLocaleString()} review${totalMatching !== 1 ? "s" : ""}`
              : `${sorted.length} review${sorted.length !== 1 ? "s" : ""}`}
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
          <div
            ref={filterPanelRef}
            className="rounded-lg border border-border bg-surface p-4 shadow-sm lg:sticky"
            style={{ top: `${filterPanelStickyTop}px` }}
          >
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
              openSections={openFilterSections}
              onToggleSection={handleToggleFilterSection}
              options={options}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </div>
          )}
          {sorted.length === 0 && !loading ? (
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
              <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
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
                    className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-brand-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load more reviews
                        {totalMatching != null && totalMatching - allReviews.length > 0 && (
                          <span className="opacity-75">
                            ({(totalMatching - allReviews.length).toLocaleString()} remaining)
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
