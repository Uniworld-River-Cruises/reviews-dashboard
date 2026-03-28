import { SkeletonBox, SkeletonReviewCard, SkeletonSearchBar } from "@/components/ui/Skeleton";

export default function ReviewsLoading() {
  return (
    <div>
      {/* Title */}
      <div className="mb-6">
        <SkeletonBox className="h-7 w-44 mb-2" />
        <SkeletonBox className="h-4 w-72" />
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <SkeletonSearchBar />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonBox className="h-10 w-24 rounded-lg" />
          <SkeletonBox className="h-4 w-20" />
        </div>
      </div>

      {/* Sort row */}
      <div className="flex items-center justify-between mb-4">
        <SkeletonBox className="h-9 w-24 rounded-lg lg:hidden" />
        <SkeletonBox className="h-8 w-32 rounded-lg ml-auto" />
      </div>

      {/* Main layout */}
      <div className="flex gap-6">
        {/* Sidebar placeholder */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="rounded-lg p-4 shadow-sm space-y-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i}>
                <SkeletonBox className="h-4 w-24 mb-2" />
                <div className="space-y-1.5">
                  <SkeletonBox className="h-3 w-full" />
                  <SkeletonBox className="h-3 w-3/4" />
                  <SkeletonBox className="h-3 w-5/6" />
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
