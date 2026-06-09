# Public Reviews API — Recommendation & Design

**Date:** 2026-06-09
**Status:** Proposed (recommendation) · revised after code review (Codex, PR #61)
**Owner:** TBD

**Goal:** Expose Uniworld's synced, AI-enriched reviews through a read-only HTTP API so the company marketing website (and partners) can render reviews, ratings, and aggregates — **without** leaking customer PII, **without** coupling consumers to Firestore internals, and using a **Feefo-style credential model** that anyone who has integrated Feefo will recognize.

**Guiding principle:** *Emulate the Feefo NativeReviews API as closely as practical, then layer our value-add on top.* That applies to three things at once:
1. **The data shape** — mirror Feefo's `/reviews/all` and `/reviews/summary/all` payloads.
2. **The brand model** — select brand via `merchant_identifier`, exactly like Feefo.
3. **The auth model** — issue `client_id` + `client_secret`, exchange for a short-lived bearer token, exactly like Feefo's `POST /oauth/v2/token`.

Then add what Feefo can't: AI theme classifications, normalized attributes (ship / itinerary / region / loyalty), itinerary grouping, and media/comment flags.

**Brand model:** Our internal `ReviewDocument.brand` value is *already* the Feefo merchant identifier (`uniworld`, `luxury-gold`), so `merchant_identifier` maps 1:1. The contract is designed to survive the [multi-tenant migration](2026-04-03-multi-tenant-roadmap.md) without a breaking change.

---

## Recommendation summary

Stand up a single, versioned, read-only Cloud Function (`reviewsApi`) plus a small credential system, all in the existing `functions/` + `shared/` packages — no new infrastructure:

1. **Mirror Feefo's two core endpoints** — `GET /v1/reviews/all` and `GET /v1/reviews/summary/all` — using Feefo's envelope and field names, plus our extensions (`/v1/reviews/{id}`, `/v1/meta/*`).
2. **Select brand via `merchant_identifier`** (`uniworld` | `luxury-gold` | `all`), matching Feefo's parameter exactly.
3. **Add an `enrichment` block to every review** carrying AI themes + derived metadata, namespaced so it never collides with Feefo's schema.
4. **Authenticate Feefo-style, server-side only:** dashboard users self-mint `client_id` + `client_secret`; consumers exchange them at `POST /v1/oauth/token` for a bearer token. (See [Authentication](#authentication--api-credentials).)
5. **Enforce the *site's own* customer-name rule** via one shared `resolveDisplayName()` function used by both the website and the API — so what the API returns is byte-for-byte what the site shows, and the raw `name`/email/refs never escape. (See [PII firewall](#pii-firewall--name-display-parity).)
6. **Read Firestore via the Admin SDK**, which lets us simultaneously **close the currently world-open Firestore read rules**.
7. **Cache on the consumer side** — the calling backend caches the token and payloads, and aggregates come from precomputed summaries — since the API is server-to-server and data changes only every ~2 hours.

---

## Background — what we have to expose

The sync pipeline ([`functions/src/sync/sync-reviews.ts`](../../functions/src/sync/sync-reviews.ts)) normalizes every Feefo review into a [`ReviewDocument`](../../shared/src/types/review.ts) in Firestore, then enriches it:

- **Themes** — Anthropic Batch classification writes `themes.positive[]` / `themes.negative[]` / `themes.classifiedAt` against a fixed taxonomy ([`shared/src/themes/definitions.ts`](../../shared/src/themes/definitions.ts)): 10 positive (Staff, Service, Food, Excursions, Ship, Accommodation, Wine & Drinks, Overall Experience, Destination & Culture, Entertainment) and 10 negative (Food Quality, Excursion Quality, Unmet Expectations, Ship Condition, Space & Size, Value, Temperature & Comfort, Noise, Itinerary Changes, Communication).
- **Normalized attributes** — `parseTags` extracts `tags.ship`, `tags.tour`, `tags.tourDirector`, `tags.bookingType`, `tags.region`, `tags.loyalty`, `tags.clientType`, `tags.package`.
- **Itinerary grouping** — `itinerary_mappings` resolves raw tour names to a parent itinerary group.
- **Flags** — `hasMedia` and `hasComment` booleans.
- **Aggregates** — [`summaries`](../../functions/src/sync/compute-summaries.ts) holds precomputed fleet / ship / itinerary rollups; `monthly_summaries` holds per-month rollups. So the summary endpoint is a single cheap doc read.

---

## PII firewall & name-display parity

### The rule we must match

The API enforces the **exact** name rules the website uses: show the customer's name when the site shows it, show "Trusted Customer" when the site does. The canonical rule (`displayName || "Trusted Customer"`, never the raw `name`) was shared and shipped to the website in **PR #60** via `resolveDisplayName()`:

```ts
// app/src/lib/format/customer.ts  (shipped in #60; the API mirrors it)
export function resolveDisplayName(
  customer: { displayName?: string | null } | null | undefined,
  fallback = "Trusted Customer"
): string {
  const name = customer?.displayName;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}
```

When the API moves into `functions/`/`shared/`, the same rule is reused verbatim (the canonical copy can live in `shared/` and the app import it, once the app consumes `shared`). The raw `name` flows **nowhere**.

### The firewall (allowlist mapper)

A single allowlist mapper is the only thing that constructs public output — never a `spread` of the raw doc, so a new PII field added later cannot leak by default:

```ts
// shared/src/reviews/public.ts
export function toPublicReview(d: ReviewDocument): PublicReview {
  return {
    merchant: { identifier: d.brand },
    id: d.id,
    url: d.feedbackUrl,
    customer: {
      display_name: resolveDisplayName(d.customer),  // identical to the website
      // display_location is OMITTED by default — the dashboard never renders
      // customer location, so to match the site we don't expose it either
      // (opt-in open decision). name / email / orderRef / customerRef NEVER map.
    },
    service: /* {min,max,rating}, title, review, created_at */,
    products: [ /* single product: rating, review, media, product{...}, created_at */ ],
    last_updated_date: d.dates.lastUpdated,
    verified: d.verified,
    // attributes EXCLUDES tour_director by default (a staff member's name — open decision)
    enrichment: { themes, attributes, itinerary, flags },
  };
}
```

**Conservative defaults (from review):** the v1 mapper **omits** `customer.display_location` (the dashboard never shows location, so omitting matches the site rule) and `enrichment.attributes.tour_director` (a staff member's personal name). Both are opt-in [open decisions](#open-decisions). The unit test asserts the *exact* output key set so any future addition is a deliberate, reviewed change.

---

## API design

### Base URL & routing

Expose the function under a clean, stable base URL via a Firebase Hosting rewrite (`/api/** → reviewsApi`). Because responses are authenticated, the rewrite is for URL tidiness and routing, not CDN caching:

```jsonc
// firebase.json → hosting
"rewrites": [
  { "source": "/api/**", "function": "reviewsApi", "region": "us-central1" },
  { "source": "**", "destination": "/index.html" }   // keep SPA fallback last
]
```

Public base: `https://<site-domain>/api/v1/...`. The `reviewsApi` function routes internally.

> **Versioning:** we use our own `/v1/` rather than Feefo's `/20/`, so our contract evolves independently. Feefo analogues are noted per endpoint.

### Endpoint map

| Our endpoint | Feefo analogue | Auth | Purpose |
|---|---|---|---|
| `POST /v1/oauth/token` | `POST /oauth/v2/token` | client_id + secret | Exchange credentials for a bearer token |
| `GET /v1/reviews/all` | `GET /20/reviews/all` | Bearer | Paginated, filtered review list |
| `GET /v1/reviews/summary/all` | `GET /20/reviews/summary/all` | Bearer | Aggregate ratings + star distribution |
| `GET /v1/reviews/{id}` | *(none)* | Bearer | Single review — permalinks / SEO |
| `GET /v1/meta/themes` | *(none)* | Bearer | AI theme taxonomy for filter UIs |
| `GET /v1/meta/merchants` | *(none)* | Bearer | Available `merchant_identifier`s + labels |

---

### `GET /v1/reviews/all`

**Query parameters** — Feefo-compatible names first, our extensions marked ➕:

| Param | Feefo? | Notes |
|---|---|---|
| `merchant_identifier` | ✓ | `uniworld` \| `luxury-gold` \| ➕`all`. Constrained to the caller's credential scope. |
| `page`, `page_size` | ✓ | `page_size` default 20, max 100. Shallow paging. |
| `cursor` | ➕ | Opaque token; preferred for deep iteration (see [Pagination](#pagination)). |
| `since_period` / `since_updated_period` | ✓ | `week`…`year`\|`all`; created vs last-updated windows. |
| `date_time_from` / `date_time_to` | ✓ | ISO created-date window. |
| `product_sku` / `parent_product_sku` | ✓ | Filter by product. |
| `review_type` | ➕ | `all` \| `service` \| `product`. |
| `rating` | ✓ | Minimum headline star (1–5). |
| `has_media` | ➕ | Only reviews with media (server-side via `hasMedia`). |
| `ship` / `tour` / `region` / `booking_type` / `loyalty` | ➕ | Normalized-attribute filters. |
| `positive_theme` / `negative_theme` | ➕ | Filter by AI theme name. |
| `search` | ✓ | Free-text (Phase 5 — Algolia; see [Search](#search)). |
| `sort` | ✓ | `newest` (default) \| `oldest`. |

**Response** — Feefo's envelope (`summary.meta` + `reviews[]`), each review Feefo-shaped plus `enrichment`:

```jsonc
{
  "summary": {
    "meta": { "count": 1842, "pages": 93, "page_size": 20, "current_page": 1 },
    "next_cursor": "eyJkIjoiMjAyNi0wNi0wMVQ..."
  },
  "reviews": [
    {
      "merchant": { "identifier": "uniworld" },
      "id": "60a3f2c1e4b0a1b2c3d4e5f6",
      "url": "https://www.feefo.com/en-US/reviews/uniworld/...",
      "customer": { "display_name": "Jane D." },
      "service": {
        "rating": { "min": 1, "max": 5, "rating": 5 },
        "title": "A wonderful trip from start to finish",
        "review": "The booking team were responsive and...",
        "created_at": "2026-05-20T09:15:00Z"
      },
      "products": [
        {
          "rating": { "min": 1, "max": 5, "rating": 5 },
          "review": "The Danube itinerary was breathtaking...",
          "media": [ { "type": "PHOTO", "url": "https://media.feefo.com/.../photo.jpg" } ],
          "product": {
            "title": "Enchanting Danube", "sku": "UW-DAN-8", "parent_sku": "UW-DAN",
            "url": "https://www.uniworld.com/...", "image_url": "https://www.uniworld.com/.../danube.jpg"
          },
          "created_at": "2026-05-20T09:15:00Z"
        }
      ],
      "last_updated_date": "2026-05-21T11:02:00Z",
      "verified": true,

      "enrichment": {
        "themes": { "positive": ["Staff", "Excursions", "Food"], "negative": [], "classified_at": "2026-05-21T03:00:00Z" },
        "attributes": {
          "ship": "S.S. Beatrice", "tour": "Enchanting Danube",
          "booking_type": "Direct", "region": "Central Europe", "loyalty": "Returning Guest",
          "client_type": "Couple", "package": "All-Inclusive"
        },
        "itinerary": { "raw": "Enchanting Danube (8 Days)", "group": "Enchanting Danube" },
        "flags": { "has_media": true, "has_comment": true }
      }
    }
  ]
}
```

**Design notes:** single `products[]` element (our model collapses to one product); `rating` objects synthesize `{min:1,max:5,rating}`; `created_at` maps from `dates.created` (per-section precision would need a sync change); raw Feefo `tags[]` are exposed normalized under `enrichment.attributes` (raw passthrough is an [open decision](#open-decisions)). Per the review, the example above already reflects the v1 defaults: **no `display_location`, no `tour_director`**.

---

### `GET /v1/reviews/summary/all`

Feefo-shaped summary served from the precomputed [`summaries`](../../functions/src/sync/compute-summaries.ts) collection. Params: `merchant_identifier`, ➕`scope` (`fleet` default | `ship` | `itinerary`), ➕`scope_value`.

```jsonc
{
  "merchant": { "identifier": "uniworld", "name": "Uniworld" },
  "meta": { "count": 1842 },
  "rating": {
    "min": 1, "max": 5, "rating": 4.81,
    "product": { "count": 1790, "5_star": 1500, "4_star": 210, "3_star": 50, "2_star": 20, "1_star": 10 },
    "service": null
  },
  "enrichment": {
    "scope": "fleet", "reviews_with_comments": 1203,
    "top_positive_themes": [ { "theme": "Staff", "count": 980 } ],
    "top_negative_themes": [ { "theme": "Value", "count": 88 } ],
    "ships": ["S.S. Beatrice"], "itineraries": ["Enchanting Danube"]
  }
}
```

> **Star-distribution caveat:** `compute-summaries.ts` builds `starDistribution` and `avgRating` from the **product** rating only (for fleet, ship, itinerary, and monthly summaries). So `rating.service` is emitted as **`null`** (shown above) until a sync change computes the service distribution — never faked. Adding `service` is part of Phase 4.

---

## Authentication & API credentials

**Model: OAuth 2.0 client-credentials, mirroring Feefo, server-side only.** Feefo issues a `client_id` + `client_secret` and you exchange them at `POST /oauth/v2/token` for a short-lived bearer token — see our own consumer implementation in [`shared/src/feefo/client.ts`](../../shared/src/feefo/client.ts). We emulate that flow exactly so a partner who has integrated Feefo can reuse their code against us by changing only the base URL and credentials.

### Credential model — server-side only

A single **confidential client**: `client_id` + `client_secret` → bearer token, for the website's backend, partners, and data pipelines. The secret always stays server-side; we do **not** issue a browser-embeddable key.

**Front-end access** is handled on the consumer's side: the website's own backend exposes thin, same-origin endpoints that call this API server-side and return JSON to its front end (the "backend proxy" pattern). That keeps the secret off every public surface, lets the consumer cache and shape responses, and is the right place to server-render review HTML + JSON-LD for SEO.

**Postman** is itself a confidential client — it holds the credentials locally, performs the token exchange, and sends the bearer token — so the server-only model works in Postman with no special handling. See [`docs/api/`](../api/README.md).

### Self-service creation in the dashboard

Add an **"API Access"** area under admin/settings:

- An owner/admin clicks **Create API client**, gives it a label and a **merchant scope** (which `merchant_identifier`s it may read), and receives `client_id` + `client_secret`. **The secret is shown once**; only a verifier is stored.
- Manage: list clients (with `lastUsedAt`), **rotate** secret, **revoke**.
- Gated by a new `manageApiClients` permission added to the existing Firestore access-control model ([`functions/src/auth/access-control.ts`](../../functions/src/auth/access-control.ts), `admin_users`) — same pattern as the existing `adminUsers` endpoint.

### Token endpoint (Feefo-shaped)

```http
POST /api/v1/oauth/token
Content-Type: application/json

{ "client_id": "uw_live_a1b2...", "client_secret": "...", "grant_type": "client_credentials" }
```
```jsonc
// 200
{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

- Look up the client, verify `status: "active"`, and **constant-time** compare the secret against the stored verifier (see [Credential storage & verification](#credential-storage--verification)).
- Issue a short-lived token (default TTL 1h). **Two options — pick one in build:**
  - **(a) Opaque token** whose hash is stored server-side and looked up per request → **revocation is immediate**.
  - **(b) Signed JWT** (`{ sub: clientId, merchants, scopes, ver, exp }`) → stateless, but a revoked client keeps working until `exp` **unless every request also re-checks the client's `status`/`tokenVersion`** (a cheap, cacheable read).
  - **Default recommendation:** opaque tokens, for simple immediate revocation; use a JWT only if statelessness is required.
- Response mirrors Feefo's `{ access_token, token_type, expires_in }` exactly.

### Authenticated requests

```http
GET /api/v1/reviews/all?merchant_identifier=uniworld
Authorization: Bearer <access_token>
```

`reviewsApi` validates the token (signature/lookup + expiry + `status`/`tokenVersion`), then checks that the requested `merchant_identifier` ∈ `token.merchants` and that scope allows `reviews:read`. A client scoped to `luxury-gold` cannot read `uniworld`.

### Abuse controls & per-endpoint authorization

- **Rate limiting is enforced** per `clientId` (the `rateLimitTier`), not merely recorded — e.g. a token bucket in Firestore/Memorystore — returning `429` with `Retry-After` when exceeded.
- **`GET /v1/reviews/{id}` is scope-checked after load:** fetch the doc, then return it only if its `brand` is within the caller's `merchants`. Return an **identical `404`** for both "not found" and "out of scope", so ids (which can be derived from Feefo URLs) can't be enumerated or probed across merchants.
- **Request logging** records `clientId`, merchant(s), endpoint, status, latency, and result count — for abuse investigation and per-client analytics.

### Firestore model

```
api_clients/{clientId}
  clientId       : string         // public id, e.g. "uw_live_a1b2c3"
  secretVerifier : string         // argon2id/bcrypt hash, OR HMAC-SHA256(secret, pepper) — see below
  label          : string         // "Marketing website (prod)"
  merchants      : string[]       // allowed identifiers, or ["*"]
  scopes         : string[]       // ["reviews:read","summary:read"]
  status         : "active"|"revoked"
  tokenVersion   : number         // bumped on rotate/revoke; invalidates opaque tokens / re-checked by JWTs
  createdBy      : string         // dashboard uid/email
  createdAt, lastUsedAt
  rateLimitTier? : string
  orgId?         : string         // multi-tenant future
```

Rules: `allow read, write: if false` — Admin SDK only; secrets/verifiers are never client-readable (mirrors the roadmap's `credentials` subcollection).

### Credential storage & verification

- **Secrets are server-generated** with high entropy (e.g. 32 random bytes, base64url) — never user-chosen — and shown once.
- **Store a verifier, not the secret:** `argon2id` (preferred) or `bcrypt`, **or** `HMAC-SHA256(secret, pepper)` where the pepper is a Secret Manager value. Plain unsalted SHA-256 is *not* the spec — choose a slow KDF or a peppered HMAC explicitly in build.
- **Verify in constant time** (`crypto.timingSafeEqual` for HMAC; the library's own compare for argon2/bcrypt).
- **JWT signing material** (option b) lives in Secret Manager, bound to the function as `REVIEWS_API_JWT_SECRET`; rotate via `kid`.
- **Revocation:** opaque tokens are killed immediately by deleting their server-side hash or bumping `tokenVersion`; JWTs need the per-request `status`/`tokenVersion` check noted above.

### Caching (server-side)

Bearer-auth responses aren't CDN-cached, so caching lives with the consumer: the calling backend caches the bearer token (~1h) and the review payloads (e.g. Next.js fetch revalidation), while aggregate reads stay cheap because `/v1/reviews/summary/all` comes from the precomputed `summaries` collection. We still send `Cache-Control` + `ETag` so any shared HTTP cache the consumer runs can honour them.

Credentials buy us per-consumer **analytics, revocation, rate-limit tiers, and brand scoping** — and keep metering/monetization open later.

---

## Brand / merchant support

`merchant_identifier` maps directly to `ReviewDocument.brand` (identical values); filtering is an indexed `where("brand","==",…)`. Validate it against a **shared, exported** brand/merchant constant in `shared/` — today there are *two private* `VALID_BRANDS` constants ([functions/src/index.ts](../../functions/src/index.ts) and [shared/src/feefo/transform.ts](../../shared/src/feefo/transform.ts)); the API should add **one exported source of truth** rather than reference a private local.

**`merchant_identifier=all` is a fan-out, not a brandless query:** run the per-merchant brand-scoped query for each allowed merchant and merge/sort. This reuses the existing `brand + …` composite indexes and **avoids adding brandless composites** — the current [`firestore.indexes.json`](../../firestore.indexes.json) has brandless indexes for `tags.tour`/`tags.ship`/themes/`hasMedia` but **not** for `tags.region`, `tags.bookingType`, `tags.loyalty`, or `ratings.product`+date, so a brandless `all`+filter query would otherwise fail. Every request is additionally constrained to the caller's credential `merchants` scope.

**Forward-compatible with multi-tenant:** a `merchant_registry/{merchant_identifier} → { orgId, collectionPath, label }` resolver keeps the API merchant-centric (Feefo-style) even after data moves to `organizations/{orgId}/reviews` — the `/v1` contract never changes, only the resolver does. API clients gain an `orgId` and belong to one org.

---

## Pagination

Support both, honestly: **`page`/`page_size`** for Feefo familiarity and shallow paging (`summary.meta` returns `{count,pages,page_size,current_page}`, `count` via a cheap `getCountFromServer` aggregate), and an opaque **`cursor`/`next_cursor`** for efficient deep iteration and full exports (preferred past the first few pages, since Firestore offset paging re-reads skipped docs). For `merchant_identifier=all`, the cursor encodes **per-merchant positions** (the fan-out merges each merchant's ordered stream), so deep paging stays correct across the merged result.

---

## Caching, CORS & methods

- **Caching:** responses carry `Cache-Control` + `ETag`; the consuming backend does the real caching (token + payloads). Aggregates are cheap (precomputed `summaries`), and data changes only every ~2h, so generous TTLs are safe.
- **CORS:** not required for server-to-server callers (CORS is a browser concern), so it stays off by default. Any browser access goes through the consumer's own same-origin backend, never directly here.
- **Methods:** `POST` for the token endpoint, `GET` elsewhere (405 otherwise).

---

## Errors & observability

- **Uniform error envelope:** `{ "error": { "code": "string", "message": "string", "request_id": "string" } }`.
- **Status codes:** `400` bad params · `401` missing/invalid/expired token · `403` valid token but merchant/scope not allowed · `404` unknown route or review (also used for out-of-scope ids) · `405` wrong method · `429` rate-limited (with `Retry-After`) · `500` server error.
- **`request_id`** echoed in the body and an `X-Request-Id` header.
- **Structured logs** per request: `clientId`, merchant(s), endpoint, status, latency, result count, rate-limit outcome — reuse the existing `operation_logs` pattern or Cloud Logging.

---

## Security tie-in

Standing up the sanitized API is the moment to fix the open-rules exposure flagged in [`docs/security-and-access.md`](../../docs/security-and-access.md). The function reads via the Admin SDK (bypasses rules), so we can tighten [`firestore.rules`](../../firestore.rules). **All five currently world-readable collections must change** from `allow read: if true` to `allow read: if request.auth != null`: `reviews`, `summaries`, `monthly_summaries`, `sync_meta`, and `itinerary_mappings`. The new `api_clients` collection is **deny-all** to client SDKs (Admin-SDK-only). Public consumers use the sanitized API instead of raw PII.

---

## Data-source options

| Option | What | When |
|---|---|---|
| **A. Live read + map (recommended v1)** | Function reads `reviews` via Admin SDK, maps through `toPublicReview()`. | MVP; reuses existing indexes. |
| **B. Precomputed `public_reviews` projection** | Sync writes a sanitized copy (public-read). API reads only that. | Scale path: cheaper reads, cleaner separation. |
| **C. Static JSON export** | Sync emits per-merchant badge JSON to Hosting/Storage. | Ratings badges / SEO blocks. |

Keep the firewall in `shared/` so B/C adopt it unchanged.

---

## Search

`search` is Phase 5. A **dormant** Algolia projection exists ([algolia-sync.ts](../../functions/src/sync/algolia-sync.ts)) — confirmed never invoked and unused by the app — but it is **only partially sanitized**: it indexes `customerName` (the `displayName`) as a *searchable* attribute. Before activation it needs a privacy pass: **drop `customerName` from the index** (or derive it via `resolveDisplayName()` and mark it non-searchable). Then activate the sync and either proxy search through `reviewsApi` or issue Algolia **search-only** keys.

---

## SEO note (confirm scope)

For **star ratings in Google results**, the site must server-render review content and emit schema.org `Review` / `AggregateRating` JSON-LD; a client-fetched widget won't be indexed. The API supplies the data; rendering must be server-side — which fits the server-only model: the site's backend fetches from the API with credentials and server-renders. Confirm whether JSON-LD is in scope before build.

---

## Phases

| Phase | Scope | Effort |
|---|---|---|
| **1 — Name rule + firewall + contract** | `resolveDisplayName()` (✅ shipped to the app in #60) promoted/shared; `PublicReview`/`PublicSummary` types + `toPublicReview()`/`toPublicSummary()` allowlist mappers (omit `display_location`/`tour_director`); unit test asserting the exact public key set. | S–M |
| **2 — Core endpoints** | `reviewsApi`: `/v1/reviews/summary/all`, `/v1/reviews/all`, `/v1/reviews/{id}` (scope-checked, uniform 404); Hosting rewrite; cache/ETag; pagination; uniform error envelope + request ids. | M |
| **3 — Auth & credentials** | `POST /v1/oauth/token`; `api_clients` model with server-generated secrets + `argon2id`/peppered-HMAC verifier; opaque-or-JWT tokens with revocation (`tokenVersion`); `apiClients` management function; `manageApiClients` permission; dashboard "API Access" UI; per-client merchant scoping, **rate-limit enforcement**, revoke/rotate. | M–L |
| **4 — Hardening + extensions** | Tighten **all five** public collections' rules; shared brand constant; `merchant_registry`; `/v1/meta/*`; `merchant_identifier=all` fan-out; **service** star distribution in sync. | M |
| **5 — Search & scale (optional)** | Privacy-pass + activate Algolia for `search`; or Option B/C. | M |

---

## Key files & changes

| File | Action | Purpose |
|---|---|---|
| `shared/src/reviews/display-name.ts` | Create | Canonical `resolveDisplayName()` (shared with the app's #60 copy) |
| `shared/src/reviews/public.ts` | Create | `PublicReview`/`PublicSummary` + allowlist mappers (omit location/tour_director) |
| `shared/src/reviews/__tests__/public.test.ts` | Create | Assert the exact public key set; no PII field serializes |
| `shared/src/feefo/brands.ts` | Create | **One exported** brand/merchant constant; replace the two private `VALID_BRANDS` |
| `shared/src/index.ts` | Modify | Re-export public mappers/types, `resolveDisplayName`, brands |
| `functions/src/api/reviews-api.ts` | Create | Param parsing, query building, fan-out for `all`, pagination, cache/ETag, error envelope, router |
| `functions/src/api/oauth.ts` | Create | Token endpoint; opaque/JWT mint+verify; constant-time secret check |
| `functions/src/api/api-clients.ts` | Create | Client CRUD (create/list/revoke/rotate); secret generation + verifier hashing |
| `functions/src/api/rate-limit.ts` | Create | Per-client token-bucket enforcement (`429` + `Retry-After`) |
| `functions/src/api/merchant-registry.ts` | Create | `merchant_identifier → { orgId, collectionPath, label }` |
| `functions/src/auth/access-control.ts` | Modify | Add `manageApiClients` permission |
| `functions/src/index.ts` | Modify | Export `reviewsApi`, `oauthToken`, `apiClients` |
| `app/src/app/admin/api-access/page.tsx` (+ component) | Create | Self-service credential UI |
| `firebase.json` | Modify | Hosting rewrite `/api/** → reviewsApi`; keep SPA fallback last |
| `firestore.rules` | Modify | `api_clients` deny-all; tighten **all five** public collections (`reviews`, `summaries`, `monthly_summaries`, `sync_meta`, `itinerary_mappings`) to `auth != null` |
| `firestore.indexes.json` | No change expected | `merchant_identifier=all` fans out over per-merchant brand-scoped queries, reusing existing indexes |
| `functions/.env.example` | Modify | `REVIEWS_API_JWT_SECRET` / `REVIEWS_API_SECRET_PEPPER` |
| `docs/feefo-api-reference.md` | Modify | Cross-link the Feefo→ours param/field/auth mapping |

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PII leak through the API | Critical | Allowlist mapper (never spread); unit test asserts the exact key set; `resolveDisplayName` shared with site; location + tour_director omitted by default |
| Client secret leakage | High | Server-generated high-entropy secrets; store only a verifier (`argon2id`/peppered-HMAC); show once; `api_clients` deny-all; signing key in Secret Manager |
| Revoked credential keeps working (JWT) | Medium | Prefer **opaque** tokens, or re-check `status`/`tokenVersion` per request; short TTL |
| `merchant_identifier=all` hits unindexed queries | Medium | Implement `all` as a per-merchant **fan-out** over existing brand-scoped indexes (no brandless composites); cap `page_size` |
| Endpoint abuse / id enumeration | Medium | Per-client rate limiting (`429`); uniform `404` for missing vs out-of-scope ids; request logging |
| Under-tightening Firestore rules | High (privacy) | Enumerate **all five** public collections explicitly in `firestore.rules` |
| Contract churn at multi-tenant | Medium | `merchant_registry` indirection keeps `/v1` stable |
| Consumers expect 1:1 Feefo parity | Low | Document every deviation (single product, synthesized `created_at`, normalized tags, `/v1/oauth/token` vs `/oauth/v2/token`, omitted location/tour_director) |

---

## Open decisions

1. **Customer-name rule:** ✅ **Resolved** — canonical `displayName || "Trusted Customer"`, `|| customer.name` fallback removed (shipped in **PR #60** via shared `resolveDisplayName()`).
2. **Auth surface:** ✅ **Resolved — server-side only.** Feefo-style `client_id`/`client_secret` → bearer token; no browser-embeddable key. Remaining sub-decision: token format — **opaque (recommended) vs JWT** — and TTL (default 1h).
3. **`display_location`:** ✅ default **omit** in v1 (the dashboard never displays customer location, so omitting matches the site rule). Open: expose later with product sign-off?
4. **`tour_director` (staff name):** ✅ default **omit** in v1 (it's a person's name). Open: expose as public metadata, or keep internal-only?
5. **Raw Feefo `tags[]`:** normalized `enrichment.attributes` only, or also retain + passthrough raw tags (needs a sync change)?
6. **Per-section `created_at`:** accept the collapsed-date approximation, or extend the sync to retain `service`/`product` timestamps separately?
7. **Hosting surface:** path-based (`/api/...` on the marketing domain) vs a dedicated `reviews-api.` subdomain.
8. **SEO scope:** is server-rendered JSON-LD in scope?

---

## Appendix — field mapping (internal → public)

| `ReviewDocument` | Public API path | Notes |
|---|---|---|
| `brand` | `merchant.identifier` | Already equals Feefo merchant id |
| `id` | `id` | Stable doc id |
| `feedbackUrl` | `url` | |
| `customer.displayName` | `customer.display_name` | via `resolveDisplayName()`; empty ⇒ `"Trusted Customer"` |
| `customer.location` | — (default) | **Omitted in v1** — the site never shows location; opt-in open decision |
| `customer.name` / `email` / `orderRef` / `customerRef` | — | **Dropped (PII).** (`name` was the value some site pages leaked as a fallback; removed in #60) |
| `ratings.service` / `ratings.product` | `service.rating.rating` / `products[0].rating.rating` | wrapped `{min:1,max:5,rating}` |
| `reviews.serviceTitle` / `serviceText` / `productText` | `service.title` / `service.review` / `products[0].review` | |
| `product.{title,sku,parentSku,url,imageUrl}` | `products[0].product.{title,sku,parent_sku,url,image_url}` | |
| `media[]` | `products[0].media[]` | `{type,url}` |
| `dates.created` / `dates.lastUpdated` | `*.created_at` / `last_updated_date` | created collapsed |
| `verified` | `verified` | Always true for synced reviews |
| `themes.{positive,negative,classifiedAt}` | `enrichment.themes.*` | **AI value-add** |
| `tags.*` (except `tourDirector`) | `enrichment.attributes.*` | snake_cased; **`tour_director` omitted in v1** (staff name — open decision) |
| `tags.tour` + `itinerary_mappings` | `enrichment.itinerary.{raw,group}` | grouping value-add |
| `hasMedia` / `hasComment` | `enrichment.flags.*` | |
| `moderationStatus` | — | Internal; all synced are `published` |
</content>
