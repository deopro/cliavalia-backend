/**
 * business service
 */

import { factories } from '@strapi/strapi';
import { normalizeEmailLocale } from '../../../utils/email-locale';
import { renderEmailTemplate } from '../../../utils/email-template-renderer';
import { BUSINESS_BRAND_SENDER } from '../../../utils/site-email-sender';

const BUSINESS_NOTIFY_SENDER_OPTS = { defaultSender: BUSINESS_BRAND_SENDER };

export default factories.createCoreService('api::business.business', ({ strapi }) => ({
  /**
   * Calculate recency weight for a review
   * Reviews from the last 30 days get full weight (1.0)
   * Reviews older than 365 days get minimum weight (0.3)
   * Linear decay between these points
   */
  calculateRecencyWeight(reviewDate: string | Date): number {
    const now = new Date()
    const review = new Date(reviewDate)
    const daysAgo = Math.floor((now.getTime() - review.getTime()) / (1000 * 60 * 60 * 24))

    if (daysAgo <= 30) {
      return 1.0 // Full weight for recent reviews
    } else if (daysAgo >= 365) {
      return 0.3 // Minimum weight for old reviews
    } else {
      // Linear decay: 1.0 at 30 days, 0.3 at 365 days
      const decayRate = (1.0 - 0.3) / (365 - 30)
      return 1.0 - (daysAgo - 30) * decayRate
    }
  },

  /**
   * Calculate rating weight
   * Higher ratings (4-5 stars) have more weight
   */
  calculateRatingWeight(rating: number): number {
    if (rating >= 5) return 1.0
    if (rating >= 4) return 0.9
    if (rating >= 3) return 0.7
    if (rating >= 2) return 0.5
    return 0.3 // Rating 1
  },

  /**
   * Calculate verification bonus
   * Verified reviews get a 20% boost
   */
  calculateVerificationBonus(verified: boolean): number {
    return verified ? 1.2 : 1.0
  },

  /**
   * Calculate volume stability factor
   * More reviews = more stable score
   */
  calculateVolumeFactor(totalReviews: number, averageRating?: number): number {
    // For businesses with high average ratings, be less punitive with single reviews
    const hasHighRating = averageRating !== undefined && averageRating >= 4.0
    
    if (totalReviews >= 50) return 1.0 // Full stability
    if (totalReviews >= 20) return 0.9
    if (totalReviews >= 10) return 0.8
    if (totalReviews >= 5) return 0.7
    if (totalReviews >= 2) return 0.6
    // For single review: use 0.8 if high rating, 0.6 if medium, 0.5 if low
    if (totalReviews === 1) {
      if (hasHighRating) return 0.8 // Less punitive for high ratings
      return 0.6 // Still reasonable for medium ratings
    }
    return 0.5 // Fallback
  },

  /**
   * Calculate AvaliScore for a business based on its reviews
   * @param businessId - The ID of the business
   * @returns The AvaliScore (1–5 stars, one decimal; 0 when no eligible reviews).
   */
  async calculateAvaliScore(businessId: number): Promise<number> {
    // Fetch only published, non-flagged reviews for this business
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
      select: ['id', 'rating', 'createdAt', 'verified'],
    })

    if (!reviews || reviews.length === 0) {
      return 0
    }

    // Calculate weighted score for each review
    let totalWeightedScore = 0
    let totalWeight = 0

    reviews.forEach((review) => {
      const ratingWeight = this.calculateRatingWeight(review.rating)
      const recencyWeight = this.calculateRecencyWeight(review.createdAt)
      const verificationBonus = this.calculateVerificationBonus(review.verified || false)

      // Combined weight for this review
      const reviewWeight = ratingWeight * recencyWeight * verificationBonus

      // Score contribution (rating normalized to 0-100)
      const ratingScore = (review.rating / 5) * 100

      totalWeightedScore += ratingScore * reviewWeight
      totalWeight += reviewWeight
    })

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0)
    const averageRating = totalRating / reviews.length
    const volumeFactor = this.calculateVolumeFactor(reviews.length, averageRating)

    if (totalWeight <= 0) {
      return Math.max(1, Math.min(5, Math.round(averageRating * 10) / 10))
    }

    const weightedMean0to100 = totalWeightedScore / totalWeight
    const dampedIndex = weightedMean0to100 * volumeFactor
    const starsFromWeighted = (dampedIndex / 100) * 5

    return Math.max(1, Math.min(5, Math.round(starsFromWeighted * 10) / 10))
  },

  /**
   * Update AvaliScore for a business
   * @param businessId - The ID of the business
   * @returns The updated AvaliScore
   */
  async updateAvaliScore(businessId: number): Promise<number> {
    const score = await this.calculateAvaliScore(businessId)
    
    // Update the business with the new score
    await strapi.db.query('api::business.business').update({
      where: { id: businessId },
      data: {
        avaliscore: score,
      },
    })

    return score
  },

  // ─── Moderation emails ─────────────────────────────────────────────────────

  async sendNewBusinessSubmissionEmail(business: any, submitter: any) {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'comercial@cliavalia.com';
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    const adminUrl = `${FRONTEND_URL}/shaolin/pending-businesses/pending`;
    const submitterName = submitter?.username || submitter?.email || 'Utilizador desconhecido';
    const sectorName = business?.sector?.name || 'N/A';
    const categories = Array.isArray(business?.categories)
      ? business.categories
      : business?.category
        ? [business.category]
        : [];
    const categoryName =
      categories.length > 0
        ? categories.map((c: { name?: string }) => c?.name).filter(Boolean).join(', ')
        : 'N/A';
    const possibleDuplicateRow = business.possibleDuplicate
      ? `<tr><td colspan="2" style="padding:8px 12px;background:#fef3c7;border:1px solid #e5e7eb;font-size:13px;color:#92400e;">⚠️ Possível duplicado confirmado pelo utilizador</td></tr>`
      : '';

    const { subject, html, from } = await renderEmailTemplate('admin-new-business-submission', {
      businessName: business.name,
      sectorName,
      categoryName,
      submitterName,
      adminUrl,
      possibleDuplicateRow,
    });

    await strapi.plugins.email.services.email.send({
      to: ADMIN_EMAIL,
      subject,
      html,
      from,
    });
    strapi.log.info(`[BUSINESS] Admin notification sent for business: ${business.name}`);
  },


  async sendBusinessApprovedEmail(business: any, submitter: any, publishedReviews: any[] = []) {
    const FRONTEND_URL = process.env.FRONTEND_URL || '';
    const businessUrl = `${FRONTEND_URL}/companies/${business.slug || business.id}`;
    const loginUrl = `${FRONTEND_URL}/business/login`;
    const publishedReviewNote = publishedReviews.length > 0
      ? '<p style="margin:12px 0 0;color:#4a4a4a;font-size:14px;">A sua avaliação também foi publicada automaticamente.</p>'
      : '';

    const { subject, html, from } = await renderEmailTemplate('business-approved', {
      ownerName: submitter.firstName || submitter.username || 'Utilizador',
      businessName: business.name,
      loginUrl,
      businessUrl,
      publishedReviewNote,
    }, normalizeEmailLocale(submitter?.emailLocale), BUSINESS_NOTIFY_SENDER_OPTS);

    await strapi.plugins.email.services.email.send({
      to: submitter.email,
      from,
      subject,
      html,
    });
  },

  async sendBusinessRejectedEmail(business: any, submitter: any, rejectionReason?: string) {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'comercial@cliavalia.com';
    const reasonHtml = rejectionReason
      ? `<p style="margin:0;color:#7f1d1d;font-size:14px;">${rejectionReason}</p>`
      : '';

    const { subject, html, from } = await renderEmailTemplate('business-rejected', {
      businessName: business.name,
      reasonHtml,
      adminEmail: ADMIN_EMAIL,
    }, normalizeEmailLocale(submitter?.emailLocale), BUSINESS_NOTIFY_SENDER_OPTS);

    await strapi.plugins.email.services.email.send({
      to: submitter.email,
      from,
      subject,
      html,
    });
  },

}));