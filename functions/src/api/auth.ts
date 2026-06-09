import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ApiError } from "./http";

/**
 * OAuth client-credentials for the public reviews API, mirroring Feefo's
 * model: a confidential client exchanges client_id + client_secret at
 * POST /v1/oauth/token for a short-lived bearer token.
 *
 * Design decisions (docs/plans/2026-06-09-public-reviews-api.md):
 *  - Secrets are server-generated high-entropy values, shown once. We store
 *    only a peppered HMAC-SHA256 verifier (pepper lives in
 *    REVIEWS_API_SECRET_PEPPER, outside Firestore), compared in constant time.
 *  - Access tokens are OPAQUE (not JWTs): the token's SHA-256 hash is the
 *    api_tokens doc id, so revocation is immediate — bumping the client's
 *    tokenVersion (or flipping status) invalidates every outstanding token
 *    at the per-request re-check.
 */

export const TOKEN_TTL_SECONDS = 3600;
export const API_CLIENTS_COLLECTION = "api_clients";
export const API_TOKENS_COLLECTION = "api_tokens";

export const ALL_SCOPES = ["reviews:read", "summary:read", "meta:read"] as const;
export type ApiScope = (typeof ALL_SCOPES)[number];

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

export interface ApiClientRecord {
  clientId: string;
  /** HMAC-SHA256(secret, pepper), hex. Never returned to callers. */
  secretVerifier: string;
  label: string;
  /** Allowed merchant identifiers, or ["*"] for all. */
  merchants: string[];
  scopes: string[];
  status: "active" | "revoked";
  /** Bumped on rotate/revoke; outstanding tokens carry the version they were
   * minted with and fail validation on mismatch. */
  tokenVersion: number;
  rateLimitPerMinute?: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
}

export interface AuthContext {
  clientId: string;
  merchants: string[];
  scopes: string[];
  rateLimitPerMinute: number;
}

export function getSecretPepper(): string {
  const pepper = process.env.REVIEWS_API_SECRET_PEPPER;
  if (!pepper || pepper.trim().length < 16) {
    throw new ApiError(
      500,
      "not_configured",
      "The reviews API is not configured (missing REVIEWS_API_SECRET_PEPPER)."
    );
  }
  return pepper.trim();
}

export function computeSecretVerifier(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

export function verifyClientSecret(
  presentedSecret: string,
  storedVerifier: string,
  pepper: string
): boolean {
  const presented = Buffer.from(computeSecretVerifier(presentedSecret, pepper), "hex");
  const stored = Buffer.from(storedVerifier, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

export function generateClientId(): string {
  return `uw_live_${randomBytes(6).toString("hex")}`;
}

export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

function generateAccessToken(): string {
  return `uwt_${randomBytes(32).toString("base64url")}`;
}

function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function recordFromSnapshot(
  id: string,
  data: FirebaseFirestore.DocumentData
): ApiClientRecord {
  return {
    clientId: id,
    secretVerifier: typeof data.secretVerifier === "string" ? data.secretVerifier : "",
    label: typeof data.label === "string" ? data.label : "",
    merchants: Array.isArray(data.merchants) ? data.merchants.filter((m: unknown) => typeof m === "string") : [],
    scopes: Array.isArray(data.scopes) ? data.scopes.filter((s: unknown) => typeof s === "string") : [],
    status: data.status === "revoked" ? "revoked" : "active",
    tokenVersion: typeof data.tokenVersion === "number" ? data.tokenVersion : 1,
    rateLimitPerMinute:
      typeof data.rateLimitPerMinute === "number" && data.rateLimitPerMinute > 0
        ? data.rateLimitPerMinute
        : undefined,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    lastUsedAt:
      typeof data.lastUsedAt === "string" || data.lastUsedAt === null
        ? data.lastUsedAt
        : undefined,
  };
}

export async function loadApiClient(clientId: string): Promise<ApiClientRecord | null> {
  if (!clientId || !/^[a-zA-Z0-9_-]{4,80}$/.test(clientId)) return null;
  const db = getFirestore();
  const snap = await db.collection(API_CLIENTS_COLLECTION).doc(clientId).get();
  if (!snap.exists) return null;
  return recordFromSnapshot(snap.id, snap.data() ?? {});
}

/** Per-instance cache so token validation doesn't read the client document
 * on every request. This cache is NOT the revocation mechanism — it is
 * per-instance, so other instances never see invalidateClientCache().
 * Revoke/rotate are immediate because they DELETE the client's outstanding
 * api_tokens docs (see api-clients.ts); the cached client record only
 * backs the status/tokenVersion sanity check. */
const clientCache = new Map<string, { record: ApiClientRecord | null; fetchedAt: number }>();
const CLIENT_CACHE_TTL_MS = 60_000;

async function loadApiClientCached(clientId: string): Promise<ApiClientRecord | null> {
  const cached = clientCache.get(clientId);
  if (cached && Date.now() - cached.fetchedAt < CLIENT_CACHE_TTL_MS) {
    return cached.record;
  }
  const record = await loadApiClient(clientId);
  clientCache.set(clientId, { record, fetchedAt: Date.now() });
  return record;
}

/** Invalidate the per-instance cache after management operations. */
export function invalidateClientCache(clientId: string): void {
  clientCache.delete(clientId);
}

export async function mintAccessToken(
  client: ApiClientRecord
): Promise<{ accessToken: string; expiresIn: number }> {
  const db = getFirestore();
  const token = generateAccessToken();
  await db.collection(API_TOKENS_COLLECTION).doc(hashAccessToken(token)).set({
    clientId: client.clientId,
    merchants: client.merchants,
    scopes: client.scopes,
    tokenVersion: client.tokenVersion,
    createdAt: new Date().toISOString(),
    // Stored as a Timestamp so a Firestore TTL policy on `expiresAt` can
    // garbage-collect expired tokens.
    expiresAt: Timestamp.fromMillis(Date.now() + TOKEN_TTL_SECONDS * 1000),
  });

  db.collection(API_CLIENTS_COLLECTION)
    .doc(client.clientId)
    .set({ lastUsedAt: new Date().toISOString() }, { merge: true })
    .catch(() => {});

  return { accessToken: token, expiresIn: TOKEN_TTL_SECONDS };
}

const INVALID_TOKEN = new ApiError(
  401,
  "invalid_token",
  "Invalid or expired access token."
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function authenticateRequest(req: any): Promise<AuthContext> {
  const header = req.headers?.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Missing bearer token.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith("uwt_") || token.length > 200) {
    throw INVALID_TOKEN;
  }

  const db = getFirestore();
  const tokenSnap = await db
    .collection(API_TOKENS_COLLECTION)
    .doc(hashAccessToken(token))
    .get();
  if (!tokenSnap.exists) {
    throw INVALID_TOKEN;
  }

  const data = tokenSnap.data() ?? {};
  const expiresAtMs =
    data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;
  if (expiresAtMs <= Date.now()) {
    tokenSnap.ref.delete().catch(() => {});
    throw INVALID_TOKEN;
  }

  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  const client = await loadApiClientCached(clientId);
  if (
    !client ||
    client.status !== "active" ||
    client.tokenVersion !== data.tokenVersion
  ) {
    throw INVALID_TOKEN;
  }

  return {
    clientId: client.clientId,
    merchants: client.merchants,
    scopes: client.scopes,
    rateLimitPerMinute: client.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
  };
}

export function requireScope(auth: AuthContext, scope: ApiScope): void {
  if (!auth.scopes.includes(scope)) {
    throw new ApiError(
      403,
      "insufficient_scope",
      `This endpoint requires the "${scope}" scope.`
    );
  }
}
