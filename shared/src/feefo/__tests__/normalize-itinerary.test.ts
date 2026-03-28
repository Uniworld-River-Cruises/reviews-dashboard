import { normalizeItineraryName } from "../normalize-itinerary";

describe("normalizeItineraryName", () => {
  it("strips direction codes and year", () => {
    expect(normalizeItineraryName("Rhine Holiday Markets (BSL-CGN) 25"))
      .toBe("Rhine Holiday Markets");
  });

  it("strips direction codes with different year", () => {
    expect(normalizeItineraryName("A Portrait of Majestic France (BOD-CDG) 19"))
      .toBe("A Portrait of Majestic France");
  });

  it("strips reversed direction codes", () => {
    expect(normalizeItineraryName("A Portrait of Majestic France (CDG-BOD) 24"))
      .toBe("A Portrait of Majestic France");
  });

  it("strips same-city codes", () => {
    expect(normalizeItineraryName("Enchanting Danube (PAS-BUD) 25"))
      .toBe("Enchanting Danube");
  });

  it("strips triple city codes", () => {
    expect(normalizeItineraryName("Wine Roads of France & Portugal W/Out (LIS-BOD-OPO) 25"))
      .toBe("Wine Roads of France & Portugal");
  });

  it("strips ship name suffix and codes", () => {
    expect(normalizeItineraryName("Splendors of Egypt & the Nile on the River Tosca (CAI-CAI) 24"))
      .toBe("Splendors of Egypt & the Nile");
  });

  it("strips S.S. ship name suffix and codes", () => {
    expect(normalizeItineraryName("Burgundy & Provence on the S.S. Catherine (LYS-ARL) 25"))
      .toBe("Burgundy & Provence");
  });

  it("leaves clean names unchanged", () => {
    expect(normalizeItineraryName("Brilliant Bordeaux"))
      .toBe("Brilliant Bordeaux");
  });

  it("leaves names with ampersands unchanged", () => {
    expect(normalizeItineraryName("Burgundy & Provence"))
      .toBe("Burgundy & Provence");
  });

  it("strips codes without year", () => {
    expect(normalizeItineraryName("European Jewels (BUD-AMS)"))
      .toBe("European Jewels");
  });

  it("strips bare trailing year", () => {
    expect(normalizeItineraryName("Enchanting Danube 25"))
      .toBe("Enchanting Danube");
  });

  it("preserves partner prefix (manual mapping needed)", () => {
    expect(normalizeItineraryName("Phoenix Tours Enchanting Danube (PAS-BUD) 25"))
      .toBe("Phoenix Tours Enchanting Danube");
  });

  it("handles India's Golden Triangle", () => {
    expect(normalizeItineraryName("India's Golden Triangle & the Sacred Ganges (DEL-CCU) 25"))
      .toBe("India's Golden Triangle & the Sacred Ganges");
  });

  it("handles empty string", () => {
    expect(normalizeItineraryName("")).toBe("");
  });

  it("handles whitespace-only string", () => {
    expect(normalizeItineraryName("   ")).toBe("");
  });
});
