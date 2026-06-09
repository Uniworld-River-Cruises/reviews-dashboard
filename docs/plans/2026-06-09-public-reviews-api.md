# Public Reviews API — Recommendation & Design

**Date:** 2026-06-09
**Status:** Proposed (recommendation)
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
4. **Authenticate Feefo-style:** dashboard users self-mint `client_id` + `client_secret`; consumers exchange them at `POST /v1/oauth/token` for a bearer token. (See [Authentication](#authentication--api-credentials).)
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

You asked that the API enforce the **exact** name rules the website uses: show the customer's name when the site shows it, show "Trusted Customer" when the site does. The wrinkle is that **the site is not internally consistent today**:

| Surface | Rule today | Leaks raw `name`? |
|---|---|---|
| Reviews Explorer, `ReviewCard`, Export, Overview panels | `displayName \|\| "Trusted Customer"` | No |
| Itinerary pages ([itinerary-queries.ts:355,531](../../app/src/lib/firestore/itinerary-queries.ts)), Ship pages ([ship-queries.ts:391,562](../../app/src/lib/firestore/ship-queries.ts)) | `displayName \|\| customer.name \|\| "Trusted Customer"` (one uses `"Guest"`) | **Yes** |

The itinerary/ship surfaces fall back to the unmasked `customer.name`. That is almost certainly unintended: Feefo's `display_name` is the reviewer's **consent-approved** public name (often a full name when they opted in); the raw `name` is the unmasked record value and is not meant for public display. This is a latent privacy issue **independent of this API**.

### The fix: one shared rule, used by site and API

Centralize the rule so the two can never drift:

```ts
// shared/src/reviews/display-name.ts
export function resolveDisplayName(customer: { displayName?: string | null }): string {
  return customer.displayName?.trim() || "Trusted Customer";
}
```

- The **website** refactors all surfaces ([queries.ts](../../app/src/lib/firestore/queries.ts), [reviews/page.tsx](../../app/src/app/reviews/page.tsx), [itinerary-queries.ts](../../app/src/lib/firestore/itinerary-queries.ts), [ship-queries.ts](../../app/src/lib/firestore/ship-queries.ts), [ExportButton.tsx](../../app/src/components/reviews/ExportButton.tsx)) to call this, **dropping the `|| customer.name` fallback** and standardizing the placeholder to "Trusted Customer".
- The **API** calls the same function for `customer.display_name`.

Result: the API returns precisely what the site shows. When a reviewer consented (so `display_name` exists, possibly a full name), that name flows through — matching your requirement. When they didn't, both show "Trusted Customer". The raw `name` flows **nowhere**.

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
      display_location: d.customer.location,          // Feefo-public city/region
      // d.customer.name / email / orderRef / customerRef are NEVER mapped
    },
    service: /* {min,max,rating}, title, review, created_at */,
    products: [ /* single product: rating, review, media, product{...}, created_at */ ],
    last_updated_date: d.dates.lastUpdated,
    verified: d.verified,
    enrichment: { themes, attributes, itinerary, flags },  // see below
  };
}
```

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
| `GET /v1/reviews/all` | `GET /20/reviews/all` | Bearer (or public path) | Paginated, filtered review list |
| `GET /v1/reviews/summary/all` | `GET /20/reviews/summary/all` | Bearer (or public path) | Aggregate ratings + star distribution |
| `GET /v1/reviews/{id}` | *(none)* | Bearer (or public path) | Single review — permalinks / SEO |
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
      "customer": { "display_name": "Jane D.", "display_location": "London, UK" },
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
          "ship": "S.S. Beatrice", "tour": "Enchanting Danube", "tour_director": "Markus W.",
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

**Design notes:** single `products[]` element (our model collapses to one product); `rating` objects synthesize `{min:1,max:5,rating}`; `created_at` maps from `dates.created` (per-section precision would need a sync change); raw Feefo `tags[]` are exposed normalized under `enrichment.attributes` (raw passthrough is an [open decision](#open-decisions)).

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
    "service": { "count": 1760, "5_star": 1480, "4_star": 200, "3_star": 50, "2_star": 18, "1_star": 12 }
  },
  "enrichment": {
    "scope": "fleet", "reviews_with_comments": 1203,
    "top_positive_themes": [ { "theme": "Staff", "count": 980 } ],
    "top_negative_themes": [ { "theme": "Value", "count": 88 } ],
    "ships": ["S.S. Beatrice"], "itineraries": ["Enchanting Danube"]
  }
}
```

