import { fetchSummary } from "../client";

describe("Feefo API Client", () => {
  it("fetches uniworld summary without auth", async () => {
    const summary = await fetchSummary("uniworld");
    expect(summary.merchant.identifier).toBe("uniworld");
    expect(summary.rating.rating).toBeGreaterThan(0);
    expect(summary.meta.count).toBeGreaterThan(0);
  }, 15000);

  it("fetches luxury-gold summary without auth", async () => {
    const summary = await fetchSummary("luxury-gold");
    expect(summary.merchant.identifier).toBe("luxury-gold");
    expect(summary.rating.rating).toBeGreaterThan(0);
  }, 15000);
});
