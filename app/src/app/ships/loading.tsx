import { SkeletonBox, SkeletonCard, SkeletonSearchBar } from "@/components/ui/Skeleton";

export default function ShipsLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-7 w-24" />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <SkeletonSearchBar />
        </div>
        <SkeletonBox className="h-10 w-40 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
