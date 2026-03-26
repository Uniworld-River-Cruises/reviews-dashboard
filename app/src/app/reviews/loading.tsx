import { SkeletonReviewCard, SkeletonSearchBar } from "@/components/ui/Skeleton";

export default function ReviewsLoading() {
  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <div className="h-7 w-44 animate-pulse rounded bg-gray-200 mb-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-200" />
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <SkeletonSearchBar />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      </div>

      {/* Sort row */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200 lg:hidden" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-gray-200 ml-auto" />
      </div>

      {/* Main layout */}
      <div className="flex gap-6">
        {/* Sidebar placeholder (hidden on mobile) */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i}>
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200 mb-2" />
                <div className="space-y-1.5">
                  <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-5/6 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Review cards */}
        <div className="flex-1 min-w-0 space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonReviewCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
