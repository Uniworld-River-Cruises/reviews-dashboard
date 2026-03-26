"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FilterSidebar, {
  type Filters,
  emptyFilters,
} from "@/components/reviews/FilterSidebar";
import ReviewCard, { type ReviewData } from "@/components/reviews/ReviewCard";
import ExportButton from "@/components/reviews/ExportButton";

// ---------------------------------------------------------------------------
// Mock data — structured to match future Algolia index shape
// ---------------------------------------------------------------------------

const MOCK_REVIEWS: ReviewData[] = [
  {
    id: "r1",
    customerName: "Margaret H.",
    rating: 5,
    ship: "S.S. Beatrice",
    itinerary: "Enchanting Danube",
    brand: "Uniworld",
    serviceReview:
      "The crew on the S.S. Beatrice were absolutely exceptional. Every single staff member greeted us by name from day two. Our butler was attentive without being intrusive, and the dining staff remembered our preferences throughout the voyage.",
    productReview:
      "The excursions were world-class. The private palace concert in Vienna was a once-in-a-lifetime experience. The ship itself is gorgeous — beautifully appointed staterooms with real marble bathrooms.",
    positiveThemes: ["Staff", "Excursions", "Accommodation"],
    negativeThemes: [],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-11-15",
  },
  {
    id: "r2",
    customerName: "Robert & Susan T.",
    rating: 5,
    ship: "S.S. La Venezia",
    itinerary: "Gems of Northern Italy",
    brand: "Uniworld",
    serviceReview:
      "From the moment we stepped aboard, the level of service was outstanding. The concierge arranged a special anniversary dinner on the top deck with personalised menus.",
    productReview:
      "The food was Michelin-quality. Every meal was a delight, with fresh local ingredients and creative presentation. The wine pairings were exquisite.",
    positiveThemes: ["Staff", "Food", "Value"],
    negativeThemes: [],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-10-28",
  },
  {
    id: "r3",
    customerName: "David L.",
    rating: 3,
    ship: "S.S. Bon Voyage",
    itinerary: "Paris & Normandy",
    brand: "Uniworld",
    serviceReview:
      "Service was generally good but not as polished as I expected given the price point. A couple of requests were forgotten and we had to follow up.",
    productReview:
      "The cabin was nicely decorated but felt quite small for the premium we paid. Storage space was limited. The excursion to Giverny was wonderful though.",
    positiveThemes: ["Excursions"],
    negativeThemes: ["Space & Size", "Value"],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-09-12",
  },
  {
    id: "r4",
    customerName: "Patricia M.",
    rating: 4,
    ship: "S.S. Sphinx",
    itinerary: "Splendors of Egypt & the Nile",
    brand: "Uniworld",
    serviceReview:
      "Excellent service throughout. The Egyptologist guide was incredibly knowledgeable and made the temples come alive with historical context.",
    productReview:
      "The food quality was inconsistent — some meals were outstanding while others were disappointing. The breakfast buffet needed more variety after the first few days.",
    positiveThemes: ["Staff", "Excursions"],
    negativeThemes: ["Food Quality"],
    bookingType: "Direct",
    region: "Africa",
    loyalty: "Returning",
    date: "2025-08-20",
  },
  {
    id: "r5",
    customerName: "",
    rating: 2,
    ship: "S.S. Beatrice",
    itinerary: "Enchanting Danube",
    brand: "Uniworld",
    serviceReview:
      "Disappointed with the overall experience. The ship felt crowded and the dining room was noisy. Staff were pleasant but seemed overwhelmed.",
    productReview:
      "The excursions were mostly bus tours with large groups, which felt impersonal. The spa was tiny and often fully booked. For the price, I expected much more exclusivity.",
    positiveThemes: [],
    negativeThemes: ["Space & Size", "Value", "Excursions"],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-07-05",
  },
  {
    id: "r6",
    customerName: "James & Elizabeth W.",
    rating: 5,
    ship: "S.S. Joie de Vivre",
    itinerary: "Paris & Normandy",
    brand: "Uniworld",
    serviceReview:
      "We have cruised with many luxury lines and Uniworld sets the gold standard. The staff ratio was incredible — it felt like there were more crew than guests.",
    productReview:
      "The Claude restaurant was outstanding. Every dinner was a culinary event. The included wines were top-quality, not the usual cheap options you find on other lines.",
    positiveThemes: ["Staff", "Food", "Value"],
    negativeThemes: [],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-10-02",
  },
  {
    id: "r7",
    customerName: "Helen R.",
    rating: 4,
    ship: "S.S. São Gabriel",
    itinerary: "Portugal's River of Gold",
    brand: "Uniworld",
    serviceReview:
      "Lovely experience overall. The crew were warm and welcoming. The captain's dinner was a highlight.",
    productReview:
      "Portugal is stunning from the water. The port wine tasting excursion in Porto was exceptional. Only downside was the Wi-Fi — very slow and unreliable for the entire cruise.",
    positiveThemes: ["Staff", "Excursions", "Food"],
    negativeThemes: ["Connectivity"],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-09-25",
  },
  {
    id: "r8",
    customerName: "George K.",
    rating: 1,
    ship: "S.S. Bon Voyage",
    itinerary: "Bordeaux, Vineyards & Châteaux",
    brand: "Uniworld",
    serviceReview:
      "Extremely disappointing. Multiple issues with our cabin that were never resolved despite repeated complaints. The air conditioning was broken for two days in August heat.",
    productReview:
      "The food was mediocre at best. The wine pairings — on a Bordeaux cruise, of all things — were shockingly poor. Several excursions were cancelled without adequate alternatives.",
    positiveThemes: [],
    negativeThemes: ["Food Quality", "Accommodation", "Excursions"],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-08-15",
  },
  {
    id: "r9",
    customerName: "Sarah & Mark D.",
    rating: 5,
    ship: "Ganges Voyager II",
    itinerary: "India's Golden Triangle & the Sacred Ganges",
    brand: "Uniworld",
    serviceReview:
      "A life-changing experience. The local guides were phenomenal — their passion for sharing Indian culture was infectious. The crew went above and beyond.",
    productReview:
      "Every detail was thought through, from the welcome garlands to the traditional dance performances. The Taj Mahal at sunrise was arranged perfectly. Food was authentic and delicious.",
    positiveThemes: ["Staff", "Excursions", "Food", "Entertainment"],
    negativeThemes: [],
    bookingType: "Agency",
    region: "Asia",
    loyalty: "Returning",
    date: "2025-11-01",
  },
  {
    id: "r10",
    customerName: "William P.",
    rating: 3,
    ship: "S.S. La Venezia",
    itinerary: "Gems of Northern Italy",
    brand: "Uniworld",
    serviceReview:
      "Service was adequate but nothing special. The staff seemed stretched thin and weren't as attentive as on our previous Uniworld cruise.",
    productReview:
      "Venice was magical but the ship felt dated compared to newer competitors. The pool area was cramped and the entertainment programme was repetitive.",
    positiveThemes: ["Excursions"],
    negativeThemes: ["Space & Size", "Entertainment", "Staff"],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-06-18",
  },
  {
    id: "r11",
    customerName: "Caroline T.",
    rating: 5,
    ship: "S.S. Beatrice",
    itinerary: "Enchanting Danube",
    brand: "Uniworld",
    serviceReview:
      "Absolutely flawless. The programme director was brilliant — funny, knowledgeable, and so well-organised. Nothing was too much trouble for any of the staff.",
    productReview:
      "Christmas markets along the Danube were enchanting. The ship was beautifully decorated for the season. The gingerbread-making class was a lovely touch.",
    positiveThemes: ["Staff", "Excursions", "Entertainment"],
    negativeThemes: [],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-12-10",
  },
  {
    id: "r12",
    customerName: "Richard & Anne B.",
    rating: 4,
    ship: "S.S. Catherine",
    itinerary: "Burgundy & Provence",
    brand: "Uniworld",
    serviceReview:
      "Very good cruise with excellent service. The sommelier was a standout — his knowledge and passion for Burgundy wines made the tastings special.",
    productReview:
      "Scenic route through Provence was beautiful. The cooking class in Lyon was a highlight. Only minor gripe was the embarkation process which felt disorganised.",
    positiveThemes: ["Staff", "Food", "Excursions"],
    negativeThemes: [],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-07-22",
  },
  {
    id: "r13",
    customerName: "Jennifer L.",
    rating: 2,
    ship: "Mekong Jewel",
    itinerary: "Timeless Wonders of Vietnam, Cambodia & the Mekong",
    brand: "Uniworld",
    serviceReview:
      "The staff tried hard but the language barrier was a significant issue. Several misunderstandings led to missed arrangements.",
    productReview:
      "The itinerary was ambitious but exhausting. Too many early starts and long bus rides. The ship itself was comfortable but showing wear. Air conditioning struggled in the heat.",
    positiveThemes: [],
    negativeThemes: ["Staff", "Accommodation", "Value"],
    bookingType: "Agency",
    region: "Asia",
    loyalty: "Returning",
    date: "2025-05-10",
  },
  {
    id: "r14",
    customerName: "Thomas & Mary G.",
    rating: 5,
    ship: "S.S. Joie de Vivre",
    itinerary: "Paris & Normandy",
    brand: "Uniworld",
    serviceReview:
      "Simply the best holiday we have ever had. The attention to detail is remarkable. Our cabin steward left personalised notes and the most creative towel art each evening.",
    productReview:
      "Monet's garden was breathtaking. The D-Day beaches excursion was deeply moving and expertly guided. Every meal was a celebration. The ship is a floating boutique hotel.",
    positiveThemes: ["Staff", "Excursions", "Food", "Accommodation"],
    negativeThemes: [],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "First-time",
    date: "2025-09-05",
  },
  {
    id: "r15",
    customerName: "Barbara S.",
    rating: 4,
    ship: "S.S. Sphinx",
    itinerary: "Splendors of Egypt & the Nile",
    brand: "Uniworld",
    serviceReview:
      "The crew were wonderful and the guide made Egyptian history fascinating. Felt very safe throughout, which was a concern before booking.",
    productReview:
      "Luxor and Karnak were awe-inspiring. The hot air balloon ride over the Valley of Kings was unforgettable. The ship could use a refresh in some common areas though.",
    positiveThemes: ["Staff", "Excursions"],
    negativeThemes: ["Accommodation"],
    bookingType: "Agency",
    region: "Africa",
    loyalty: "First-time",
    date: "2025-10-15",
  },
  {
    id: "r16",
    customerName: "Andrew C.",
    rating: 3,
    ship: "S.S. Catherine",
    itinerary: "Burgundy & Provence",
    brand: "Uniworld",
    serviceReview:
      "Mixed experience. Dining service was excellent but reception staff were unhelpful when we needed to change an excursion.",
    productReview:
      "The route was scenic but some ports felt rushed. Would have preferred fewer stops with more time at each. Wine tastings were the highlight of the trip.",
    positiveThemes: ["Food"],
    negativeThemes: ["Staff", "Excursions"],
    bookingType: "Direct",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-06-30",
  },
  {
    id: "r17",
    customerName: "Linda & Peter F.",
    rating: 5,
    ship: "S.S. São Gabriel",
    itinerary: "Portugal's River of Gold",
    brand: "Uniworld",
    serviceReview:
      "Perfection from start to finish. The crew created such a warm, family atmosphere. By the end of the voyage, it felt like saying goodbye to friends.",
    productReview:
      "The Douro Valley is breathtaking and seeing it from the river is the only way to do it. The quinta visits with private tastings were exceptional. Food was a celebration of Portuguese cuisine.",
    positiveThemes: ["Staff", "Excursions", "Food", "Value"],
    negativeThemes: [],
    bookingType: "Agency",
    region: "Europe",
    loyalty: "Returning",
    date: "2025-10-20",
  },
  {
    id: "r18",
    customerName: "Janet W.",
    rating: 4,
    ship: "Ganges Voyager II",
    itinerary: "India's Golden Triangle & the Sacred Ganges",
    brand: "Uniworld",
    serviceReview:
      "Wonderful crew who made us feel so welcome. The wellness programme with daily yoga on deck was a lovely addition.",
    productReview:
      "India is overwhelming in the best way, and having the ship as a calm retreat was perfect. The only letdown was the farewell dinner — it felt rushed compared to the high standard of other meals.",
    positiveThemes: ["Staff", "Entertainment"],
    negativeThemes: ["Food Quality"],
    bookingType: "Direct",
    region: "Asia",
    loyalty: "First-time",
    date: "2025-11-08",
  },
];

