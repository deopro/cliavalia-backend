/**
 * review-reaction service
 * Aggregates and mutates engagement signals on reviews.
 * Two independent signals per user per review: "helpful" and "similar_experience".
 */

import { factories } from '@strapi/strapi';

const SIGNAL_TYPES = ['helpful', 'similar_experience'] as const;
export type EngagementType = (typeof SIGNAL_TYPES)[number];
/** @deprecated Use EngagementType */
export type EmojiType = EngagementType;

export interface ReactionSummary {
  counts: Record<EngagementType, number>;
  userSignals: Record<EngagementType, boolean>;
  /** @deprecated use counts.helpful + counts.similar_experience */
  total: number;
}

type UserRow = { id: number; firstName?: string; lastName?: string; username?: string; profileImage?: string; documentId?: string };

export default factories.createCoreService(
  'api::review-reaction.review-reaction',
  ({ strapi }) => ({
    /**
     * Get engagement summary for a review.
     * Returns counts per signal type, userSignals (which types the current user has active), and total.
     */
    async getSummaryForReview(
      reviewId: number,
      userId?: number | null
    ): Promise<ReactionSummary> {
      const reactions = await strapi.db
        .query('api::review-reaction.review-reaction')
        .findMany({
          where: { review: reviewId },
          select: ['emojiType'],
          populate: ['user'],
        });

      const counts: Record<string, number> = {};
      SIGNAL_TYPES.forEach((t) => (counts[t] = 0));
      const userSignals: Record<string, boolean> = {};
      SIGNAL_TYPES.forEach((t) => (userSignals[t] = false));

      for (const r of reactions) {
        const type = r.emojiType as EngagementType;
        if (!SIGNAL_TYPES.includes(type)) continue;
        counts[type] = (counts[type] || 0) + 1;
        const uid = r.user != null && typeof r.user === 'object' && 'id' in r.user
          ? (r.user as { id: number }).id
          : r.user;
        if (userId && uid === userId) userSignals[type] = true;
      }

      const total = Object.values(counts).reduce((s, n) => s + n, 0);

      return {
        counts: counts as Record<EngagementType, number>,
        userSignals: userSignals as Record<EngagementType, boolean>,
        total,
      };
    },

    /**
     * Toggle a specific signal type for a user on a review (independent of other signal types).
     * If the user already has this signal → remove it. Otherwise → add it.
     * Returns the updated summary.
     */
    async toggleSignal(
      reviewId: number,
      userId: number,
      signalType: EngagementType
    ): Promise<ReactionSummary> {
      if (!SIGNAL_TYPES.includes(signalType)) {
        throw new Error(`Invalid signalType: ${signalType}`);
      }

      // Find existing row for this specific (user, review, signalType)
      const existing = await strapi.db
        .query('api::review-reaction.review-reaction')
        .findMany({
          where: { review: reviewId, user: userId, emojiType: signalType },
        });

      if (existing.length > 0) {
        // Toggle off: delete all rows for this (user, review, signalType)
        await strapi.db.query('api::review-reaction.review-reaction').deleteMany({
          where: { id: { $in: existing.map((r: { id: number }) => r.id) } },
        });
      } else {
        // Toggle on: create new row
        await strapi.db.query('api::review-reaction.review-reaction').create({
          data: { review: reviewId, user: userId, emojiType: signalType },
        });
      }

      return this.getSummaryForReview(reviewId, userId);
    },

    /** @deprecated Use toggleSignal */
    async setReaction(
      reviewId: number,
      userId: number,
      emojiType: EngagementType
    ): Promise<ReactionSummary> {
      return this.toggleSignal(reviewId, userId, emojiType);
    },

    /** @deprecated Use toggleSignal */
    async removeReaction(reviewId: number, userId: number): Promise<ReactionSummary> {
      // Remove all signals for this user on this review (legacy behaviour)
      await strapi.db.query('api::review-reaction.review-reaction').deleteMany({
        where: { review: reviewId, user: userId },
      });
      return this.getSummaryForReview(reviewId, userId);
    },

    /**
     * Get total number of signals given by a user (for gamification / user level).
     */
    async getReactionsGivenCount(userId: number): Promise<number> {
      const count = await strapi.db
        .query('api::review-reaction.review-reaction')
        .count({ where: { user: userId } });
      return count ?? 0;
    },

    /**
     * Get aggregate counts of reactions received on all reviews authored by a user.
     * Returns counts per signal type (helpful, similar_experience).
     */
    async getReactionsReceivedForUser(userId: number): Promise<Record<EngagementType, number>> {
      const counts: Record<string, number> = {};
      SIGNAL_TYPES.forEach((t) => (counts[t] = 0));

      // Step 1: fetch all review IDs authored by this user.
      const userReviews = await strapi.db
        .query('api::review.review')
        .findMany({
          where: { users_permissions_user: { id: userId } },
          select: ['id'],
        });

      const reviewIds = (userReviews as { id: number }[]).map((r) => r.id);
      if (reviewIds.length === 0) {
        return counts as Record<EngagementType, number>;
      }

      // Step 2: use Knex directly to avoid Strapi ORM issues with $in on
      // relation fields stored in link tables. The ORM's findMany with
      // { review: { $in: reviewIds } } silently returns partial results.
      const knex = strapi.db.connection;
      const rows = await knex('review_reactions')
        .join(
          'review_reactions_review_lnk',
          'review_reactions.id',
          'review_reactions_review_lnk.review_reaction_id',
        )
        .whereIn('review_reactions_review_lnk.review_id', reviewIds)
        .select('review_reactions.emoji_type as emojiType');

      for (const r of rows) {
        const type = r.emojiType as EngagementType;
        if (SIGNAL_TYPES.includes(type)) {
          counts[type] = (counts[type] || 0) + 1;
        }
      }

      return counts as Record<EngagementType, number>;
    },

    /**
     * Get list of users who engaged with a review, grouped by signal type.
     */
    async getReactorsByType(reviewId: number): Promise<Record<EngagementType, UserRow[]>> {
      const reactions = await strapi.db
        .query('api::review-reaction.review-reaction')
        .findMany({
          where: { review: reviewId },
          select: ['emojiType'],
          populate: {
            user: {
              fields: ['id', 'firstName', 'lastName', 'username', 'profileImage', 'documentId'],
            },
          },
        });

      const result: Record<string, UserRow[]> = {};
      SIGNAL_TYPES.forEach((t) => (result[t] = []));

      for (const r of reactions) {
        const type = r.emojiType as EngagementType;
        if (!SIGNAL_TYPES.includes(type)) continue;
        const user = r.user as any;
        if (user && user.id) {
          result[type].push({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            profileImage: user.profileImage,
            documentId: user.documentId,
          });
        }
      }

      return result as Record<EngagementType, UserRow[]>;
    },

    /**
     * Get engagement summaries for multiple reviews (for list endpoints).
     */
    async getSummariesForReviews(
      reviewIds: number[],
      userId?: number | null
    ): Promise<Map<number, ReactionSummary>> {
      const map = new Map<number, ReactionSummary>();
      if (reviewIds.length === 0) return map;

      // Use Knex directly: the 'review' relation lives in a link table, and
      // Strapi's ORM $in filter + populate on link-table relations is unreliable.
      const knex = strapi.db.connection;
      const rows = await knex('review_reactions')
        .join(
          'review_reactions_review_lnk',
          'review_reactions.id',
          'review_reactions_review_lnk.review_reaction_id',
        )
        .leftJoin(
          'review_reactions_user_lnk',
          'review_reactions.id',
          'review_reactions_user_lnk.review_reaction_id',
        )
        .whereIn('review_reactions_review_lnk.review_id', reviewIds)
        .select(
          'review_reactions_review_lnk.review_id as reviewId',
          'review_reactions.emoji_type as emojiType',
          'review_reactions_user_lnk.user_id as userId',
        );

      const byReview = new Map<number, Array<{ emojiType: string; user: number | null }>>();
      for (const id of reviewIds) byReview.set(id, []);
      for (const r of rows) {
        const reviewId = Number(r.reviewId);
        const uid = r.userId ? Number(r.userId) : null;
        const list = byReview.get(reviewId);
        if (list) list.push({ emojiType: r.emojiType, user: uid });
      }

      for (const reviewId of reviewIds) {
        const list = byReview.get(reviewId) || [];
        const counts: Record<string, number> = {};
        SIGNAL_TYPES.forEach((t) => (counts[t] = 0));
        const userSignals: Record<string, boolean> = {};
        SIGNAL_TYPES.forEach((t) => (userSignals[t] = false));
        for (const { emojiType, user: uid } of list) {
          if (SIGNAL_TYPES.includes(emojiType as EngagementType))
            counts[emojiType] = (counts[emojiType] || 0) + 1;
          if (userId && uid === userId) userSignals[emojiType] = true;
        }
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        map.set(reviewId, {
          counts: counts as Record<EngagementType, number>,
          userSignals: userSignals as Record<EngagementType, boolean>,
          total,
        });
      }
      return map;
    },
  })
);
