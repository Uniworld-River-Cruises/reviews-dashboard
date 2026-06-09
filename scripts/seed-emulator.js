/**
 * Seed the Firestore EMULATOR with sample data for exercising the public
 * reviews API locally (reviews, summaries, itinerary mappings, and one API
 * client whose credentials are printed at the end).
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator.js
 *
 * The API client's secret verifier is computed with the same peppered HMAC
 * as functions/src/api/auth.ts, using REVIEWS_API_SECRET_PEPPER (defaults to
 * the local-test pepper below — keep it in sync with functions/.env.local).
 */

const { createHmac } = require("crypto");
const path = require("path");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set (emulator only).");
  process.exit(1);
}

// Reuse the functions package's firebase-admin install.
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "feefo-reviews" });
const db = admin.firestore();

const PEPPER = process.env.REVIEWS_API_SECRET_PEPPER || "local-test-pepper-0123456789abcdef";
const CLIENT_ID = "uw_live_local0test01";
const CLIENT_SECRET = "local-test-secret-not-for-production-1234";

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function review({ id, brand, displayName, ship, tour, region, serviceRating, productRating, serviceText, productText, positive, negative, media, daysAgo, sku, parentSku }) {
  return {
    id,
    feedbackUrl: `https://www.feefo.com/en-US/reviews/${brand}/${id}`,
    brand,
    customer: {
      name: "SEED_PII_FULL_NAME",
      displayName: displayName ?? null,
      location: "SEED_PII_LOCATION",
      email: "seed-pii@example.com",
      orderRef: "SEED_PII_ORDER",
      customerRef: "SEED_PII_CUSTOMER",
    },
    product: {
      title: tour,
      sku: sku ?? `${brand.toUpperCase()}-SKU-${id.slice(-2)}`,
      parentSku: parentSku ?? null,
      url: null,
      imageUrl: null,
    },
    ratings: { service: serviceRating ?? null, product: productRating ?? null },
    reviews: {
      serviceTitle: serviceText ? "Service headline" : null,
      serviceText: serviceText ?? null,
      productText: productText ?? null,
    },
    tags: {
      ship: ship ?? null,
      tour,
      tourDirector: "SEED_PII_TOUR_DIRECTOR",
      bookingType: "Direct",
      region: region ?? null,
      loyalty: "Returning Guest",
      clientType: "Couple",
      package: null,
    },
    themes: {
      positive: positive ?? [],
      negative: negative ?? [],
      classifiedAt: isoDaysAgo(daysAgo - 0.5),
    },
    media: media ?? [],
    dates: {
      created: isoDaysAgo(daysAgo),
      lastUpdated: isoDaysAgo(daysAgo - 0.25),
      synced: new Date().toISOString(),
    },
    hasComment: Boolean(serviceText || productText),
    hasMedia: (media ?? []).length > 0,
    moderationStatus: "published",
    verified: true,
  };
}

const REVIEWS = [
  review({
    id: "aaaaaaaaaaaaaaaaaaaaaa01", brand: "uniworld", displayName: "Jane D.",
    ship: "S.S. Beatrice", tour: "Enchanting Danube (8 Days)", region: "Central Europe",
    serviceRating: 5, productRating: 5,
    serviceText: "Booking was effortless.", productText: "The Danube was breathtaking.",
    positive: ["Staff", "Excursions"], negative: [],
    media: [{ type: "PHOTO", url: "https://example.com/p1.jpg" }],
    daysAgo: 2, sku: "UW-DAN-8", parentSku: "UW-DAN",
  }),
  review({
    id: "aaaaaaaaaaaaaaaaaaaaaa02", brand: "uniworld", displayName: null,
    ship: "S.S. Beatrice", tour: "Enchanting Danube (8 Days)", region: "Central Europe",
    serviceRating: 4, productRating: 4,
    serviceText: null, productText: "Lovely ship, food could improve.",
    positive: ["Ship"], negative: ["Food Quality"],
    daysAgo: 5, sku: "UW-DAN-8", parentSku: "UW-DAN",
  }),
  review({
    id: "aaaaaaaaaaaaaaaaaaaaaa03", brand: "uniworld", displayName: "Robert K.",
    ship: "S.S. Maria Theresa", tour: "Castles along the Rhine", region: "Western Europe",
    serviceRating: 3, productRating: null,
    serviceText: "Itinerary changed twice before sailing.", productText: null,
    positive: [], negative: ["Itinerary Changes"],
    daysAgo: 40, sku: "UW-RHI-10",
  }),
  review({
    id: "bbbbbbbbbbbbbbbbbbbbbb01", brand: "luxury-gold", displayName: "Amelia P.",
    ship: null, tour: "Majestic Switzerland", region: "Alps",
    serviceRating: 5, productRating: 5,
    serviceText: "White-glove from start to finish.", productText: "Hotels were superb.",
    positive: ["Service", "Accommodation"], negative: [],
    media: [{ type: "PHOTO", url: "https://example.com/p2.jpg" }],
    daysAgo: 3, sku: "LG-SWI-9",
  }),
  review({
    id: "bbbbbbbbbbbbbbbbbbbbbb02", brand: "luxury-gold", displayName: null,
    ship: null, tour: "Majestic Switzerland", region: "Alps",
    serviceRating: 2, productRating: 2,
    serviceText: null, productText: "Not worth the price.",
    positive: [], negative: ["Value"],
    daysAgo: 10, sku: "LG-SWI-9",
  }),
];

