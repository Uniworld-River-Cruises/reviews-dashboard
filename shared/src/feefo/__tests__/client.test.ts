import { fetchSummary } from "../client";

describe("Feefo API Client", () => {
  it("fetches uniworld summary without auth", async () => {
    const summary = await fetchSummary("uniworld");
    expect(summary.merchant.identifier).toBe("uniworld");
    expect(summary.rating.rating).toBeGreaterThan(0);
    expect(summary.meta.count).toBeGreaterThan(0);
  }, 15000);

  it("returns Feefo's all-time merchant numbers, not the default last-year window", async () => {
    // Uniworld had 24,888 reviews all-time vs ~3,700 in the last year on
    // 2026-10-12; anything under 20k means since_period=all was dropped.
    const summary = await fetchSummary("uniworld");
    expect(summary.meta.count).toBeGreaterThan(20000);
  }, 15000);

  it("fetches luxury-gold summary without auth", async () => {
    const summary = await fetchSummary("luxury-gold");
    expect(summary.merchant.identifier).toBe("luxury-gold");
    expect(summary.rating.rating).toBeGreaterThan(0);
  }, 15000);
});
