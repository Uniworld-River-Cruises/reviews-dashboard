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
    <div className="flex items-center rounded-full bg-gray-100 p-0.5">
      {brands.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setBrand(value)}
          className={`rounded-full px-2.5 py-1 text-xs sm:px-4 sm:py-1.5 sm:text-sm font-medium transition-colors whitespace-nowrap ${
            brand === value
              ? "bg-[#1B3A5C] text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
