# Security and Access

## Protected HTTP Functions

These endpoints are protected in [functions/src/index.ts](/C:/projects/feefo-reviews/functions/src/index.ts):

- `manualSync`
- `batchClassify`
- `itineraryMappings`
- `adminLogs`
- `adminUsers`
- `apiClients` (public-reviews-API credential management — `manageApiClients` permission)

### Allowed auth methods

1. Firebase ID token in `Authorization: Bearer <token>`
2. Shared service token in `x-sync-token` header (must match `SYNC_API_TOKEN`)

## Authorization Controls

Environment variables used by functions:

- `ADMIN_EMAILS`: comma-separated email allowlist (legacy fallback; prefer the
  Firestore `admin_users` collection)
- `REQUIRE_ADMIN_CLAIM`: `true|false` to require Firebase custom claim `admin=true`
- `SYNC_API_TOKEN`: optional non-interactive service token
- `REVIEWS_API_SECRET_PEPPER`: HMAC pepper for public-API client secret verifiers

## Public Reviews API

The public reviews API (`reviewsApi`) is a separate, bearer-token-authenticated
surface that serves a **sanitized projection** of review data (no customer
name/email/order refs — see `toPublicReview()` in `shared/`). Credentials are
OAuth client-credentials managed from the dashboard's Admin → API Access page.
Design: [docs/plans/2026-06-09-public-reviews-api.md](/C:/projects/feefo-reviews/docs/plans/2026-06-09-public-reviews-api.md).

## Frontend Privileged Actions

The frontend sends Firebase ID tokens for protected operations through
[app/src/lib/functions-client.ts](/C:/projects/feefo-reviews/app/src/lib/functions-client.ts).

- Refresh button triggers `manualSync`
- Admin page triggers `itineraryMappings` / `adminUsers` / `adminLogs` actions
- Admin → API Access triggers `apiClients` actions

## Firestore Access

[firestore.rules](/C:/projects/feefo-reviews/firestore.rules) (hardened in Phase 4):

- Dashboard collections (`reviews`, `summaries`, `monthly_summaries`,
  `sync_meta`, `itinerary_mappings`): **read requires a signed-in user**
  (`request.auth != null`); all client writes denied. Review documents carry
  customer PII, so they are no longer world-readable — unauthenticated
  consumers use the sanitized public API instead.
- API credential collections (`api_clients`, `api_tokens`, `api_rate_limits`):
  deny-all to client SDKs; Admin SDK (Cloud Functions) only.
- Everything else: deny-all catch-all.

All Firestore writes occur via the Admin SDK in Cloud Functions, which bypasses
these rules; the dashboard only reads after `AuthGate` completes sign-in
(verified: no client Firestore read exists outside the authenticated subtree).

CI deploys rules and indexes together with functions/hosting
(`firebase deploy --only functions,hosting,firestore`).

Rules enforcement is exercised against the emulator suite by
[scripts/smoke-rules.sh](/C:/projects/feefo-reviews/scripts/smoke-rules.sh)
(unauthenticated reads denied; signed-in reads allowed; credential store sealed
even for signed-in users; client writes denied).

## Hardening Status (from the original review)

1. ~~Require Firebase auth for all client Firestore reads~~ — **done (Phase 4)**.
2. Remove or hash PII fields that are not required for analytics — open; the
   public API already excludes them via the allowlist mapper, and no dashboard
   surface renders them (`resolveDisplayName`).
3. Move function access to custom claim-only authorization — open
   (`REQUIRE_ADMIN_CLAIM` exists but is opt-in).
4. Audit logging on protected endpoint calls — partial: `operation_logs`
   records sync/classification/summary/apiClient actions with actor identity.
