"use client";

import { useDashboard, type Brand } from "@/contexts/DashboardContext";

const brands: { value: Brand; label: string }[] = [
  { value: "uniworld", label: "Uniworld" },
  { value: "luxury-gold", label: "Luxury Gold" },
  { value: "combined", label: "Combined" },
];

export default function BrandSwitcher() {
  const { brand, setBrand } = useDashboard();

  return (
    <div className="inline-flex items-center rounded-full bg-white/10 p-0.5">
      {brands.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setBrand(value)}
          className={`rounded-full px-2.5 py-1 text-xs sm:px-4 sm:py-1.5 sm:text-sm font-medium transition-colors whitespace-nowrap ${
            brand === value
              ? "bg-[#C5A258] text-white shadow-sm"
              : "text-white/70 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