function summary({ brand, scope, scopeValue, reviews }) {
  const ratings = reviews.map((r) => r.ratings.product).filter((r) => typeof r === "number");
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) dist[Math.round(r)] += 1;
  const positive = {};
  const negative = {};
  for (const r of reviews) {
    for (const t of r.themes.positive) positive[t] = (positive[t] || 0) + 1;
    for (const t of r.themes.negative) negative[t] = (negative[t] || 0) + 1;
  }
  const top = (counts) =>
    Object.entries(counts).map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  return {
    id: scopeValue ? `${brand}_${scope}_${scopeValue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : brand,
    brand,
    scope,
    scopeValue: scopeValue ?? null,
    totalReviews: reviews.length,
    reviewsWithComments: reviews.filter((r) => r.hasComment).length,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0,
    starDistribution: { 1: dist[1], 2: dist[2], 3: dist[3], 4: dist[4], 5: dist[5] },
    topPositiveThemes: top(positive),
    topNegativeThemes: top(negative),
    ships: [...new Set(reviews.map((r) => r.tags.ship).filter(Boolean))],
    itineraries: [...new Set(reviews.map((r) => r.tags.tour).filter(Boolean))],
    childItineraries: [],
    lastUpdated: new Date().toISOString(),
  };
}

async function main() {
  for (const r of REVIEWS) {
    await db.collection("reviews").doc(r.id).set(r);
  }

  const uniworld = REVIEWS.filter((r) => r.brand === "uniworld");
  const luxuryGold = REVIEWS.filter((r) => r.brand === "luxury-gold");
  const summaries = [
    summary({ brand: "uniworld", scope: "fleet", scopeValue: null, reviews: uniworld }),
    summary({ brand: "luxury-gold", scope: "fleet", scopeValue: null, reviews: luxuryGold }),
    summary({ brand: "uniworld", scope: "ship", scopeValue: "S.S. Beatrice", reviews: uniworld.filter((r) => r.tags.ship === "S.S. Beatrice") }),
  ];
  for (const s of summaries) {
    await db.collection("summaries").doc(s.id).set(s);
  }

  await db.collection("itinerary_mappings").doc("uniworld_enchanting-danube-8-days").set({
    rawName: "Enchanting Danube (8 Days)",
    autoParentName: "Enchanting Danube",
    manualParentName: null,
    effectiveParentName: "Enchanting Danube",
    brand: "uniworld",
    reviewCount: 2,
    lastUpdated: new Date().toISOString(),
  });

  const verifier = createHmac("sha256", PEPPER).update(CLIENT_SECRET).digest("hex");
  await db.collection("api_clients").doc(CLIENT_ID).set({
    clientId: CLIENT_ID,
    secretVerifier: verifier,
    label: "Local emulator test client",
    merchants: ["*"],
    scopes: ["reviews:read", "summary:read", "meta:read"],
    status: "active",
    tokenVersion: 1,
    createdBy: "seed-script",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: null,
  });
  // A second client scoped to luxury-gold only, for scope-enforcement checks.
  await db.collection("api_clients").doc("uw_live_lgonly00001").set({
    clientId: "uw_live_lgonly00001",
    secretVerifier: createHmac("sha256", PEPPER).update("lg-only-secret").digest("hex"),
    label: "LG-scoped test client",
    merchants: ["luxury-gold"],
    scopes: ["reviews:read", "summary:read", "meta:read"],
    status: "active",
    tokenVersion: 1,
    createdBy: "seed-script",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: null,
  });

  console.log(`Seeded ${REVIEWS.length} reviews, ${summaries.length} summaries, 1 mapping, 2 api_clients.`);
  console.log(`client_id:     ${CLIENT_ID}`);
  console.log(`client_secret: ${CLIENT_SECRET}`);
  console.log(`lg-only client: uw_live_lgonly00001 / lg-only-secret`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
