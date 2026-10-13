import {
  WEBSITE_CANDIDATE_RULE,
  computeHeadlineRating,
  isWebsiteCandidate,
  isWebsitePlacement,
  WebsiteCandidateInput,
} from "../website";

function candidate(overrides: Partial<WebsiteCandidateInput> = {}): WebsiteCandidateInput {
  return {
    ratings: { service: 5, product: 5 },
    reviews: {
      serviceText: "The crew made every day special, from the welcome to the farewell.",
    },
    themes: { positive: ["Staff"] },
    hasComment: true,
    ...overrides,
  };
}

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
  it("accepts a 5-star commented review with a positive theme and 60-600 chars of service text", () => {
    expect(isWebsiteCandidate(candidate())).toBe(true);
  });

  it("accepts when only one of product/service is 5 stars", () => {
    expect(isWebsiteCandidate(candidate({ ratings: { product: 4, service: 5 } }))).toBe(true);
    expect(isWebsiteCandidate(candidate({ ratings: { product: 5, service: null } }))).toBe(true);
  });

  it("rejects when neither rating is 5", () => {
    expect(isWebsiteCandidate(candidate({ ratings: { product: 4, service: 4 } }))).toBe(false);
  });

  it("requires a comment and a positive theme", () => {
    expect(isWebsiteCandidate(candidate({ hasComment: false }))).toBe(false);
    expect(isWebsiteCandidate(candidate({ themes: { positive: [] } }))).toBe(false);
    expect(isWebsiteCandidate(candidate({ themes: null }))).toBe(false);
  });

  it("bounds the trimmed service text length inclusively", () => {
    const { minServiceTextLength: min, maxServiceTextLength: max } = WEBSITE_CANDIDATE_RULE;
    const withText = (t: string) => candidate({ reviews: { serviceText: t } });
    expect(isWebsiteCandidate(withText("x".repeat(min)))).toBe(true);
    expect(isWebsiteCandidate(withText("x".repeat(min - 1)))).toBe(false);
    expect(isWebsiteCandidate(withText(`  ${"x".repeat(min - 1)}  `))).toBe(false);
    expect(isWebsiteCandidate(withText("x".repeat(max)))).toBe(true);
    expect(isWebsiteCandidate(withText("x".repeat(max + 1)))).toBe(false);
    expect(isWebsiteCandidate(candidate({ reviews: { serviceText: null } }))).toBe(false);
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
