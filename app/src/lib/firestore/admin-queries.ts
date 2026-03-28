import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export interface ItineraryMapping {
  rawName: string;
  autoParentName: string;
  manualParentName: string | null;
  effectiveParentName: string;
  brand: string;
  reviewCount: number;
  lastUpdated: string;
}

export async function getItineraryMappings(brand: string): Promise<ItineraryMapping[]> {
  const ref = collection(db, "itinerary_mappings");
  const constraints = brand === "combined"
    ? []
    : [where("brand", "==", brand)];

  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs
    .map((doc) => doc.data() as ItineraryMapping)
    .sort((a, b) => b.reviewCount - a.reviewCount);
}

const FUNCTIONS_BASE = process.env.NEXT_PUBLIC_FUNCTIONS_URL || "https://us-central1-feefo-reviews.cloudfunctions.net";

export async function saveManualMapping(
  brand: string,
  rawName: string,
  manualParentName: string | null
): Promise<void> {
  const res = await fetch(`${FUNCTIONS_BASE}/itineraryMappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", brand, rawName, manualParentName }),
  });
  if (!res.ok) throw new Error(`Failed to save mapping: ${res.status}`);
}

export async function triggerRebuildMappings(brand?: string): Promise<void> {
  const res = await fetch(`${FUNCTIONS_BASE}/itineraryMappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rebuild", brand }),
  });
  if (!res.ok) throw new Error(`Failed to rebuild mappings: ${res.status}`);
}

export async function triggerRecomputeSummaries(brand?: string): Promise<void> {
  const res = await fetch(`${FUNCTIONS_BASE}/itineraryMappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "recompute", brand }),
  });
  if (!res.ok) throw new Error(`Failed to recompute summaries: ${res.status}`);
}
