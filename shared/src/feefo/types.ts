export interface FeefoCredentials {
  clientId: string;
  clientSecret: string;
  merchantIdentifier: string;
}

export interface FeefoTokenResponse {
  access_token: string;
  expires_in: number;
}

export interface FeefoReviewTag {
  type: "SALE" | "FEEDBACK";
  key: string;
  values: string[];
}

export interface FeefoCustomer {
  name?: string;
  display_name?: string;
  display_location?: string;
  email?: string;
  order_ref?: string;
  customer_ref?: string;
}

export interface FeefoRating {
  min: number;
  max: number;
  rating: number;
}

export interface FeefoMedia {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
}

export interface FeefoProduct {
  rating: FeefoRating;
  id: string;
  review?: string;
  media?: FeefoMedia[];
  product: {
    title: string;
    sku: string;
    parent_sku?: string;
    url?: string;
    image_url?: string;
    tags?: FeefoReviewTag[];
  };
  created_at: string;
}

export interface FeefoService {
  rating: FeefoRating;
  id: string;
  title?: string;
  review?: string;
  created_at: string;
}

export interface FeefoReview {
  merchant: { identifier: string };
  url: string;
  customer: FeefoCustomer;
  service?: FeefoService;
  products: FeefoProduct[];
  tags?: FeefoReviewTag[];
  locale?: string;
  products_purchased?: string[];
  last_updated_date: string;
}

export interface FeefoReviewsResponse {
  summary: {
    meta: {
      count: number;
      pages: number;
      page_size: number;
      current_page: number;
    };
  };
  reviews: FeefoReview[];
}

export interface FeefoSummaryResponse {
  merchant: {
    identifier: string;
    name: string;
    url: string;
    logo: string;
    review_url: string;
  };
  meta: {
    count: number;
    pages: number;
    page_size: number;
  };
  rating: {
    min: number;
    max: number;
    rating: number;
    service: {
      count: number;
      "1_star": number;
      "2_star": number;
      "3_star": number;
      "4_star": number;
      "5_star": number;
    };
    product: {
      count: number;
      "1_star": number;
      "2_star": number;
      "3_star": number;
      "4_star": number;
      "5_star": number;
    };
  };
}

export type Brand = "uniworld" | "luxury-gold";
