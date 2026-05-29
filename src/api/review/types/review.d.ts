/**
 * TypeScript type definitions for Review API
 */

/**
 * Review entity structure
 */
export interface Review {
  id: number;
  title: string;
  rating: number;
  reviewText: ReviewBlock[];
  users_permissions_user?: {
    id: number;
    username: string;
    email?: string;
  };
  business?: {
    id: number;
    name: string;
    logoUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * Strapi blocks format for rich text
 */
export interface ReviewBlock {
  type: 'paragraph' | 'heading' | 'list' | 'quote' | 'code';
  children: ReviewTextNode[];
  level?: number; // For headings
  format?: 'ordered' | 'unordered'; // For lists
}

/**
 * Text node in Strapi blocks
 */
export interface ReviewTextNode {
  type: 'text' | 'link';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  url?: string; // For links
}

/**
 * Review creation data
 */
export interface CreateReviewData {
  title: string;
  rating: number;
  reviewText: ReviewBlock[];
  business: number;
}

/**
 * Review update data
 */
export interface UpdateReviewData {
  title?: string;
  rating?: number;
  reviewText?: ReviewBlock[];
}

/**
 * Review statistics for a business
 */
export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

/**
 * Review query filters
 */
export interface ReviewFilters {
  business?: number | number[];
  users_permissions_user?: number | number[];
  rating?: number | { $gte?: number; $lte?: number };
}

/**
 * Review query options
 */
export interface ReviewQueryOptions {
  filters?: ReviewFilters;
  sort?: string | string[];
  pagination?: {
    page?: number;
    pageSize?: number;
    start?: number;
    limit?: number;
  };
  populate?: string | string[] | object;
}

/**
 * API response for single review
 */
export interface ReviewResponse {
  data: Review;
  meta?: Record<string, any>;
}

/**
 * API response for multiple reviews
 */
export interface ReviewsResponse {
  data: Review[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

/**
 * Error response structure
 */
export interface ReviewErrorResponse {
  error: {
    status: number;
    name: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Review service interface
 */
export interface ReviewService {
  hasUserReviewedBusiness(userId: number, businessId: number, agencyId?: number | null): Promise<boolean>;
  getReviewsByBusiness(businessId: number, options?: any): Promise<Review[]>;
  getReviewsByUser(userId: number, options?: any): Promise<Review[]>;
  getAverageRatingForBusiness(businessId: number): Promise<number>;
  getReviewStatsForBusiness(businessId: number): Promise<ReviewStats>;
  isReviewOwner(reviewId: number, userId: number): Promise<boolean>;
}

/**
 * Review controller context
 */
export interface ReviewContext {
  state: {
    user?: {
      id: number;
      username: string;
      email: string;
    };
  };
  request: {
    body: {
      data: CreateReviewData | UpdateReviewData;
    };
  };
  params: {
    id?: string;
  };
  query: ReviewQueryOptions;
  unauthorized(message?: string): void;
  badRequest(message?: string): void;
  notFound(message?: string): void;
  forbidden(message?: string): void;
  internalServerError(message?: string): void;
  created(data: any): void;
}

/**
 * Helper type to convert plain text to Strapi blocks
 */
export type PlainTextToBlocks = (text: string) => ReviewBlock[];

/**
 * Helper type to convert Strapi blocks to plain text
 */
export type BlocksToPlainText = (blocks: ReviewBlock[]) => string;

