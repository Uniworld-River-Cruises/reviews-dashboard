# Merchant Management & Classification Controls — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hard-coded brand/merchant configuration with a database-driven merchant directory, store Feefo OAuth credentials in Google Secret Manager, give the admin panel full visibility and control over per-merchant review sync and classification (with cost previews), and refactor the merchant selector into a searchable multi-select.

**Architecture:**
- Merchant *metadata* (id, display name, Feefo merchant identifier, enabled flag, sync/classify cutoffs, cached counts) lives in Firestore `merchants/{merchantId}`.
- Feefo `client_id` / `client_secret` for each merchant live in Google Secret Manager, named by convention (`feefo-{merchantId}-client-id`, `feefo-{merchantId}-client-secret`). Because merchant ids are dynamic, we **cannot** use `defineSecret` (which requires statically-named secrets bound at deploy time). Instead, the Functions service account is granted `roles/secretmanager.secretAccessor` and Functions read secrets at runtime via the `@google-cloud/secret-manager` SDK with an in-process cache.
- Credential lookup adapters live in `functions/` (server-only). The `shared/` package stays free of `@google-cloud/secret-manager` and Firestore Admin SDK imports so it remains usable from any runtime.
- Per-merchant classification batches replace the single global lock. Each merchant gets its own `sync_meta/batch_classify_{merchantId}` doc and can auto-chain 10K-request batches until the pending queue is drained.
- An admin merchants screen surfaces counts, oldest pending review date, estimated cost to finish, and per-merchant Classify / Pause / Enable / Disable controls.
- The header `MerchantSwitcher` becomes a searchable multi-select (with "All") backed by the Firestore merchant list.
- **URL slug vs Feefo identifier vs document id:** these are three distinct strings even though they often coincide. `id` is the Firestore doc id (used as the value stored in `reviews.brand`). `feefoMerchantIdentifier` is what Feefo accepts in API calls (may be different, e.g. `uniworld_us`). `urlSlug` is what appears in user-facing URLs (`/{urlSlug}/...`) and is set by the admin — added so the upcoming routing refactor (`/itineraries?slug=...` → `/{merchantSlug}/itineraries/{slug}`) lands cleanly without another schema change. Two merchants can share a `brandThemeId` (visual theme), but each has its own `urlSlug`. URL paths are always single-merchant.

**Tech Stack:** Firebase Functions v2 (Node 20, TypeScript — matches current `functions/package.json` `engines.node`; a Node 22 upgrade is out of scope for this plan), Firestore, Google Secret Manager (`@google-cloud/secret-manager` SDK, IAM-based access — no `defineSecret`), Next.js App Router, React, Tailwind, Anthropic Batch API (Haiku 4.5).

**Out of scope (intentionally):**
- Re-classification of already-classified reviews (one-off admin script if ever needed).
- Auto-discovery of merchants from Feefo (admins add merchants manually).
- Self-service merchant onboarding by non-admins.
- The URL/routing refactor from `/itineraries?slug=...` to `/{merchantSlug}/itineraries/{slug}` — owned by a separate plan. This plan adds the `urlSlug` *field* so the routing work can land cleanly later, but does not change any routes or add redirects for the old query-param URLs.
- Brand-neutral terminology for what the dashboard currently calls "itineraries" and "ships". Non-cruise brands offer tours/trips, not itineraries — and Feefo itself uses the term **products** for what we display. The likely direction is a global rename of "itineraries" → "products" rather than per-merchant configuration, since "products" matches the source data. Deferred to its own follow-up plan/issue (created alongside this one) because the rename touches page titles, nav labels, route segments, breadcrumbs, copy, and possibly Firestore collection naming — large enough to risk this issue's scope.
- Locale-aware date formatting. Tangential; pursued separately.

---

## Phase 0 — Discovery & Schema Lock-In

### Task 0.1: Confirm review schema fields used downstream

**Files:**
- Read: [shared/src/types/review.ts](shared/src/types/review.ts)
- Read: [shared/src/feefo/transform.ts](shared/src/feefo/transform.ts)

**Step 1: Document the existing fields the plan depends on**

Confirm in writing (in PR description, not code):
- `brand: Brand` — currently a union `"uniworld" | "luxury-gold"`. This plan widens it to `string` and removes `VALID_BRANDS` gating.
- `dates.created` / `dates.lastUpdated` — used for newest-first ordering and "oldest pending" display.
- `themes.classifiedAt` — null sentinel for unclassified.
- `hasComment` — boolean filter for classification eligibility.

No code change in this task. This is the freeze point before refactor.

### Task 0.2: Decide on naming

- **Firestore collection:** `merchants` (not `brands` — the existing `brands` collection is for visual themes and is a separate concern).
- **Field on `reviews`:** keep existing `brand` field, repurposed to hold the merchant doc `id` (`uniworld`, `trafalgar`, etc.). No new field added on reviews.
- **Three distinct merchant strings** (see architecture):
  - `id` — Firestore doc id, stored in `reviews.brand`. Slug-safe.
  - `feefoMerchantIdentifier` — what we send to Feefo. Often equals `id` but may differ.
  - `urlSlug` — public URL segment for the upcoming routing refactor. Often equals `id`, but admin can set differently. Reserved-slug + uniqueness validated.
- **Secret Manager naming:** `feefo-{id}-client-id`, `feefo-{id}-client-secret` (keyed by `id`, not `urlSlug` — secrets are infrastructure, not user-facing).

---

## Phase 1 — Firestore Merchant Schema & Backfill

### Task 1.1: Define the `Merchant` type

**Files:**
- Create: `shared/src/types/merchant.ts`
- Modify: `shared/src/index.ts` (re-export)

