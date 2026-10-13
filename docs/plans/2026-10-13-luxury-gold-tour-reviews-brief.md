# Let the uniworld website ask for one tour's reviews cleanly: itinerary-group filter, deck variants grouped, rating sorts

**Repo:** `C:\projects\feefo-reviews`   **Branch:** new branch from `main` (last commit seen: `08bfd7b`, PR #75)
**Status:** the uniworld-journeys site (PR Uniworld-River-Cruises/Uniworld-Journeys-Sitecore#42) already shows luxury-gold
reviews for 18 of 21 former Luxury Gold tours by asking `merchant_identifier=luxury-gold&tour=<tour name>`. Three gaps
remain; this brief closes them in the API so the site can ask one clean question per tour.

## Context
21 Luxury Gold tours are now sold as Uniworld journeys (Sitecore Sailing Years with Brand = Luxury Gold, e.g. Ultimate
Portugal). Their reviews live under the **luxury-gold** merchant and carry **no `parent_sku`**: product SKUs are tour
code plus season (`G328N26`, `G328M26`), and Sitecore holds a different season code (`G328N27`) and an unrelated
Uniworld itinerary code (361, no reviews). The only shared key is the tour name. The site matches the Sailing Year
Title ("&" read as "and") against the reviews' `tags.tour`.

Result on 2026-10-13 (`scope=itinerary` summary per name): 18 match (Ultimate Italy 566, Indulgence in Eastern Canada
213, ... Ultimate Portugal 26). No match:
- **Croatia and the Dalmatian Coast**: Feefo splits it into "Croatia and the Dalmatian Coast Upper Deck" (G263U, 71
  reviews) and "... Lower Deck" (G263L, 29); some product titles read "Croatia & the Dalmatian Coast".
- **Exquisite Northern Italy** (G220) and **Legendary Japan** (A611): no reviews yet ("Majestic Japan", A610, is a
  different tour). Nothing to do for these.

## Root cause (API side)
1. **The list filter is the raw tour tag; the summary is the grouped name.** `tour` filters `tags.tour` with `==`
   (`functions/src/api/reviews-api.ts:221`). `scope=itinerary` summaries group by the *effective parent name*
   (`functions/src/sync/compute-summaries.ts:82-100`: manual mapping, else `normalizeItineraryName`). So a summary and
   a list for "the same tour" can disagree, and a grouped tour (Upper + Lower Deck) has a summary but no list query.
2. **Deck variants are not grouped.** `normalizeItineraryName` (`shared/src/feefo/normalize-itinerary.ts:11`) strips
   direction codes, years and ship suffixes, not "Upper Deck" / "Lower Deck". Manual overrides already exist
   (`itinerary_mappings` docs with `manualParentName`, `functions/src/sync/itinerary-mappings.ts:26-80`, edited on the
   admin page `app/src/app/admin/page.tsx`), but they only affect summaries (point 1).
3. **Rating sorts only work with `parent_product_sku`.** `RATING_SORT_COMBINABLE` (`reviews-api.ts:105`, checked at
   `:313`); `sort=highest` with `tour` returns 400. The site therefore offers only Newest/Oldest for these tours.
4. Also seen: `tags.tour` is missing on some reviews (product title only, e.g. "Majestic Japan " with a trailing
   space); `compute-summaries.ts:89` falls back to `product.title`, the list filter does not.

## What has already been tried
- Site-side matching by `tour=<Title>`: works for 18 tours; cannot cover Croatia (two raw names) and cannot sort by rating.
- `product_sku=G328N27` (Sitecore's season code): 0 results; the reviews carry older season codes.
- No API change has been made for this.

## The change
1. **Store the resolved itinerary group on each review** (e.g. `tags.itineraryGroup` = effective parent name, from
   `tags.tour ?? product.title`, via the same lookup as `compute-summaries.ts:82-84`), set at sync and backfilled; when
   a mapping's `manualParentName` changes, rewrite the group on that mapping's reviews.
2. **Add a list filter `itinerary=<group>`** on that field (`pushAttr`, `reviews-api.ts:220-230`), with the composite
   indexes it needs, and add it to `RATING_SORT_COMBINABLE` (sorts on `ratings.headline`, as `parent_product_sku`
   does) and to `WEBSITE_COMBINABLE` if cheap. Document it in `functions/src/api/openapi.ts` and `docs/api/README.md`.
3. **Group the deck variants manually (Matt, 2026-10-13: no rule change).** Matt sets the Effective Parent of both
   Croatia rows (Upper Deck, Lower Deck) to "Croatia and the Dalmatian Coast" on the admin page's Itinerary Grouping
   section, then clicks Recompute Summaries. Ask him to do this only once `itinerary=` is live, or the site's header
   shows about 100 reviews while its drawer list (still `tour=`) is empty. Step 1's backfill must pick up manual
   mappings, and a later mapping edit must regroup that mapping's reviews.
4. Make sure `scope=itinerary&scope_value=<group>` and `itinerary=<group>` agree on counts for every luxury-gold group.

The website change afterwards is small (uniworld-journeys `Areas/Uniworld/Journeys/ReviewsApi.cs`: `Reviews` with
`&itinerary=` instead of `&tour=`, and the drawer offers rating sorts again); it is not part of this brief.

## Acceptance check
With the uniworld-journeys client credentials (or Postman, `docs/api/`):
- `GET /v1/reviews/all?merchant_identifier=luxury-gold&itinerary=Croatia%20and%20the%20Dalmatian%20Coast&page_size=8`
  returns reviews from both decks, `summary.meta.count` about 100 and equal to
  `GET /v1/reviews/summary/all?merchant_identifier=luxury-gold&scope=itinerary&scope_value=Croatia%20and%20the%20Dalmatian%20Coast` `meta.count`.
- `...&itinerary=Ultimate%20Portugal&sort=highest` returns 200 (not 400), 5-star reviews first; `count` 26.
- For every luxury-gold group, list `count` (no other filter) equals the itinerary summary's `meta.count`.
- `scripts/smoke-api.sh` passes with new checks for `itinerary=` (alone, with `sort=highest`, with `rating=`).

## Landmines
- New composite indexes must show **Enabled** in Firestore before the filter works in production (#72/#73 history:
  a duplicate index failed a deploy with 409).
- The backfill touches every review document: batch it and keep the conditional writes the summary step uses.
- Merging these tours' future **uniworld** reviews (once sold as Uniworld, under a `parent_sku`) with their
  luxury-gold history is a separate question; do not build it here.

## Open questions for Matt
- Should the API also accept several groups at once (e.g. `itinerary=A|B`), or is one group per tour enough?
