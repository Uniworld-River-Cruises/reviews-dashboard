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

Copy [functions/.env.example](/C:/projects/feefo-reviews/functions/.env.example) to `functions/.env.local` and fill values.

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

## Rollback

- Functions: redeploy previous revision from CI artifact or previous commit.
- Hosting: redeploy a prior commit's `app/out`.
- Firestore rules/indexes: redeploy known-good versions from git history.
