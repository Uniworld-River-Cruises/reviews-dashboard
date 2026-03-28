import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { postFunction } from "@/lib/functions-client";

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

export async function saveManualMapping(
  brand: string,
  rawName: string,
  manualParentName: string | null
): Promise<void> {
  await postFunction("itineraryMappings", {
    action: "update",
    brand,
    rawName,
    manualParentName,
  });
}

export async function triggerRebuildMappings(brand?: string): Promise<void> {
  await postFunction("itineraryMappings", {
    action: "rebuild",
    brand,
  });
}

export async function triggerRecomputeSummaries(brand?: string): Promise<void> {
  await postFunction("itineraryMappings", {
    action: "recompute",
    brand,
  });
}
