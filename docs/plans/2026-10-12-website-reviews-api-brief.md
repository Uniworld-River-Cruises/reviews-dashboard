# Make the public reviews API serve the new uniworld website (replies, locations, trip summaries, totals, approval queue)

**Repo:** `C:\projects\feefo-reviews` (GitHub, deploys to Firebase on merge to `main`, PR-gated)
**Branch:** none yet; start one from `origin/main`. **Status:** brief only, no code written (2026-10-12).

## Context
The new uniworld website (`C:\projects\uniworld-journeys`, Sitecore 8.2, ASP.NET MVC on .NET Framework 4.6.1, AWS) calls
Feefo's public API directly today, from `src/Uniworld.Website/Areas/Uniworld/Controllers/JourneysReviewsController.cs`
in that repo (branch `feature/journeys-venue-cards`). Matt (2026-10-12) wants it to read from this project's API instead:
we own the data, it carries the AI themes, and reviews can be approved for the website here. The site switches over once
this work is live; its views stay as they are. Two uses, plus one new one:
1. **Itinerary reviews drawer** (`JourneysReviewsController.Drawer`, uniworld-journeys `:46`): one trip by Feefo
   `parent_product_sku` (the itinerary code, e.g. `176`). Today it calls Feefo `summary/product` (`:264`), then loads
   up to 4,000 reviews (`:278`) and sorts newest, oldest, highest or lowest in memory (`:57`).
2. **Brand block on Guest Stories** (`JourneysReviewsController.Brand`, `:100`): Feefo's merchant summary (`:134`)
   and 8 reviews per page (`:158`), sorted newest or oldest, filtered by star, with "Showing 8 of 24,888" and See more.
3. **New: approved quotes.** Reviews a person approved for the website, filtered by theme, ship or itinerary, for the
   site's quote carousels (Culinary, Guest Stories, ship pages).

Each review shows: service title, customer display name, **location**, date, **trip name**, service and product
ratings and texts, and **Uniworld's reply**.

## Root cause (the gaps)
1. **Replies are not collected.** The sync never asks for `full_thread=include` (`shared/src/feefo/client.ts:116-125`),
   and Feefo leaves merchant replies out without it. Measured 2026-10-12: 45 of the 86 one-star Uniworld reviews have a
   `thread` entry of type `MERCHANT_COMMENT` with `author: "Uniworld Guest Relations"`; the comment is HTML.
   `shared/src/types/review.ts` has no field for replies.
2. **Location is withheld.** It is stored (`shared/src/types/review.ts:8`) but left out of the public shape on purpose
   (`shared/src/reviews/public.ts:12-18`, "the dashboard never renders customer location"). The website design shows
   "Name, Country". Only `customer.location` should be exposed (as `display_location`), never name, email or refs.
3. **No summary per trip.** Itinerary summaries are keyed by a slug of the itinerary name
   (`functions/src/api/reviews-api.ts:771-776`), not by `parent_sku`. The drawer needs average, count and 1-5 star
   counts (product and service) for one `parent_product_sku`.
4. **A star filter means no total and no page numbers.** `rating` is applied after the query
   (`reviews-api.ts:298-302`), so `count` stays null (`reviews-api.ts:555-562`) and pages after the first need a cursor
   (`reviews-api.ts:244-251`). The site shows "Showing x of y" and fetches page N for See more.
5. **No rating sort.** `sort` is newest or oldest only (`reviews-api.ts:144-147`). The drawer offers Highest and
   Lowest rating.
6. **The headline brand rating should be Feefo's own.** Matt decided 2026-10-12 the site shows Feefo's 4.8.
   `avgRating` here is a computed product average (`public.ts:276`, `functions/src/sync/compute-summaries.ts:243`).
   `fetchSummary` exists but is never called (`client.ts:189`).
7. **Nothing marks a review for the website.** Every review is stored as `moderationStatus: "published"`
   (`shared/src/feefo/transform.ts:98`).

## What has already been tried
Nothing in this repo. On the site side, Feefo's own API was tested on 2026-10-12:
- `sort=%2Bupdated_date` works for oldest; the `+` must be encoded.
- Feefo has no rating sort: `sort=-rating` returns an error.
- Feefo's own `rating` filter gives 86 one-star reviews while the product distribution shows 311. This API's filter
  (product rating, else service) is the better meaning; keep it.

## The change
1. **Replies.**
   - Add `full_thread: "include"` to the sync request (`client.ts:116`).
   - Store the last `MERCHANT_COMMENT` per review as `reply: { text, author, createdAt } | null`:
     - convert the HTML to plain text: `<br>`, `</p>` and `</div>` become line breaks, other tags are stripped,
       entities decoded, and non-breaking spaces turned into normal spaces;
     - keep the raw HTML as well if you like.
   - Expose it as `reply` on the public review (`public.ts`).
   - Old reviews only get replies after a full sync (`manualSync` with `fullSync:true`). Run it once after deploy.
2. **Location.** Add `customer.display_location` to the public shape. Update the comment at `public.ts:12-18` and the
   open decision in `docs/plans/2026-06-09-public-reviews-api.md`.
