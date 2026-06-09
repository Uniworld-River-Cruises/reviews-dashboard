import { ReviewDocument } from "../../types/review";
import { toPublicReview, toPublicSummary, SummaryDocLike } from "../public";
import { resolveDisplayName } from "../display-name";

/** Fixture with sentinel PII values — the tests assert none of these strings
 * ever appear anywhere in serialized public output. */
const PII = {
  name: "PII_FULL_NAME_Jane_Doe",
  email: "PII_EMAIL_jane.doe@example.com",
  orderRef: "PII_ORDER_REF_12345",
  customerRef: "PII_CUSTOMER_REF_67890",
  location: "PII_LOCATION_London_UK",
  tourDirector: "PII_STAFF_NAME_Markus_W",
};

function fixture(overrides: Partial<ReviewDocument> = {}): ReviewDocument {
  return {
    id: "60a3f2c1e4b0a1b2c3d4e5f6",
    feedbackUrl: "https://www.feefo.com/en-US/reviews/uniworld/abc",
    brand: "uniworld",
    customer: {
      name: PII.name,
      displayName: "Jane D.",
      location: PII.location,
      email: PII.email,
      orderRef: PII.orderRef,
      customerRef: PII.customerRef,
    },
    product: {
      title: "Enchanting Danube",
      sku: "UW-DAN-8",
      parentSku: "UW-DAN",
      url: "https://www.uniworld.com/danube",
      imageUrl: "https://www.uniworld.com/danube.jpg",
    },
    ratings: { service: 5, product: 4 },
    reviews: {
      serviceTitle: "A wonderful trip",
      serviceText: "The booking team were responsive.",
      productText: "The Danube itinerary was breathtaking.",
    },
    tags: {
      ship: "S.S. Beatrice",
      tour: "Enchanting Danube (8 Days)",
      tourDirector: PII.tourDirector,
      bookingType: "Direct",
      region: "Central Europe",
      loyalty: "Returning Guest",
      clientType: "Couple",
      package: "All-Inclusive",
    },
    themes: {
      positive: ["Staff", "Excursions"],
      negative: ["Value"],
      classifiedAt: "2026-05-21T03:00:00Z",
    },
    media: [{ type: "PHOTO", url: "https://media.feefo.com/photo.jpg" }],
    dates: {
      created: "2026-05-20T09:15:00Z",
      lastUpdated: "2026-05-21T11:02:00Z",
      synced: "2026-05-21T12:00:00Z",
    },
    hasComment: true,
    hasMedia: true,
    moderationStatus: "published",
    verified: true,
    ...overrides,
  };
}

describe("resolveDisplayName", () => {
  it("returns the trimmed consented display name", () => {
    expect(resolveDisplayName({ displayName: "  Jane D.  " })).toBe("Jane D.");
  });

  it("falls back when the display name is missing or blank", () => {
    expect(resolveDisplayName({ displayName: null })).toBe("Trusted Customer");
    expect(resolveDisplayName({ displayName: "   " })).toBe("Trusted Customer");
    expect(resolveDisplayName(undefined)).toBe("Trusted Customer");
  });

  it("never reads any property other than displayName", () => {
    // A customer object with ONLY PII set must still produce the fallback.
    expect(
      resolveDisplayName({ name: PII.name, email: PII.email } as never)
    ).toBe("Trusted Customer");
  });
});

describe("toPublicReview — PII firewall", () => {
  it("never serializes any PII sentinel value", () => {
    const serialized = JSON.stringify(toPublicReview(fixture()));
    for (const value of Object.values(PII)) {
      expect(serialized).not.toContain(value);
    }
  });

  it("emits exactly the allowlisted top-level keys", () => {
    const pub = toPublicReview(fixture());
    expect(Object.keys(pub).sort()).toEqual(
      [
        "customer",
        "enrichment",
        "id",
        "last_updated_date",
        "merchant",
        "products",
        "service",
        "url",
        "verified",
      ].sort()
    );
  });

  it("customer contains ONLY display_name (no location, no name)", () => {
    const pub = toPublicReview(fixture());
    expect(Object.keys(pub.customer)).toEqual(["display_name"]);
    expect(pub.customer.display_name).toBe("Jane D.");
  });

  it("attributes exclude tour_director", () => {
    const pub = toPublicReview(fixture());
    expect(Object.keys(pub.enrichment.attributes).sort()).toEqual(
      [
        "booking_type",
        "client_type",
        "loyalty",
        "package",
        "region",
        "ship",
        "tour",
      ].sort()
    );
  });

  it("uses the site name rule (Trusted Customer fallback)", () => {
    const pub = toPublicReview(
      fixture({
        customer: {
          name: PII.name,
          displayName: null,
          location: null,
          email: PII.email,
          orderRef: null,
          customerRef: null,
        },
      })
    );
    expect(pub.customer.display_name).toBe("Trusted Customer");
  });
});

