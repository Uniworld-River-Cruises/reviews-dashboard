"use client";

import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { resolveDisplayName } from "@/lib/format/customer";
import { postFunction } from "@/lib/functions-client";

/** Mirrors WEBSITE_PLACEMENTS in shared/src/reviews/website.ts (the API and
 * the moderation endpoint validate against that list). */
export const WEBSITE_PLACEMENTS = [
  { id: "guest-stories", label: "Guest Stories" },
  { id: "culinary", label: "Culinary" },
  { id: "ships", label: "Ships" },
  { id: "travel-that-gives-back", label: "Travel That Gives Back" },
] as const;

export type WebsitePlacement = (typeof WEBSITE_PLACEMENTS)[number]["id"];
export type WebsiteStatus = "candidate" | "approved" | "rejected";

export const WEBSITE_QUEUE_PAGE_SIZE = 25;

/** One filter at a time: each has a composite index (brand + website.status
 * + field + dates.created), the same ones the public API's website filter
 * uses. */
export type WebsiteQueueFilter =
  | { kind: "none" }
  | { kind: "theme"; value: string }
  | { kind: "ship"; value: string }
  | { kind: "itinerary"; value: string };

export interface WebsiteQueueReview {
  id: string;
  brand: string;
  displayName: string;
  location: string | null;
  tripName: string;
  parentSku: string | null;
  ship: string | null;
  serviceRating: number | null;
  productRating: number | null;
  serviceTitle: string | null;
  serviceText: string | null;
  productText: string | null;
  positiveThemes: string[];
  date: string;
  reply: string | null;
  status: WebsiteStatus;
  placements: WebsitePlacement[];
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface WebsiteQueuePage {
  reviews: WebsiteQueueReview[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

function filterConstraint(filter: WebsiteQueueFilter): QueryConstraint[] {
  switch (filter.kind) {
    case "theme":
      return [where("themes.positive", "array-contains", filter.value)];
    case "ship":
      return [where("tags.ship", "==", filter.value)];
    case "itinerary":
      return [where("product.parentSku", "==", filter.value)];
    default:
      return [];
  }
}

function toQueueReview(snap: QueryDocumentSnapshot<DocumentData>): WebsiteQueueReview {
  const d = snap.data();
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  return {
    id: snap.id,
    brand: d.brand,
    displayName: resolveDisplayName(d.customer),
    location: text(d.customer?.location),
    tripName: d.product?.title ?? "Unknown",
    parentSku: d.product?.parentSku ?? null,
    ship: d.tags?.ship ?? null,
    serviceRating: d.ratings?.service ?? null,
    productRating: d.ratings?.product ?? null,
    serviceTitle: text(d.reviews?.serviceTitle),
    serviceText: text(d.reviews?.serviceText),
    productText: text(d.reviews?.productText),
    positiveThemes: Array.isArray(d.themes?.positive) ? d.themes.positive : [],
    date: d.dates?.created ?? "",
    reply: text(d.reply?.text),
    status: d.website?.status ?? "candidate",
    placements: Array.isArray(d.website?.placements) ? d.website.placements : [],
    decidedBy: d.website?.decidedBy ?? null,
    decidedAt: d.website?.decidedAt ?? null,
  };
}

function baseConstraints(
  brand: string,
  status: WebsiteStatus,
  filter: WebsiteQueueFilter
): QueryConstraint[] {
  return [
    where("brand", "==", brand),
    where("website.status", "==", status),
    ...filterConstraint(filter),
  ];
}

export async function getWebsiteQueuePage(
  brand: string,
  status: WebsiteStatus,
  filter: WebsiteQueueFilter,
  cursor: QueryDocumentSnapshot<DocumentData> | null
): Promise<WebsiteQueuePage> {
  const constraints: QueryConstraint[] = [
    ...baseConstraints(brand, status, filter),
    orderBy("dates.created", "desc"),
  ];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(WEBSITE_QUEUE_PAGE_SIZE + 1));

  const snap = await getDocs(query(collection(getClientDb(), "reviews"), ...constraints));
  const docs = snap.docs.slice(0, WEBSITE_QUEUE_PAGE_SIZE);
  return {
    reviews: docs.map(toQueueReview),
    cursor: docs.length > 0 ? docs[docs.length - 1] : cursor,
    hasMore: snap.docs.length > WEBSITE_QUEUE_PAGE_SIZE,
  };
}

/** Exact count per status for the current brand + filter (server-side). */
export async function getWebsiteQueueCounts(
  brand: string,
  filter: WebsiteQueueFilter
): Promise<Record<WebsiteStatus, number>> {
  const statuses: WebsiteStatus[] = ["candidate", "approved", "rejected"];
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const q = query(
        collection(getClientDb(), "reviews"),
        ...baseConstraints(brand, status, filter),
        orderBy("dates.created", "desc")
      );
      return (await getCountFromServer(q)).data().count;
    })
  );
  return { candidate: counts[0], approved: counts[1], rejected: counts[2] };
}

export interface WebsiteQueueFilterOptions {
  themes: string[];
  ships: string[];
  itineraries: { parentSku: string; label: string }[];
}

/** Filter options from the precomputed summary docs (cheap: one query). */
export async function getWebsiteQueueFilterOptions(
  brand: string
): Promise<WebsiteQueueFilterOptions> {
  const snap = await getDocs(
    query(collection(getClientDb(), "summaries"), where("brand", "==", brand))
  );
  const themes = new Set<string>();
  const ships = new Set<string>();
  const itineraries: { parentSku: string; label: string }[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    for (const t of data.topPositiveThemes ?? []) {
      if (typeof t?.theme === "string") themes.add(t.theme);
    }
    if (data.scope === "ship" && typeof data.scopeValue === "string") {
      ships.add(data.scopeValue);
    }
    if (data.scope === "product" && typeof data.scopeValue === "string") {
      const names: string[] = Array.isArray(data.itineraries) ? data.itineraries : [];
      itineraries.push({
        parentSku: data.scopeValue,
        label: `${names[0] ?? "Trip"}${names.length > 1 ? ` (+${names.length - 1})` : ""} · ${data.scopeValue}`,
      });
    }
  }
  return {
    themes: [...themes].sort(),
    ships: [...ships].sort(),
    itineraries: itineraries.sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export async function moderateWebsiteReview(
  reviewId: string,
  action: "approve" | "reject" | "reset",
  placements: WebsitePlacement[] = []
): Promise<void> {
  await postFunction("websiteModeration", { reviewId, action, placements });
}
