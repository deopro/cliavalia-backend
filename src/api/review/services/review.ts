/**
 * review service
 */

import { factories } from '@strapi/strapi';
import type { EmailLocale } from '../../../utils/email-locale';
import { normalizeEmailLocale } from '../../../utils/email-locale';
import { renderEmailTemplate } from '../../../utils/email-template-renderer';

function ratingStarsLabels(localeNorm: EmailLocale): string[] {
  if (localeNorm === 'en') {
    return ['', '1 star', '2 stars', '3 stars', '4 stars', '5 stars'];
  }
  return ['', '1 estrela', '2 estrelas', '3 estrelas', '4 estrelas', '5 estrelas'];
}

export default factories.createCoreService('api::review.review', ({ strapi }) => ({
  /**
   * Check if a user has already reviewed a business (agency-aware).
   * When agencyId is provided, checks for a review on that specific agency.
   * When agencyId is null/undefined, checks for a review with no agency.
   * @param userId - The user ID
   * @param businessId - The business ID
   * @param agencyId - Optional agency ID
   * @returns boolean - true if a matching review exists
   */
  async hasUserReviewedBusiness(userId: number, businessId: number, agencyId?: number | null): Promise<boolean> {
    const where: Record<string, unknown> = {
      users_permissions_user: userId,
      business: businessId,
    };
    if (agencyId) {
      where.agency = agencyId;
    } else {
      where.agency = { $null: true };
    }
    const review = await strapi.db.query('api::review.review').findOne({ where });

    return !!review;
  },

  /**
   * Get all reviews for a specific business
   * @param businessId - The business ID
   * @param options - Query options (pagination, sorting, etc.)
   * @returns Array of reviews
   */
  async getReviewsByBusiness(businessId: number, options = {}) {
    return await strapi.db.query('api::review.review').findMany({
      where: { business: businessId },
      populate: {
        users_permissions_user: {
          fields: ['id', 'username'],
        },
      },
      orderBy: { createdAt: 'desc' },
      ...options,
    });
  },

  /**
   * Get all reviews by a specific user
   * @param userId - The user ID
   * @param options - Query options (pagination, sorting, etc.)
   * @returns Array of reviews
   */
  async getReviewsByUser(userId: number, options = {}) {
    return await strapi.db.query('api::review.review').findMany({
      where: { users_permissions_user: userId },
      populate: {
        business: {
          fields: ['id', 'name', 'logoUrl'],
        },
      },
      orderBy: { createdAt: 'desc' },
      ...options,
    });
  },

  async getOwnedBusinessByUser(userId: number) {
    return await strapi.db.query('api::business.business').findOne({
      where: { owner: userId },
      select: ['id', 'name', 'slug'],
    });
  },

  async getPendingConsumerReportReviewIdsForBusiness(businessId: number): Promise<{ id: number; reason: string; subReason?: string; reportedAt: string; reportCount: number }[]> {
    const reports = await strapi.db.query('api::review-report.review-report').findMany({
      where: {
        status: { $in: ['pending', 'analysing'] },
      },
      populate: {
        review: {
          fields: ['id'],
          populate: {
            business: { fields: ['id'] },
          },
        },
      },
    });

    const byReviewId = new Map<number, { id: number; reason: string; subReason?: string; reportedAt: string; reportCount: number }>();
    for (const row of reports) {
      const r = row as { reason?: string; subReason?: string; createdAt?: string; review?: { id?: number; business?: { id?: number } } };
      const rev = r.review;
      if (!rev?.id || rev?.business?.id !== businessId) {
        continue;
      }

      const existing = byReviewId.get(rev.id);
      if (!existing) {
        byReviewId.set(rev.id, {
          id: rev.id,
          reason: r.reason || '',
          subReason: r.subReason,
          reportedAt: r.createdAt || '',
          reportCount: 1,
        });
        continue;
      }

      existing.reportCount += 1;
      const incomingTime = new Date(r.createdAt || 0).getTime();
      const existingTime = new Date(existing.reportedAt || 0).getTime();
      if (incomingTime > existingTime) {
        existing.reason = r.reason || existing.reason;
        existing.subReason = r.subReason;
        existing.reportedAt = r.createdAt || existing.reportedAt;
      }
    }
    return [...byReviewId.values()];
  },

  /**
   * Reviews for this business that have at least one consumer-submitted review-report
   * still open (pending or analysing). These are NOT reflected on review.reportStatus;
   * reportReview() only creates api::review-report rows.
   */
  async getReviewsWithPendingConsumerReportsForBusiness(businessId: number) {
    const reportMeta = await this.getPendingConsumerReportReviewIdsForBusiness(businessId);
    if (reportMeta.length === 0) {
      return [];
    }

    const reasonMap = new Map<number, { reason: string; subReason?: string; reportedAt: string; reportCount: number }>();
    for (const meta of reportMeta) {
      reasonMap.set(meta.id, {
        reason: meta.reason,
        subReason: meta.subReason,
        reportedAt: meta.reportedAt,
        reportCount: meta.reportCount,
      });
    }

    const reviews = await strapi.db.query('api::review.review').findMany({
      where: {
        business: businessId,
        id: { $in: reportMeta.map((m) => m.id) },
      },
      populate: {
        users_permissions_user: {
          fields: ['id', 'username', 'firstName', 'lastName', 'email'],
        },
        business: {
          fields: ['id', 'name', 'slug'],
        },
        experiencePhotos: true,
        audioReview: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((review: any) => {
      const meta = reasonMap.get(review.id);
      return {
        ...review,
        consumerReportReason: meta?.reason,
        consumerReportSubReason: meta?.subReason,
        consumerReportedAt: meta?.reportedAt,
        consumerReportCount: meta?.reportCount || 1,
      };
    });
  },

  async getFlaggedReviewsForBusinessOwner(userId: number) {
    const business = await this.getOwnedBusinessByUser(userId);

    if (!business) {
      return [];
    }

    return await strapi.db.query('api::review.review').findMany({
      where: {
        business: business.id,
        $or: [
          { moderation_status: 'Sinalizada' },
          { moderation_status: 'Flagged' },
          {
            $and: [
              { moderation_status: 'Pending' },
              { moderation_reason: { $notNull: true } },
              { is_published: false },
            ],
          },
        ],
      },
      populate: {
        users_permissions_user: {
          fields: ['id', 'username', 'firstName', 'lastName', 'email'],
        },
        business: {
          fields: ['id', 'name', 'slug'],
        },
        experiencePhotos: true,
        audioReview: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Calculate average rating for a business
   * @param businessId - The business ID
   * @returns Average rating (rounded to 1 decimal place)
   */
  async getAverageRatingForBusiness(businessId: number): Promise<number> {
    // Only count published, non-flagged reviews
    const reviews = await strapi.db.query('api::review.review').findMany({
      where: {
        business: businessId,
        $and: [
          {
            $or: [
              { moderation_status: { $null: true } },
              {
                $and: [
                  { moderation_status: { $ne: 'Sinalizada' } },
                  { moderation_status: { $ne: 'Flagged' } },
                ],
              },
            ],
          },
          {
            $or: [
              { is_published: { $eq: true } },
              { is_published: { $null: true } },
            ],
          },
        ],
      },
      select: ['rating'],
    });

    if (reviews.length === 0) {
      return 0;
    }

    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = sum / reviews.length;

    return Math.round(average * 10) / 10; // Round to 1 decimal place
  },

  /**
   * Get review statistics for a business
   * @param businessId - The business ID
   * @returns Object with review statistics
   */
  async getReviewStatsForBusiness(businessId: number) {
    // Only count published, non-flagged reviews
    const reviews = await strapi.db.query('api::review.review').findMany({
      where: {
        business: businessId,
        $and: [
          {
            $or: [
              { moderation_status: { $null: true } },
              {
                $and: [
                  { moderation_status: { $ne: 'Sinalizada' } },
                  { moderation_status: { $ne: 'Flagged' } },
                ],
              },
            ],
          },
          {
            $or: [
              { is_published: { $eq: true } },
              { is_published: { $null: true } },
            ],
          },
        ],
      },
      select: ['rating'],
    });

    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      };
    }

    // Calculate rating distribution
    const ratingDistribution = reviews.reduce((acc, review) => {
      acc[review.rating] = (acc[review.rating] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Ensure all ratings (1-5) are represented
    for (let i = 1; i <= 5; i++) {
      if (!ratingDistribution[i]) {
        ratingDistribution[i] = 0;
      }
    }

    // Calculate average
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const averageRating = Math.round((sum / totalReviews) * 10) / 10;

    return {
      totalReviews,
      averageRating,
      ratingDistribution,
    };
  },

  /**
   * Validate review ownership
   * @param reviewId - The review ID
   * @param userId - The user ID
   * @returns boolean - true if user owns the review, false otherwise
   */
  async isReviewOwner(reviewId: number, userId: number): Promise<boolean> {
    const review = await strapi.db.query('api::review.review').findOne({
      where: { id: reviewId },
      populate: ['users_permissions_user'],
    });

    if (!review || !review.users_permissions_user) {
      return false;
    }

    return review.users_permissions_user.id === userId;
  },

  /**
   * Increment unique view count for a review with 24-hour throttle
   * Only increments if the user hasn't viewed this review in the last 24 hours
   * @param reviewId - The review ID
   * @param userId - The authenticated user ID
   * @returns void
   */
  async incrementUniqueViews(reviewId: number, userId: number): Promise<void> {
    // Calculate 24-hour threshold (24 hours ago from now)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Check for existing view log within the last 24 hours
    const existingLog = await strapi.db.query('api::review-view-log.review-view-log').findOne({
      where: {
        review: reviewId,
        viewer: userId,
        viewedAt: {
          $gt: twentyFourHoursAgo.toISOString(),
        },
      },
    });

    // If log found (user viewed recently), return without incrementing
    if (existingLog) {
      strapi.log.debug('Review view throttled - user viewed within last 24 hours', {
        reviewId,
        userId,
        lastViewed: existingLog.viewedAt,
      });
      return;
    }

    // No recent log found - increment view count and create log entry
    try {
      // Get current view count
      const review = await strapi.db.query('api::review.review').findOne({
        where: { id: reviewId },
        select: ['views'],
      });

      if (!review) {
        throw new Error(`Review with id ${reviewId} not found`);
      }

      // Increment the views field in the review table
      await strapi.db.query('api::review.review').update({
        where: { id: reviewId },
        data: {
          views: (review.views || 0) + 1,
        },
      });

      // Create a new view log entry
      await strapi.db.query('api::review-view-log.review-view-log').create({
        data: {
          review: reviewId,
          viewer: userId,
          viewedAt: new Date().toISOString(),
        },
      });

      strapi.log.debug('Review view incremented successfully', {
        reviewId,
        userId,
        newViewCount: (review.views || 0) + 1,
      });
    } catch (error: any) {
      strapi.log.error('Error incrementing review view', {
        reviewId,
        userId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },

  /**
   * Send email notification when appeal is approved
   * @param userEmail - The user's email address
   * @param reviewTitle - The review title
   * @param businessName - The business name
   */
  async sendAppealApprovalEmail(
    userEmail: string,
    reviewTitle: string,
    businessName: string,
    localeLike?: unknown,
  ): Promise<void> {
    const lc = normalizeEmailLocale(localeLike);
    const frontendUrl = process.env.FRONTEND_URL;
    const reviewUrl = `${frontendUrl}/user/my-reviews`;

    const { subject, html, from } = await renderEmailTemplate('review-appeal-approved', {
      reviewTitle: reviewTitle || "N/A",
      businessName: businessName || "o negócio",
      reviewUrl,
    }, lc);

    try {
      await strapi.plugins.email.services.email.send({ to: userEmail, subject, html, from });
      strapi.log.info(`Appeal approval email sent to: ${userEmail}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending appeal approval email to ${userEmail}:`, emailError);
      throw emailError;
    }
  },

    /**
   * Send email notification when appeal is rejected
   * @param userEmail - The user's email address
   * @param reviewTitle - The review title
   * @param businessName - The business name
   * @param reason - The admin's rejection reason
   */
  async sendAppealRejectionEmail(
    userEmail: string,
    reviewTitle: string,
    businessName: string,
    reason: string,
    localeLike?: unknown,
  ): Promise<void> {
    const lc = normalizeEmailLocale(localeLike);
    const frontendUrl = process.env.FRONTEND_URL;
    const reviewUrl = `${frontendUrl}/user/my-reviews`;

    const { subject, html, from } = await renderEmailTemplate('review-appeal-rejected', {
      reviewTitle: reviewTitle || "N/A",
      businessName: businessName || "o negócio",
      reason: reason || "",
      reviewUrl,
    }, lc);

    try {
      await strapi.plugins.email.services.email.send({ to: userEmail, subject, html, from });
      strapi.log.info(`Appeal rejection email sent to: ${userEmail}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending appeal rejection email to ${userEmail}:`, emailError);
      throw emailError;
    }
  },

    /**
   * Send email notification to business when a new review is written
   * @param businessEmail - The business owner's email address
   * @param businessName - The business name
   * @param reviewTitle - The review title
   * @param reviewText - The review text (excerpt)
   * @param rating - The rating (1-5)
   * @param reviewerName - Optional reviewer display name
   * @param reviewId - The review ID (for link)
   */
  async sendNewReviewEmailToBusiness(
    businessEmail: string,
    businessName: string,
    reviewTitle: string,
    reviewText: string,
    rating: number,
    reviewerName: string | null,
    reviewId: number | string,
    localeLike?: unknown,
  ): Promise<void> {
    const lc = normalizeEmailLocale(localeLike);
    const frontendUrl = process.env.FRONTEND_URL;
    const dashboardUrl = `${frontendUrl}/business/dashboard/reviews/inbox`;
    const ratingLabels = ratingStarsLabels(lc);
    const fallbackStar = lc === 'en' ? `${rating} stars` : `${rating} estrelas`;
    const starsLabel = ratingLabels[rating] || fallbackStar;
    const byPrep = lc === 'en' ? ' by' : ' por';
    const byLine = reviewerName ? `${byPrep} ${reviewerName}` : '';
    const reviewExcerpt = reviewText ? (reviewText.length > 200 ? reviewText.substring(0, 200) + "..." : reviewText) : "";

    const { subject, html, from } = await renderEmailTemplate('review-new-review', {
      businessName: businessName || "o seu negócio",
      reviewTitle: reviewTitle || "Avaliação",
      starsLabel,
      byLine,
      reviewExcerpt,
      dashboardUrl,
    }, lc);

    try {
      await strapi.plugins.email.services.email.send({ to: businessEmail, subject, html, from });
      strapi.log.info(`New review email sent to business: ${businessEmail}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending new review email to business ${businessEmail}:`, emailError);
      // Don't throw - email failure shouldn't prevent review creation
    }
  },

    /**
   * Send email notification to business when a user updates their review
   * @param businessEmail - The business owner's email address
   * @param businessName - The business name
   * @param reviewTitle - The review title
   * @param reviewText - The review text (excerpt)
   * @param rating - The rating (1-5)
   * @param reviewerName - Optional reviewer display name
   * @param reviewId - The review ID (for link)
   */
  async sendReviewUpdatedEmailToBusiness(
    businessEmail: string,
    businessName: string,
    reviewTitle: string,
    reviewText: string,
    rating: number,
    reviewerName: string | null,
    reviewId: number | string,
    localeLike?: unknown,
  ): Promise<void> {
    const lc = normalizeEmailLocale(localeLike);
    const frontendUrl = process.env.FRONTEND_URL;
    const dashboardUrl = `${frontendUrl}/business/dashboard/reviews/inbox`;
    const ratingLabels = ratingStarsLabels(lc);
    const fallbackStar = lc === 'en' ? `${rating} stars` : `${rating} estrelas`;
    const starsLabel = ratingLabels[rating] || fallbackStar;
    const byPrep = lc === 'en' ? ' by' : ' por';
    const byLine = reviewerName ? `${byPrep} ${reviewerName}` : '';
    const reviewExcerpt = reviewText ? (reviewText.length > 200 ? reviewText.substring(0, 200) + "..." : reviewText) : "";

    const { subject, html, from } = await renderEmailTemplate('review-updated', {
      businessName: businessName || "o seu negócio",
      reviewTitle: reviewTitle || "Avaliação",
      starsLabel,
      byLine,
      reviewExcerpt,
      dashboardUrl,
    }, lc);

    try {
      await strapi.plugins.email.services.email.send({ to: businessEmail, subject, html, from });
      strapi.log.info(`Review updated email sent to business: ${businessEmail}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending review updated email to business ${businessEmail}:`, emailError);
      // Don't throw - email failure shouldn't prevent review update
    }
  },

    /**
   * Send email notification when a business replies to a review
   * @param reviewerEmail - The reviewer's email address
   * @param reviewerName - The reviewer's name
   * @param businessName - The business name
   * @param reviewTitle - The review title
   * @param businessReply - The business reply text
   * @param reviewId - The review ID (for link)
   */
  async sendBusinessReplyEmail(
    reviewerEmail: string,
    reviewerName: string,
    businessName: string,
    reviewTitle: string,
    businessReply: string,
    reviewId: number | string,
    localeLike?: unknown,
  ): Promise<void> {
    const lc = normalizeEmailLocale(localeLike);
    const frontendUrl = process.env.FRONTEND_URL;
    const reviewUrl = `${frontendUrl}/reviews/${reviewId}`;

    const { subject, html, from } = await renderEmailTemplate('review-business-reply', {
      reviewerName: reviewerName || "Utilizador",
      businessName: businessName || "o negócio",
      reviewTitle: reviewTitle || "Avaliação",
      businessReply: businessReply || "",
      reviewUrl,
    }, lc);

    try {
      await strapi.plugins.email.services.email.send({ to: reviewerEmail, subject, html, from });
      strapi.log.info(`Business reply email sent to: ${reviewerEmail}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending business reply email to ${reviewerEmail}:`, emailError);
      // Don't throw error - email failure shouldn't prevent reply from being saved
    }
  },
}));