> **Star-distribution caveat:** `compute-summaries.ts` currently builds `starDistribution` from the **product** rating only. Serve `product` now; populating `service` needs a small sync addition. Until then emit `product` and null `service` rather than faking it.

---

## Authentication & API credentials

**Model: OAuth 2.0 client-credentials, mirroring Feefo.** Feefo issues a `client_id` + `client_secret` and you exchange them at `POST /oauth/v2/token` for a short-lived bearer token — see our own consumer implementation in [`shared/src/feefo/client.ts`](../../shared/src/feefo/client.ts). We emulate that flow exactly so a partner who has integrated Feefo can reuse their code against us by changing only the base URL and credentials.

### Credential model — server-side only

A single **confidential client**: `client_id` + `client_secret` → bearer token, for the website's backend, partners, and data pipelines. The secret always stays server-side; we do **not** issue a browser-embeddable key.

**Front-end access** is handled on the consumer's side: the website's own backend exposes thin, same-origin endpoints that call this API server-side and return JSON to its front end (the "backend proxy" pattern). That keeps the secret off every public surface, lets the consumer cache and shape responses, and is the right place to server-render review HTML + JSON-LD for SEO.

**Postman** is itself a confidential client — it holds the credentials locally, performs the token exchange, and sends the bearer token — so the server-only model works in Postman with no special handling. See [`docs/api/`](../api/README.md).

### Self-service creation in the dashboard

Add an **"API Access"** area under admin/settings:

- An owner/admin clicks **Create API client**, gives it a label and a **merchant scope** (which `merchant_identifier`s it may read), and receives `client_id` + `client_secret`. **The secret is shown once**; only a hash is stored.
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
{ "access_token": "<JWT>", "token_type": "Bearer", "expires_in": 3600 }
```

- Look up the client, verify `status: "active"`, **constant-time** compare the secret against the stored hash.
- Mint a short-lived signed **JWT** (HS256 via a Secret Manager key, or RS256) with claims `{ sub: clientId, merchants: [...], scopes: [...], exp }`.
- Response mirrors Feefo's `{ access_token, expires_in }` exactly. (Implementation: add `jose`/`jsonwebtoken`, or self-sign with Node `crypto` HMAC — no new dep.)

### Authenticated requests

```http
GET /api/v1/reviews/all?merchant_identifier=uniworld
Authorization: Bearer <access_token>
```

`reviewsApi` verifies the JWT signature + expiry, then checks that the requested `merchant_identifier` ∈ `token.merchants` and that scope allows `reviews:read`. A client scoped to `luxury-gold` cannot read `uniworld`.

### Firestore model

```
api_clients/{clientId}
  clientId    : string            // public id, e.g. "uw_live_a1b2c3"
  secretHash  : string            // sha256/bcrypt of the secret (shown to user once)
  label       : string            // "Marketing website (prod)"
  merchants   : string[]          // allowed identifiers, or ["*"]
  scopes      : string[]          // ["reviews:read","summary:read"]
  status      : "active"|"revoked"
  createdBy   : string            // dashboard uid/email
  createdAt, lastUsedAt
  rateLimitTier? : string
  orgId?      : string            // multi-tenant future
