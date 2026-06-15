# Reviews API — developer guide

The public, read-only **Reviews API** is live in production. Design:
[docs/plans/2026-06-09-public-reviews-api.md](../plans/2026-06-09-public-reviews-api.md).

## Interactive reference (start here)

- **Docs / playground:** <https://feefo-reviews.web.app/api/docs> — every
  endpoint, schemas, and live *Try it out*. Click **Authorize**, enter your
  client ID + secret, and run calls right in the browser.
- **OpenAPI spec:** <https://feefo-reviews.web.app/api/v1/openapi.json> — import
  into Postman/Insomnia, or feed to `openapi-generator` for a typed client SDK.

The Postman collection below is an equivalent hand-built starting point; the
OpenAPI spec is the source of truth.

## Postman

| File | Import as |
|---|---|
| `reviews-api.postman_collection.json` | Collection |
| `reviews-api.postman_environment.json` | Environment |

## Files

| File | Import as |
|---|---|
| `reviews-api.postman_collection.json` | Collection |
| `reviews-api.postman_environment.json` | Environment |

## Quick start

1. In Postman: **Import** → drop both files in.
2. Select the **Uniworld Reviews API** environment (top-right).
3. Get credentials, either:
   - **Create them in Postman** (owners/admins): set the `syncToken` variable to
     the `SYNC_API_TOKEN` value, then run **Admin → Create API client**. Its test
     script auto-saves `clientId`/`clientSecret` into the collection — **copy the
     secret from the response to a password manager; it is shown exactly once.**
   - Or paste an existing `clientId`/`clientSecret` into the variables.
4. Run **Auth → Get access token**. Its test script saves `accessToken` automatically.
5. Run anything under **Reviews** / **Meta** — they inherit the bearer token.

When you get a `401`, the token expired (default 1h) — re-run **Get access token**.
**Admin** also has List / Rotate / Revoke; rotate and revoke kill the client's
outstanding tokens immediately.

### Variables

| Variable | Meaning | Example |
|---|---|---|
| `baseUrl` | API base (Hosting rewrite `/api`) | `https://feefo-reviews.web.app/api` |
| `clientId` / `clientSecret` | Your API credentials | minted in the dashboard |
| `accessToken` | Filled automatically by the token request | — |
| `merchantIdentifier` | Brand selector | `uniworld`, `luxury-gold`, `all` |

For local development against the Firebase emulators, point `baseUrl`
directly at the functions emulator — no Hosting emulator needed:
`http://127.0.0.1:5001/feefo-reviews/us-central1/reviewsApi`
(the router accepts paths with or without the `/api` prefix). Start the
emulators with `firebase emulators:start --only functions,firestore`, seed
data + test credentials with `node scripts/seed-emulator.js`
(`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`), and optionally run the full
contract check with `bash scripts/smoke-api.sh`.

---

## Authentication: server-side vs client-side

The API uses **OAuth 2.0 client-credentials**, exactly like Feefo: you exchange
a `client_id` + `client_secret` for a short-lived bearer token, then send
`Authorization: Bearer <token>`. This model is built for **confidential
clients** — code that can keep a secret. That has direct consequences for
*where* you can safely call it.

### Server-to-server (the safe default)

Your website's backend (a Next.js Route Handler / SSR / build step), a partner's
server, or a data pipeline holds the `client_secret` in an environment variable,
calls `POST /v1/oauth/token`, caches the token for ~1h, and calls the API. The
secret never leaves the server. This is how the dashboard already consumes Feefo
(see `shared/src/feefo/client.ts`).

### Why you can't just call it from browser JavaScript

If you ship the `client_secret` to the browser, it's trivially extractable from
DevTools / the network tab / view-source. Anyone can then mint tokens as you —
exhaust your rate limits, scrape under your identity, etc. **There is no way to
hide a secret in client-side JS.** Two more friction points: browsers enforce
**CORS** (the API must allow your origin), and **bearer-auth responses aren't
CDN-cached**, so you lose the cheap/fast edge cache.

So: never put the `client_secret` (or a long-lived token derived from it) in a
public web page.

### Calling from the browser

The decision for this project is **server-side only** — we do **not** issue a
browser-embeddable key. Front-end review data is served by **your own backend**,
not by calling this API directly from the browser:

- **Backend proxy (the pattern we use).** Your server exposes a thin
  *same-origin* endpoint (e.g. `/api/reviews`) that calls this API with the
  `client_secret` server-side and returns JSON to your front end. The browser
  never sees a credential, you get server-side caching, and it's the right place
  to server-render review content + schema.org JSON-LD for SEO.

A publishable, origin-locked key for direct browser calls (the Stripe /
Algolia / Google Maps model) is intentionally **out of scope for v1**. It could
be added later if a true on-page widget is ever needed — see the plan's
[open decisions](../plans/2026-06-09-public-reviews-api.md#open-decisions).

### Recommendation for this project

> Mostly server-to-server, with front-end needs served by your own backend.

- **Server-to-server** (your site's backend, partners, pipelines) → confidential
  client (`client_id` + `client_secret`), exactly as in this Postman collection.
- **Anything the front end needs** → route it through your backend's own
  same-origin endpoints (backend proxy), which call this API server-side.

This mirrors Feefo's own split (a server-side OAuth API; public widgets are a
separate concern) and keeps the `client_secret` off every public surface.
