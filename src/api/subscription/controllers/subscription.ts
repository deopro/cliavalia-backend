/**
 * Subscription controller — GET /api/subscription/status, POST /api/subscription/upgrade, POST /api/subscription/cancel
 */

import { downgradeToFree, upgradeToPro } from '../../business/services/subscription';

export default {
  /**
   * GET /api/subscription/status
   * Returns the subscription state of the authenticated user's business.
   * Self-healing: if data in the DB is stale (trial/pro expired but not yet
   * downgraded by the daily cron), this endpoint downgrades inline and returns
   * the corrected values.
   */
  async status(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const business = await strapi.db.query('api::business.business').findOne({
      where: { owner: user.id },
      select: [
        'documentId',
        'subscriptionPlan',
        'subscriptionStatus',
        'trialStartedAt',
        'trialExpiresAt',
        'subscriptionStartedAt',
        'subscriptionEndsAt',
      ],
    });

    if (!business) {
      return ctx.notFound('No business found for this user');
    }

    const now = new Date();
    const trialExpiresAt = business.trialExpiresAt ? new Date(business.trialExpiresAt) : null;
    const subscriptionEndsAt = business.subscriptionEndsAt ? new Date(business.subscriptionEndsAt) : null;

    // ── Inline expiry guard ──────────────────────────────────────────────
    // If the cron job missed this business (e.g. server restart), fix it now.
    const trialExpired =
      business.subscriptionPlan === 'trial' &&
      business.subscriptionStatus === 'active' &&
      trialExpiresAt !== null &&
      trialExpiresAt <= now;

    const proExpired =
      business.subscriptionPlan === 'pro' &&
      business.subscriptionStatus === 'active' &&
      subscriptionEndsAt !== null &&
      subscriptionEndsAt <= now;

    if (trialExpired || proExpired) {
      // Persist the downgrade (email is sent by the cron/bootstrap catch-up)
      await downgradeToFree(business.documentId);
      business.subscriptionPlan = 'free';
      business.subscriptionStatus = 'expired';
    }
    // ─────────────────────────────────────────────────────────────────────

    const daysUntilTrialExpires = trialExpiresAt
      ? Math.max(0, Math.ceil((trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const isTrialActive =
      business.subscriptionPlan === 'trial' &&
      business.subscriptionStatus === 'active' &&
      trialExpiresAt !== null &&
      trialExpiresAt > now;

    const isProActive =
      business.subscriptionPlan === 'pro' &&
      business.subscriptionStatus === 'active' &&
      (subscriptionEndsAt === null || subscriptionEndsAt > now);

    const isEnterpriseActive =
      business.subscriptionPlan === 'enterprise' &&
      business.subscriptionStatus === 'active';

    ctx.body = {
      data: {
        subscriptionPlan: business.subscriptionPlan ?? 'free',
        subscriptionStatus: business.subscriptionStatus ?? 'active',
        trialStartedAt: business.trialStartedAt ?? null,
        trialExpiresAt: business.trialExpiresAt ?? null,
        subscriptionStartedAt: business.subscriptionStartedAt ?? null,
        subscriptionEndsAt: business.subscriptionEndsAt ?? null,
        daysUntilTrialExpires,
        isTrialActive,
        isProActive,
        isEnterpriseActive,
        canReply: isTrialActive || isProActive || isEnterpriseActive,
      },
    };
  },

  /**
   * POST /api/subscription/upgrade
   * Admin-only endpoint to manually upgrade a business to Pro.
   * Body: { documentId: string, durationDays?: number }
   */
  async upgrade(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    // Only admin users can call this endpoint
    const isAdmin = user.role?.type === 'administrator' || user.isAdmin === true;
    if (!isAdmin) {
      return ctx.forbidden('Admin access required');
    }

    const { documentId, durationDays } = ctx.request.body as {
      documentId?: string;
      durationDays?: number;
    };

    if (!documentId) {
      return ctx.badRequest('documentId is required');
    }

    const business = await strapi.db.query('api::business.business').findOne({
      where: { documentId },
    });

    if (!business) {
      return ctx.notFound('Business not found');
    }

    await upgradeToPro(documentId, durationDays ?? 365);

    ctx.body = { data: { success: true, message: 'Business upgraded to Pro' } };
  },

  /**
   * POST /api/subscription/cancel
   * Cancels the active subscription for the authenticated business owner.
   * Immediately downgrades to free plan.
   */
  async cancel(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const business = await strapi.db.query('api::business.business').findOne({
      where: { owner: user.id },
      select: ['documentId', 'subscriptionPlan', 'subscriptionStatus'],
    });

    if (!business) {
      return ctx.notFound('No business found for this user');
    }

    if (business.subscriptionPlan === 'free') {
      return ctx.badRequest('No active subscription to cancel');
    }

    await downgradeToFree(business.documentId);

    ctx.body = { data: { success: true, message: 'Subscription cancelled successfully' } };
  },
};
