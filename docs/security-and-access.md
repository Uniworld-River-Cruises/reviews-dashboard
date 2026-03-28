# Security and Access

## Protected HTTP Functions

These endpoints are protected in [functions/src/index.ts](/C:/projects/feefo-reviews/functions/src/index.ts):

- `manualSync`
- `batchClassify`
- `itineraryMappings`

### Allowed auth methods

1. Firebase ID token in `Authorization: Bearer <token>`
2. Shared service token in `x-sync-token` header (must match `SYNC_API_TOKEN`)

## Authorization Controls

Environment variables used by functions:

- `ADMIN_EMAILS`: comma-separated email allowlist
- `REQUIRE_ADMIN_CLAIM`: `true|false` to require Firebase custom claim `admin=true`
- `SYNC_API_TOKEN`: optional non-interactive service token

## Frontend Privileged Actions

The frontend sends Firebase ID tokens for protected operations through [app/src/lib/functions-client.ts](/C:/projects/feefo-reviews/app/src/lib/functions-client.ts).

- Refresh button triggers `manualSync`
- Admin page triggers `itineraryMappings` actions

## Firestore Access

Current Firestore rules are read-open for dashboard collections and write-deny for clients. See [firestore.rules](/C:/projects/feefo-reviews/firestore.rules).

Collections with open read include review records that may contain customer email/order references. If this dashboard is exposed beyond trusted users, tighten rules and redact sensitive fields.

## Recommended Hardening Next

1. Require Firebase auth for all client Firestore reads.
2. Remove or hash PII fields that are not required for analytics.
3. Move function access to custom claim-only authorization.
4. Add audit logging/alerts on protected endpoint calls.
