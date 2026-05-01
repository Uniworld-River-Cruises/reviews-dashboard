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

**Tech Stack:** Firebase Functions v2 (Node 20, TypeScript — matches current `functions/package.json` `engines.node`; a Node 22 upgrade is out of scope for this plan), Firestore, Google Secret Manager (`@google-cloud/secret-manager` SDK, IAM-based access — no `defineSecret`), Next.js App Router, React, Tailwind, Anthropic Batch API (Haiku 4.5).

**Out of scope (intentionally):**
- Re-classification of already-classified reviews (one-off admin script if ever needed).
- Auto-discovery of merchants from Feefo (admins add merchants manually).
- Self-service merchant onboarding by non-admins.

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
- **Field on `reviews`:** keep existing `brand` field, repurposed to hold the Feefo merchant identifier (`uniworld`, `trafalgar`, etc.). No new field added.
- **Secret Manager naming:** `feefo-{merchantId}-client-id`, `feefo-{merchantId}-client-secret`. IDs are slug-safe (lowercase, alphanumeric + hyphen).

---

## Phase 1 — Firestore Merchant Schema & Backfill

### Task 1.1: Define the `Merchant` type

**Files:**
- Create: `shared/src/types/merchant.ts`
- Modify: `shared/src/index.ts` (re-export)

