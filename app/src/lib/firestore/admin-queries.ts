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

export interface KnownUser {
  email: string;
  uid?: string;
  displayName?: string | null;
  photoURL?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  role: AdminRole | null;
  active: boolean | null;
}

export type OperationLogType = "sync" | "classification" | "summary";
export type OperationLogLevel = "info" | "success" | "warning" | "error";
export type OperationLogSource = "scheduled" | "manual" | "system";

export interface OperationLogEntry {
  id: string;
  type: OperationLogType;
  level: OperationLogLevel;
  action: string;
  message: string;
  createdAt: string;
  brand?: string | null;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
  details?: Record<string, unknown> | null;
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

export async function listKnownUsers(): Promise<KnownUser[]> {
  const response = await postFunction<{ knownUsers?: KnownUser[] }>("adminUsers", {
    action: "known",
  });
  return response.knownUsers ?? [];
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

export async function listOperationalLogs(
  hours?: number | null,
  limit?: number
): Promise<OperationLogEntry[]> {
  const response = await postFunction<{ logs?: OperationLogEntry[] }>("adminLogs", {
    hours: typeof hours === "number" ? hours : null,
    limit,
  });
  return response.logs ?? [];
}

export interface DuplicateMember {
  id: string;
  brand: string | null;
  serviceId: string | null;
  productId: string | null;
  orderRef: string | null;
  created: string | null;
  lastUpdated: string | null;
  productTitle: string | null;
}

export interface DuplicateGroup {
  feedbackUrl: string;
  members: DuplicateMember[];
}

export interface DuplicateAuditReport {
  scannedDocs: number;
  duplicateGroups: number;
  extraDocs: number;
  scannedBrand: string | null;
  groups: DuplicateGroup[];
}

export async function runDuplicateReviewAudit(
  brand?: string | null
): Promise<DuplicateAuditReport> {
  const response = await postFunction<{ report: DuplicateAuditReport }>(
    "auditDuplicateReviews",
    brand ? { brand } : {}
  );
  return response.report;
}

export interface DuplicateResolutionResult {
  groupsResolved: number;
  docsDeleted: number;
  scannedBrand: string | null;
}

export async function resolveDuplicateReviews(
  brand?: string | null
): Promise<DuplicateResolutionResult> {
  const response = await postFunction<{ result: DuplicateResolutionResult }>(
    "resolveDuplicateReviews",
    brand ? { brand } : {}
  );
  return response.result;
}
