# Feefo Review Intelligence Dashboard

Internal analytics dashboard for Uniworld and Luxury Gold guest reviews.

## Purpose

This application ingests Feefo reviews, stores normalized data in Firestore, computes fleet/ship/itinerary summaries, and provides:

- Executive overview KPIs and trends
- Itinerary and ship drill-down pages
- Reviews explorer with filters
- Admin tooling for itinerary grouping overrides

## Repository Structure

- `app/`: Next.js frontend (static export, hosted on Firebase Hosting)
- `functions/`: Firebase Cloud Functions (sync, classification orchestration, admin endpoints)
- `shared/`: Shared Feefo client/types/transforms/theme definitions used by functions and tooling
- `docs/`: API references, plans, and runbooks

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Firebase Hosting + Cloud Functions + Firestore
- Feefo API (OAuth client credentials)
- Anthropic Batch API (theme classification)
- Recharts for analytics UI

## Security Model (Current)

- Sensitive HTTP function endpoints require:
  - Firebase ID token (and optional email allowlist / admin claim), or
  - `x-sync-token` that matches server-side `SYNC_API_TOKEN`
- Firestore writes occur via Admin SDK in Cloud Functions

See [docs/security-and-access.md](/C:/projects/feefo-reviews/docs/security-and-access.md).

## Quick Start

1. Use Node 20:
```bash
nvm use 20.20.0
```

2. Install dependencies (in this order):
```bash
npm --prefix shared install
npm --prefix shared run build
node scripts/copy-shared.js
npm --prefix functions install
npm --prefix app install
```

3. Configure env files:
- `app/.env.local` from `app/.env.example`
- `functions/.env.local` from `functions/.env.example`

4. Run frontend locally:
```bash
npm --prefix app run dev
```

5. Build backend packages:
```bash
npm --prefix shared run build
node scripts/copy-shared.js
npm --prefix functions run build
```

## Deployment

See [DEPLOY.md](/C:/projects/feefo-reviews/DEPLOY.md).

## Operations

See [docs/operations-runbook.md](/C:/projects/feefo-reviews/docs/operations-runbook.md).
