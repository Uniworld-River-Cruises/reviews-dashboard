import { createHash } from "crypto";
import {
  getFirestore,
  Query,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  NEGATIVE_THEMES,
  POSITIVE_THEMES,
  ReviewDocument,
  SummaryDocLike,
  toPublicReview,
  toPublicSummary,
} from "@feefo/shared";
import { ApiError, newRequestId, sendError, sendJson } from "./http";
import {
  AuthContext,
  authenticateRequest,
  getSecretPepper,
  loadApiClient,
  mintAccessToken,
  requireScope,
  verifyClientSecret,
} from "./auth";
import { TOKEN_RATE_LIMIT_PER_MINUTE, enforceRateLimit } from "./rate-limit";
import {
  MerchantInfo,
  listMerchantsForScope,
  resolveMerchants,
} from "./merchant-registry";

/**
 * The public reviews API (design: docs/plans/2026-06-09-public-reviews-api.md).
 *
 * Routes (all under an optional /api prefix added by the Hosting rewrite):
 *   POST /v1/oauth/token           — client-credentials → opaque bearer token
 *   GET  /v1/reviews/all           — paginated, filtered review list
 *   GET  /v1/reviews/summary/all   — precomputed aggregates
 *   GET  /v1/reviews/{id}          — single review (uniform 404 out of scope)
 *   GET  /v1/meta/themes           — AI theme taxonomy
 *   GET  /v1/meta/merchants        — merchants visible to the credential
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
/** page-mode window may not reach past this many results — use cursors. */
const PAGE_MODE_MAX_WINDOW = 1000;
/** Per-request scan budget for post-filtered cursor iteration. */
const MAX_SCANNED_DOCS = 3000;
const FETCH_BATCH = 100;

const SINCE_PERIOD_DAYS: Record<string, number | null> = {
  week: 7,
  month: 30,
  quarter: 90,
  half_year: 182,
  year: 365,
  all: null,
};

// ── Param parsing ───────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";

interface AttributeFilter {
  param: string;
  field: string;
  op: "==" | "array-contains";
  value: string | boolean;
}

interface ListParams {
  merchantParam: string | undefined;
  page: number | null;
  pageSize: number;
  cursor: string | null;
  dateField: "dates.created" | "dates.lastUpdated";
  dateFrom: string | null;
  dateTo: string | null;
  direction: SortDirection;
  attribute: AttributeFilter | null;
  rating: number | null;
  reviewType: "service" | "product" | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryParam(req: any, name: string): string | undefined {
  const value = req.query?.[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function parsePositiveInt(raw: string, name: string, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new ApiError(400, "invalid_parameter", `${name} must be an integer between 1 and ${max}.`);
  }
  return value;
}

function parseIsoDate(raw: string, name: string): string {
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new ApiError(400, "invalid_parameter", `${name} must be an ISO 8601 timestamp.`);
  }
  return new Date(ms).toISOString();
}

function parseSincePeriod(raw: string, name: string): number | null {
  if (!(raw in SINCE_PERIOD_DAYS)) {
    throw new ApiError(
      400,
      "invalid_parameter",
      `${name} must be one of: ${Object.keys(SINCE_PERIOD_DAYS).join(", ")}.`
    );
  }
  return SINCE_PERIOD_DAYS[raw];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListParams(req: any): ListParams {
  if (queryParam(req, "search") !== undefined) {
    throw new ApiError(
      400,
      "search_not_supported",
      "Free-text search is not available yet (planned; see the API docs)."
    );
  }

  const pageRaw = queryParam(req, "page");
  const page = pageRaw === undefined ? null : parsePositiveInt(pageRaw, "page", 100000);
  const pageSizeRaw = queryParam(req, "page_size");
  const pageSize =
    pageSizeRaw === undefined
      ? PAGE_SIZE_DEFAULT
      : parsePositiveInt(pageSizeRaw, "page_size", PAGE_SIZE_MAX);
  const cursor = queryParam(req, "cursor") ?? null;
  if (cursor && page !== null) {
    throw new ApiError(400, "invalid_parameter", "page cannot be combined with cursor.");
  }

  const sortRaw = queryParam(req, "sort") ?? "newest";
  if (sortRaw !== "newest" && sortRaw !== "oldest") {
    throw new ApiError(400, "invalid_parameter", "sort must be 'newest' or 'oldest'.");
  }

  // Date window. since_updated_period filters/sorts on dates.lastUpdated and
  // cannot combine with created-date filters (one range field per query).
  const sincePeriod = queryParam(req, "since_period");
  const sinceUpdatedPeriod = queryParam(req, "since_updated_period");
  const dateTimeFrom = queryParam(req, "date_time_from");
  const dateTimeTo = queryParam(req, "date_time_to");

  let dateField: ListParams["dateField"] = "dates.created";
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (sinceUpdatedPeriod !== undefined) {
    if (sincePeriod !== undefined || dateTimeFrom !== undefined || dateTimeTo !== undefined) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "since_updated_period cannot be combined with since_period or date_time_from/to."
      );
    }
    dateField = "dates.lastUpdated";
    const days = parseSincePeriod(sinceUpdatedPeriod, "since_updated_period");
    if (days !== null) dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
  } else {
    if (sincePeriod !== undefined) {
      const days = parseSincePeriod(sincePeriod, "since_period");
      if (days !== null) dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
    }
    if (dateTimeFrom !== undefined) {
      const from = parseIsoDate(dateTimeFrom, "date_time_from");
      dateFrom = dateFrom && dateFrom > from ? dateFrom : from;
    }
    if (dateTimeTo !== undefined) dateTo = parseIsoDate(dateTimeTo, "date_time_to");
  }