```typescript
// shared/src/types/merchant.ts
export interface Merchant {
  id: string;                       // Firestore doc id; used as value of reviews.brand. Lowercase, slug-safe.
  displayName: string;              // "Trafalgar"
  feefoMerchantIdentifier: string;  // What Feefo accepts as merchant_identifier (may differ from id, e.g. "uniworld_us")
  urlSlug: string;                  // Public URL segment (/{urlSlug}/...). Unique across merchants. Immutable after first save.
  enabled: boolean;                 // disabled merchants skipped by sync + UI
  syncSinceYears: number;           // how far back to pull raw reviews (default 5)
  classifySinceYears: number;       // how far back to classify with Claude (default 2)
  autoChain: boolean;               // when true, completing a classification batch immediately submits the next 10K. Default true. Per-merchant kill switch surfaced in admin UI.
  brandThemeId: string | null;      // optional FK to brand theme doc; null = default
  counts: {
    total: number;                  // total reviews stored
    classified: number;             // reviews with themes.classifiedAt != null
    pending: number;                // hasComment == true && classifiedAt == null
    pendingWithinClassifyWindow: number; // pending AND within classifySinceYears
    oldestPendingDate: string | null;    // ISO; null when pending == 0
    countsUpdatedAt: string;        // ISO timestamp of last recompute
  };
  createdAt: string;
  updatedAt: string;
}
```

**Validation rules** (enforced at write time, both in admin UI and in the `setMerchantConfig` Cloud Function):
- `id`, `urlSlug`: lowercase ASCII, alphanumeric + hyphens, 2-40 chars, must not start or end with hyphen.
- `urlSlug`: must be unique across `merchants` (Firestore query at write time).
- `urlSlug`: must not be one of the **reserved slugs**: `admin`, `api`, `_next`, `login`, `logout`, `signin`, `signout`, `settings`, `account`, `static`, `public`, `assets`, `merchants`, `themes`, `overview`. Maintained as a constant in `shared/src/types/merchant.ts` so both admin UI and server validation use the same list.
- `urlSlug` is **immutable** after first save. The admin edit dialog disables the field once `createdAt` is non-null. Rationale: changing a slug breaks any external links/bookmarks; redirect-table machinery is more complexity than it's worth for an internal admin tool.
- `feefoMerchantIdentifier`: validated by attempting an OAuth round-trip against Feefo before saving credentials (already covered by Task 2.4).

**Test:** `shared/src/types/__tests__/merchant.test.ts` — type-only file, add a compile-time assertion test that a sample object satisfies `Merchant`.

**Commit:** `feat(shared): add Merchant type`

### Task 1.2: One-time migration script — seed `merchants/uniworld` and `merchants/luxury-gold`

**Files:**
- Create: `functions/src/migrations/2026-04-30-seed-merchants.ts`
- Create: `functions/src/migrations/__tests__/2026-04-30-seed-merchants.test.ts`

**Step 1: Write the failing test** that asserts running the migration on a fresh emulator creates two docs with the expected shape and `enabled: true`.

**Step 2: Implement** — idempotent (skip if doc exists), logs to ops log, callable via a one-off `onRequest` admin endpoint guarded by `manageUsers` permission. Seed values: `urlSlug = id`, `feefoMerchantIdentifier = id`, `enabled = true`, `syncSinceYears = 5`, `classifySinceYears = 2`, `autoChain = true`, `brandThemeId = null`. Counts are populated by Task 1.3.

**Step 3: Verify** against Firestore emulator.

**Commit:** `feat(functions): seed initial merchant docs`

### Task 1.3: Backfill cached counts for existing reviews

**Files:**
- Create: `functions/src/migrations/2026-04-30-backfill-merchant-counts.ts`

The migration runs an aggregation query per merchant:
```typescript
const totalSnap = await db.collection("reviews").where("brand", "==", merchantId).count().get();
const classifiedSnap = await db.collection("reviews")
  .where("brand", "==", merchantId)
  .where("themes.classifiedAt", "!=", null)
  .count().get();
// pending + oldestPendingDate via single ordered query, limit 1
```

Writes results into `merchants/{id}.counts`.

**Test:** seed 100 reviews with mixed classification states; assert counts match.

**Commit:** `feat(functions): backfill merchant review counts`

### Task 1.4: Firestore trigger to keep counts fresh on review writes

**Files:**
- Create: `functions/src/triggers/on-review-write.ts`
- Modify: `functions/src/index.ts` (export trigger)

**Decision:** use `onDocumentWritten("reviews/{reviewId}")` and increment/decrement merchant counters transactionally based on diff between before/after snapshots. Avoids per-page `count()` queries on the admin screen.

**Normalization helper:** the trigger must treat a *missing* `themes` map (or missing `themes.classifiedAt`) as `classifiedAt == null`. The current sync writes use `merge: true` and intentionally do not overwrite the `themes` map on incremental updates ([functions/src/sync/sync-reviews.ts:134](functions/src/sync/sync-reviews.ts:134)), so existing review docs may have no `themes` field at all. A `normalizeClassification(data) -> { classifiedAt: string | null }` helper centralizes this and is the only path the trigger uses to read classification state.

**Helper — "within classify window" predicate.** The trigger needs to know whether a review is within the merchant's `classifySinceYears` window to update `pendingWithinClassifyWindow` correctly. Define `isWithinClassifyWindow(merchant, review): boolean` as `review.dates.created >= now - merchant.classifySinceYears years`. Computed at the moment of the trigger fire. If the computed cutoff drifts during the trigger run by milliseconds, that's fine — it self-corrects on the next event.

**All transition cases the test must cover (six total). Each case lists every counter it touches.**

1. **Create, hasComment true, unclassified** → `total++`, `pending++`; if `isWithinClassifyWindow` → `pendingWithinClassifyWindow++`. If `dates.created < cachedOldestPendingDate` (or cached is null) → update `oldestPendingDate` in place.
2. **Create, hasComment true, already classified** (rare, e.g. backfill writes) → `total++`, `classified++`. No change to `pending` / `pendingWithinClassifyWindow` / `oldestPendingDate`.
3. **Create, hasComment false** → `total++`. No effect on classification counters.
4. **Update: classification applied** (`classifiedAt` null → ISO) → `classified++`, `pending--`; if review was within classify window → `pendingWithinClassifyWindow--`. If this review *was* the cached oldest pending → trigger an `oldestPendingDate` recompute job.
5. **Update: `brand` field changed** (merchant reassignment, expected to be rare but possible) → decrement *all five* counters on the old merchant (`total`, `pending`/`classified`, `pendingWithinClassifyWindow` if it was in the old merchant's window) and increment on the new merchant (re-evaluate window with the new merchant's `classifySinceYears`). Recompute `oldestPendingDate` on both if affected.
6. **Delete** → mirror create logic in reverse; if review was cached oldest pending → trigger recompute. If review was within the classify window and pending → `pendingWithinClassifyWindow--`.

