"use client";

interface HealthBadgeProps {
  rating: number;
}

function getHealth(rating: number): { label: string; color: string; bg: string } {
  if (rating >= 4.7) return { label: "Excellent", color: "#22c55e", bg: "bg-green-50 text-green-700" };
  if (rating >= 4.4) return { label: "Strong", color: "#3b82f6", bg: "bg-blue-50 text-blue-700" };
  if (rating >= 4.0) return { label: "Good", color: "#eab308", bg: "bg-yellow-50 text-yellow-700" };
  return { label: "Needs Attention", color: "#ef4444", bg: "bg-red-50 text-red-700" };
}

export default function HealthBadge({ rating }: HealthBadgeProps) {
  const { label, bg } = getHealth(rating);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg}`}>
      {label}
    </span>
  );
}
