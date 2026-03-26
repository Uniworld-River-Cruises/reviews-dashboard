import { transformReview } from "../transform";
import { FeefoReview } from "../types";

const sampleReview: FeefoReview = {
  merchant: { identifier: "uniworld" },
  url: "https://www.feefo.com/reviews/uniworld/feedback-123",
  customer: {
    name: "Jane Doe",
    display_name: "Jane Doe",
    display_location: "USA",
    email: "jane@example.com",
    order_ref: "ORD-123",
    customer_ref: "CUST-456",
  },
  service: {
    rating: { min: 1, max: 5, rating: 5 },
    id: "svc-001",
    title: "Wonderful crew",
    review: "The staff was amazing.",
    created_at: "2026-01-15T10:00:00Z",
  },
  products: [
    {
      rating: { min: 1, max: 5, rating: 4 },
      id: "prod-001",
      review: "Beautiful ship and great excursions.",
      media: [{ id: "m1", type: "PHOTO", url: "https://img.com/1.jpg" }],
      product: {
        title: "Rhine Holiday Markets",
        sku: "21666-51823",
        parent_sku: "204",
        url: "https://uniworld.com/rhine",
        image_url: "https://img.com/rhine.jpg",
      },
      created_at: "2026-01-15T10:00:00Z",
    },
  ],
  tags: [
    { type: "SALE", key: "ship", values: ["S.S. Elisabeth"] },
    {
      type: "SALE",
      key: "tour",
      values: ["Rhine Holiday Markets (BSL-CGN) 25"],
    },
    { type: "SALE", key: "pbbbooking", values: ["RA - Agency"] },
  ],
  last_updated_date: "2026-01-15T12:00:00Z",
};

describe("transformReview", () => {
  it("uses service.id as document ID (feedback ID)", () => {
    const result = transformReview(sampleReview);
    expect(result.id).toBe("svc-001");
  });

  it("transforms a Feefo review to Firestore format", () => {
    const result = transformReview(sampleReview);
    expect(result.brand).toBe("uniworld");
    expect(result.feedbackUrl).toContain("feefo.com");
    expect(result.customer.name).toBe("Jane Doe");
    expect(result.product.title).toBe("Rhine Holiday Markets");
    expect(result.ratings.service).toBe(5);
    expect(result.ratings.product).toBe(4);
    expect(result.reviews.serviceText).toBe("The staff was amazing.");
    expect(result.reviews.productText).toBe(
      "Beautiful ship and great excursions."
    );
    expect(result.tags.ship).toBe("S.S. Elisabeth");
    expect(result.tags.tour).toBe("Rhine Holiday Markets (BSL-CGN) 25");
    expect(result.hasComment).toBe(true);
    expect(result.themes.positive).toEqual([]);
    expect(result.themes.classifiedAt).toBeNull();
  });

  it("handles reviews with no service section", () => {
    const noService = { ...sampleReview, service: undefined };
    const result = transformReview(noService);
    expect(result.id).toBe("prod-001");
    expect(result.ratings.service).toBeNull();
    expect(result.reviews.serviceText).toBeNull();
  });

  it("handles reviews with no products", () => {
    const noProducts = { ...sampleReview, products: [] };
    const result = transformReview(noProducts);
    expect(result.id).toBe("svc-001");
    expect(result.ratings.product).toBeNull();
    expect(result.product.title).toBe("Unknown");
  });

  it("handles reviews with no tags", () => {
    const noTags = { ...sampleReview, tags: undefined };
    const result = transformReview(noTags);
    expect(result.tags.ship).toBeNull();
  });

  it("marks hasComment false for rating-only reviews", () => {
    const ratingOnly: FeefoReview = {
      ...sampleReview,
      service: { ...sampleReview.service!, review: undefined },
      products: [{ ...sampleReview.products[0], review: undefined }],
    };
    const result = transformReview(ratingOnly);
    expect(result.hasComment).toBe(false);
  });
});