```typescript
// shared/src/types/merchant.ts
export interface Merchant {
  id: string;                       // slug, matches Feefo merchant_identifier
  displayName: string;              // "Trafalgar"
  feefoMerchantIdentifier: string;  // Feefo URL slug, often === id
  enabled: boolean;                 // disabled merchants skipped by sync + UI
  syncSinceYears: number;           // how far back to pull raw reviews (default 5)
  classifySinceYears: number;       // how far back to classify with Claude (default 2)
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

**Test:** `shared/src/types/__tests__/merchant.test.ts` — type-only file, add a compile-time assertion test that a sample object satisfies `Merchant`.

**Commit:** `feat(shared): add Merchant type`

### Task 1.2: One-time migration script — seed `merchants/uniworld` and `merchants/luxury-gold`

**Files:**
- Create: `functions/src/migrations/2026-04-30-seed-merchants.ts`
- Create: `functions/src/migrations/__tests__/2026-04-30-seed-merchants.test.ts`

**Step 1: Write the failing test** that asserts running the migration on a fresh emulator creates two docs with the expected shape and `enabled: true`.

**Step 2: Implement** — idempotent (skip if doc exists), logs to ops log, callable via a one-off `onRequest` admin endpoint guarded by `manageUsers` permission.

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

**All transition cases the test must cover (six total):**
1. **Create, hasComment true, unclassified** → `total++`, `pending++`. If `dates.created < cachedOldestPendingDate` (or cached is null) → update `oldestPendingDate` in place.
2. **Create, hasComment true, already classified** (rare, e.g. backfill writes) → `total++`, `classified++`. No change to `oldestPendingDate`.
3. **Create, hasComment false** → `total++`. No effect on `pending` or `classified`.
4. **Update: classification applied** (`classifiedAt` null → ISO) → `classified++`, `pending--`. If this review *was* the cached oldest pending → trigger a recompute job for `oldestPendingDate` (don't try to find the new oldest incrementally).
5. **Update: `brand` field changed** (merchant reassignment, expected to be rare but possible) → decrement old merchant's counters, increment new merchant's counters; recompute `oldestPendingDate` on both if affected.
6. **Delete** → mirror create logic in reverse; if review was cached oldest pending → trigger recompute.

`oldestPendingDate` recompute is a single ordered query: `where brand == X and hasComment == true and themes.classifiedAt == null orderBy dates.created asc limit 1`. Cheap; safe to run inline rather than as a separate scheduled job, but the trigger flags it as a follow-up write to keep the main transaction small.

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
- Modify: [shared/src/feefo/client.ts:44-148](shared/src/feefo/client.ts:44) — remove `getBrandCredentials`, the `envMap`, and the `MERCHANT_IDENTIFIERS` table. Change `fetchReviews`, `fetchAllReviews`, `getAccessToken`, and `fetchSummary` signatures to accept `{ credentials: FeefoCredentials, merchantIdentifier: string }` rather than a `Brand` enum. The token cache key becomes `merchantIdentifier`.
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
- Creates the secret if missing, adds a new version if it exists. Uses `SecretManagerServiceClient.createSecret` + `addSecretVersion`.
- Validates the credentials by performing a `getAccessToken` round-trip against Feefo before storing — if Feefo rejects, return 400 and don't write.
- Writes an entry to operation logs (without the secret values).

**Test:** mock Secret Manager + Feefo; assert validation-failure path doesn't write.

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

Replace `export type Brand = "uniworld" | "luxury-gold"` with `export type Brand = string` (kept for now to minimize churn) — or rename to `MerchantId` across the codebase. The plan recommends renaming; one large find-replace commit is cleanest.

Remove the `VALID_BRANDS` gate in `transformReview` and validate against the `merchants/{id}` doc instead (caller fetches once per sync run and passes the validated id).

**Test:** existing `transform.test.ts` expectations updated to allow arbitrary merchant ids.

**Commit:** `refactor(shared): allow arbitrary merchant ids`

### Task 3.2: Sweep hard-coded brand call sites in `functions/src/index.ts`

**Files (all in [functions/src/index.ts](functions/src/index.ts)):**

Replace each of the following with iteration over `merchants where enabled == true`:

- **Line 46-49** — delete `VALID_BRANDS` and `isValidBrand`. Replace with `isKnownMerchant(merchantId): Promise<boolean>` reading the merchants collection (cached).
- **Line 293-294 (scheduled sync summary recompute)** — loop over enabled merchants instead of two literal calls.
- **Line 352-353 (sync lock reset error path)** — read merchant ids dynamically; reset lock for every merchant whose sync was attempted in this run, not the two literals.
- **Line 379-380 (manual sync summary recompute)** — same pattern as scheduled.
- **Line 481-502 (itinerary mappings: rebuild + name-fix)** — `brand` query param validation goes through `isKnownMerchant`; the rebuild loop iterates the merchants collection when no brand is specified.
- **Line 516-524 (manual summary recompute endpoint)** — same.

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

**Decision:** maintain a small reverse-lookup collection.

When a batch is submitted, write **two** docs in the same transaction:
- `sync_meta/batch_classify_{merchantId}` — per-merchant lock and current state (status, batchId, submittedAt). Existing shape, scoped per merchant.
- `batches/{batchId}` — `{ merchantId, submittedAt, status }`. Cleaned up (deleted) when the batch reaches a terminal state.

`processBatchResults(batchId)` reads `batches/{batchId}` first to resolve `merchantId`, then proceeds with merchant-scoped writes. The HTTP endpoint accepts either `{ batchId }` (resolves merchant from the lookup doc) or `{ merchantId }` (uses that merchant's current `batchId` from the lock doc) — never both. Reject ambiguous calls with 400.

**Test:** unit-test resolution in both directions; integration-test that two merchants submitting concurrently each resolve correctly on poll.

**Commit:** `feat(functions): batchId↔merchantId reverse lookup for classification`

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

**"Add merchant" CTA:** opens `MerchantEditDialog` with fields for id, display name, Feefo merchant identifier, sync window, classify window.

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

### Task 6.1: New `MerchantMultiSelect` component

**Files:**
- Create: `app/src/components/layout/MerchantMultiSelect.tsx`
- Modify: `app/src/contexts/BrandContext.tsx` — `activeMerchant` becomes `activeMerchants: string[]` (`["all"]` represents the all-merchants state).
- Modify: every consumer of `activeMerchant` (find via `grep -r activeMerchant app/src`) — most read it for query filtering; update to `merchantId IN activeMerchants` Firestore queries.

**Selection cap:** company has ~16 merchants total. The multi-select hard-caps at 10 chosen items (Firestore `IN` limit). "Select all" is a separate state — it issues queries scoped to **all enabled merchants visible to the current tenant** rather than packing all ids into an `IN`. The popover disables remaining checkboxes once 10 are selected and shows "Use 'Select all' to include every merchant."

**Tenant scoping for "Select all":** the dashboard already has tenant/brand-theme concepts via `BrandContext` and `brandThemeId` on the merchant doc. "Select all" must scope to merchants where `enabled == true AND brandThemeId == currentTenant.brandThemeId` (or `brandThemeId IS NULL` if the current tenant is the default). This keeps the door open for adding a second tenant later without retroactively leaking data across tenants. Implementation: client passes either an explicit list of merchant ids (≤10) *or* a sentinel `{ allForTenant: true, brandThemeId }` to query helpers; helpers translate the sentinel into the tenant-scoped query at the data layer, not in UI components.

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
| 10-item Firestore `IN` cap when many merchants selected | Company has ~16 merchants total, so multi-select is capped at 10 in the UI. "Select all" bypasses the `IN` filter entirely (issues an unfiltered query). |
| Two admins set credentials simultaneously | Secret Manager handles versioning; last write wins, both versions retained. |

---

## Definition of Done

- [ ] Adding a new merchant via the admin UI takes < 2 minutes (display name, Feefo creds, save).
- [ ] No Feefo credentials exist in environment variables, GitHub secrets, or git history (post-rotation).
- [ ] Admin merchants screen shows accurate counts and an oldest-pending date for every merchant.
- [ ] Cost preview returns within 5 seconds for a merchant with 100K pending.
- [ ] Auto-chain classify drains a 25K pending queue end-to-end without admin intervention.
- [ ] `MerchantMultiSelect` works with 1, 2, 10, and 25 merchants.
- [ ] Existing Uniworld and Luxury Gold dashboards function identically post-migration (regression tested).
- [ ] All new endpoints are admin-gated; Secret Manager IAM is documented.
