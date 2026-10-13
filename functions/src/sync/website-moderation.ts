import { getFirestore } from "firebase-admin/firestore";
import {
  ReviewDocument,
  WebsiteModeration,
  WebsitePlacement,
  isWebsiteCandidate,
  isWebsitePlacement,
} from "@feefo/shared";

export type WebsiteModerationAction = "approve" | "reject" | "reset";

export class WebsiteModerationError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const REVIEW_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function parseModerationRequest(body: unknown): {
  reviewId: string;
  action: WebsiteModerationAction;
  placements: WebsitePlacement[];
} {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const reviewId = input.reviewId;
  if (typeof reviewId !== "string" || !REVIEW_ID_PATTERN.test(reviewId)) {
    throw new WebsiteModerationError(400, "reviewId is required.");
  }
  const action = input.action;
  if (action !== "approve" && action !== "reject" && action !== "reset") {
    throw new WebsiteModerationError(400, "action must be 'approve', 'reject' or 'reset'.");
  }
  const rawPlacements = input.placements ?? [];
  if (!Array.isArray(rawPlacements) || !rawPlacements.every(isWebsitePlacement)) {
    throw new WebsiteModerationError(400, "placements must be a list of known placement tags.");
  }
  return { reviewId, action, placements: [...new Set(rawPlacements)] };
}

/**
 * Record a person's website decision on one review.
 *  - approve: approved, with the given placement tags (re-approving edits them)
 *  - reject:  rejected, no placements
 *  - reset:   undo a decision: back to candidate if the rule still matches,
 *             else no website state
 * Returns the review's new website state.
 */
export async function moderateWebsiteReview(input: {
  reviewId: string;
  action: WebsiteModerationAction;
  placements: WebsitePlacement[];
  actorEmail: string | null;
}): Promise<{ brand: string; website: WebsiteModeration | null }> {
  const db = getFirestore();
  const ref = db.collection("reviews").doc(input.reviewId);

  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) throw new WebsiteModerationError(404, "No review with that id.");
    const review = snap.data() as ReviewDocument;
    const now = new Date().toISOString();
    const proposedAt = review.website?.proposedAt ?? null;

    let website: WebsiteModeration | null;
    if (input.action === "reset") {
      website = isWebsiteCandidate(review)
        ? { status: "candidate", placements: [], decidedBy: null, decidedAt: null, proposedAt: proposedAt ?? now }
        : null;
    } else {
      website = {
        status: input.action === "approve" ? "approved" : "rejected",
        placements: input.action === "approve" ? input.placements : [],
        decidedBy: input.actorEmail,
        decidedAt: now,
        proposedAt,
      };
    }

    txn.update(ref, { website });
    return { brand: review.brand, website };
  });
}