```

Rules: `allow read, write: if false` — Admin SDK only; secrets are never client-readable (mirrors the roadmap's `credentials` subcollection). Signing key lives in Secret Manager / functions env as `REVIEWS_API_JWT_SECRET`.

### Caching (server-side)

Bearer-auth responses aren't CDN-cached, so caching lives with the consumer: the calling backend caches the bearer token (~1h) and the review payloads (e.g. Next.js fetch revalidation), while aggregate reads stay cheap because `/v1/reviews/summary/all` comes from the precomputed `summaries` collection. We still send `Cache-Control` + `ETag` so any shared HTTP cache the consumer runs can honour them.

Credentials buy us per-consumer **analytics, revocation, rate-limit tiers, and brand scoping** — and keep metering/monetization open later.

---

## Brand / merchant support

`merchant_identifier` maps directly to `ReviewDocument.brand` (identical values), validated against `VALID_BRANDS` ([index.ts](../../functions/src/index.ts)); filtering is an indexed `where("brand","==",…)`. `merchant_identifier=all` fans out and merges (the dashboard's "combined" logic). Every request is additionally constrained to the **caller's credential `merchants` scope**.

**Forward-compatible with multi-tenant:** a `merchant_registry/{merchant_identifier} → { orgId, collectionPath, label }` resolver keeps the API merchant-centric (Feefo-style) even after data moves to `organizations/{orgId}/reviews` — the `/v1` contract never changes, only the resolver does. API clients gain an `orgId` and belong to one org.

---

## Pagination

Support both, honestly: **`page`/`page_size`** for Feefo familiarity and shallow paging (`summary.meta` returns `{count,pages,page_size,current_page}`, `count` via a cheap `getCountFromServer` aggregate), and an opaque **`cursor`/`next_cursor`** for efficient deep iteration and full exports (preferred past the first few pages, since Firestore offset paging re-reads skipped docs).

---

## Caching, CORS & methods

- **Caching:** responses carry `Cache-Control` + `ETag`; the consuming backend does the real caching (token + payloads). Aggregates are cheap (precomputed `summaries`), and data changes only every ~2h, so generous TTLs are safe.
- **CORS:** not required for server-to-server callers (CORS is a browser concern), so it stays off by default. Any browser access goes through the consumer's own same-origin backend, never directly here.
- **Methods:** `POST` for the token endpoint, `GET` elsewhere (405 otherwise).

---

## Security tie-in

Standing up the sanitized API is the moment to fix the open-rules exposure flagged in [`docs/security-and-access.md`](../../docs/security-and-access.md): the function reads via the Admin SDK (bypasses rules), so we can tighten [`firestore.rules`](../../firestore.rules) `reviews` (and other dashboard collections) from `allow read: if true` to `allow read: if request.auth != null` — matching the roadmap's legacy-collection rules. Public consumers use the sanitized API instead of raw PII.

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

`search` is Phase 5. A **dormant**, already-PII-stripped Algolia projection exists ([algolia-sync.ts](../../functions/src/sync/algolia-sync.ts)) but is never invoked and unused by the app. If needed, activate that sync and either proxy search through `reviewsApi` or issue Algolia **search-only** keys.

---

## SEO note (confirm scope)

For **star ratings in Google results**, the site must server-render review content and emit schema.org `Review` / `AggregateRating` JSON-LD; a client-fetched widget won't be indexed. The API supplies the data; rendering must be server-side. Confirm before build — it shapes whether the site consumes the **credentialed server path** (recommended for SEO) vs a browser widget.

---

## Phases

| Phase | Scope | Effort |
|---|---|---|
| **1 — Name rule + firewall + contract** | `resolveDisplayName()` in `shared/`; refactor all app surfaces to use it (drop `\|\| name` fallback on itinerary/ship); `PublicReview`/`PublicSummary` types + `toPublicReview()`/`toPublicSummary()`; unit tests asserting PII never serializes. | S–M |
| **2 — Core endpoints** | `reviewsApi`: `/v1/reviews/summary/all`, `/v1/reviews/all`, `/v1/reviews/{id}`; Hosting rewrite; cache/ETag; pagination. | M |
| **3 — Auth & credentials** | `POST /v1/oauth/token`; `api_clients` model + hashing + JWT mint/verify; `apiClients` management function; `manageApiClients` permission; dashboard "API Access" UI; per-client merchant scoping + revoke/rotate. | M–L |
| **4 — Hardening + extensions** | Tighten Firestore rules; `merchant_registry`; `/v1/meta/*`; `merchant_identifier=all`; service-star distribution in sync. | M |
| **5 — Search & scale (optional)** | Activate Algolia for `search`; or Option B/C. | M |

---

## Key files & changes

| File | Action | Purpose |
|---|---|---|
| `shared/src/reviews/display-name.ts` | Create | `resolveDisplayName()` — single source of truth for the name rule |
| `shared/src/reviews/public.ts` | Create | `PublicReview`/`PublicSummary` + allowlist mappers |
| `shared/src/reviews/__tests__/public.test.ts` | Create | Assert no PII field serializes; name parity with the site rule |
| `shared/src/index.ts` | Modify | Re-export public mappers/types + `resolveDisplayName` |
| `app/src/lib/firestore/{queries,itinerary-queries,ship-queries}.ts` | Modify | Use `resolveDisplayName`; **remove `\|\| customer.name` fallback** |
| `app/src/app/reviews/page.tsx`, `app/src/components/reviews/ExportButton.tsx` | Modify | Use `resolveDisplayName` |
| `functions/src/api/reviews-api.ts` | Create | Param parsing, query building, pagination, cache headers, router |
| `functions/src/api/oauth.ts` | Create | Token endpoint; JWT mint/verify; constant-time secret check |
| `functions/src/api/api-clients.ts` | Create | Client CRUD (create/list/revoke/rotate), secret hashing |
| `functions/src/api/merchant-registry.ts` | Create | `merchant_identifier → { orgId, collectionPath, label }` |
| `functions/src/auth/access-control.ts` | Modify | Add `manageApiClients` permission |
| `functions/src/index.ts` | Modify | Export `reviewsApi`, `oauthToken`, `apiClients` |
| `app/src/app/admin/api-access/page.tsx` (+ component) | Create | Self-service credential UI |
| `firebase.json` | Modify | Hosting rewrite `/api/** → reviewsApi`; keep SPA fallback last |
| `firestore.rules` | Modify | `api_clients` deny-all to clients; tighten `reviews` to `auth != null` |
| `firestore.indexes.json` | Modify | Brand-less attribute/date indexes for `merchant_identifier=all` |
| `functions/.env.example` | Modify | `REVIEWS_API_JWT_SECRET`, `REVIEWS_API_ALLOWED_ORIGINS` |
| `docs/feefo-api-reference.md` | Modify | Cross-link the Feefo→ours param/field/auth mapping |

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PII leak through the API | Critical | Allowlist mapper (never spread); unit test asserts forbidden keys absent; `resolveDisplayName` shared with site |
| Existing itinerary/ship pages already render raw names | High (privacy) | Fix as Phase 1 (drop `\|\| name`); ship before the API launches |
| Client secret leakage | High | Store only a hash; show secret once; `api_clients` deny-all client reads; signing key in Secret Manager |
| Auth breaks CDN caching | Medium | Consumer-side caching for credentialed path; publishable-key/public cached path for browser/SEO |
| `merchant_identifier=all` hits unindexed queries | Medium | Pre-create composite indexes; cap `page_size`; prefer cursor |
| Contract churn at multi-tenant | Medium | `merchant_registry` indirection keeps `/v1` stable |
| Consumers expect 1:1 Feefo parity | Low | Document every deviation (single product, synthesized `created_at`, normalized tags, `/v1/oauth/token` vs `/oauth/v2/token`) |

---

## Open decisions

1. **Customer-name rule (needs a call):** confirm the canonical rule is `displayName \|\| "Trusted Customer"` everywhere and that we **remove the `\|\| customer.name` fallback** on itinerary/ship pages. (Recommended — it's a privacy fix regardless of the API.)
2. **Auth surface:** ✅ **Resolved — server-side only.** Feefo-style `client_id`/`client_secret` → bearer token; no browser-embeddable key. Front-end access goes through the consumer's own same-origin backend endpoints. Remaining sub-decision: token TTL (default 1h) and JWT vs opaque token.
3. **`display_location`:** keep Feefo's city/region (it treats it as public) or drop for extra caution?
4. **Raw Feefo `tags[]`:** normalized `enrichment.attributes` only, or also retain + passthrough raw tags (needs a sync change)?
5. **Per-section `created_at`:** accept the collapsed-date approximation, or extend the sync to retain `service`/`product` timestamps separately?
6. **Hosting surface:** path-based (`/api/...` on the marketing domain) vs a dedicated `reviews-api.` subdomain.
7. **SEO scope:** is server-rendered JSON-LD in scope?

---

## Appendix — field mapping (internal → public)

| `ReviewDocument` | Public API path | Notes |
|---|---|---|
| `brand` | `merchant.identifier` | Already equals Feefo merchant id |
| `id` | `id` | Stable doc id |
| `feedbackUrl` | `url` | |
| `customer.displayName` | `customer.display_name` | via `resolveDisplayName()`; empty ⇒ `"Trusted Customer"` |
| `customer.location` | `customer.display_location` | Public-safe |
| `customer.name` / `email` / `orderRef` / `customerRef` | — | **Dropped (PII).** `name` is the value some site pages currently leak as a fallback — to be removed |
| `ratings.service` / `ratings.product` | `service.rating.rating` / `products[0].rating.rating` | wrapped `{min:1,max:5,rating}` |
| `reviews.serviceTitle` / `serviceText` / `productText` | `service.title` / `service.review` / `products[0].review` | |
| `product.{title,sku,parentSku,url,imageUrl}` | `products[0].product.{title,sku,parent_sku,url,image_url}` | |
| `media[]` | `products[0].media[]` | `{type,url}` |
| `dates.created` / `dates.lastUpdated` | `*.created_at` / `last_updated_date` | created collapsed |
| `verified` | `verified` | Always true for synced reviews |
| `themes.{positive,negative,classifiedAt}` | `enrichment.themes.*` | **AI value-add** |
| `tags.*` | `enrichment.attributes.*` | snake_cased |
| `tags.tour` + `itinerary_mappings` | `enrichment.itinerary.{raw,group}` | grouping value-add |
| `hasMedia` / `hasComment` | `enrichment.flags.*` | |
| `moderationStatus` | — | Internal; all synced are `published` |
</content>
