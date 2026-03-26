import { SkeletonCard, SkeletonSearchBar } from "@/components/ui/Skeleton";

export default function ItinerariesLoading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="h-7 w-36 animate-pulse rounded bg-gray-200" />

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SkeletonSearchBar />
        </div>
        <div className="h-10 w-40 animate-pulse rounded-lg bg-gray-200" />
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
