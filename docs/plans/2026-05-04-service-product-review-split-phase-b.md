# Service vs Product Review Split — Phase B

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface Feefo's service-vs-product review distinction in the dashboard. Each review card shows the service text and product text as separately labelled sections with their own star ratings, and the Reviews Explorer gains an "All / Service / Product" filter.

**Architecture:** Schema is unchanged — `ratings.service` / `ratings.product` and `reviews.serviceText` / `reviews.productText` are already separate fields. Mapping (`mapReviewDoc`) exposes both ratings on `ReviewData` instead of collapsing them. `ReviewCard` conditionally renders a Service section, a Product section, or both, mirroring the labels Feefo uses on their public reviews page. The new filter is a single string state (`"all" | "service" | "product"`) plumbed through URL params and applied client-side, alongside the existing theme/rating/media filters. Aggregate metrics (Overview KPI cards, themes, trend chart) remain combined in this phase — that's Phase C scope.

**Tech Stack:** Next.js 16 (existing), Firebase Firestore, date-fns. No new dependencies.

---

## Background

Feefo's data model gives each "review event" up to two pieces:

- **Service review** — text + rating about the merchant's customer service / booking experience.
- **Product review** — text + rating about the actual product (for Uniworld, the cruise itinerary).

A customer can rate one without the other or rate them differently. Feefo's public page (verified at `https://www.feefo.com/en-US/reviews/uniworld`) shows two separate averages in the header ("Service 4.8/5", "Product 4.6/5") and three tabs (All / Service / Product), and each individual review card is labelled with its type.

Today our app:

1. Joins `serviceText + productText` with a space and renders one paragraph (`ReviewCard.tsx:55-57, :128`).
2. Shows a single star rating using `ratings.product ?? ratings.service` (`mapReviewDoc` in `app/src/app/reviews/page.tsx:56`).
3. Has no filter for review type.

Phase B is purely a Reviews-page change. No Overview/aggregate work — that's Phase C.

## Files touched

- `app/src/components/reviews/ReviewCard.tsx` — split rendering into labelled Service / Product sections.
- `app/src/app/reviews/page.tsx` — extend `ReviewData` mapping, parse/serialise `reviewType` URL param, apply client-side filter.
- `app/src/components/reviews/FilterSidebar.tsx` — add the `Filters.reviewType` field plus a segmented "All / Service / Product" toggle UI at the top of the sidebar.
- `app/src/components/reviews/ExportButton.tsx` — verify CSV export still works (no changes expected; both texts already exported as separate columns).

No backend / Firestore index changes. No schema changes.

## URL contract

New optional query param: `reviewType=service|product`. Absence ⇒ "all". The default state writes no `reviewType` param to keep URLs clean (matches the existing `sort=newest` default-omitted convention).

## Verification approach

`app/` has no test infrastructure. Manual verification in the dev server, the same pattern used for the date-presets PR:

1. Open `/reviews` with the default "All" filter — confirm reviews with both sections render both, and reviews with one section render one.
2. Toggle to "Service" — only reviews with service text remain, only the Service section is visible per card.
3. Toggle to "Product" — only reviews with product text remain, only the Product section is visible per card.
4. Reload the page on a non-default filter — URL persists, state restores.
5. Spot-check on Uniworld and Luxury Gold to make sure the split is visually consistent across brands.

---

## Task 1 — Extend `ReviewData` to carry both ratings

**Files:**
- Modify: `app/src/components/reviews/ReviewCard.tsx` (the `ReviewData` interface)
- Modify: `app/src/app/reviews/page.tsx` (`mapReviewDoc`)

**Change:** Replace the single `rating: number` with two optional fields:

```ts
serviceRating: number | null;
productRating: number | null;
```

Drop the legacy `rating` field after the card stops using it.

**`mapReviewDoc` change:**

```ts
serviceRating: typeof d.ratings?.service === "number" ? d.ratings.service : null,
productRating: typeof d.ratings?.product === "number" ? d.ratings.product : null,
```

**Verify:** `npx tsc --noEmit` passes from `app/`. Anywhere in the page that previously read `r.rating` either reads one of the two new fields or computes a display fallback inline.

**Commit:** `refactor(reviews): expose service and product ratings separately on ReviewData`

---

## Task 2 — Render labelled Service / Product sections in `ReviewCard`

**File:** `app/src/components/reviews/ReviewCard.tsx`

Replace the merged `fullText` block with two conditional sections. Each section renders only when its text is non-empty. Each section has a small header — a "Service" or "Product" label and a star rating (using the section's own rating, falling back to the other type's rating if missing — Feefo sometimes reports just one).

Sketch:

```tsx
const sections: Array<{ kind: "service" | "product"; text: string; rating: number | null }> = [];
if (review.serviceReview) sections.push({ kind: "service", text: review.serviceReview, rating: review.serviceRating });
if (review.productReview) sections.push({ kind: "product", text: review.productReview, rating: review.productRating });
```

