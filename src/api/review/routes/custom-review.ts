/**
 * Custom review routes
 * These routes are in addition to the default Strapi REST routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/reviews/me',
      handler: 'review.me',
      config: {
        policies: [],
        middlewares: [],
        // No auth config = uses default authentication (required)
      },
    },
    {
      method: 'POST',
      path: '/reviews/:id/view',
      handler: 'review.incrementView',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Public endpoint - no authentication required
      },
    },
    // Increment share count for a review
    {
      method: 'POST',
      path: '/reviews/:id/share',
      handler: 'review.incrementShare',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Public endpoint - no authentication required
      },
    },
    {
      method: 'POST',
      path: '/reviews/:id/helpful',
      handler: 'review.toggleHelpful',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Bypass permission check, handle auth in controller
      },
    },
    {
      method: 'POST',
      path: '/reviews/:id/appeal',
      handler: 'review.appeal',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Bypass permission check, handle auth in controller
      },
    },
    {
      method: 'GET',
      path: '/reviews/appeals',
      handler: 'review.getUserAppeals',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Bypass permission check, handle auth in controller
      },
    },
    {
      method: 'GET',
      path: '/reviews/appeals/:id',
      handler: 'review.getAppeal',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Bypass permission check, handle auth in controller
      },
    },
    {
      method: 'GET',
      path: '/reviews/business/flagged',
      handler: 'review.getBusinessFlaggedReviews',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/reviews/business/pending-consumer-reports',
      handler: 'review.getBusinessPendingConsumerReportedReviews',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    // Review reports (consumer report a review)
    {
      method: 'POST',
      path: '/reviews/:id/report',
      handler: 'review.reportReview',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Handle auth in controller
      },
    },
    {
      method: 'GET',
      path: '/reviews/reports/me',
      handler: 'review.getMyReports',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Handle auth in controller
      },
    },
    // Reaction summary for a review (counts, top3, total, userReaction)
    {
      method: 'GET',
      path: '/reviews/:id/reactions',
      handler: 'review.getReactions',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    // Set current user reaction on a review
    {
      method: 'POST',
      path: '/reviews/:id/reaction',
      handler: 'review.setReaction',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    // User reaction stats for gamification (reactions given count + review count)
    {
      method: 'GET',
      path: '/reviews/reaction-stats/me',
      handler: 'review.getReactionStatsMe',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    // Public user stats (review count) for any user - used on public profile
    {
      method: 'GET',
      path: '/reviews/stats/:userId',
      handler: 'review.getPublicUserStats',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Public endpoint
      },
    },
    // Get list of users who reacted to a review
    {
      method: 'GET',
      path: '/reviews/:id/reactors',
      handler: 'review.getReactors',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
  ],
};

