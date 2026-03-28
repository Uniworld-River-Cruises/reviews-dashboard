import { FeefoReviewTag } from "./types";

export interface ParsedTags {
  ship: string | null;
  tour: string | null;
  tourDirector: string | null;
  bookingType: string | null;
  region: string | null;
  loyalty: string | null;
  clientType: string | null;
  package: string | null;
}

const TAG_KEY_MAP: Record<string, keyof ParsedTags> = {
  ship: "ship",
  tour: "tour",
  tourdirector: "tourDirector",
  pbbbooking: "bookingType",
  region: "region",
  loyalty: "loyalty",
  clienttype: "clientType",
  package: "package",
};

export function parseTags(
  saleTags: FeefoReviewTag[] | undefined,
  productTags?: FeefoReviewTag[] | undefined,
): ParsedTags {
  const result: ParsedTags = {
    ship: null,
    tour: null,
    tourDirector: null,
    bookingType: null,
    region: null,
    loyalty: null,
    clientType: null,
    package: null,
  };

  // Parse sale-level tags first
  if (saleTags) {
    for (const tag of saleTags) {
      const field = TAG_KEY_MAP[tag.key.toLowerCase()];
      if (field && tag.values.length > 0) {
        result[field] = tag.values[0];
      }
    }
  }

  // Product-level tags override (ship, tour, package live here)
  if (productTags) {
    for (const tag of productTags) {
      const field = TAG_KEY_MAP[tag.key.toLowerCase()];
      if (field && tag.values.length > 0) {
        result[field] = tag.values[0];
      }
    }
  }

  return result;
}