  // Attribute filters map to indexed equality/array-contains constraints.
  // v1 allows at most ONE per request so every query stays inside the
  // composite indexes we actually have (brand + attribute + date).
  const attributeCandidates: AttributeFilter[] = [];
  const pushAttr = (param: string, field: string, op: AttributeFilter["op"]) => {
    const value = queryParam(req, param);
    if (value !== undefined) {
      if (!value.trim()) {
        throw new ApiError(400, "invalid_parameter", `${param} must not be empty.`);
      }
      attributeCandidates.push({ param, field, op, value });
    }
  };
  pushAttr("ship", "tags.ship", "==");
  pushAttr("tour", "tags.tour", "==");
  pushAttr("region", "tags.region", "==");
  pushAttr("booking_type", "tags.bookingType", "==");
  pushAttr("loyalty", "tags.loyalty", "==");
  pushAttr("product_sku", "product.sku", "==");
  pushAttr("parent_product_sku", "product.parentSku", "==");
  pushAttr("positive_theme", "themes.positive", "array-contains");
  pushAttr("negative_theme", "themes.negative", "array-contains");

  const hasMediaRaw = queryParam(req, "has_media");
  if (hasMediaRaw !== undefined) {
    if (hasMediaRaw !== "true" && hasMediaRaw !== "false") {
      throw new ApiError(400, "invalid_parameter", "has_media must be 'true' or 'false'.");
    }
    if (hasMediaRaw === "true") {
      attributeCandidates.push({ param: "has_media", field: "hasMedia", op: "==", value: true });
    }
  }

  if (attributeCandidates.length > 1) {
    throw new ApiError(
      400,
      "filters_not_combinable",
      `Combine at most one of these filters per request: ${attributeCandidates
        .map((a) => a.param)
        .join(", ")}.`
    );
  }

  // Post-filters (applied in memory while scanning, because Firestore can't
  // express them alongside the indexed constraints).
  const ratingRaw = queryParam(req, "rating");
  const rating = ratingRaw === undefined ? null : parsePositiveInt(ratingRaw, "rating", 5);

