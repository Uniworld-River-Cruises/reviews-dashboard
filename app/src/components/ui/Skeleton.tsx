export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonKpi() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SkeletonBox className="h-4 w-24 mb-3" />
      <SkeletonBox className="h-8 w-20 mb-2" />
      <SkeletonBox className="h-3 w-32" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SkeletonBox className="h-5 w-3/4 mb-3" />
      <SkeletonBox className="h-3 w-1/2 mb-5" />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <SkeletonBox className="h-3 w-12 mb-1" />
          <SkeletonBox className="h-6 w-10" />
        </div>
        <div>
          <SkeletonBox className="h-3 w-12 mb-1" />
          <SkeletonBox className="h-6 w-10" />
        </div>
        <div>
          <SkeletonBox className="h-3 w-12 mb-1" />
          <SkeletonBox className="h-6 w-10" />
        </div>
      </div>
      <SkeletonBox className="h-6 w-16 rounded-full" />
    </div>
  );
}

const BAR_HEIGHTS = ["h-[75%]", "h-[45%]", "h-[90%]", "h-[60%]", "h-[35%]", "h-[80%]", "h-[50%]", "h-[70%]"];

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SkeletonBox className="h-5 w-40 mb-4" />
      <div className="flex items-end gap-2 h-48">
        {BAR_HEIGHTS.map((h, i) => (
          <SkeletonBox key={i} className={`flex-1 rounded-t ${h}`} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <SkeletonBox className="h-5 w-40" />
        <SkeletonBox className="h-8 w-48 rounded-lg" />
      </div>
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex gap-4 pb-3 border-b border-gray-200">
          <SkeletonBox className="h-4 flex-[2]" />
          <SkeletonBox className="h-4 flex-1" />
          <SkeletonBox className="h-4 flex-1" />
          <SkeletonBox className="h-4 flex-1" />
          <SkeletonBox className="h-4 flex-1" />
          <SkeletonBox className="h-4 w-16" />
        </div>
        {/* Data rows */}
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4 py-2">
            <SkeletonBox className="h-4 flex-[2]" />
            <SkeletonBox className="h-4 flex-1" />
            <SkeletonBox className="h-4 flex-1" />
            <SkeletonBox className="h-4 flex-1" />
            <SkeletonBox className="h-4 flex-1" />
            <SkeletonBox className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonReviewCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-4 w-28" />
          <SkeletonBox className="h-3 w-20" />
        </div>
        <SkeletonBox className="h-4 w-20" />
      </div>
      <SkeletonBox className="h-3 w-48 mb-3" />
      <div className="space-y-2">
        <SkeletonBox className="h-3 w-full" />
        <SkeletonBox className="h-3 w-full" />
        <SkeletonBox className="h-3 w-3/4" />
      </div>
      <div className="flex gap-2 mt-3">
        <SkeletonBox className="h-5 w-16 rounded-full" />
        <SkeletonBox className="h-5 w-20 rounded-full" />
        <SkeletonBox className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonSearchBar() {
  return <SkeletonBox className="h-10 w-full rounded-lg" />;
}