// ---------------------------------------------------------------------------
// Derive filter options from data
// ---------------------------------------------------------------------------

function deriveOptions(reviews: ReviewData[]) {
  const unique = <T,>(arr: T[]) => Array.from(new Set(arr)).sort();
  return {
    brands: unique(reviews.map((r) => r.brand)),
    ships: unique(reviews.map((r) => r.ship)),
    itineraries: unique(reviews.map((r) => r.itinerary)),
    positiveThemes: unique(reviews.flatMap((r) => r.positiveThemes)),
    negativeThemes: unique(reviews.flatMap((r) => r.negativeThemes)),
    bookingTypes: unique(reviews.map((r) => r.bookingType)),
    regions: unique(reviews.map((r) => r.region)),
    loyaltyLevels: unique(reviews.map((r) => r.loyalty)),
  };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortOption = "newest" | "oldest" | "highest" | "lowest";

function sortReviews(reviews: ReviewData[], sort: SortOption): ReviewData[] {
  const sorted = [...reviews];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.date.localeCompare(a.date));
    case "oldest":
      return sorted.sort((a, b) => a.date.localeCompare(b.date));
    case "highest":
      return sorted.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date));
    case "lowest":
      return sorted.sort((a, b) => a.rating - b.rating || b.date.localeCompare(a.date));
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
    if ((values as Array<string | number>).length > 0) {
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
  const sort = (searchParams.get("sort") as SortOption) || "newest";

  const parseArray = (key: string) => {
    const val = searchParams.get(key);
    return val ? val.split(",") : [];
  };

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
  };

  return { filters, search, sort };
}