  const reviewTypeRaw = queryParam(req, "review_type") ?? "all";
  if (!["all", "service", "product"].includes(reviewTypeRaw)) {
    throw new ApiError(400, "invalid_parameter", "review_type must be all, service, or product.");
  }
  const reviewType = reviewTypeRaw === "all" ? null : (reviewTypeRaw as "service" | "product");

  const hasPostFilters = rating !== null || reviewType !== null;
  if (hasPostFilters && page !== null && page > 1) {
    throw new ApiError(
      400,
      "use_cursor",
      "rating/review_type filters require cursor pagination beyond the first page."
    );
  }

  const window = ((page ?? 1) - 1) * pageSize + pageSize;
  if (window > PAGE_MODE_MAX_WINDOW) {
    throw new ApiError(
      400,
      "use_cursor",
      `page * page_size cannot exceed ${PAGE_MODE_MAX_WINDOW}; use cursor pagination for deep iteration.`
    );
  }

  return {
    merchantParam: queryParam(req, "merchant_identifier"),
    page,
    pageSize,
    cursor,
    dateField,
    dateFrom,
    dateTo,
    direction: sortRaw === "oldest" ? "asc" : "desc",
    attribute: attributeCandidates[0] ?? null,
    rating,
    reviewType,
  };
}

function hasPostFilters(p: ListParams): boolean {
  return p.rating !== null || p.reviewType !== null;
}

// ── Query building & merge pagination ───────────────────────────────────────

function buildBaseQuery(merchant: MerchantInfo, p: ListParams): Query {
  const db = getFirestore();
  let q: Query = db
    .collection(merchant.reviewsCollection)
    .where("brand", "==", merchant.identifier);
  if (p.attribute) {
    q = q.where(p.attribute.field, p.attribute.op, p.attribute.value);
  }
  if (p.dateFrom) q = q.where(p.dateField, ">=", p.dateFrom);
  if (p.dateTo) q = q.where(p.dateField, "<=", p.dateTo);
  return q.orderBy(p.dateField, p.direction);
}

function matchesPostFilters(snap: QueryDocumentSnapshot, p: ListParams): boolean {
  if (p.rating !== null) {
    const ratings = snap.get("ratings") as { product?: number; service?: number } | undefined;
    const headline = ratings?.product ?? ratings?.service ?? null;
    if (typeof headline !== "number" || Math.round(headline) !== p.rating) return false;
  }
  if (p.reviewType !== null) {
    const reviews = snap.get("reviews") as
      | { serviceText?: string | null; productText?: string | null }
      | undefined;
    const text = p.reviewType === "service" ? reviews?.serviceText : reviews?.productText;
    if (typeof text !== "string" || !text.trim()) return false;
  }
  return true;
}

interface MerchantStream {
  merchant: MerchantInfo;
  buffer: QueryDocumentSnapshot[];
  bufferIndex: number;
  lastFetched: QueryDocumentSnapshot | null;
  /** Doc id of the last doc handed to the merge (the cursor position). */
  lastConsumedId: string | null;
  /** True once Firestore has no more docs beyond the current buffer. */
  noMoreAfterBuffer: boolean;
  /** True when a cursor marked this stream finished in a prior request. */
  done: boolean;
}

async function fillStream(stream: MerchantStream, p: ListParams): Promise<void> {
  if (stream.done || stream.noMoreAfterBuffer || stream.bufferIndex < stream.buffer.length) {
    return;
  }
  let q = buildBaseQuery(stream.merchant, p);
  if (stream.lastFetched) q = q.startAfter(stream.lastFetched);
  const snap = await q.limit(FETCH_BATCH).get();
  stream.buffer = snap.docs;
  stream.bufferIndex = 0;
  if (snap.docs.length > 0) stream.lastFetched = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < FETCH_BATCH) stream.noMoreAfterBuffer = true;
}