describe("toPublicReview — shape mapping", () => {
  it("wraps ratings in Feefo's {min,max,rating} envelope", () => {
    const pub = toPublicReview(fixture());
    expect(pub.service?.rating).toEqual({ min: 1, max: 5, rating: 5 });
    expect(pub.products[0].rating).toEqual({ min: 1, max: 5, rating: 4 });
  });

  it("emits service: null when there is no service rating, title, or text", () => {
    const pub = toPublicReview(
      fixture({
        ratings: { service: null, product: 4 },
        reviews: { serviceTitle: null, serviceText: null, productText: "Great." },
      })
    );
    expect(pub.service).toBeNull();
  });

  it("always emits exactly one products[] element with snake_case product fields", () => {
    const pub = toPublicReview(fixture());
    expect(pub.products).toHaveLength(1);
    expect(pub.products[0].product).toEqual({
      title: "Enchanting Danube",
      sku: "UW-DAN-8",
      parent_sku: "UW-DAN",
      url: "https://www.uniworld.com/danube",
      image_url: "https://www.uniworld.com/danube.jpg",
    });
  });

  it("resolves the itinerary group through the mapping lookup", () => {
    const lookup = new Map([["Enchanting Danube (8 Days)", "Enchanting Danube"]]);
    const pub = toPublicReview(fixture(), { itineraryGroupLookup: lookup });
    expect(pub.enrichment.itinerary).toEqual({
      raw: "Enchanting Danube (8 Days)",
      group: "Enchanting Danube",
    });
  });

  it("falls back to the raw name when no mapping exists", () => {
    const pub = toPublicReview(fixture());
    expect(pub.enrichment.itinerary.group).toBe("Enchanting Danube (8 Days)");
  });

  it("maps themes and flags", () => {
    const pub = toPublicReview(fixture());
    expect(pub.enrichment.themes).toEqual({
      positive: ["Staff", "Excursions"],
      negative: ["Value"],
      classified_at: "2026-05-21T03:00:00Z",
    });
    expect(pub.enrichment.flags).toEqual({ has_media: true, has_comment: true });
  });
});

describe("toPublicSummary", () => {
  const summaryDoc: SummaryDocLike = {
    scope: "fleet",
    scopeValue: null,
    totalReviews: 1842,
    reviewsWithComments: 1203,
    avgRating: 4.81,
    starDistribution: { "1": 10, "2": 20, "3": 50, "4": 210, "5": 1500 },
    topPositiveThemes: [{ theme: "Staff", count: 980 }],
    topNegativeThemes: [{ theme: "Value", count: 88 }],
    ships: ["S.S. Beatrice"],
    itineraries: ["Enchanting Danube"],
    lastUpdated: "2026-06-09T00:00:00Z",
  };

  it("maps the Feefo-shaped envelope with service: null", () => {
    const pub = toPublicSummary(summaryDoc, {
      identifier: "uniworld",
      name: "Uniworld",
    });
    expect(pub.merchant).toEqual({ identifier: "uniworld", name: "Uniworld" });
    expect(pub.meta).toEqual({ count: 1842 });
    expect(pub.rating.rating).toBe(4.81);
    expect(pub.rating.product).toEqual({
      count: 1790,
      "5_star": 1500,
      "4_star": 210,
      "3_star": 50,
      "2_star": 20,
      "1_star": 10,
    });
    expect(pub.rating.service).toBeNull();
  });

  it("carries scope and enrichment fields", () => {
    const pub = toPublicSummary(
      { ...summaryDoc, scope: "ship", scopeValue: "S.S. Beatrice" },
      { identifier: "uniworld", name: "Uniworld" }
    );
    expect(pub.enrichment.scope).toBe("ship");
    expect(pub.enrichment.scope_value).toBe("S.S. Beatrice");
    expect(pub.enrichment.top_positive_themes).toEqual([
      { theme: "Staff", count: 980 },
    ]);
  });
});
