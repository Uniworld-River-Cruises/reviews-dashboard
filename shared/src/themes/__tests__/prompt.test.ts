import { POSITIVE_THEMES, NEGATIVE_THEMES } from "../definitions";
import { classifierPrompt } from "../prompt";

describe("Classifier prompt", () => {
  it("lists every theme name", () => {
    const prompt = classifierPrompt("Great trip", "uniworld");
    for (const t of [...POSITIVE_THEMES, ...NEGATIVE_THEMES]) {
      expect(prompt).toContain(t.name);
    }
  });

  it("adds a brand line before the review when the merchant is known", () => {
    expect(classifierPrompt("Great trip", "luxury-gold")).toContain(
      "Brand: Luxury Gold (escorted land tours by coach and hotel, normally no ship)\n\nReview:\nGreat trip"
    );
    expect(classifierPrompt("Great trip", null)).not.toContain("Brand:");
    expect(classifierPrompt("Great trip", null)).toContain("\n\nReview:\nGreat trip\n\n");
  });
});
