# Reviews API — Postman & developer guide

A Postman collection for the public, read-only **Reviews API** described in
[docs/plans/2026-06-09-public-reviews-api.md](../plans/2026-06-09-public-reviews-api.md).

> **Status:** the API is being built against this contract. The collection
> targets the planned `/v1` endpoints so it's ready to point at the
> Functions emulator (during development) or production (once deployed).

## Files

| File | Import as |
|---|---|
| `reviews-api.postman_collection.json` | Collection |
| `reviews-api.postman_environment.json` | Environment |

## Quick start

1. In Postman: **Import** → drop both files in.
2. Select the **Uniworld Reviews API** environment (top-right).
3. Set `clientId` and `clientSecret` (from the dashboard's **API Access** page).
4. Run **Auth → Get access token**. Its test script saves `accessToken` automatically.
5. Run anything under **Reviews** / **Meta** — they inherit the bearer token.

When you get a `401`, the token expired (default 1h) — re-run **Get access token**.

### Variables

| Variable | Meaning | Example |
|---|---|---|
| `baseUrl` | API base (Hosting rewrite `/api`) | `https://feefo-reviews.web.app/api` |
| `clientId` / `clientSecret` | Your API credentials | minted in the dashboard |
| `accessToken` | Filled automatically by the token request | — |
| `merchantIdentifier` | Brand selector | `uniworld`, `luxury-gold`, `all` |

For local development against the Firebase emulator, set `baseUrl` to the
Hosting emulator (e.g. `http://127.0.0.1:5000/api`) so the `/api` rewrite
resolves to the `reviewsApi` function.

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

### Calling from the browser — three safe patterns

1. **Publishable key (recommended for on-page widgets).** Issue a *separate*,
   restricted key that is safe to embed because it is **origin-locked**
   (only works from your domains, checked via the `Origin`/`Referer` header),
   **read-only**, tightly rate-limited, and cacheable. Even if copied, it only
   works from your site. This is the Stripe *publishable key* / Algolia
   *search-only key* / Google Maps *API key* model — and Feefo's own *public
   widgets* vs its OAuth Reviews API.

2. **Backend proxy (most control, best for SEO).** Your server exposes a thin
   *same-origin* endpoint (e.g. `/api/reviews`) that calls the real API with the
   secret server-side and returns sanitized JSON. The browser never sees a
   credential; you also get server-side caching and can server-render review
   content + schema.org JSON-LD for rich snippets.

3. **Token broker.** Your server mints a short-lived, scope-limited token on
   demand and hands it to the browser. More moving parts; usually unnecessary
   when (1) or (2) suffice.

### Recommendation for this project

> Mostly server-to-server, with some client-side JS.

- **Server-to-server** → confidential client (`client_id` + `client_secret`).
  Use it from your site's backend and for partners.
- **Client-side JS / widgets / SEO** → a **publishable, origin-locked key** on
  the cached public path, *or* a **backend proxy** when you want to server-render
  for SEO.

This mirrors Feefo (OAuth API for servers + public widgets for pages) and keeps
the `client_secret` off every public surface. The publishable-key path is an
[open decision](../plans/2026-06-09-public-reviews-api.md#open-decisions) — flag
whether you want it and we'll include it in the build.