Render each section with a header row (`Service`/`Product` label + `<StarRating>`) above the text. Re-use the existing `line-clamp-4` + Read more / Show less behaviour, but per-section.

Drop the single `<StarRating>` from the card header. The service-title `<h3>` stays where it is. Theme tags stay at the bottom (still apply to the whole review).

**Verify:** Visit `/reviews`. Cards with both texts show two stacked labelled sections. Cards with only one show one. Star rating per section reflects the matching `ratings.service` / `ratings.product` value.

**Commit:** `feat(reviews): show service and product as separate labelled sections per card`

---

## Task 3 — Add `reviewType` to the `Filters` shape and URL

**Files:**
- Modify: `app/src/components/reviews/FilterSidebar.tsx`
- Modify: `app/src/app/reviews/page.tsx`

**Filters interface change:**

```ts
export type ReviewType = "all" | "service" | "product";

export interface Filters {
  // ... existing ...
  reviewType: ReviewType;
}

export const emptyFilters: Filters = {
  // ... existing ...
  reviewType: "all",
};
```

**`paramsToFilters` change:** read `searchParams.get("reviewType")`, accept only `"service"` or `"product"`, default to `"all"`.

**`filtersToParams` change:** write `reviewType=service|product` only when not `"all"`.

**`serverFilterKey`:** include `filters.reviewType` so the main query effect still re-runs when it changes (even though the actual filter is client-side, the user expects an immediate visual refresh).

**Verify:** Setting `?reviewType=service` in the URL and reloading restores the toggle to "Service" but doesn't yet affect rendering.

**Commit:** `feat(reviews): add reviewType to filter state and URL contract`

---

## Task 4 — Add the toggle UI in `FilterSidebar`

**File:** `app/src/components/reviews/FilterSidebar.tsx`

Add a segmented three-button toggle at the top of the sidebar (above Brand). Style: pill-shaped button group, similar to the Brand toggle in `BrandHeader`. Active button uses `bg-brand-accent text-accent-foreground`, inactive uses muted tone.

```tsx
<div className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-surface-alt p-1">
  {(["all", "service", "product"] as ReviewType[]).map((rt) => (
    <button
      key={rt}
      onClick={() => onChange({ ...filters, reviewType: rt })}
      className={
        filters.reviewType === rt
          ? "rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
          : "rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
      }
    >
      {rt === "all" ? "All" : rt === "service" ? "Service" : "Product"}
    </button>
  ))}
</div>
```

Place above the existing "Only reviews with photos or videos" checkbox.

**Verify:** Toggle visually switches. Selecting "Service" updates the URL to `?reviewType=service`. Selecting "All" removes the param.

**Commit:** `feat(reviews): add Service / Product / All toggle to FilterSidebar`

---

## Task 5 — Apply the filter client-side and hide off-type sections

**Files:**
- Modify: `app/src/app/reviews/page.tsx` (`applyClientFilters`)
- Modify: `app/src/components/reviews/ReviewCard.tsx`

**`applyClientFilters`:**

```ts
if (filters.reviewType === "service" && !r.serviceReview) return false;
if (filters.reviewType === "product" && !r.productReview) return false;
```

Add this branch alongside the existing `hasMedia` filter.

**`ReviewCard`:** Accept an optional `reviewTypeFilter?: ReviewType` prop. When set to `"service"` only render the Service section even if a Product section also exists (and vice versa). When `"all"` or undefined, render both. This is what gives the user the "tab feels filtered" Feefo-style experience.

Plumb `filters.reviewType` from the page through to each `<ReviewCard>` instance.

**Verify:**
- "All" tab: both sections render where present (unchanged from Task 2).
- "Service" tab: cards without service text disappear; cards with both render only the Service section.
- "Product" tab: mirror behaviour.
- Reload with `?reviewType=service` — restores the filter and the visual.

**Commit:** `feat(reviews): apply reviewType filter both to result set and rendered sections`

---

## Task 6 — Manual verification + PR

1. `npx tsc --noEmit` from `app/` — clean.
2. `npx eslint src/app/reviews/page.tsx src/components/reviews/ReviewCard.tsx src/components/reviews/FilterSidebar.tsx` — clean.
3. Dev server walkthrough described in **Verification approach** above.
4. Push branch, open PR against `main` referencing this design doc and the Feefo screenshots.
5. Note in the PR body that aggregate metrics (header averages, themes, trend split) are deferred to Phase C.

**Commit:** none (PR-level only).

---

## Out of scope (Phase C)

- Two header averages on the Overview page ("Service" + "Product" KPI cards).
- Splitting `getFleetSummaryByDateRange` and `compute-summaries.ts` to track service-only and product-only aggregates.
- Splitting the trend chart into two lines.
- Re-classifying themes per type (the classifier currently joins both texts; splitting requires either two batches or a prompt rework).
- Distribution histogram split.

These all consume the same `reviewType` primitive Phase B introduces.
