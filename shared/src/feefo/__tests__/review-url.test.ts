import { feefoReviewKey, feefoUrlLocaleVariants } from "../review-url";

const NEW =
  "https://www.feefo.com/en-US/reviews/uniworld/58186a8f9066817b286d7a37/customer-review-my-service-feedback";
const OLD =
  "https://www.feefo.com/en_US/reviews/uniworld/58186a8f9066817b286d7a37/customer-review-my-service-feedback";

describe("feefoReviewKey", () => {
  it("is the same for both locale spellings of a review URL", () => {
    expect(feefoReviewKey(NEW)).toBe("58186a8f9066817b286d7a37");
    expect(feefoReviewKey(OLD)).toBe(feefoReviewKey(NEW));
  });

  it("falls back to the URL when it carries no review id", () => {
    const url = "https://www.feefo.com/reviews/uniworld/feedback-123";
    expect(feefoReviewKey(url)).toBe(url);
  });
});

describe("feefoUrlLocaleVariants", () => {
  it("returns both spellings from either one", () => {
    expect(feefoUrlLocaleVariants(NEW)).toEqual([NEW, OLD]);
    expect(feefoUrlLocaleVariants(OLD)).toEqual([NEW, OLD]);
  });

  it("handles other locales (Luxury Gold uses en-GB)", () => {
    const gb = "https://www.feefo.com/en-GB/reviews/luxury-gold/68a1b2c3d4e5f60718293a4b/x";
    expect(feefoUrlLocaleVariants(gb)).toEqual([gb, gb.replace("en-GB", "en_GB")]);
  });

  it("returns the URL unchanged when it has no locale segment", () => {
    const url = "https://www.feefo.com/reviews/uniworld/feedback-123";
    expect(feefoUrlLocaleVariants(url)).toEqual([url]);
  });
});
