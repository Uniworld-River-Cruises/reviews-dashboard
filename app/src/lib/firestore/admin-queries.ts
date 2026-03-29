"use client";

import { getClientDb } from "@/lib/firebase";
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

export type AdminRole = "owner" | "admin" | "sync";

export type AdminAccessPermission =
  | "sync"
  | "batchClassify"
  | "manageMappings"
  | "manageUsers";

export interface AdminUserAccess {
  email: string;
  role: AdminRole;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface CurrentAdminAccess {
  email: string | null;
  role: AdminRole | null;
  active: boolean;
  allowed: boolean;
  permissions: Record<AdminAccessPermission, boolean>;
}

export async function getItineraryMappings(brand: string): Promise<ItineraryMapping[]> {
  const db = getClientDb();
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

export async function listAdminUsers(): Promise<AdminUserAccess[]> {
  const response = await postFunction<{ users?: AdminUserAccess[] }>("adminUsers", {
    action: "list",
  });
  return response.users ?? [];
}

export async function getCurrentAdminAccess(): Promise<CurrentAdminAccess> {
  const response = await postFunction<{ access: CurrentAdminAccess }>("adminUsers", {
    action: "current",
  });
  return response.access;
}

export async function upsertAdminUser(
  email: string,
  role: AdminRole,
  active: boolean = true
): Promise<AdminUserAccess> {
  const response = await postFunction<{ user: AdminUserAccess }>("adminUsers", {
    action: "upsert",
    email,
    role,
    active,
  });
  return response.user;
}

export async function removeAdminUser(email: string): Promise<void> {
  await postFunction("adminUsers", {
    action: "remove",
    email,
  });
}
