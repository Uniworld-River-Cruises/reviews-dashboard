export interface ReviewDocument {
  id: string;
  feedbackUrl: string;
  brand: "uniworld" | "luxury-gold";
  customer: {
    name: string | null;
    displayName: string | null;
    location: string | null;
    email: string | null;
    orderRef: string | null;
    customerRef: string | null;
  };
  product: {
    title: string;
    sku: string;
    parentSku: string | null;
    url: string | null;
    imageUrl: string | null;
  };
  ratings: {
    service: number | null;
    product: number | null;
  };
  reviews: {
    serviceTitle: string | null;
    serviceText: string | null;
    productText: string | null;
  };
  tags: {
    ship: string | null;
    tour: string | null;
    tourDirector: string | null;
    bookingType: string | null;
    region: string | null;
    loyalty: string | null;
    clientType: string | null;
    package: string | null;
  };
  themes: {
    positive: string[];
    negative: string[];
    classifiedAt: string | null;
  };
  media: { type: string; url: string }[];
  dates: {
    created: string;
    lastUpdated: string;
    synced: string;
  };
  hasComment: boolean;
  /** Mirror of `media.length > 0`. Persisted as its own boolean so the
   * Reviews Explorer can filter media-bearing reviews server-side —
   * Firestore can't query "array length > 0" directly. */
  hasMedia: boolean;
  moderationStatus: string;
  verified: boolean;
}
