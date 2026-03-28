import { parseTags } from "../parse-tags";
import { FeefoReviewTag } from "../types";

describe("parseTags", () => {
  it("extracts ship, tour, region, and booking type from SALE tags", () => {
    const tags: FeefoReviewTag[] = [
      { type: "SALE", key: "ship", values: ["S.S. Elisabeth"] },
      { type: "SALE", key: "tour", values: ["Rhine Holiday Markets (BSL-CGN) 25"] },
      { type: "SALE", key: "region", values: ["Uniworld (USD)"] },
      { type: "SALE", key: "pbbbooking", values: ["RA - Agency"] },
      { type: "SALE", key: "loyalty", values: ["NO"] },
      { type: "SALE", key: "clienttype", values: ["RetailClient"] },
      { type: "SALE", key: "package", values: ["Europe"] },
      { type: "SALE", key: "tourdirector", values: ["21666-51823"] },
      { type: "SALE", key: "displayname", values: ["John Smith"] },
    ];

    const result = parseTags(tags);

    expect(result.ship).toBe("S.S. Elisabeth");
    expect(result.tour).toBe("Rhine Holiday Markets (BSL-CGN) 25");
    expect(result.region).toBe("Uniworld (USD)");
    expect(result.bookingType).toBe("RA - Agency");
    expect(result.loyalty).toBe("NO");
    expect(result.clientType).toBe("RetailClient");
    expect(result.package).toBe("Europe");
    expect(result.tourDirector).toBe("21666-51823");
  });

  it("returns null fields for missing tags", () => {
    const result = parseTags([]);
    expect(result.ship).toBeNull();
    expect(result.tour).toBeNull();
    expect(result.region).toBeNull();
  });

  it("handles undefined tags array", () => {
    const result = parseTags(undefined);
    expect(result.ship).toBeNull();
  });

  it("extracts ship and tour from product-level tags", () => {
    const saleTags: FeefoReviewTag[] = [
      { type: "SALE", key: "region", values: ["Uniworld (USD)"] },
      { type: "SALE", key: "loyalty", values: ["NO"] },
    ];
    const productTags: FeefoReviewTag[] = [
      { type: "SALE", key: "ship", values: ["River Tosca"] },
      { type: "SALE", key: "tour", values: ["Splendors of Egypt & the Nile on the River Tosca (CAI-CAI) 26"] },
      { type: "SALE", key: "package", values: ["Egypt"] },
    ];

    const result = parseTags(saleTags, productTags);

    expect(result.ship).toBe("River Tosca");
    expect(result.tour).toBe("Splendors of Egypt & the Nile on the River Tosca (CAI-CAI) 26");
    expect(result.package).toBe("Egypt");
    expect(result.region).toBe("Uniworld (USD)");
  });

  it("product tags override sale tags for same key", () => {
    const saleTags: FeefoReviewTag[] = [
      { type: "SALE", key: "ship", values: ["Old Ship"] },
    ];
    const productTags: FeefoReviewTag[] = [
      { type: "SALE", key: "ship", values: ["Correct Ship"] },
    ];

    const result = parseTags(saleTags, productTags);
    expect(result.ship).toBe("Correct Ship");
  });
});
