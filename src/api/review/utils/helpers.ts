/**
 * Review utility functions
 * Helper functions for common review operations
 */

import type { ReviewBlock, ReviewTextNode } from '../types/review';

/**
 * Convert plain text string to Strapi blocks format
 * @param text - Plain text string
 * @returns Array of Strapi blocks
 */
export function plainTextToBlocks(text: string): ReviewBlock[] {
  if (!text || text.trim() === '') {
    return [];
  }

  // Split text into paragraphs (by double newline)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim() !== '');

  return paragraphs.map(paragraph => ({
    type: 'paragraph',
    children: [
      {
        type: 'text',
        text: paragraph.trim()
      }
    ]
  }));
}

/**
 * Convert Strapi blocks to plain text string
 * @param blocks - Array of Strapi blocks
 * @returns Plain text string
 */
export function blocksToPlainText(blocks: ReviewBlock[]): string {
  if (!blocks || blocks.length === 0) {
    return '';
  }

  return blocks.map(block => {
    if (!block.children || block.children.length === 0) {
      return '';
    }

    return block.children
      .map(child => child.text || '')
      .join('')
      .trim();
  }).filter(text => text !== '').join('\n\n');
}

/**
 * Validate rating value
 * @param rating - Rating value to validate
 * @returns True if valid, false otherwise
 */
export function isValidRating(rating: any): boolean {
  if (typeof rating !== 'number') {
    return false;
  }

  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

/**
 * Get rating description from numeric value
 * @param rating - Rating value (1-5)
 * @returns Description string
 */
export function getRatingDescription(rating: number): string {
  const descriptions: Record<number, string> = {
    1: 'Very Poor',
    2: 'Poor',
    3: 'Average',
    4: 'Good',
    5: 'Excellent'
  };

  return descriptions[rating] || 'Unknown';
}

/**
 * Calculate percentage of ratings for distribution
 * @param count - Number of reviews with this rating
 * @param total - Total number of reviews
 * @returns Percentage (0-100)
 */
export function calculateRatingPercentage(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

/**
 * Format review date for display
 * @param date - Date string or Date object
 * @returns Formatted date string
 */
export function formatReviewDate(date: string | Date): string {
  const reviewDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - reviewDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Sanitize review text (remove potentially harmful content)
 * @param text - Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeReviewText(text: string): string {
  if (!text) {
    return '';
  }

  // Remove HTML tags
  let sanitized = text.replace(/<[^>]*>/g, '');

  // Remove script tags and content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Truncate review text to specified length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: '...')
 * @returns Truncated text
 */
export function truncateReviewText(text: string, maxLength: number, suffix: string = '...'): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Validate review data before creation
 * @param data - Review data to validate
 * @returns Validation result with success flag and errors
 */
export function validateReviewData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.title || typeof data.title !== 'string') {
    errors.push('Title is required and must be a string');
  } else if (data.title.length < 3) {
    errors.push('Title must be at least 3 characters long');
  } else if (data.title.length > 100) {
    errors.push('Title must not exceed 100 characters');
  }

  if (!data.rating) {
    errors.push('Rating is required');
  } else if (!isValidRating(data.rating)) {
    errors.push('Rating must be an integer between 1 and 5');
  }

  if (!data.reviewText) {
    errors.push('Review text is required');
  }

  if (!data.business || typeof data.business !== 'number') {
    errors.push('Business ID is required and must be a number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if a review is recent (within last 7 days)
 * @param reviewDate - Review creation date
 * @returns True if recent, false otherwise
 */
export function isRecentReview(reviewDate: string | Date): boolean {
  const date = typeof reviewDate === 'string' ? new Date(reviewDate) : reviewDate;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays <= 7;
}

/**
 * Generate review summary statistics
 * @param reviews - Array of reviews
 * @returns Summary statistics
 */
export function generateReviewSummary(reviews: any[]) {
  if (!reviews || reviews.length === 0) {
    return {
      total: 0,
      average: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentCount: 0
    };
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  let recentCount = 0;

  reviews.forEach(review => {
    totalRating += review.rating;
    distribution[review.rating as keyof typeof distribution]++;
    
    if (isRecentReview(review.createdAt)) {
      recentCount++;
    }
  });

  const average = totalRating / reviews.length;

  return {
    total: reviews.length,
    average: Math.round(average * 10) / 10,
    distribution,
    recentCount
  };
}

/**
 * Sort reviews by various criteria
 * @param reviews - Array of reviews to sort
 * @param sortBy - Sort criteria ('date', 'rating', 'recent')
 * @param order - Sort order ('asc' or 'desc')
 * @returns Sorted array of reviews
 */
export function sortReviews(reviews: any[], sortBy: 'date' | 'rating' | 'recent' = 'date', order: 'asc' | 'desc' = 'desc'): any[] {
  const sorted = [...reviews];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'rating':
        comparison = a.rating - b.rating;
        break;
      case 'recent':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }

    return order === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Filter reviews by rating range
 * @param reviews - Array of reviews
 * @param minRating - Minimum rating (inclusive)
 * @param maxRating - Maximum rating (inclusive)
 * @returns Filtered array of reviews
 */
export function filterReviewsByRating(reviews: any[], minRating: number = 1, maxRating: number = 5): any[] {
  return reviews.filter(review => 
    review.rating >= minRating && review.rating <= maxRating
  );
}

/**
 * Get most helpful reviews (placeholder - can be extended with voting system)
 * @param reviews - Array of reviews
 * @param limit - Number of reviews to return
 * @returns Array of most helpful reviews
 */
export function getMostHelpfulReviews(reviews: any[], limit: number = 5): any[] {
  // For now, return most recent reviews with rating >= 4
  // This can be extended when a voting/helpful system is implemented
  return reviews
    .filter(review => review.rating >= 4)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

