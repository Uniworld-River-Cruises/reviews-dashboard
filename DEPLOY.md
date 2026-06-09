# Deployment Guide (Firebase Hosting + Cloud Functions)

This project deploys to Firebase, not GitHub Pages.

## Prerequisites

- Node.js 20.x (use `nvm use 20.20.0`)
- `firebase-tools` CLI
- Access to Firebase project `feefo-reviews`

## 1) Install Dependencies

Run these from repository root (order matters because `functions` depends on generated `functions/shared-lib`):

```bash
npm --prefix shared install
npm --prefix shared run build
node scripts/copy-shared.js
npm --prefix functions install
npm --prefix app install
```

## 2) Configure Environment

### Frontend

Copy [app/.env.example](/C:/projects/feefo-reviews/app/.env.example) to `app/.env.local` and fill values.

### Functions

For local emulation, copy [functions/.env.example](/C:/projects/feefo-reviews/functions/.env.example) to `functions/.env.local` and fill values.

For production deploys, Firebase Functions loads dotenv files from `functions/.env` plus project-specific files such as `functions/.env.feefo-reviews`.

Minimum required for sync:

- `FEEFO_UNIWORLD_CLIENT_ID`
- `FEEFO_UNIWORLD_CLIENT_SECRET`
- `FEEFO_LUXURY_GOLD_CLIENT_ID`
- `FEEFO_LUXURY_GOLD_CLIENT_SECRET`
- `ADMIN_EMAILS`

Recommended for protected service-to-service calls:

- `SYNC_API_TOKEN`

## 3) Deploy Firestore Rules + Indexes

```bash
firebase deploy --only firestore
```

## 4) Deploy Functions

```bash
firebase deploy --only functions
```

Notes:

- Predeploy step automatically builds `shared`, copies `shared/dist` into `functions/shared-lib`, and builds `functions`.
- If building functions locally outside `firebase deploy`, run:
  - `npm --prefix shared run build`
  - `node scripts/copy-shared.js`
  - `npm --prefix functions run build`
- Function endpoints `manualSync`, `batchClassify`, and `itineraryMappings` now require auth.

## 5) Build + Deploy Hosting

```bash
npm --prefix app run build
firebase deploy --only hosting
```

Hosting serves static export from `app/out` as configured in [firebase.json](/C:/projects/feefo-reviews/firebase.json).

## 6) Post-Deploy Smoke Checks

- Open deployed dashboard URL.
- Sign in from header auth button.
- Trigger `Refresh` (manual sync).
- Verify admin page can rebuild/recompute mappings.
- Confirm `sync_meta` updates in Firestore.

## GitHub Actions Production Deploys

This repository now includes [firebase-deploy.yml](/C:/projects/feefo-reviews/.github/workflows/firebase-deploy.yml), which deploys Firebase Hosting and Cloud Functions automatically on pushes to `main`.

Set these GitHub Actions secrets before enabling the workflow:

- `FIREBASE_SERVICE_ACCOUNT_FEEFO_REVIEWS`
  Use a Google Cloud service account key JSON with permission to deploy Hosting and Functions for the `feefo-reviews` project.
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `FEEFO_UNIWORLD_CLIENT_ID`
- `FEEFO_UNIWORLD_CLIENT_SECRET`
- `FEEFO_LUXURY_GOLD_CLIENT_ID`
- `FEEFO_LUXURY_GOLD_CLIENT_SECRET`

Optional GitHub Actions secrets:

- `ADMIN_EMAILS`
- `SYNC_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `ALGOLIA_APP_ID`
- `ALGOLIA_ADMIN_KEY`
- `REQUIRE_ADMIN_CLAIM`
- `REVIEWS_API_SECRET_PEPPER`
  Required for the public reviews API (`reviewsApi` / `apiClients` functions):
  a long random value (32+ chars) used to HMAC API client secret verifiers.
  Without it the token endpoint returns 500 `not_configured`. Rotating it
  invalidates every existing API client secret.

The workflow writes:

- `app/.env.local` for the static frontend build
- `functions/.env.feefo-reviews` for the production Firebase Functions deploy

You can also run the same workflow manually with `workflow_dispatch` from the Actions tab.

### Secret Value Mapping

Use this mapping when filling GitHub Actions secrets:

- `FIREBASE_SERVICE_ACCOUNT_FEEFO_REVIEWS`
  Value: the full JSON contents of a Google Cloud service account key for a deployer account in project `feefo-reviews`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
  Value: Firebase Console > Project settings > Your apps > Web app > `apiKey`
- `FEEFO_UNIWORLD_CLIENT_ID`
  Value: Uniworld Feefo API OAuth client ID
- `FEEFO_UNIWORLD_CLIENT_SECRET`
  Value: Uniworld Feefo API OAuth client secret
- `FEEFO_LUXURY_GOLD_CLIENT_ID`
  Value: Luxury Gold Feefo API OAuth client ID
- `FEEFO_LUXURY_GOLD_CLIENT_SECRET`
  Value: Luxury Gold Feefo API OAuth client secret
- `ADMIN_EMAILS`
  Value: optional legacy fallback allowlist for backend admin/sync endpoints. Prefer the Firestore `admin_users` collection for runtime access control instead of storing a changing user list in GitHub.
- `SYNC_API_TOKEN`
  Value: a long random shared token used only for non-interactive service-to-service calls. This is optional if all admin/sync actions come from signed-in users in the web app.
- `ANTHROPIC_API_KEY`
  Value: Anthropic API key, only if batch classification is enabled
- `ALGOLIA_APP_ID`
  Value: Algolia application ID, only if Algolia sync/search is enabled
- `ALGOLIA_ADMIN_KEY`
  Value: Algolia admin API key, only if Algolia sync/search is enabled
- `REQUIRE_ADMIN_CLAIM`
  Value: `true` or `false`

## Rollback

- Functions: redeploy previous revision from CI artifact or previous commit.
- Hosting: redeploy a prior commit's `app/out`.
- Firestore rules/indexes: redeploy known-good versions from git history.
