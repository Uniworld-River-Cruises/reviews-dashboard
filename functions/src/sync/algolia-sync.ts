import { algoliasearch } from "algoliasearch";
import { ReviewDocument } from "@feefo/shared";

const client = algoliasearch(
  process.env.ALGOLIA_APP_ID!,
  process.env.ALGOLIA_ADMIN_KEY!
);

const INDEX_NAME = "reviews";

export async function syncToAlgolia(reviews: ReviewDocument[]): Promise<void> {
  const objects = reviews
    .filter((r) => r.hasComment)
    .map((r) => ({
      objectID: r.id,
      brand: r.brand,
      customerName: r.customer.displayName,
      productTitle: r.product.title,
      serviceRating: r.ratings.service,
      productRating: r.ratings.product,
      serviceText: r.reviews.serviceText,
      productText: r.reviews.productText,
      ship: r.tags.ship,
      tour: r.tags.tour,
      bookingType: r.tags.bookingType,
      region: r.tags.region,
      loyalty: r.tags.loyalty,
      positiveThemes: r.themes.positive,
      negativeThemes: r.themes.negative,
      createdAt: new Date(r.dates.created).getTime() / 1000,
      createdAtISO: r.dates.created,
    }));

  for (let i = 0; i < objects.length; i += 1000) {
    const batch = objects.slice(i, i + 1000);
    await client.saveObjects({
      indexName: INDEX_NAME,
      objects: batch,
    });
  }
}

export async function configureAlgoliaIndex(): Promise<void> {
  await client.setSettings({
    indexName: INDEX_NAME,
    indexSettings: {
      searchableAttributes: [
        "productText",
        "serviceText",
        "customerName",
        "productTitle",
        "ship",
        "tour",
      ],
      attributesForFaceting: [
        "filterOnly(brand)",
        "filterOnly(ship)",
        "filterOnly(tour)",
        "filterOnly(bookingType)",
        "filterOnly(region)",
        "filterOnly(loyalty)",
        "searchable(positiveThemes)",
        "searchable(negativeThemes)",
        "filterOnly(serviceRating)",
        "filterOnly(productRating)",
      ],
      ranking: ["desc(createdAt)", "typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"],
      numericAttributesForFiltering: ["createdAt", "serviceRating", "productRating"],
    },
  });
}