`oldestPendingDate` recompute is a single ordered query: `where brand == X and hasComment == true and themes.classifiedAt == null orderBy dates.created asc limit 1`. Cheap; safe to run inline rather than as a separate scheduled job, but the trigger flags it as a follow-up write to keep the main transaction small.

**Recompute on config change (NOT triggered by review writes — triggered by `setMerchantConfig` from Task 5.1b):**

`pendingWithinClassifyWindow` depends on `merchant.classifySinceYears`, so a config change has to be reflected in the cached count. When `setMerchantConfig` changes `classifySinceYears`, it enqueues a recompute that runs the aggregation:
```
where brand == X
  and hasComment == true
  and themes.classifiedAt == null
  and dates.created >= now - newClassifySinceYears years
  count
```
Result is written to `counts.pendingWithinClassifyWindow`, and `counts.countsUpdatedAt` is bumped. This is the ONLY path that writes `pendingWithinClassifyWindow` from a config change — the review-write trigger only handles per-review deltas. Without this hook, increasing the window would leave the count stale (auto-chain stops too early); decreasing the window would leave it inflated (auto-chain keeps submitting reviews that are now outside the window). Daily reconciliation (Task 7.3) is a backstop, not a substitute.

**Test:** unit-test the diff logic with all six cases; integration-test against emulator covering create + classify + delete sequence end to end.

**Commit:** `feat(functions): maintain merchant counts via trigger`

---

## Phase 2 — Secret Manager Integration

### Task 2.1: Add `@google-cloud/secret-manager` dependency

**Files:**
- Modify: `functions/package.json`

```bash
cd functions && npm install @google-cloud/secret-manager
```

**Commit:** `chore(functions): add Secret Manager SDK`

### Task 2.2: Move credential lookup to `functions/`, refactor `shared/feefo/client.ts` to inject credentials

**Why move it:** `shared/` is consumed by both server (Functions) and tooling. Importing `@google-cloud/secret-manager` and `firebase-admin/firestore` into `shared/src/feefo/client.ts` would force every consumer of `shared` to take on those server-only dependencies. Cleaner: `shared/` exposes pure HTTP/transform logic; `functions/` owns credential resolution and passes credentials in.

**Files:**
- Create: `functions/src/feefo/credentials.ts` — exports `getMerchantCredentials(merchantId)` reading from Secret Manager (`feefo-{merchantId}-client-id` / `-client-secret`) with a 10-minute in-process cache.
- Create: `functions/src/feefo/merchants.ts` — exports `getMerchantConfig(merchantId)` reading the Firestore `merchants/{id}` doc with a 5-minute in-process cache.
- Modify: [shared/src/feefo/client.ts:44-148](shared/src/feefo/client.ts:44) — remove `getBrandCredentials`, the `envMap`, and the `MERCHANT_IDENTIFIERS` table. Change `fetchReviews`, `fetchAllReviews`, `getAccessToken`, and `fetchSummary` signatures to accept `{ credentials: FeefoCredentials, merchantIdentifier: string }` rather than a `Brand` enum.

**Cache keying — single rule, applies everywhere downstream:** the in-process OAuth token cache in `shared/src/feefo/client.ts` is keyed by `merchantIdentifier` (the Feefo-side string), because that's what the OAuth call is scoped to and what callers naturally have when invoking the client. The merchant-doc cache in `functions/src/feefo/merchants.ts` and the credential cache in `functions/src/feefo/credentials.ts` are both keyed by `merchantId` (the Firestore doc id). When clearing caches after a credential rotation (Task 2.4), the caller looks up `feefoMerchantIdentifier` from the merchant doc and uses it to clear the token cache. To make this clean, `shared/src/feefo/client.ts` exposes a small `clearAccessToken(merchantIdentifier: string)` helper rather than letting callers reach into the cache map directly.
- Modify: every Functions call site (sync, summary recompute, etc.) to fetch credentials first and pass them in.

**Step 1: Write the failing test** in `functions/src/feefo/__tests__/credentials.test.ts` — mock Secret Manager; assert correct secret names are accessed and that a second call within TTL hits the cache.

**Step 2: Write the failing test** in `shared/src/feefo/__tests__/client.test.ts` — assert `fetchReviews` accepts injected credentials and works without any env vars or Secret Manager imports.

**Step 3: Implement** both files.

**Step 4: Run tests** in both packages.

**Commit (1):** `refactor(shared): inject Feefo credentials, drop env-var lookup`
**Commit (2):** `feat(functions): Secret Manager-backed merchant credentials`

### Task 2.3: Wire `defineSecret` in callers (so Functions runtime mounts secrets)

**Files:**
- Modify: `functions/src/index.ts`

Use `defineSecret` per-merchant is impossible (merchants are dynamic). Instead, grant the Functions service account `roles/secretmanager.secretAccessor` on the project and call the SDK directly inside handlers — no `defineSecret` needed. Document this in `docs/security-and-access.md`.

**Commit:** `docs: document Secret Manager IAM setup for Feefo credentials`

### Task 2.4: Admin endpoint to set merchant credentials

**Files:**
- Create: `functions/src/admin/set-merchant-credentials.ts`
- Modify: `functions/src/index.ts` (export `setMerchantCredentials` HTTP function)

**Behavior:**
- POST `{ merchantId, clientId, clientSecret }`.
- Auth: requires `manageUsers` permission (the existing top-tier admin gate; rename to `manageMerchants` in a follow-up if we want finer-grained).

**Validation flow (this is order-sensitive — do NOT short-circuit):**

