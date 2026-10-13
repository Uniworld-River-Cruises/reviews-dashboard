import {
  WEBSITE_CANDIDATE_RULE,
  computeHeadlineRating,
  isWebsiteCandidate,
  isWebsitePlacement,
  WebsiteCandidateInput,
} from "../website";

const NOW = Date.parse("2026-10-13T00:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function candidate(overrides: Partial<WebsiteCandidateInput> = {}): WebsiteCandidateInput {
  return {
    ratings: { service: 5, product: 5 },
    reviews: {
      serviceText:
        "The crew made every day special, from the warm welcome on embarkation to the farewell " +
        "dinner, and the excursions were organised so well that we never once felt rushed.",
    },
    themes: { positive: ["Staff", "Excursions"] },
    hasComment: true,
    dates: { created: daysAgo(30) },
    ...overrides,
  };
}

const check = (overrides: Partial<WebsiteCandidateInput> = {}) =>
  isWebsiteCandidate(candidate(overrides), WEBSITE_CANDIDATE_RULE, NOW);

describe("computeHeadlineRating", () => {
  it("prefers the product rating, else the service rating, rounded", () => {
    expect(computeHeadlineRating({ product: 4, service: 1 })).toBe(4);
    expect(computeHeadlineRating({ product: null, service: 2.6 })).toBe(3);
    expect(computeHeadlineRating({ product: 4.4, service: null })).toBe(4);
  });

  it("is null when neither rating exists", () => {
    expect(computeHeadlineRating({ product: null, service: null })).toBeNull();
    expect(computeHeadlineRating(undefined)).toBeNull();
  });
});

describe("isWebsiteCandidate (default rule)", () => {
  it("accepts a recent review with both ratings 5, two positive themes and 150-600 chars", () => {
    expect(check()).toBe(true);
  });

  it("requires BOTH product and service to be 5 stars", () => {
    expect(check({ ratings: { product: 4, service: 5 } })).toBe(false);
    expect(check({ ratings: { product: 5, service: 4 } })).toBe(false);
    expect(check({ ratings: { product: 5, service: null } })).toBe(false);
  });

  it("requires a comment and at least two positive themes", () => {
    expect(check({ hasComment: false })).toBe(false);
    expect(check({ themes: { positive: ["Staff"] } })).toBe(false);
    expect(check({ themes: { positive: [] } })).toBe(false);
    expect(check({ themes: null })).toBe(false);
  });

  it("bounds the trimmed service text length inclusively", () => {
    const { minServiceTextLength: min, maxServiceTextLength: max } = WEBSITE_CANDIDATE_RULE;
    const withText = (t: string) => check({ reviews: { serviceText: t } });
    expect(withText("x".repeat(min))).toBe(true);
    expect(withText("x".repeat(min - 1))).toBe(false);
    expect(withText(`  ${"x".repeat(min - 1)}  `)).toBe(false);
    expect(withText("x".repeat(max))).toBe(true);
    expect(withText("x".repeat(max + 1))).toBe(false);
    expect(check({ reviews: { serviceText: null } })).toBe(false);
  });

  it("only proposes reviews created within the last two years", () => {
    const { maxAgeDays } = WEBSITE_CANDIDATE_RULE;
    expect(check({ dates: { created: daysAgo(maxAgeDays - 1) } })).toBe(true);
    expect(check({ dates: { created: daysAgo(maxAgeDays + 1) } })).toBe(false);
    expect(check({ dates: { created: null } })).toBe(false);
    expect(check({ dates: { created: "not a date" } })).toBe(false);
  });
});

describe("isWebsitePlacement", () => {
  it("accepts only the fixed placement list", () => {
    expect(isWebsitePlacement("culinary")).toBe(true);
    expect(isWebsitePlacement("guest-stories")).toBe(true);
    expect(isWebsitePlacement("Culinary")).toBe(false);
    expect(isWebsitePlacement("anything")).toBe(false);
    expect(isWebsitePlacement(1)).toBe(false);
  });
});
