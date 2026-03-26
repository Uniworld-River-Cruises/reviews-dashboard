import { SkeletonKpi, SkeletonChart, SkeletonTable } from "@/components/ui/Skeleton";

export default function OverviewLoading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
      </div>

      <SkeletonChart />

      {/* Theme Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>

      {/* Fleet Comparison Table */}
      <SkeletonTable />
    </div>
  );
}
