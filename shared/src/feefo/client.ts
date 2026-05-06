import {
  FeefoCredentials,
  FeefoTokenResponse,
  FeefoReviewsResponse,
  FeefoSummaryResponse,
  Brand,
} from "./types";

const FEEFO_BASE_URL = "https://api.feefo.com/api";
const TOKEN_URL = `${FEEFO_BASE_URL}/oauth/v2/token`;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const MERCHANT_IDENTIFIERS: Record<Brand, string> = {
  uniworld: "uniworld",
  "luxury-gold": "luxury-gold",
};

const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);

    if (res.ok) return res;

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`Feefo API ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    throw new Error(`Feefo API error: ${res.status} ${await res.text()}`);
  }

  throw new Error("Exhausted retries");
}

export function getBrandCredentials(brand: Brand): FeefoCredentials {
  const envMap: Record<Brand, { idKey: string; secretKey: string; merchant: string }> = {
    uniworld: {
      idKey: "FEEFO_UNIWORLD_CLIENT_ID",
      secretKey: "FEEFO_UNIWORLD_CLIENT_SECRET",
      merchant: "uniworld",
    },
    "luxury-gold": {
      idKey: "FEEFO_LUXURY_GOLD_CLIENT_ID",
      secretKey: "FEEFO_LUXURY_GOLD_CLIENT_SECRET",
      merchant: "luxury-gold",
    },
  };

  const config = envMap[brand];
  const clientId = process.env[config.idKey];
  const clientSecret = process.env[config.secretKey];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing credentials for ${brand}: ${config.idKey} and/or ${config.secretKey}`);
  }

  return { clientId, clientSecret, merchantIdentifier: config.merchant };
}

export async function getAccessToken(brand: Brand): Promise<string> {
  const cached = tokenCache[brand];
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.token;
  }

  const creds = getBrandCredentials(brand);
  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const data = (await res.json()) as FeefoTokenResponse;
  tokenCache[brand] = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function fetchReviews(
  brand: Brand,
  params: {
    page?: number;
    pageSize?: number;
    sincePeriod?: "month" | "year" | "all";
    sinceUpdatedPeriod?: "month" | "year" | "all";
    /**
     * When true, sets `media=ONLY` on the request. Feefo returns the `media`
     * field on `products[]` only when this filter is active — the default
     * `/reviews/all` response strips media entirely. Note that ONLY is also
     * a *filter*: the response is limited to reviews that have media
     * (currently around 7% of reviews). Use this for the media-enrichment
     * sync pass, not the main sync.
     */
    mediaOnly?: boolean;
  } = {}
): Promise<FeefoReviewsResponse> {
  const token = await getAccessToken(brand);
  const creds = getBrandCredentials(brand);

  const searchParams = new URLSearchParams({
    merchant_identifier: creds.merchantIdentifier,
    page_size: String(params.pageSize ?? 100),
    page: String(params.page ?? 1),
  });

  if (params.sincePeriod) searchParams.set("since_period", params.sincePeriod);
  if (params.sinceUpdatedPeriod) searchParams.set("since_updated_period", params.sinceUpdatedPeriod);
  if (params.mediaOnly) searchParams.set("media", "ONLY");

  const url = `${FEEFO_BASE_URL}/20/reviews/all?${searchParams}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return (await res.json()) as FeefoReviewsResponse;
}

export async function fetchAllReviews(
  brand: Brand,
  sincePeriod: "month" | "year" | "all" = "all",
  onProgress?: (page: number, totalPages: number) => void
): Promise<FeefoReviewsResponse["reviews"]> {
  const allReviews: FeefoReviewsResponse["reviews"] = [];
  let page = 1;

  while (true) {
    const response = await fetchReviews(brand, { page, sincePeriod });
    allReviews.push(...response.reviews);

    if (onProgress) onProgress(page, response.summary.meta.pages);
    if (page >= response.summary.meta.pages) break;
    page++;
  }

  return allReviews;
}

/**
 * Paginate through every review that has media (using `media=ONLY`) and
 * return a `feedbackUrl → flattened media array` map. Aggregates media
 * across all products on a single review into one array per URL, since
 * our review document collapses both products into one `media` field.
 *
 * The map's key (`feedbackUrl`) matches `ReviewDocument.feedbackUrl`, which
 * is the stable identifier the sync uses for review re-targeting after
 * the URL-based ID fix in PR #44.
 */
export async function fetchMediaByUrl(
  brand: Brand,
  sincePeriod: "month" | "year" | "all" = "all"
): Promise<Map<string, { type: "PHOTO" | "VIDEO"; url: string }[]>> {
  const map = new Map<string, { type: "PHOTO" | "VIDEO"; url: string }[]>();
  let page = 1;
  while (true) {
    const response = await fetchReviews(brand, { page, sincePeriod, mediaOnly: true });
    for (const review of response.reviews) {
      const merged: { type: "PHOTO" | "VIDEO"; url: string }[] = [];
      for (const product of review.products ?? []) {
        for (const m of product.media ?? []) {
          merged.push({ type: m.type, url: m.url });
        }
      }
      if (merged.length > 0 && review.url) {
        map.set(review.url, merged);
      }
    }
    if (page >= response.summary.meta.pages) break;
    page++;
  }
  return map;
}

export async function fetchSummary(brand: Brand): Promise<FeefoSummaryResponse> {
  const merchantIdentifier = MERCHANT_IDENTIFIERS[brand];
  const url = `${FEEFO_BASE_URL}/20/reviews/summary/all?merchant_identifier=${merchantIdentifier}`;
  const res = await fetchWithRetry(url);
  return (await res.json()) as FeefoSummaryResponse;
}