1. **Validate using the supplied credentials directly.** Call the *pure* shared Feefo client (the post-Task-2.2 version that accepts injected credentials) with `{ clientId, clientSecret }` from the POST body. **Do not** route through `getMerchantCredentials(merchantId)` — that adapter reads existing Secret Manager values and may also serve from the 10-minute in-process cache, both of which would validate the *old* credentials, not the ones being submitted.
2. **Two-step Feefo check.**
   a. OAuth round-trip: prove `clientId` + `clientSecret` are valid.
   b. Merchant-scoped probe: with the access token, call a cheap merchant-scoped endpoint (e.g. `GET /api/20/reviews/summary/all?merchant_identifier={feefoMerchantIdentifier}` from the merchant doc). OAuth success alone does not prove the doc's `feefoMerchantIdentifier` is correct — different Feefo accounts can hold the same OAuth client but expose different merchants. If the probe returns 0 reviews / 404 / wrong identifier, return 400 with a clear message.
3. **Only on both checks passing:** `createSecret` if missing, `addSecretVersion` for `feefo-{merchantId}-client-id` and `feefo-{merchantId}-client-secret`.
4. **Invalidate caches after a successful write.** Two caches need clearing, with different keys (per the rule in Task 2.2):
   - **Credential cache** (`functions/src/feefo/credentials.ts`) keyed by `merchantId` — clear by `merchantId`.
   - **OAuth token cache** (`shared/src/feefo/client.ts`) keyed by `merchantIdentifier` — clear via `clearAccessToken(merchant.feefoMerchantIdentifier)`. The handler must read the merchant doc to get the identifier.

   Both clears are small in-process map writes — no cross-instance broadcast needed at our scale. (If we later go multi-region or scale to many warm instances, revisit; until then a stale cached token in another instance will simply expire within `expires_in` and pull the new credentials on next refresh.)
5. **Write an operation log entry** with `merchantId`, `actorEmail`, `secretVersion` (returned from Secret Manager), and **no** secret values.

**Test cases:**
- Wrong client id/secret → 400, no Secret Manager write, no cache clear.
- Right OAuth + wrong merchant identifier → 400, no write, no cache clear.
- Both correct → secret version written; cache invalidation observed (next `getMerchantCredentials` call hits Secret Manager, not the cache).
- Concurrent writes from two admins → both succeed (Secret Manager versions); last-write-wins for the cache.

**Commit:** `feat(functions): admin endpoint to set Feefo credentials`

### Task 2.5: Migrate the two existing brands from env vars to Secret Manager

**Files:**
- Add a one-off script: `functions/scripts/migrate-existing-secrets.ts`
- Modify: `.github/workflows/firebase-deploy.yml` — remove the `FEEFO_*` env writes once verified.

**Step 1: Run** the script locally with the current env vars set, which calls Secret Manager to seed the existing four secrets.
**Step 2: Verify** via `gcloud secrets versions list`.
**Step 3: Deploy** a build that no longer reads env vars.
**Step 4: Remove** secrets from GitHub and the deploy workflow.

**Commit (1 of 2):** `feat: migrate existing Feefo creds to Secret Manager`
**Commit (2 of 2):** `chore(ci): remove Feefo env vars from deploy workflow`

---

## Phase 3 — Dynamic Merchant Sweep + Index Rollout

### Task 3.0: Inventory all hard-coded `uniworld` / `luxury-gold` references and required indexes

**Why first:** before refactoring sync, we need a complete picture of every code path that gates on the two-brand union and every Firestore query whose shape will change. Missing one means new merchants will sync but disappear from summaries, mappings, or filters.

**Inventory targets (results go in the PR description, not committed):**
- `grep -rn "uniworld\|luxury-gold" functions/ shared/ app/` — confirmed call sites in [functions/src/index.ts](functions/src/index.ts) at lines 46, 293-294, 352-353, 379-380, 481-502, 516-524 cover: `VALID_BRANDS` validation, `computeSummaries` calls in scheduled & manual sync, `sync_meta` lock resets, `rebuildItineraryMappings`, and itinerary mapping admin endpoints. Add any others surfaced.
- `grep -rn "VALID_BRANDS\|isValidBrand" functions/ shared/` — find every gate.
- Firestore query inventory: list every place `where("brand", "==", ...)` is combined with `where("dates.*")`, `where("themes.*")`, `where("hasComment", ...)`, `where("ratings.*")`, or `orderBy("dates.*")`. Each unique combination is a candidate composite index.
- `firestore.indexes.json` audit — list current indexes; diff against the new requirements.

**Output:** a checklist in the PR description with:
- All literal-brand call sites to refactor (each becomes a one-line entry in Task 3.1+).
- All composite indexes to add (Task 3.4).

**Commit:** none — this is research feeding the rest of the phase.

### Task 3.1: Drop the `Brand` union; rename to `MerchantId` everywhere

**Files:**
- Modify: [shared/src/feefo/types.ts:123](shared/src/feefo/types.ts:123)
- Modify: [shared/src/feefo/transform.ts:5](shared/src/feefo/transform.ts:5)
- Modify: [functions/src/sync/sync-reviews.ts](functions/src/sync/sync-reviews.ts)
- Modify: every other call site (find via `grep -rn "Brand[^A-Za-z]" shared/ functions/ app/`)

**Step 1: Define the new type.** Replace
```ts
export type Brand = "uniworld" | "luxury-gold";
```
with
```ts
export type MerchantId = string;
/** @deprecated Use MerchantId. Kept for one transitional commit so call sites can be renamed in a focused diff. */
export type Brand = MerchantId;
```
The alias keeps the rename mechanical — the next commit is a project-wide find-replace from `Brand` to `MerchantId`. Removing the alias is the final step in this task.