function streamHead(stream: MerchantStream): QueryDocumentSnapshot | null {
  if (stream.done) return null;
  return stream.bufferIndex < stream.buffer.length ? stream.buffer[stream.bufferIndex] : null;
}

function streamFinished(stream: MerchantStream): boolean {
  return (
    stream.done || (stream.noMoreAfterBuffer && stream.bufferIndex >= stream.buffer.length)
  );
}

function compareDocs(
  a: QueryDocumentSnapshot,
  b: QueryDocumentSnapshot,
  p: ListParams
): number {
  const aDate = (a.get(p.dateField) as string | undefined) ?? "";
  const bDate = (b.get(p.dateField) as string | undefined) ?? "";
  const byDate = p.direction === "desc" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
  if (byDate !== 0) return byDate;
  // Mirror Firestore's implicit __name__ tiebreaker (follows the last
  // orderBy direction) so the merged order matches per-stream order.
  return p.direction === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
}

// ── Cursor encoding ─────────────────────────────────────────────────────────

interface CursorPayload {
  v: 1;
  /** Hash of the canonical query (merchants + filters + sort); a cursor is
   * only valid for the exact query it was issued for. */
  q: string;
  /** merchant id → last consumed doc id, null (start), or "done". */
  m: Record<string, string | null>;
}

function queryKeyHash(merchants: MerchantInfo[], p: ListParams): string {
  const canonical = JSON.stringify({
    merchants: merchants.map((m) => m.identifier).sort(),
    dateField: p.dateField,
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
    direction: p.direction,
    attribute: p.attribute ? [p.attribute.field, p.attribute.op, p.attribute.value] : null,
    rating: p.rating,
    reviewType: p.reviewType,
  });
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

const INVALID_CURSOR = new ApiError(
  400,
  "invalid_cursor",
  "The cursor is invalid, expired, or was issued for a different query."
);

const MAX_CURSOR_LENGTH = 2048;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Decode and STRICTLY validate an attacker-suppliable cursor: bounded
 * length, bound to the query hash, `m` a plain non-null object, and every
 * position either null, "done", or a doc-id-safe string — nothing else may
 * ever reach a Firestore document path. */
function decodeCursor(raw: string, expectedKey: string): Record<string, string | null> {
  if (raw.length > MAX_CURSOR_LENGTH) throw INVALID_CURSOR;
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    throw INVALID_CURSOR;
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.v !== 1 ||
    payload.q !== expectedKey ||
    payload.m === null ||
    typeof payload.m !== "object" ||
    Array.isArray(payload.m)
  ) {
    throw INVALID_CURSOR;
  }
  for (const value of Object.values(payload.m)) {
    if (value !== null && value !== "done" && !(typeof value === "string" && DOC_ID_PATTERN.test(value))) {
      throw INVALID_CURSOR;
    }
  }
  return payload.m;
}

function captureCursorState(streams: MerchantStream[]): Record<string, string | null> {
  const state: Record<string, string | null> = {};
  for (const stream of streams) {
    state[stream.merchant.identifier] = streamFinished(stream)
      ? "done"
      : stream.lastConsumedId;
  }
  return state;
}

// ── Itinerary mapping lookups (per-instance cache) ──────────────────────────

const mappingCache = new Map<string, { lookup: Map<string, string>; fetchedAt: number }>();
const MAPPING_CACHE_TTL_MS = 300_000;