// ---------------------------------------------------------------------------
// Page content (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

function ReviewsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parse initial state from URL
  const initial = paramsToFilters(searchParams);
  const [search, setSearch] = useState(initial.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sort, setSort] = useState<SortOption>(initial.sort);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync state to URL
  useEffect(() => {
    const qs = filtersToParams(filters, search, sort);
    const newUrl = qs ? `/reviews?${qs}` : "/reviews";
    router.replace(newUrl, { scroll: false });
  }, [filters, search, sort, router]);

  // Reset visible count when filters/search/sort change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, search, sort]);

  const options = useMemo(() => deriveOptions(MOCK_REVIEWS), []);

  // Filter
  const filtered = useMemo(() => {
    return MOCK_REVIEWS.filter((r) => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${r.customerName} ${r.serviceReview} ${r.productReview} ${r.ship} ${r.itinerary}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Filters
      if (filters.brand.length && !filters.brand.includes(r.brand)) return false;
      if (filters.rating.length && !filters.rating.includes(r.rating)) return false;
      if (filters.ship.length && !filters.ship.includes(r.ship)) return false;
      if (filters.itinerary.length && !filters.itinerary.includes(r.itinerary))
        return false;
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
      if (filters.bookingType.length && !filters.bookingType.includes(r.bookingType))
        return false;
      if (filters.region.length && !filters.region.includes(r.region)) return false;
      if (filters.loyalty.length && !filters.loyalty.includes(r.loyalty)) return false;
      return true;
    });
  }, [search, filters]);

  const sorted = useMemo(() => sortReviews(filtered, sort), [filtered, sort]);
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

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

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1B3A5C]">Reviews Explorer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search and filter guest reviews across all cruises
        </p>
      </div>

      {/* Search bar row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
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
            className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C]/30"
          />
        </div>
        <div className="flex items-center gap-3">
          <ExportButton reviews={sorted} />
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {sorted.length} review{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Sort + mobile filter toggle */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[#1B3A5C] px-1.5 py-0.5 text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <label htmlFor="sort-select" className="text-sm text-gray-500">
            Sort:
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest Rating</option>
            <option value="lowest">Lowest Rating</option>
          </select>
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
              ? "fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-white p-4 shadow-xl lg:static lg:z-auto lg:w-64 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden"
          } lg:block lg:w-64 shrink-0`}
        >
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sticky top-4">
            <div className="flex items-center justify-between lg:hidden mb-3">
              <span className="text-sm font-semibold text-[#1B3A5C]">Filters</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded p-1 hover:bg-gray-100 text-gray-400"
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
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <p className="text-gray-500">
                No reviews match your search and filters.
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setFilters(emptyFilters);
                }}
                className="mt-3 text-sm font-medium text-[#1B3A5C] hover:underline"
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
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1B3A5C] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1B3A5C]/90 transition-colors"
                  >
                    Load more reviews
                    <span className="text-white/70">
                      ({sorted.length - visibleCount} remaining)
                    </span>
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
        </div>
      }
    >
      <ReviewsContent />
    </Suspense>
  );
}