**Step 2: Find-replace `Brand` → `MerchantId`** across `shared/`, `functions/`, and `app/`. Type imports, parameter names, generic parameters. Rename `brand` *parameter* names to `merchantId` only when it improves clarity locally; the `brand` *field* on `reviews` documents stays (renaming a Firestore field would require a backfill that's out of scope).

**Step 3: Remove the `VALID_BRANDS` gate** in `transformReview` and validate against the `merchants/{id}` doc instead (caller fetches once per sync run and passes the validated id).

**Step 4: Delete the `Brand` alias.** Last commit of the task.

**Test:** existing `transform.test.ts` expectations updated to allow arbitrary merchant ids.

**Commits:**
1. `refactor(shared): introduce MerchantId, alias Brand for transition`
2. `refactor: rename Brand → MerchantId across codebase`
3. `refactor(shared): drop deprecated Brand alias`

### Task 3.2: Sweep hard-coded brand call sites in `functions/src/index.ts`

**Two distinct merchant-set queries — pick the right one per call site:**

| Helper | Returns | Use for |
|---|---|---|
| `listEnabledMerchants()` | `merchants where enabled == true` | Scheduled syncs, scheduled classification candidates, the default behaviour of "loop over merchants" in batch operations. |
| `isKnownMerchant(id)` | `merchants/{id}` exists (any `enabled` value) | Validation of a `merchantId` query param on admin endpoints — admins must still be able to act on a *disabled* merchant (recompute summaries, clean up mappings, inspect state, force a one-off sync). Disabling a merchant only stops *automatic* operations against it. |
| `listAllMerchants()` | every doc in `merchants` | Admin merchants screen, operational tooling that surfaces disabled merchants alongside enabled ones. |

Disabling a merchant means "skip from scheduled work and from the user-facing multi-select", **not** "lose access to". An admin opening the merchants screen still sees disabled merchants and can re-enable them or run one-off operations.

**Files (all in [functions/src/index.ts](functions/src/index.ts)):**

Replace each of the following per the rule above:

- **Line 46-49** — delete `VALID_BRANDS` and `isValidBrand`. Replace with `isKnownMerchant(merchantId): Promise<boolean>` reading the merchants collection (cached). Use this for query-param validation everywhere `isValidBrand` was used.
- **Line 293-294 (scheduled sync summary recompute)** — loop with `listEnabledMerchants()`.
- **Line 352-353 (sync lock reset error path)** — read merchant ids dynamically; reset lock for every merchant whose sync was attempted in *this* run (track in-process), not via a fresh query. Don't accidentally clear locks for merchants that weren't being synced.
- **Line 379-380 (manual sync summary recompute)** — when no `brand` arg is supplied, loop with `listEnabledMerchants()`. When a specific `brand` is supplied, validate via `isKnownMerchant` and recompute even if disabled (admin operation).
- **Line 481-502 (itinerary mappings: rebuild + name-fix)** — `brand` query param validation goes through `isKnownMerchant`. The rebuild-all path uses `listEnabledMerchants()`; explicit per-merchant rebuild proceeds even on disabled merchants.
- **Line 516-524 (manual summary recompute endpoint)** — same pattern.

Each replacement is a small, isolated diff. Group by handler and commit per handler so reviewers can follow.

**Tests:** existing tests stay green; add one new emulator test that registers a third merchant and verifies the scheduled sync handler computes summaries for all three.

**Commits (one per handler):**
- `refactor(functions): scheduled sync iterates merchants collection`
- `refactor(functions): manual sync iterates merchants collection`
- `refactor(functions): itinerary mappings iterate merchants collection`
- `refactor(functions): summary recompute iterates merchants collection`
- `refactor(functions): drop VALID_BRANDS in favor of merchants collection`

### Task 3.3: Sync orchestrator iterates `merchants` collection

**Files:**
- Modify: `functions/src/sync/sync-reviews.ts`
- Modify: `functions/src/index.ts` (the sync HTTP handler and the scheduled job)

**Behavior changes:**
- The scheduled sync queries `merchants where enabled == true` and runs `syncBrand` for each (sequentially today, parallel later if needed).
- `syncBrand` accepts `merchantId: string` and reads the merchant doc to get `syncSinceYears`. **Cutoff enforcement (paginate-and-stop):** Feefo's `since_period` only supports `month | year | all` — there is no `since_date` parameter. So we always request `since_period=all` and walk pages newest-to-oldest, breaking out of the pagination loop as soon as we encounter a review whose `last_updated_date` is older than `now - syncSinceYears`. This costs extra Feefo round-trips on the first full sync of a long-history merchant but gives us an exact, per-merchant cutoff. Subsequent incremental syncs stop early because new reviews are always within the window.
- Lock doc moves from `sync_meta/{brand}` to `sync_meta/sync_{merchantId}` (avoid collision with future sync_meta keys).

**Test:** integration test against emulator with two seeded merchants — verify each runs and writes the correct merchant scope.

**Commit:** `feat(functions): sync iterates Firestore merchant list`

### Task 3.4: Deploy composite indexes BEFORE switching production query paths

**Why this is its own task:** Firestore rejects queries that hit a missing composite index with a runtime error. If we land the per-merchant classification query (Task 4.1) before the index is built, the production cron will start erroring within the hour. Indexes can take **minutes to tens of minutes** to build on large collections. Sequence: index commit → wait for build → query commit.

**Files:**
- Modify: `firestore.indexes.json`

**Indexes to add (final list comes from Task 3.0 inventory; expected minimum):**
- `reviews`: `brand ASC, hasComment ASC, themes.classifiedAt ASC, dates.created DESC` — supports the per-merchant classification query (Task 4.1).
- `reviews`: `brand ASC, hasComment ASC, themes.classifiedAt ASC, dates.created ASC` — supports the `oldestPendingDate` recompute (Task 1.4).
- Any additional indexes flagged by the Task 3.0 inventory for multi-merchant `IN` queries combined with date/theme/tag filters.

**Steps:**
1. Add indexes to `firestore.indexes.json`.
2. Commit and deploy with `firebase deploy --only firestore:indexes` only — do not deploy functions or app code in this commit.
3. Wait for Firebase console to show all indexes as **Enabled** (not "Building").
4. Only then proceed to Phase 4.

**Commit:** `chore(firestore): add composite indexes for per-merchant queries`

---

## Phase 4 — Per-Merchant Classification with Auto-Chain

### Task 4.0: `batchId → merchantId` reverse lookup

**Why:** once batches are per-merchant, `processBatchResults(batchId)` and the scheduled `runClassificationAutomation` need to know which merchant a returning Anthropic batch belongs to so they update the correct lock doc, write the correct counts, and trigger the right auto-chain follow-up. The current code stores the batch id in a single global doc — that breaks the moment two merchants have batches in flight.

**Files:**
- Modify: `functions/src/sync/batch-classify.ts`

**Decision:** maintain a small reverse-lookup collection `batches/{batchId}`.

**Why this can't be a single transaction:** the `batchId` is only known *after* Anthropic's API returns. So writes around it have to span the API call. The implementation is a three-step sequence with explicit rollback on failure:

**Step A — Reserve the per-merchant submission lock (Firestore transaction).**
Set `sync_meta/batch_classify_{merchantId}` to `{ status: "submitting", submissionLockToken, submissionLockExpiresAt }`. Same shape as the existing global lock, just per-merchant. If the doc already shows an active batch or live submission lock, abort with `acquired: false` (existing behavior in `batch-classify.ts:37`).

**Step B — Call Anthropic.**
Outside the transaction. On HTTP error, jump to Step D.

**Step C — Commit `{ merchantId, batchId }` mapping (Firestore transaction).**
On Anthropic success, run a single transaction that writes BOTH:
- `sync_meta/batch_classify_{merchantId}` ← `{ status: <Anthropic processing_status>, batchId, submittedAt, totalRequests, submissionLockToken: null, submissionLockExpiresAt: null }`.
- `batches/{batchId}` ← `{ merchantId, submittedAt, status: <Anthropic processing_status>, terminalAt: null }`.

Both docs land atomically; downstream pollers can resolve in either direction.

**Step D — Rollback on failure.**
If Step B failed, clear the submitting lock so a retry can acquire it: set `sync_meta/batch_classify_{merchantId}` to `{ status: "error", errorMessage, submissionLockToken: null, submissionLockExpiresAt: null }`. Mirror the existing error path in `batch-classify.ts:218`.

**Resolution paths:**
- `processBatchResults(batchId)` reads `batches/{batchId}` to resolve `merchantId`, then writes results scoped to that merchant.
- The HTTP endpoint accepts either `{ batchId }` (resolves merchant from the lookup doc) or `{ merchantId }` (reads the per-merchant lock to get current `batchId`) — never both. Reject ambiguous calls with 400.

**Retention of `batches/{batchId}` after terminal state:**
Don't delete eagerly. When a batch reaches a terminal state (`complete`, `ended_no_results`, `error`), set `terminalAt: <now>` on the doc but leave it in place. A scheduled function `cleanupTerminalBatches` (runs daily) deletes docs where `terminalAt < now - 30d`. Rationale: retries, manual debugging, and operation-log correlation all benefit from being able to resolve a `batchId` for some time after the batch ends. 30 days is arbitrary but generous; tune later if storage becomes a concern.

**Test:**
- Unit: resolution in both directions, ambiguous-input 400.
- Unit: rollback path leaves the lock in `error` state with no `batchId`.
- Integration: two merchants submit concurrently; each resolves to its own `merchantId` on poll. Cleanup job deletes only docs older than the TTL.

**Commit:** `feat(functions): batchId↔merchantId reverse lookup with rollback and TTL`

### Task 4.1: Move batch lock from global to per-merchant

**Files:**
- Modify: [functions/src/sync/batch-classify.ts:33](functions/src/sync/batch-classify.ts:33)

Lock doc path: `sync_meta/batch_classify_{merchantId}`.

`submitClassificationBatch` gains a `merchantId` argument. The unclassified query becomes:

```typescript
db.collection("reviews")
  .where("brand", "==", merchantId)
  .where("hasComment", "==", true)
  .where("themes.classifiedAt", "==", null)
  .where("dates.created", ">=", classifyCutoffISO)
  .orderBy("dates.created", "desc")  // newest first per user requirement
  .limit(BATCH_SIZE);
```

(Requires a composite index — add to `firestore.indexes.json`.)

**Test:** existing `batch-classify` tests refactored to pass `merchantId`; add a test that two merchants can hold locks concurrently without contention.

**Commit:** `feat(functions): per-merchant classification locks`

### Task 4.2: Auto-chain — kick off the next batch when one ends

**Files:**
- Modify: `functions/src/index.ts` (the `processBatchResults` post-completion hook)

**Behavior:** after `processBatchResults` writes results and sets status to `complete`, if the merchant's `pendingWithinClassifyWindow` count is still > 0 *and* the merchant's `autoChain` flag is true (default true), immediately call `submitClassificationBatch(merchantId)` to start the next 10K.

A merchant-level kill switch (`autoChain: false`) lets admins pause without disabling the merchant.

**Test:** simulate a 25K-pending merchant; assert three batches are submitted in sequence as each completes.

**Commit:** `feat(functions): auto-chain classification batches per merchant`

### Task 4.3: Cost preview API

**Files:**
- Create: `functions/src/admin/estimate-classification-cost.ts`
- Modify: `functions/src/index.ts` (export `estimateClassificationCost`)

**Behavior:**
- POST `{ merchantId }` returns `{ pendingCount, estimatedInputTokens, estimatedOutputTokens, estimatedUsd }`.
- Sample N=200 pending reviews per merchant, count tokens (use `@anthropic-ai/sdk` token counter or a cheap heuristic: `chars / 3.5`), extrapolate to the full pending count.
- Apply Haiku 4.5 batch pricing constants (define in `functions/src/admin/pricing.ts` so they're easy to update). Document the source URL in a comment.

**Test:** unit-test the math with stubbed token counts.

**Commit:** `feat(functions): classification cost estimator`

---

## Phase 5 — Admin Merchants Screen

### Task 5.1: Merchants list endpoint

**Files:**
- Create: `functions/src/admin/list-merchants.ts`
- Modify: `functions/src/index.ts`

Returns the full `merchants` collection plus computed fields (`hasCredentials: boolean` — derived by attempting `secretManager.access` for `feefo-{id}-client-id`). Auth: admin only.

**Commit:** `feat(functions): list-merchants admin endpoint`

### Task 5.1b: `setMerchantConfig` create/update endpoint

**Why this task exists:** Task 1.1 references "validation enforced in `setMerchantConfig`" and Task 5.2's admin dialog calls a server endpoint to save merchant metadata, but no earlier task actually defines or exports that Cloud Function. This task fills that gap.

**Files:**
- Create: `functions/src/admin/set-merchant-config.ts`
- Modify: `functions/src/index.ts` (export `setMerchantConfig` HTTP function)

**Behavior:**
- `POST { merchantId, config: Partial<Merchant> }` — single endpoint handles both create and update; the handler reads `merchants/{merchantId}` to decide.
- Auth: same admin gate as `setMerchantCredentials` (`manageUsers` for now; rename to `manageMerchants` later if we split).

**Validation rules (server-side authoritative — admin UI mirrors but does not replace):**
- On **create**: all required fields present (`id`, `displayName`, `feefoMerchantIdentifier`, `urlSlug`); `id` matches the URL `merchantId` param; `urlSlug` not in the reserved-slug constant from `shared/src/types/merchant.ts`; `urlSlug` unique across `merchants` (Firestore `where("urlSlug", "==", x).limit(1)` check inside a transaction with the write).
- On **update**: reject any change to `id`, `urlSlug`, or `feefoMerchantIdentifier` once `createdAt` is set (slug-immutability rule from Task 1.1). Return 400 with a clear message — don't silently drop the field.
- `syncSinceYears`, `classifySinceYears`: positive integers, max 20 (sanity cap).
- `enabled`, `autoChain`: booleans.
- `brandThemeId`: must be null or reference an existing `brands/{id}` doc.

**Side effects on update:**
- If `classifySinceYears` changed, schedule a recompute of `counts.pendingWithinClassifyWindow` and `counts.oldestPendingDate` for that merchant (cross-references Task 1.4 trigger logic — see the new "Recompute on config change" section there).
- Bump `updatedAt = now`. On create, set `createdAt = updatedAt = now`.
- Write an operation log entry (`type: "admin"`, `action: "merchant_config_set"`, includes the diff, omits no values since metadata isn't sensitive).

**Test cases:**
- Create with reserved slug → 400.
- Create duplicating an existing `urlSlug` → 400 (and the transactional check works under concurrent writes — two simultaneous creates with the same slug must not both succeed).
- Update changing `urlSlug` after `createdAt` is set → 400.
- Update with `classifySinceYears` change → recompute scheduled (verify by checking the merchant's `counts.countsUpdatedAt` advances).
- Non-admin caller → 403.

**Commit:** `feat(functions): setMerchantConfig admin endpoint`

### Task 5.2: Merchants screen UI

**Files:**
- Create: `app/src/app/(admin)/admin/merchants/page.tsx`
- Create: `app/src/components/admin/MerchantsTable.tsx`
- Create: `app/src/components/admin/MerchantRow.tsx`
- Create: `app/src/components/admin/MerchantEditDialog.tsx`
- Create: `app/src/components/admin/MerchantCredentialsDialog.tsx`
- Modify: `app/src/components/admin/AdminNav.tsx` (add link)

**Columns:** Display name | Reviews | Classified | Pending | Oldest pending | Est. cost to finish | Status (enabled / paused / no creds) | Actions (Edit, Set credentials, Classify all, Pause, Disable)

**Empty state:** "No merchants yet — add one to start syncing."

**"Add merchant" CTA:** opens `MerchantEditDialog` with fields for **id**, **display name**, **Feefo merchant identifier**, **URL slug** (defaults to id, editable on create), **sync window**, **classify window**, **brand theme** (optional). Inline validation enforces the rules from Task 1.1: lowercase/alphanumeric/hyphen, length, not in the reserved-slug list, not duplicating an existing merchant's `urlSlug`. Submit-time uniqueness check happens server-side too.

**Edit-existing-merchant dialog:** same fields but `id`, `urlSlug`, and `feefoMerchantIdentifier` are read-only. Slug immutability is enforced by both the disabled UI input and a server-side check that rejects writes that change `urlSlug` after `createdAt` is set.

**"Set credentials" dialog:** id + secret fields, both `type="password"`, never echoed back from the server. Submit calls `setMerchantCredentials`. Surfaces the Feefo validation error if creds are wrong.

**Cost preview:** triggered on demand by clicking the "Est. cost to finish" cell — fires `estimateClassificationCost` and shows a tooltip / inline result. Don't run on page load (it costs API calls per merchant).

**Note (Next.js):** before writing any of this, the engineer must read [node_modules/next/dist/docs/](node_modules/next/dist/docs/) per `app/AGENTS.md` — this Next.js has breaking changes from training data.

**Test:** Playwright test against a seeded admin user that adds a merchant, sets fake creds (validation fails — expected), then sets correct mock creds and triggers a classify.

**Commit:** `feat(app): admin merchants management screen`

### Task 5.3: Wire Classify / Pause buttons

**Files:**
- Modify: `app/src/lib/functions-client.ts` (add typed wrappers)

Buttons call `batchClassify({ action: "submit", merchantId })` and toggle `autoChain` via a new `setMerchantAutoChain` admin endpoint (Task 4.2 added the field; this task adds the toggle endpoint).

**Commit:** `feat(app): merchant classify and pause controls`

---

## Phase 6 — Merchant Selector Refactor (Multi-Select)

**Scope rule — multi-select applies to overview/list views only.** Detail pages (a single review, a single product/itinerary, a single ship) always represent one merchant. When the user navigates from a list view into a detail page, the selector visually collapses to the single merchant carried by the page context. This matches Feefo's data model where each review belongs to exactly one merchant + one product, and avoids the impossible state of a multi-merchant detail URL. Concretely:

| View | Selector behaviour | URL state — today (this issue) | URL state — future (post-routing-refactor, [#49](https://github.com/Uniworld-River-Cruises/reviews-dashboard/issues/49)) |
|---|---|---|---|
| Executive dashboard, themes, reviews list | Multi-select active; up to 10 ids or "All" | `?merchants=a,b,c` (or `?merchants=all`) | Same — overview routes stay query-param driven |
| Single product / itinerary / ship / review detail | Selector shows the path's / page's merchant; cannot multi-select from this page | `?slug=...&merchant=X` (existing query-param routing — extend to carry `merchant`) | `/{urlSlug}/products/{productSlug}` (or whatever #49 lands on) |
| Admin merchants table | Always shows every merchant (admin scope) | `/admin/merchants` | unchanged |

When a user clicks a row on a list view to navigate into a detail page, the multi-select state is cleared and replaced by the single merchant the row belongs to. The browser back-button restores the prior multi-select. **For this issue's scope:** the detail page reads its merchant from a `merchant` query param (added to the existing route shape); the path-based form is a future-compatibility note and is not implemented here.

### Task 6.1: New `MerchantMultiSelect` component

**Files:**
- Create: `app/src/components/layout/MerchantMultiSelect.tsx`
- Modify: `app/src/contexts/BrandContext.tsx` — `activeMerchant` becomes `activeMerchants: string[]` (`["all"]` represents the all-merchants state).
- Modify: every consumer of `activeMerchant` (find via `grep -r activeMerchant app/src`) — most read it for query filtering; update to `merchantId IN activeMerchants` Firestore queries.

**Selection cap:** company has ~16 merchants total. The multi-select hard-caps at 10 chosen items (Firestore `IN` limit). "Select all" is a separate state — it issues queries scoped to **all enabled merchants visible to the current tenant** rather than packing all ids into an `IN`. The popover disables remaining checkboxes once 10 are selected and shows "Use 'Select all' to include every merchant."

**Theme-scoped "Select all":** "Select all" scopes to merchants where `enabled == true AND brandThemeId == <currently-active theme id>`. This is a **UI scoping mechanism**, not access control — `brandThemeId` is a visual theme FK and two unrelated merchants could legitimately share a theme. If true tenant isolation becomes a requirement (different customer accounts not seeing each other's data), that's a separate change introducing a `tenantId` field with appropriate Firestore security rules; do not retrofit `brandThemeId` for that purpose.

**Reading the active theme id from `BrandContext` — current shape vs target shape:** the existing context ([`app/src/contexts/BrandContext.tsx`](app/src/contexts/BrandContext.tsx)) exposes `brand: BrandTheme` with a `brand.id` field; there is **no separate `brandThemeId` property** today. For this issue, the sentinel resolves to `BrandContext.brand.id`. If a future change splits the brand-theme concept from the active-tenant concept, it should add a dedicated `brandThemeId` (and possibly `tenantId`) to the context — that is *not* this issue's scope.

**Implementation:** client passes either an explicit list of merchant ids (≤10) *or* a sentinel `{ allInActiveTheme: true, brandThemeId: BrandContext.brand.id }` to query helpers; helpers translate the sentinel into the theme-scoped query at the data layer, not in UI components.

**UX:**
- Trigger button shows "All merchants" or "3 merchants" or the single label.
- Popover with: search box, "Select all" / "Clear" buttons, alphabetized list of enabled merchants with checkboxes.
- Selection persists in URL (`?merchants=trafalgar,uniworld`) so dashboards stay shareable.

**Replace:** [app/src/components/layout/MerchantSwitcher.tsx](app/src/components/layout/MerchantSwitcher.tsx) — delete after all callers migrate.

**Test:** Vitest component test for selection state + URL sync; visual diff via Playwright.

**Commit (1):** `feat(app): MerchantMultiSelect component`
**Commit (2):** `refactor(app): activeMerchant -> activeMerchants[] across consumers`
**Commit (3):** `chore(app): remove deprecated MerchantSwitcher`

---

## Phase 7 — Verification & Rollout

### Task 7.1: End-to-end smoke test

Add a third test merchant (e.g., `insight-vacations`) on staging:
1. Create merchant via admin UI.
2. Set credentials.
3. Trigger a sync — verify reviews appear in Firestore with `brand: "insight-vacations"`.
4. Trigger Classify all — verify the batch runs and auto-chains until pending = 0.
5. Disable merchant — verify it disappears from `MerchantMultiSelect`.

### Task 7.2: Index verification (deployment happens earlier in Task 3.4)

- Confirm all indexes added in Task 3.4 are still **Enabled** in the Firebase console after the full rollout.
- Document the index → query mapping in `docs/operations-runbook.md` for future debugging.

### Task 7.3: Monitoring

- Add a scheduled function `recomputeMerchantCountsDaily` as a backstop in case the trigger drifts (idempotent recompute, runs 03:00 UTC).
- Add a Cloud Logging metric on `batch_submit_failed` op log entries.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Trigger-driven counts drift on bulk writes | Daily reconciliation job (Task 7.3). |
| Secret Manager API quota under heavy traffic | In-process cache (Task 2.2); secrets read at most once per 10 min per cold start. |
| Composite index build time on production reviews collection | Build the index *before* shipping query changes; Firestore rejects queries that hit a missing index, so deploy the index commit first. |
| Cost estimator under-counts (token heuristic too rough) | Sample size 200 + show "± 20%" range in UI. |
| 10-item Firestore `IN` cap when many merchants selected | Company has ~16 merchants total, so multi-select is capped at 10 in the UI. "Select all" bypasses the `IN` filter by issuing the theme-scoped all-merchants query (Phase 6 sentinel `{ allInActiveTheme: true, brandThemeId }`), not an unfiltered reviews query. |
| Two admins set credentials simultaneously | Secret Manager handles versioning; last write wins, both versions retained. |

---

## Definition of Done

- [ ] Adding a new merchant via the admin UI takes < 2 minutes (display name, Feefo creds, save).
- [ ] No Feefo credentials exist in environment variables, GitHub secrets, or git history (post-rotation).
- [ ] Admin merchants screen shows accurate counts and an oldest-pending date for every merchant.
- [ ] Cost preview returns within 5 seconds for a merchant with 100K pending.
- [ ] Auto-chain classify drains a 25K pending queue end-to-end without admin intervention when `merchant.autoChain == true`.
- [ ] Toggling `autoChain` to false on the admin screen halts further submissions for that merchant within one batch cycle without affecting other merchants.
- [ ] `MerchantMultiSelect` works with 1, 2, 10, and 25 merchants.
- [ ] Existing Uniworld and Luxury Gold dashboards function identically post-migration (regression tested).
- [ ] All new endpoints are admin-gated; Secret Manager IAM is documented.