async function getGroupLookup(merchant: MerchantInfo): Promise<Map<string, string>> {
  const cached = mappingCache.get(merchant.identifier);
  if (cached && Date.now() - cached.fetchedAt < MAPPING_CACHE_TTL_MS) {
    return cached.lookup;
  }
  const db = getFirestore();
  const snap = await db
    .collection(merchant.mappingsCollection)
    .where("brand", "==", merchant.identifier)
    .get();
  const lookup = new Map<string, string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.rawName === "string" && typeof data.effectiveParentName === "string") {
      lookup.set(data.rawName, data.effectiveParentName);
    }
  }
  mappingCache.set(merchant.identifier, { lookup, fetchedAt: Date.now() });
  return lookup;
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleListReviews(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  auth: AuthContext,
  log: Record<string, unknown>
): Promise<void> {
  const p = parseListParams(req);
  const merchants = resolveMerchants(p.merchantParam, auth.merchants);
  log.merchants = merchants.map((m) => m.identifier);

  const key = queryKeyHash(merchants, p);
  const streams: MerchantStream[] = merchants.map((merchant) => ({
    merchant,
    buffer: [],
    bufferIndex: 0,
    lastFetched: null,
    lastConsumedId: null,
    noMoreAfterBuffer: false,
    done: false,
  }));

  // Resume from a cursor: position each stream after its last consumed doc.
  if (p.cursor) {
    const state = decodeCursor(p.cursor, key);
    const db = getFirestore();
    for (const stream of streams) {
      const position = state[stream.merchant.identifier];
      if (position === undefined) throw INVALID_CURSOR;
      if (position === "done") {
        stream.done = true;
      } else if (position !== null) {
        const snap = await db
          .collection(stream.merchant.reviewsCollection)
          .doc(position)
          .get();
        if (!snap.exists) throw INVALID_CURSOR;
        stream.lastFetched = snap as unknown as QueryDocumentSnapshot;
        stream.lastConsumedId = position;
      }
    }
  }

  const targetSkip = ((p.page ?? 1) - 1) * p.pageSize;
  const needed = targetSkip + p.pageSize + 1;

  const matches: Array<{ snap: QueryDocumentSnapshot; merchant: MerchantInfo }> = [];
  let scanned = 0;
  let cursorAtWindowEnd: Record<string, string | null> | null = null;

  while (matches.length < needed && scanned < MAX_SCANNED_DOCS) {
    // Pick the next doc across streams in merged date order.
    let best: MerchantStream | null = null;
    for (const stream of streams) {
      await fillStream(stream, p);
      const head = streamHead(stream);
      if (!head) continue;
      if (!best) {
        best = stream;
      } else {
        const bestHead = streamHead(best);
        if (bestHead && compareDocs(head, bestHead, p) < 0) best = stream;
      }
    }
    if (!best) break; // every stream exhausted

    const snap = best.buffer[best.bufferIndex];
    best.bufferIndex += 1;
    best.lastConsumedId = snap.id;
    scanned += 1;

    if (matchesPostFilters(snap, p)) {
      matches.push({ snap, merchant: best.merchant });
      if (matches.length === targetSkip + p.pageSize) {
        cursorAtWindowEnd = captureCursorState(streams);
      }
    }
  }

  const allFinished = streams.every(streamFinished);
  const windowMatches = matches.slice(targetSkip, targetSkip + p.pageSize);
  const hasMore = matches.length > targetSkip + p.pageSize || !allFinished;

  // Exact totals are only knowable when every filter ran server-side.
  let count: number | null = null;
  let pages: number | null = null;
  if (!hasPostFilters(p)) {
    count = 0;
    for (const merchant of merchants) {
      const agg = await buildBaseQuery(merchant, p).count().get();
      count += agg.data().count;
    }
    pages = Math.max(1, Math.ceil(count / p.pageSize));
  }

  const nextCursor = hasMore
    ? encodeCursor({ v: 1, q: key, m: cursorAtWindowEnd ?? captureCursorState(streams) })
    : null;

  const reviews = [];
  for (const match of windowMatches) {
    const lookup = await getGroupLookup(match.merchant);
    reviews.push(
      toPublicReview(match.snap.data() as ReviewDocument, { itineraryGroupLookup: lookup })
    );
  }
  log.resultCount = reviews.length;
  log.scanned = scanned;

  sendJson(
    res,
    requestId,
    200,
    {
      summary: {
        meta: {
          count,
          pages,
          page_size: p.pageSize,
          current_page: p.cursor ? null : p.page ?? 1,
        },
        next_cursor: nextCursor,
      },
      reviews,
    },
    { req }
  );
}

