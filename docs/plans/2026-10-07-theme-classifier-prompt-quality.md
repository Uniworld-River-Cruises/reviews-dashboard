# Theme classifier: prompt quality (satellite brief)

**Repo:** `Uniworld-River-Cruises/reviews-dashboard` (`C:\projects\feefo-reviews`)
**Status:** not started. Depends on the Haiku 5.5 switch (`feat/haiku-5-5-classifier`) being merged.

## Background

Review themes are tagged by Claude Haiku through the Anthropic Batch API
(`functions/src/sync/batch-classify.ts`). The prompt lives in
`shared/src/themes/prompt.ts` (`classifierPrompt`); model settings live in
`shared/src/themes/model.ts`. Each classified review records `themes.model`.

During the Haiku 4.5 to 5.5 switch (2026-10-07) we compared prompts on 45
recent Uniworld and Luxury Gold reviews:

| Setup | Positive / review | Negative / review | Input tokens |
|---|---|---|---|
| Haiku 4.5, production prompt | 3.39 | 1.41 | 275 |
| Haiku 5.5, production prompt + brand line (shipped) | 3.76 | 1.51 | 440 |
| Haiku 5.5, stricter prompt with theme descriptions | 3.07 to 3.13 | 1.13 to 1.18 | ~1,150 |

Per-review agreement between any two setups was low (7 to 15 of 45 identical),
including the same prompt on 4.5 vs 5.5. The stricter prompt fixed some
over-tagging (e.g. "Itinerary Changes" for "wanted more free time") but missed
real themes (Space & Size on a smaller replacement ship, Destination & Culture on
"sites were enthralling"). Without labeled data there was no way to say which
setup is more accurate, so the production wording was kept.

## Goal

Pick the classifier prompt by measured accuracy, not judgment.

## Steps

1. Pull ~60 reviews (both merchants, spread across star ratings, including
   mixed reviews and itinerary-change trips) and have Matt or a team member tag
   them by hand against the theme list in `shared/src/themes/definitions.ts`.
   Agree on edge cases first (what counts as "Unmet Expectations",
   "Overall Experience").
2. Score each candidate prompt per theme (precision and recall), weighting the
   themes leadership reads most.
3. Ship the winner in `classifierPrompt`, then re-classify history so trends
   stay comparable.

## Acceptance check

- A labeled set is committed (or stored) with its tagging guidelines.
- The chosen prompt beats the shipped prompt on overall F1 and does not lose on
  any high-visibility theme.
- Theme trend charts show no artificial step at the switch date (history
  re-classified).
