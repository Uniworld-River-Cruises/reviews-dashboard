import { getFirestore } from "firebase-admin/firestore";

/**
 * Read-only audit: find reviews stored as multiple Firestore documents.
 *
 * `transformReview` picks the document ID from `service.id ?? product.id ??
 * url-extracted hash`. If a Feefo review starts product-only and later gains
 * a service feedback, the chosen ID changes and the next sync writes a new
 * document — leaving the old one orphaned. This script groups reviews by
 * their stable `feedbackUrl` and surfaces every group with more than one doc.
 *
 * The audit changes nothing. It returns enough metadata for a human to decide
 * which duplicate to keep and run a manual cleanup separately.
 */

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
  extraDocs: number; // members beyond one per feedbackUrl
  scannedBrand: string | null;
  groups: DuplicateGroup[];
}

const MAX_GROUPS_RETURNED = 200;

export async function findDuplicateReviews(
  filterBrand: string | null = null
): Promise<DuplicateAuditReport> {
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection("reviews");
  if (filterBrand) {
    query = query.where("brand", "==", filterBrand);
  }
  const snap = await query.get();

  const byUrl = new Map<string, DuplicateMember[]>();

  for (const doc of snap.docs) {
    const data = doc.data();
    const url = typeof data.feedbackUrl === "string" ? data.feedbackUrl : null;
    if (!url) continue; // older docs without a feedbackUrl can't be deduped this way

    const member: DuplicateMember = {
      id: doc.id,
      brand: typeof data.brand === "string" ? data.brand : null,
      serviceId:
        typeof data.service?.id === "string"
          ? data.service.id
          : null,
      productId:
        typeof data.product?.id === "string" ? data.product.id : null,
      orderRef:
        typeof data.customer?.orderRef === "string"
          ? data.customer.orderRef
          : null,
      created:
        typeof data.dates?.created === "string" ? data.dates.created : null,
      lastUpdated:
        typeof data.dates?.lastUpdated === "string"
          ? data.dates.lastUpdated
          : null,
      productTitle:
        typeof data.product?.title === "string" ? data.product.title : null,
    };

    const existing = byUrl.get(url);
    if (existing) {
      existing.push(member);
    } else {
      byUrl.set(url, [member]);
    }
  }

  const groups: DuplicateGroup[] = [];
  let extraDocs = 0;
  for (const [feedbackUrl, members] of byUrl) {
    if (members.length > 1) {
      // Newest first so it's easy to spot which doc to keep.
      members.sort((a, b) =>
        (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "")
      );
      groups.push({ feedbackUrl, members });
      extraDocs += members.length - 1;
    }
  }

  groups.sort((a, b) => b.members.length - a.members.length);

  return {
    scannedDocs: snap.size,
    duplicateGroups: groups.length,
    extraDocs,
    scannedBrand: filterBrand,
    groups: groups.slice(0, MAX_GROUPS_RETURNED),
  };
}