async function handleGetReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  auth: AuthContext,
  reviewId: string,
  log: Record<string, unknown>
): Promise<void> {
  const merchants = resolveMerchants("all", auth.merchants);
  const db = getFirestore();

  // Identical 404 for "doesn't exist" and "outside the credential's merchant
  // scope" so review ids can't be probed across merchants.
  const notFound = new ApiError(404, "review_not_found", "No review with that id.");

  const collections = [...new Set(merchants.map((m) => m.reviewsCollection))];
  let snap: FirebaseFirestore.DocumentSnapshot | null = null;
  for (const collection of collections) {
    const candidate = await db.collection(collection).doc(reviewId).get();
    if (candidate.exists) {
      snap = candidate;
      break;
    }
  }
  if (!snap) throw notFound;

  const brand = snap.get("brand");
  const merchant = merchants.find((m) => m.identifier === brand);
  if (!merchant) throw notFound;

  const lookup = await getGroupLookup(merchant);
  log.merchants = [merchant.identifier];
  log.resultCount = 1;
  sendJson(
    res,
    requestId,
    200,
    toPublicReview(snap.data() as ReviewDocument, { itineraryGroupLookup: lookup }),
    { req }
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function asSummaryDoc(data: FirebaseFirestore.DocumentData): SummaryDocLike {
  return {
    scope: data.scope === "ship" || data.scope === "itinerary" ? data.scope : "fleet",
    scopeValue: typeof data.scopeValue === "string" ? data.scopeValue : null,
    totalReviews: typeof data.totalReviews === "number" ? data.totalReviews : 0,
    reviewsWithComments:
      typeof data.reviewsWithComments === "number" ? data.reviewsWithComments : 0,
    avgRating: typeof data.avgRating === "number" ? data.avgRating : 0,
    starDistribution:
      typeof data.starDistribution === "object" && data.starDistribution !== null
        ? (data.starDistribution as Record<string, number>)
        : {},
    serviceStarDistribution:
      typeof data.serviceStarDistribution === "object" && data.serviceStarDistribution !== null
        ? (data.serviceStarDistribution as Record<string, number>)
        : undefined,
    topPositiveThemes: Array.isArray(data.topPositiveThemes) ? data.topPositiveThemes : [],
    topNegativeThemes: Array.isArray(data.topNegativeThemes) ? data.topNegativeThemes : [],
    ships: Array.isArray(data.ships) ? data.ships : [],
    itineraries: Array.isArray(data.itineraries) ? data.itineraries : [],
    lastUpdated: typeof data.lastUpdated === "string" ? data.lastUpdated : undefined,
  };
}

function mergeSummaries(docs: SummaryDocLike[]): SummaryDocLike {
  const merged: SummaryDocLike = {
    scope: docs[0].scope,
    scopeValue: docs[0].scopeValue,
    totalReviews: 0,
    reviewsWithComments: 0,
    avgRating: 0,
    starDistribution: {},
    topPositiveThemes: [],
    topNegativeThemes: [],
    ships: [],
    itineraries: [],
    lastUpdated: undefined,
  };

  let ratingWeight = 0;
  const positive: Record<string, number> = {};
  const negative: Record<string, number> = {};
  const ships = new Set<string>();
  const itineraries = new Set<string>();

  // Service distributions merge only when EVERY doc has one — a partial
  // merge would silently undercount, so mixed inputs yield service: null.
  const allHaveService = docs.every((doc) => doc.serviceStarDistribution);
  const mergedService: Record<string, number> = {};

  for (const doc of docs) {
    merged.totalReviews += doc.totalReviews;
    merged.reviewsWithComments += doc.reviewsWithComments;
    ratingWeight += doc.avgRating * doc.totalReviews;
    for (const [star, value] of Object.entries(doc.starDistribution)) {
      if (typeof value === "number") {
        merged.starDistribution[star] = (merged.starDistribution[star] ?? 0) + value;
      }
    }
    if (allHaveService && doc.serviceStarDistribution) {
      for (const [star, value] of Object.entries(doc.serviceStarDistribution)) {
        if (typeof value === "number") {
          mergedService[star] = (mergedService[star] ?? 0) + value;
        }
      }
    }
    for (const t of doc.topPositiveThemes) positive[t.theme] = (positive[t.theme] ?? 0) + t.count;
    for (const t of doc.topNegativeThemes) negative[t.theme] = (negative[t.theme] ?? 0) + t.count;
    for (const ship of doc.ships) ships.add(ship);
    for (const itinerary of doc.itineraries) itineraries.add(itinerary);
    if (doc.lastUpdated && (!merged.lastUpdated || doc.lastUpdated > merged.lastUpdated)) {
      merged.lastUpdated = doc.lastUpdated;
    }
  }

  merged.avgRating =
    merged.totalReviews > 0 ? Math.round((ratingWeight / merged.totalReviews) * 100) / 100 : 0;
  if (allHaveService) {
    merged.serviceStarDistribution = mergedService;
  }
  merged.topPositiveThemes = Object.entries(positive)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  merged.topNegativeThemes = Object.entries(negative)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  merged.ships = [...ships].sort();
  merged.itineraries = [...itineraries].sort();
  return merged;
}

async function handleSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  auth: AuthContext,
  log: Record<string, unknown>
): Promise<void> {
  const scope = queryParam(req, "scope") ?? "fleet";
  if (!["fleet", "ship", "itinerary"].includes(scope)) {
    throw new ApiError(400, "invalid_parameter", "scope must be fleet, ship, or itinerary.");
  }
  const scopeValue = queryParam(req, "scope_value");
  if (scope !== "fleet" && (!scopeValue || !scopeValue.trim())) {
    throw new ApiError(400, "invalid_parameter", `scope_value is required when scope=${scope}.`);
  }

  const merchants = resolveMerchants(queryParam(req, "merchant_identifier"), auth.merchants);
  log.merchants = merchants.map((m) => m.identifier);

  const db = getFirestore();
  const found: Array<{ merchant: MerchantInfo; doc: SummaryDocLike }> = [];
  for (const merchant of merchants) {
    const docId =
      scope === "fleet"
        ? merchant.identifier
        : `${merchant.identifier}_${scope}_${slugify(scopeValue!.trim())}`;
    const snap = await db.collection(merchant.summariesCollection).doc(docId).get();
    if (snap.exists) {
      found.push({ merchant, doc: asSummaryDoc(snap.data() ?? {}) });
    }
  }

  if (found.length === 0) {
    throw new ApiError(404, "summary_not_found", "No summary for that merchant/scope.");
  }

  const body =
    found.length === 1 && merchants.length === 1
      ? toPublicSummary(found[0].doc, {
          identifier: found[0].merchant.identifier,
          name: found[0].merchant.label,
        })
      : toPublicSummary(mergeSummaries(found.map((f) => f.doc)), {
          identifier: "all",
          name: "All merchants",
        });

  log.resultCount = 1;
  sendJson(res, requestId, 200, body, { req, cacheSeconds: 600 });
}

async function handleToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  log: Record<string, unknown>
): Promise<void> {
  const pepper = getSecretPepper();

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const clientSecret = typeof body.client_secret === "string" ? body.client_secret : "";
  const grantType = typeof body.grant_type === "string" ? body.grant_type : "";

  if (grantType !== "client_credentials") {
    throw new ApiError(400, "unsupported_grant_type", "grant_type must be client_credentials.");
  }
  if (!clientId || !clientSecret) {
    throw new ApiError(400, "invalid_request", "client_id and client_secret are required.");
  }
  // Reject malformed ids BEFORE any Firestore access: untrusted strings must
  // never reach a document path (a "/" would address a nested path or throw).
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(clientId) || clientSecret.length > 200) {
    throw new ApiError(400, "invalid_request", "client_id or client_secret is malformed.");
  }

  // Brute-force guard: failed and successful exchanges both count against a
  // per-client_id budget, checked before any secret verification. The key is
  // hashed so the rate-limit doc id never embeds caller-controlled bytes.
  const rateKey = `token_${createHash("sha256").update(clientId).digest("hex").slice(0, 40)}`;
  await enforceRateLimit(rateKey, TOKEN_RATE_LIMIT_PER_MINUTE);

  const invalidClient = new ApiError(401, "invalid_client", "Invalid client credentials.");
  const client = await loadApiClient(clientId);
  if (!client || client.status !== "active" || !client.secretVerifier) {
    throw invalidClient;
  }
  if (!verifyClientSecret(clientSecret, client.secretVerifier, pepper)) {
    throw invalidClient;
  }

  const { accessToken, expiresIn } = await mintAccessToken(client);
  log.clientId = client.clientId;
  sendJson(
    res,
    requestId,
    200,
    { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn },
    { noStore: true }
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleApiRequest(req: any, res: any): Promise<void> {
  const requestId = newRequestId();
  const startedAt = Date.now();
  const log: Record<string, unknown> = {};

  try {
    let path = typeof req.path === "string" && req.path ? req.path : "/";
    path = path.replace(/\/+$/, "") || "/";
    // Behind the Hosting rewrite the function sees the original /api/... path;
    // called directly (emulator, cloudfunctions.net) there is no prefix.
    if (path === "/api" || path.startsWith("/api/")) path = path.slice(4) || "/";

    if (path === "/v1/oauth/token") {
      if (req.method !== "POST") {
        throw new ApiError(405, "method_not_allowed", "Use POST for the token endpoint.");
      }
      await handleToken(req, res, requestId, log);
      return;
    }

    if (req.method !== "GET") {
      throw new ApiError(405, "method_not_allowed", "Use GET.");
    }

    const auth = await authenticateRequest(req);
    log.clientId = auth.clientId;
    await enforceRateLimit(`api:${auth.clientId}`, auth.rateLimitPerMinute);

    if (path === "/v1/reviews/all") {
      requireScope(auth, "reviews:read");
      await handleListReviews(req, res, requestId, auth, log);
      return;
    }

    if (path === "/v1/reviews/summary/all") {
      requireScope(auth, "summary:read");
      await handleSummary(req, res, requestId, auth, log);
      return;
    }

    if (path === "/v1/meta/themes") {
      requireScope(auth, "meta:read");
      sendJson(
        res,
        requestId,
        200,
        {
          themes: {
            positive: POSITIVE_THEMES.map((t) => ({ name: t.name, description: t.description })),
            negative: NEGATIVE_THEMES.map((t) => ({ name: t.name, description: t.description })),
          },
        },
        { req, cacheSeconds: 3600 }
      );
      return;
    }

    if (path === "/v1/meta/merchants") {
      requireScope(auth, "meta:read");
      sendJson(
        res,
        requestId,
        200,
        {
          merchants: listMerchantsForScope(auth.merchants).map((m) => ({
            merchant_identifier: m.identifier,
            label: m.label,
          })),
        },
        { req, cacheSeconds: 3600 }
      );
      return;
    }

    const idMatch = path.match(/^\/v1\/reviews\/([A-Za-z0-9_-]{1,128})$/);
    if (idMatch) {
      requireScope(auth, "reviews:read");
      await handleGetReview(req, res, requestId, auth, idMatch[1], log);
      return;
    }

    throw new ApiError(404, "not_found", "Unknown endpoint.");
  } catch (error) {
    sendError(res, requestId, error);
  } finally {
    console.log(
      JSON.stringify({
        msg: "reviewsApi",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        ...log,
      })
    );
  }
}
