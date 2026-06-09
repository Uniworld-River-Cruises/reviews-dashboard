import { getFirestore } from "firebase-admin/firestore";
import { ApiError } from "./http";

/**
 * Fixed-window per-client rate limiting backed by one Firestore doc per key
 * (api_rate_limits/{key}: { windowStart: epoch-minute, count }). A
 * transaction resets the window or increments the count, so the limit holds
 * across function instances. Exceeding it returns 429 with Retry-After.
 */

export const TOKEN_RATE_LIMIT_PER_MINUTE = 30;

const COLLECTION = "api_rate_limits";

export async function checkRateLimit(
  key: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(key);
  const nowMs = Date.now();
  const windowStart = Math.floor(nowMs / 60_000);

  let allowed = true;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const data = snap.data();
    if (data && data.windowStart === windowStart && typeof data.count === "number") {
      if (data.count >= limitPerMinute) {
        allowed = false;
        return;
      }
      txn.update(ref, { count: data.count + 1 });
    } else {
      txn.set(ref, { windowStart, count: 1 });
    }
  });

  return {
    allowed,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil(((windowStart + 1) * 60_000 - nowMs) / 1000)),
  };
}

export async function enforceRateLimit(key: string, limitPerMinute: number): Promise<void> {
  const { allowed, retryAfterSeconds } = await checkRateLimit(key, limitPerMinute);
  if (!allowed) {
    throw new ApiError(429, "rate_limited", "Rate limit exceeded.", {
      "Retry-After": String(retryAfterSeconds),
    });
  }
}
