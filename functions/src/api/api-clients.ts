import { getFirestore } from "firebase-admin/firestore";
import { isMerchantIdentifier } from "@feefo/shared";
import {
  ALL_SCOPES,
  API_CLIENTS_COLLECTION,
  API_TOKENS_COLLECTION,
  ApiClientRecord,
  computeSecretVerifier,
  generateClientId,
  generateClientSecret,
  getSecretPepper,
  invalidateClientCache,
  loadApiClient,
} from "./auth";
import { ApiError } from "./http";

/**
 * Delete every outstanding access token for a client. Revocation must be
 * immediate, and the in-memory client cache in auth.ts is per-instance —
 * invalidating it here cannot reach the reviewsApi instances. Removing the
 * token documents makes the per-request token lookup fail everywhere at
 * once, regardless of any instance's cache.
 */
async function deleteOutstandingTokens(clientId: string): Promise<number> {
  const db = getFirestore();
  const snapshot = await db
    .collection(API_TOKENS_COLLECTION)
    .where("clientId", "==", clientId)
    .get();
  if (snapshot.empty) return 0;
  const writer = db.bulkWriter();
  for (const doc of snapshot.docs) {
    writer.delete(doc.ref);
  }
  await writer.close();
  return snapshot.size;
}

/**
 * Management operations for API credentials, called by the authenticated
 * `apiClients` admin endpoint (manageApiClients permission). The plain
 * client secret is returned exactly once, at create/rotate time; only the
 * peppered HMAC verifier is stored.
 */

export type PublicApiClient = Omit<ApiClientRecord, "secretVerifier">;

function sanitize(record: ApiClientRecord): PublicApiClient {
  const { secretVerifier: _verifier, ...rest } = record;
  return rest;
}

function validateLabel(label: unknown): string {
  if (typeof label !== "string" || !label.trim() || label.trim().length > 100) {
    throw new ApiError(400, "invalid_label", "label is required (max 100 characters).");
  }
  return label.trim();
}

function validateMerchants(merchants: unknown): string[] {
  if (!Array.isArray(merchants) || merchants.length === 0) {
    throw new ApiError(
      400,
      "invalid_merchants",
      'merchants must be a non-empty array of merchant identifiers, or ["*"].'
    );
  }
  if (merchants.length === 1 && merchants[0] === "*") {
    return ["*"];
  }
  const unique = [...new Set(merchants)];
  for (const merchant of unique) {
    if (!isMerchantIdentifier(merchant)) {
      throw new ApiError(400, "invalid_merchants", `Unknown merchant identifier: ${merchant}`);
    }
  }
  return unique as string[];
}

function validateScopes(scopes: unknown): string[] {
  if (scopes === undefined || scopes === null) {
    return [...ALL_SCOPES];
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ApiError(400, "invalid_scopes", "scopes must be a non-empty array when provided.");
  }
  const unique = [...new Set(scopes)];
  for (const scope of unique) {
    if (!(ALL_SCOPES as readonly string[]).includes(scope as string)) {
      throw new ApiError(400, "invalid_scopes", `Unknown scope: ${scope}`);
    }
  }
  return unique as string[];
}

export async function createApiClient(input: {
  label: unknown;
  merchants: unknown;
  scopes?: unknown;
  createdBy: string | null;
}): Promise<{ client: PublicApiClient; clientSecret: string }> {
  const pepper = getSecretPepper();
  const label = validateLabel(input.label);
  const merchants = validateMerchants(input.merchants);
  const scopes = validateScopes(input.scopes);

  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const now = new Date().toISOString();

  const record: ApiClientRecord = {
    clientId,
    secretVerifier: computeSecretVerifier(clientSecret, pepper),
    label,
    merchants,
    scopes,
    status: "active",
    tokenVersion: 1,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };

  const db = getFirestore();
  await db.collection(API_CLIENTS_COLLECTION).doc(clientId).create(record);

  return { client: sanitize(record), clientSecret };
}

export async function listApiClients(): Promise<PublicApiClient[]> {
  const db = getFirestore();
  const snapshot = await db.collection(API_CLIENTS_COLLECTION).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return sanitize({
        clientId: doc.id,
        secretVerifier: "",
        label: typeof data.label === "string" ? data.label : "",
        merchants: Array.isArray(data.merchants) ? data.merchants : [],
        scopes: Array.isArray(data.scopes) ? data.scopes : [],
        status: data.status === "revoked" ? "revoked" : "active",
        tokenVersion: typeof data.tokenVersion === "number" ? data.tokenVersion : 1,
        rateLimitPerMinute:
          typeof data.rateLimitPerMinute === "number" ? data.rateLimitPerMinute : undefined,
        createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
        lastUsedAt:
          typeof data.lastUsedAt === "string" || data.lastUsedAt === null
            ? data.lastUsedAt
            : undefined,
      });
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function requireClient(clientId: unknown): Promise<ApiClientRecord> {
  if (typeof clientId !== "string" || !clientId.trim()) {
    throw new ApiError(400, "invalid_client_id", "clientId is required.");
  }
  const record = await loadApiClient(clientId.trim());
  if (!record) {
    throw new ApiError(404, "client_not_found", "No API client with that id.");
  }
  return record;
}

/** Revoke a client: blocks new token exchanges AND kills every outstanding
 * token immediately (their api_tokens docs are deleted, so validation fails
 * on the next request from any instance). */
export async function revokeApiClient(clientId: unknown): Promise<PublicApiClient> {
  const record = await requireClient(clientId);
  const db = getFirestore();
  const now = new Date().toISOString();
  await db.collection(API_CLIENTS_COLLECTION).doc(record.clientId).update({
    status: "revoked",
    tokenVersion: record.tokenVersion + 1,
    updatedAt: now,
  });
  await deleteOutstandingTokens(record.clientId);
  invalidateClientCache(record.clientId);
  return sanitize({ ...record, status: "revoked", tokenVersion: record.tokenVersion + 1, updatedAt: now });
}

/** Rotate a client's secret. Outstanding tokens are killed immediately
 * (token docs deleted + tokenVersion bump); the new secret is returned
 * exactly once. */
export async function rotateApiClient(
  clientId: unknown
): Promise<{ client: PublicApiClient; clientSecret: string }> {
  const pepper = getSecretPepper();
  const record = await requireClient(clientId);
  if (record.status !== "active") {
    throw new ApiError(400, "client_revoked", "Cannot rotate a revoked client.");
  }

  const clientSecret = generateClientSecret();
  const now = new Date().toISOString();
  const db = getFirestore();
  await db.collection(API_CLIENTS_COLLECTION).doc(record.clientId).update({
    secretVerifier: computeSecretVerifier(clientSecret, pepper),
    tokenVersion: record.tokenVersion + 1,
    updatedAt: now,
  });
  await deleteOutstandingTokens(record.clientId);
  invalidateClientCache(record.clientId);

  return {
    client: sanitize({ ...record, tokenVersion: record.tokenVersion + 1, updatedAt: now }),
    clientSecret,
  };
}
