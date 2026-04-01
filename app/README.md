# Frontend App (`app/`)

Next.js frontend for the Feefo dashboard.

## Requirements

- Node.js 20.x (required)
- `app/.env.local` configured from [app/.env.example](/C:/projects/feefo-reviews/app/.env.example)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

This project uses static export (`next.config.ts` has `output: "export"`), generating `app/out` for Firebase Hosting.

## Auth + Protected Actions

- Header includes sign-in/sign-out control.
- Sign-in uses Microsoft 365 accounts via Firebase OAuth provider (`microsoft.com`).
- Refresh/admin actions call Cloud Functions with Firebase ID token in `Authorization` header.
- If user is not signed in (or not allowlisted server-side), protected actions fail with 401/403.

## Important UI Routes

- `/` Overview
- `/itineraries` Itinerary list and detail (`?slug=...`)
- `/ships` Ship list and detail (`?slug=...`)
- `/reviews` Reviews explorer
- `/admin` Itinerary grouping admin
