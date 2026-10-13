/**
 * OpenAPI 3.1 description of the public reviews API, plus the interactive
 * docs page (Scalar) that renders it.
 *
 * This object is the single source of truth: it is served verbatim at
 * GET /api/v1/openapi.json (for Postman/Insomnia import and SDK generation)
 * and embedded into the GET /api/docs reference page. Keep it in sync with
 * the router in reviews-api.ts and the public shapes in
 * shared/src/reviews/public.ts.
 */

const PROD_BASE = "https://feefo-reviews.web.app/api";

const ERROR_RESPONSE = {
  description: "Error envelope",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Uniworld Reviews API",
    version: "1.0.0",
    description: [
      "Read-only access to Uniworld's verified guest reviews and rating",
      "summaries, enriched with AI theme classifications and normalized",
      "attributes. The shape emulates the Feefo NativeReviews API.",
      "",
      "## Authentication",
      "Server-to-server OAuth 2.0 client-credentials. Create credentials in the",
      "dashboard (Admin → API Access), then either:",
      "",
      "1. Click **Authorize** above, choose *oauth2*, and enter your client ID +",
      "   secret — the docs will fetch a token and use it for *Try it out*; or",
      "2. `POST /v1/oauth/token` with `grant_type=client_credentials` and your",
      "   credentials, then send `Authorization: Bearer <access_token>`.",
      "",
      "Tokens are opaque and expire after 1 hour. Each credential is scoped to",
      "specific merchants; requests outside that scope return 403.",
      "",
      "## Notes",
      "- `merchant_identifier` selects the brand (`uniworld`, `luxury-gold`, or",
      "  `all`).",
      "- Customer PII is never returned: only the consented display name and the",
      "  customer's display location (`customer.display_location`, as Feefo shows it).",
      "- `reply` is the merchant's latest reply as plain text (converted from",
      "  Feefo's HTML). Escape it when rendering.",
      "- `website=approved` returns only reviews a person approved for the website",
      "  in the dashboard's Website Queue; `placement` narrows to a carousel.",
      "- Deep pagination uses the opaque `cursor`; `page`/`page_size` is capped.",
    ].join("\n"),
    contact: { name: "Uniworld Reviews API" },
  },
  servers: [{ url: PROD_BASE, description: "Production" }],
  security: [{ oauth2: ["reviews:read", "summary:read", "meta:read"] }, { bearerAuth: [] }],
  tags: [
    { name: "Auth", description: "Token exchange" },
    { name: "Reviews", description: "Individual reviews" },
    { name: "Summaries", description: "Pre-aggregated ratings" },
    { name: "Meta", description: "Reference data" },
  ],
  paths: {
    "/v1/oauth/token": {
      post: {
        tags: ["Auth"],
        summary: "Exchange client credentials for a bearer token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/TokenRequest" },
            },
            "application/json": {
              schema: { $ref: "#/components/schemas/TokenRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Access token",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TokenResponse" } },
            },
          },
          "400": ERROR_RESPONSE,
          "401": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/v1/reviews/all": {
      get: {
        tags: ["Reviews"],
        summary: "List reviews",
        description:
          "Paginated, filtered list. At most one of the indexed filters " +
          "(ship/tour/region/booking_type/loyalty/product_sku/parent_product_sku/" +
          "positive_theme/negative_theme/has_media) may be used per request. " +
          "`website=approved` (optionally with `placement`) may be added to one of " +
          "ship/tour/parent_product_sku/positive_theme (but `placement` and " +
          "`positive_theme` cannot be combined). `sort=highest|lowest` may be combined " +
          "only with parent_product_sku, and not with date filters.",
        parameters: [
          { $ref: "#/components/parameters/MerchantIdentifier" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "1-based page; `page * page_size` capped at 1000 — use `cursor` beyond that." },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor from a prior response's `next_cursor`. Preferred for deep iteration." },
          { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "oldest", "highest", "lowest"], default: "newest" }, description: "newest/oldest: by date. highest/lowest: by headline rating (product rating, else service, rounded), then newest first. Feefo has no rating sort; this is an extension." },
          { name: "since_period", in: "query", schema: { type: "string", enum: ["week", "month", "quarter", "half_year", "year", "all"] }, description: "Filter on created date." },
          { name: "since_updated_period", in: "query", schema: { type: "string", enum: ["week", "month", "quarter", "half_year", "year", "all"] }, description: "Filter on last-updated date (mutually exclusive with created-date filters)." },
          { name: "date_time_from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "date_time_to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "rating", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 }, description: "Exact headline star (product rating, else service rating, rounded). On its own (with or without date filters) it runs server-side: exact `count` and `page` work. Combined with another filter it is applied while scanning: `count` is null and pages beyond the first need `cursor`." },
          { name: "review_type", in: "query", schema: { type: "string", enum: ["all", "service", "product"], default: "all" } },
          { name: "has_media", in: "query", schema: { type: "boolean" } },
          { name: "ship", in: "query", schema: { type: "string" } },
          { name: "tour", in: "query", schema: { type: "string" } },
          { name: "region", in: "query", schema: { type: "string" } },
          { name: "booking_type", in: "query", schema: { type: "string" } },
          { name: "loyalty", in: "query", schema: { type: "string" } },
          { name: "product_sku", in: "query", schema: { type: "string" } },
          { name: "parent_product_sku", in: "query", schema: { type: "string" } },
          { name: "positive_theme", in: "query", schema: { type: "string" }, description: "AI theme name, e.g. `Staff`." },
          { name: "negative_theme", in: "query", schema: { type: "string" } },
          { name: "website", in: "query", schema: { type: "string", enum: ["approved"] }, description: "Only reviews approved for the website in the dashboard's Website Queue. Created-date sorting and filters only." },
          { name: "placement", in: "query", schema: { type: "string", enum: ["guest-stories", "culinary", "ships", "travel-that-gives-back"] }, description: "Requires `website=approved`. Only approved reviews tagged for this placement." },
        ],
        responses: {
          "200": {
            description: "A page of reviews",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ReviewListResponse" } },
            },
          },
          "400": ERROR_RESPONSE,
          "401": ERROR_RESPONSE,
          "403": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/v1/reviews/{id}": {
      get: {
        tags: ["Reviews"],
        summary: "Get a single review",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Stable review id from a list response." },
        ],
        responses: {
          "200": {
            description: "The review",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PublicReview" } } },
          },
          "401": ERROR_RESPONSE,
          "403": ERROR_RESPONSE,
          "404": { description: "Not found, or outside the credential's merchant scope (identical response for both).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/v1/reviews/summary/all": {
      get: {
        tags: ["Summaries"],
        summary: "Aggregate ratings + star distribution",
        description: "Served from precomputed summaries (refreshed on every sync). `rating.rating` is the average PRODUCT rating of the stored reviews at every scope. The fleet scope for a single merchant also carries Feefo's own published merchant numbers in `rating.feefo_rating` and `meta.feefo_count` (use these for a headline that matches Feefo); they are null at other scopes and for `all` merges. `rating.service` is null for legacy summary documents and for `all` merges where any merchant lacks a service distribution.",
        parameters: [
          { $ref: "#/components/parameters/MerchantIdentifier" },
          { name: "scope", in: "query", schema: { type: "string", enum: ["fleet", "ship", "itinerary", "product"], default: "fleet" }, description: "`product` is one trip, identified by `parent_product_sku`." },
          { name: "scope_value", in: "query", schema: { type: "string" }, description: "Required when scope is ship or itinerary." },
          { name: "parent_product_sku", in: "query", schema: { type: "string" }, description: "Required when scope is product: the Feefo parent product SKU (itinerary code), e.g. `176`." },
        ],
        responses: {
          "200": {
            description: "Summary",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PublicSummary" } } },
          },
          "400": ERROR_RESPONSE,
          "401": ERROR_RESPONSE,
          "403": ERROR_RESPONSE,
          "404": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/v1/meta/themes": {
      get: {
        tags: ["Meta"],
        summary: "AI theme taxonomy",
        responses: {
          "200": {
            description: "Positive and negative theme names + descriptions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    themes: {
                      type: "object",
                      properties: {
                        positive: { type: "array", items: { $ref: "#/components/schemas/ThemeDefinition" } },
                        negative: { type: "array", items: { $ref: "#/components/schemas/ThemeDefinition" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": ERROR_RESPONSE,
          "403": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
    "/v1/meta/merchants": {
      get: {
        tags: ["Meta"],
        summary: "Merchants visible to the credential",
        responses: {
          "200": {
            description: "Merchant identifiers + labels",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    merchants: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          merchant_identifier: { type: "string" },
                          label: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": ERROR_RESPONSE,
          "403": ERROR_RESPONSE,
          "429": ERROR_RESPONSE,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      oauth2: {
        type: "oauth2",
        description: "Client-credentials grant. Enter your client ID + secret; the docs fetch and apply a token.",
        flows: {
          clientCredentials: {
            tokenUrl: `${PROD_BASE}/v1/oauth/token`,
            scopes: {
              "reviews:read": "Read reviews",
              "summary:read": "Read rating summaries",
              "meta:read": "Read reference data",
            },
          },
        },
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Paste an access_token obtained from /v1/oauth/token.",
      },
    },
    parameters: {
      MerchantIdentifier: {
        name: "merchant_identifier",
        in: "query",
        schema: { type: "string", default: "all" },
        description: "`uniworld`, `luxury-gold`, a comma list, or `all`. Constrained to the credential's scope.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "invalid_parameter" },
              message: { type: "string" },
              request_id: { type: "string" },
            },
            required: ["code", "message", "request_id"],
          },
        },
      },
      TokenRequest: {
        type: "object",
        required: ["client_id", "client_secret", "grant_type"],
        properties: {
          client_id: { type: "string" },
          client_secret: { type: "string" },
          grant_type: { type: "string", enum: ["client_credentials"] },
        },
      },
      TokenResponse: {
        type: "object",
        properties: {
          access_token: { type: "string" },
          token_type: { type: "string", example: "Bearer" },
          expires_in: { type: "integer", example: 3600 },
        },
      },
      Rating: {
        type: "object",
        properties: {
          min: { type: "integer", example: 1 },
          max: { type: "integer", example: 5 },
          rating: { type: ["number", "null"] },
        },
      },
      Media: {
        type: "object",
        properties: {
          type: { type: "string", example: "PHOTO" },
          url: { type: "string", format: "uri" },
        },
      },
      StarDistribution: {
        type: "object",
        properties: {
          count: { type: "integer" },
          "5_star": { type: "integer" },
          "4_star": { type: "integer" },
          "3_star": { type: "integer" },
          "2_star": { type: "integer" },
          "1_star": { type: "integer" },
        },
      },
      PublicReview: {
        type: "object",
        properties: {
          merchant: { type: "object", properties: { identifier: { type: "string" } } },
          id: { type: "string" },
          url: { type: "string", format: "uri" },
          customer: {
            type: "object",
            properties: {
              display_name: { type: "string", example: "Jane D." },
              display_location: { type: ["string", "null"], example: "London, United Kingdom", description: "The location the customer chose to display on Feefo; null when none." },
            },
          },
          service: {
            oneOf: [
              {
                type: "object",
                properties: {
                  rating: { $ref: "#/components/schemas/Rating" },
                  title: { type: ["string", "null"] },
                  review: { type: ["string", "null"] },
                  created_at: { type: "string" },
                },
              },
              { type: "null" },
            ],
          },
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rating: { $ref: "#/components/schemas/Rating" },
                review: { type: ["string", "null"] },
                media: { type: "array", items: { $ref: "#/components/schemas/Media" } },
                product: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    sku: { type: "string" },
                    parent_sku: { type: ["string", "null"] },
                    url: { type: ["string", "null"] },
                    image_url: { type: ["string", "null"] },
                  },
                },
                created_at: { type: "string" },
              },
            },
          },
          last_updated_date: { type: "string" },
          verified: { type: "boolean" },
          reply: {
            description: "The merchant's latest reply, or null. Plain text converted from Feefo's HTML (line breaks kept as \\n); escape it when rendering.",
            oneOf: [
              {
                type: "object",
                properties: {
                  text: { type: "string" },
                  author: { type: ["string", "null"], example: "Customer Service" },
                  created_at: { type: ["string", "null"] },
                },
              },
              { type: "null" },
            ],
          },
          enrichment: {
            type: "object",
            properties: {
              themes: {
                type: "object",
                properties: {
                  positive: { type: "array", items: { type: "string" } },
                  negative: { type: "array", items: { type: "string" } },
                  classified_at: { type: ["string", "null"] },
                },
              },
              attributes: {
                type: "object",
                properties: {
                  ship: { type: ["string", "null"] },
                  tour: { type: ["string", "null"] },
                  booking_type: { type: ["string", "null"] },
                  region: { type: ["string", "null"] },
                  loyalty: { type: ["string", "null"] },
                  client_type: { type: ["string", "null"] },
                  package: { type: ["string", "null"] },
                },
              },
              itinerary: {
                type: "object",
                properties: {
                  raw: { type: ["string", "null"] },
                  group: { type: ["string", "null"] },
                },
              },
              flags: {
                type: "object",
                properties: {
                  has_media: { type: "boolean" },
                  has_comment: { type: "boolean" },
                },
              },
            },
          },
        },
      },
      ReviewListResponse: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              meta: {
                type: "object",
                properties: {
                  count: { type: ["integer", "null"], description: "Total matches; null when a post-filter is active (review_type, or rating combined with another filter)." },
                  pages: { type: ["integer", "null"] },
                  page_size: { type: "integer" },
                  current_page: { type: ["integer", "null"] },
                },
              },
              next_cursor: { type: ["string", "null"] },
            },
          },
          reviews: { type: "array", items: { $ref: "#/components/schemas/PublicReview" } },
        },
      },
      PublicSummary: {
        type: "object",
        properties: {
          merchant: {
            type: "object",
            properties: { identifier: { type: "string" }, name: { type: "string" } },
          },
          meta: {
            type: "object",
            properties: {
              count: { type: "integer" },
              feefo_count: { type: ["integer", "null"], example: 24888, description: "Feefo's own review count for the merchant (fleet scope, single merchant)." },
            },
          },
          rating: {
            type: "object",
            properties: {
              min: { type: "integer", example: 1 },
              max: { type: "integer", example: 5 },
              rating: { type: "number", description: "Average product rating of the stored reviews." },
              feefo_rating: { type: ["number", "null"], example: 4.8, description: "Feefo's own published merchant rating (fleet scope, single merchant)." },
              product: { $ref: "#/components/schemas/StarDistribution" },
              service: {
                oneOf: [{ $ref: "#/components/schemas/StarDistribution" }, { type: "null" }],
              },
            },
          },
          enrichment: {
            type: "object",
            properties: {
              scope: { type: "string", enum: ["fleet", "ship", "itinerary", "product"] },
              scope_value: { type: ["string", "null"] },
              reviews_with_comments: { type: "integer" },
              top_positive_themes: { type: "array", items: { $ref: "#/components/schemas/ThemeCount" } },
              top_negative_themes: { type: "array", items: { $ref: "#/components/schemas/ThemeCount" } },
              ships: { type: "array", items: { type: "string" } },
              itineraries: { type: "array", items: { type: "string" } },
              last_updated: { type: ["string", "null"] },
            },
          },
        },
      },
      ThemeCount: {
        type: "object",
        properties: { theme: { type: "string" }, count: { type: "integer" } },
      },
      ThemeDefinition: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
      },
    },
  },
} as const;

/**
 * The interactive reference page. Scalar reads the spec embedded in the
 * script tag (no network fetch needed to render), and drives Try-it-out
 * against the `servers` URL in the spec.
 */
export function renderDocsHtml(): string {
  const spec = JSON.stringify(openApiDocument);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Uniworld Reviews API — Reference</title>
  </head>
  <body>
    <script id="api-reference" type="application/json">${spec}</script>
    <script>
      var configuration = { theme: "default" };
      document.getElementById("api-reference").dataset.configuration =
        JSON.stringify(configuration);
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
