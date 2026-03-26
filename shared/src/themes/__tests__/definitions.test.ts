import { POSITIVE_THEMES, NEGATIVE_THEMES, VALID_POSITIVE_NAMES, VALID_NEGATIVE_NAMES } from "../definitions";

describe("Theme definitions", () => {
  it("has 10 positive themes", () => {
    expect(POSITIVE_THEMES).toHaveLength(10);
  });

  it("has 10 negative themes", () => {
    expect(NEGATIVE_THEMES).toHaveLength(10);
  });

  it("has unique positive theme names", () => {
    expect(VALID_POSITIVE_NAMES.size).toBe(POSITIVE_THEMES.length);
  });

  it("has unique negative theme names", () => {
    expect(VALID_NEGATIVE_NAMES.size).toBe(NEGATIVE_THEMES.length);
  });

  it("no overlap between positive and negative theme names", () => {
    for (const name of VALID_POSITIVE_NAMES) {
      expect(VALID_NEGATIVE_NAMES.has(name as any)).toBe(false);
    }
  });
});