3. **Per-trip summary.**
   - Compute summaries keyed by `parent_sku` per merchant during the summary step (`compute-summaries.ts`).
   - Serve them as `GET /v1/reviews/summary/all?scope=product&parent_product_sku=176`, with:
     - `meta.count`
     - `rating.rating`: the product average
     - `rating.product` and `rating.service` star distributions (the same shape as the fleet summary)
4. **Exact totals and page numbers with a star filter.**
   - Store a `ratings.headline` field: product rating, else service rating, rounded.
   - Make `rating` a server-side `where` on it, with composite indexes per sort (`firestore.indexes.json`).
   - Then `count` and `page` work like the unfiltered list.
5. **Rating sort.** Add `sort=highest|lowest`: `ratings.headline` desc or asc, then the date desc. Add the indexes for the
   `merchant` + `parent_sku` combination.
6. **Feefo headline.**
   - Store Feefo's merchant summary (`fetchSummary`, `client.ts:189`) on each sync: rating and count.
   - Return it on the fleet summary as `rating.feefo_rating` and `meta.feefo_count`, or make it the fleet
     `rating.rating`; document which.
   - The site shows 4.8 and 24,888 (Feefo's merchant numbers as of 2026-10-12).
7. **Website approval queue (Matt chose 2c: rules propose, a person approves, in this dashboard).**
   - Add `website: { status: "candidate" | "approved" | "rejected" | null, placements: string[], decidedBy,
     decidedAt }`.
   - A rule marks candidates on sync. Suggested rule: product or service rating 5, `hasComment`, at least one positive
     theme, and service text of 60 to 600 characters. Make the rule easy to change.
   - Add a dashboard queue page (filter by brand, theme, ship, itinerary) with Approve, Reject and optional placement
     tags such as `culinary` or `guest-stories`.
   - Add a public filter `website=approved` and `placement=` to `/v1/reviews/all`, combinable with `positive_theme`,
     `ship` and `parent_product_sku`.
   - The one-filter-per-request limit (`reviews-api.ts:123-275`) has to allow `website` plus one other filter.
8. **Website client.** Matt agreed to create an API client `uniworld-journeys` with `reviews:read`, `summary:read` and
   `meta:read` for merchant `uniworld`. The website keeps its secret in deployed, local-only config.
9. **Cold starts (optional).** The site calls server-side and caches pages for 1 hour and summaries for 6 hours. Setting
   `minInstances: 1` on `reviewsApi` (`functions/src/index.ts:847`) would avoid a slow first page render. Matt decides,
   since it costs money.
10. Update `docs/api/README.md` and the OpenAPI spec for every new parameter and field.

## Acceptance check
With a token for the `uniworld-journeys` client, against `https://feefo-reviews.web.app/api`:
- `GET /v1/reviews/all?merchant_identifier=uniworld&rating=1&page=3&page_size=8&sort=newest`
  - returns 200 with `summary.meta.count` equal to the number of one-star reviews (not null);
  - at least one review on pages 1 to 4 has a non-empty plain-text `reply.text` with no HTML tags;
  - reviews carry `customer.display_location` where the customer gave one.
- `GET /v1/reviews/all?merchant_identifier=uniworld&parent_product_sku=176&sort=highest&page_size=8`
  - returns reviews in descending headline rating.
- `GET /v1/reviews/summary/all?merchant_identifier=uniworld&scope=product&parent_product_sku=176`
  - returns count, average and both star distributions for that trip.
- `GET /v1/reviews/summary/all?merchant_identifier=uniworld&scope=fleet`
  - includes Feefo's merchant rating (4.8 on 2026-10-12) and count.
- In the dashboard, approving a candidate makes it appear in `GET /v1/reviews/all?merchant_identifier=uniworld&website=approved`.
- Existing API tests pass, and new ones cover each new parameter.

## Landmines
- Deploys on merge to `main` (`.github/workflows/firebase-deploy.yml`). Never push to `main`; open a PR.
- Firestore composite indexes must deploy before the queries that need them, or the API returns 500.
  `firebase deploy --only firestore:indexes` builds them first; large collections take minutes.
- A full sync re-reads every review from Feefo. Check the Feefo rate limits and the 3600 s timeout of `manualSync`
  (`functions/src/index.ts:356`).
- Replies are HTML containing links (mailto). Store plain text for the website. Never pass the HTML through unescaped.
- Do not expose `customer.name`, email, `orderRef` or `customerRef`. Only `display_name` and `display_location`.
- Secrets: Feefo credentials are GitHub Actions secrets written into `functions/.env.feefo-reviews` at deploy
  (`DEPLOY.md`). Never paste values.
- Open PR #48 (merchant management plan) may touch the merchant registry. Check it before editing
  `functions/src/api/merchant-registry.ts`.

## Open questions for Matt
- The candidate rule thresholds (item 7): start with the suggested rule, or a different one?
- Placement tag list: free text, or a fixed list (`guest-stories`, `culinary`, `ships`, `travel-that-gives-back`)?
- `minInstances: 1` on `reviewsApi`: yes or no (cost)?
