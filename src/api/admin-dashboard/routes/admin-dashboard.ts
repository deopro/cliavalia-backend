/**
 * Custom admin dashboard routes
 * These routes verify admin tokens directly and bypass users-permissions auth
 */

export default {
  routes: [
    // Business Claims
    {
      method: 'GET',
      path: '/admin-dashboard/business-claims',
      handler: 'admin-dashboard.getBusinessClaims',
      config: {
        auth: false, // We handle auth in the controller
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/business-claims/:id',
      handler: 'admin-dashboard.getBusinessClaim',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/business-claims/:id',
      handler: 'admin-dashboard.updateBusinessClaim',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Users
    {
      method: 'GET',
      path: '/admin-dashboard/users',
      handler: 'admin-dashboard.getUsers',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/users/:id',
      handler: 'admin-dashboard.getUser',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/users/:id',
      handler: 'admin-dashboard.updateUser',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Businesses
    {
      method: 'GET',
      path: '/admin-dashboard/businesses',
      handler: 'admin-dashboard.getBusinesses',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/businesses',
      handler: 'admin-dashboard.createBusiness',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/businesses/:id',
      handler: 'admin-dashboard.getBusiness',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/businesses/:id',
      handler: 'admin-dashboard.updateBusiness',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/businesses/:id',
      handler: 'admin-dashboard.deleteBusiness',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Reviews
    {
      method: 'GET',
      path: '/admin-dashboard/reviews',
      handler: 'admin-dashboard.getReviews',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/reviews/:id',
      handler: 'admin-dashboard.getReview',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/reviews/:id',
      handler: 'admin-dashboard.updateReview',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/reviews/:id/rerun-moderation',
      handler: 'admin-dashboard.rerunReviewModeration',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/reviews/:id',
      handler: 'admin-dashboard.deleteReview',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Appeals
    {
      method: 'GET',
      path: '/admin-dashboard/appeals',
      handler: 'admin-dashboard.getAppeals',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/appeals/:id',
      handler: 'admin-dashboard.getAppeal',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/appeals/:id',
      handler: 'admin-dashboard.updateAppeal',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Reviewer Verifications
    {
      method: 'GET',
      path: '/admin-dashboard/reviewer-verifications',
      handler: 'admin-dashboard.getReviewerVerifications',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/reviewer-verifications/:id',
      handler: 'admin-dashboard.getReviewerVerification',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/reviewer-verifications/:id',
      handler: 'admin-dashboard.updateReviewerVerification',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Review Reports (consumer reports of reviews)
    {
      method: 'GET',
      path: '/admin-dashboard/review-reports',
      handler: 'admin-dashboard.getReviewReports',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/review-reports/:id',
      handler: 'admin-dashboard.getReviewReport',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/review-reports/:id',
      handler: 'admin-dashboard.updateReviewReport',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // Pending Businesses (user-submitted, awaiting approval)
    {
      method: 'GET',
      path: '/admin-dashboard/pending-businesses',
      handler: 'admin-dashboard.getPendingBusinesses',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-businesses/bulk/approve',
      handler: 'admin-dashboard.approveBulkPendingBusinesses',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-businesses/bulk/reject',
      handler: 'admin-dashboard.rejectBulkPendingBusinesses',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/pending-businesses/:id',
      handler: 'admin-dashboard.getPendingBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-businesses/:id/approve',
      handler: 'admin-dashboard.approvePendingBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-businesses/:id/reject',
      handler: 'admin-dashboard.rejectPendingBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Site Settings
    {
      method: 'GET',
      path: '/admin-dashboard/settings',
      handler: 'admin-dashboard.getSettings',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/settings/public',
      handler: 'admin-dashboard.getPublicSettings',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/settings',
      handler: 'admin-dashboard.updateSettings',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Pending Locations (renamed from Pending Agencies)
    {
      method: 'GET',
      path: '/admin-dashboard/pending-locations',
      handler: 'admin-dashboard.getPendingAgencies',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/pending-locations/:id',
      handler: 'admin-dashboard.getPendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-locations/:id/approve',
      handler: 'admin-dashboard.approvePendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-locations/:id/reject',
      handler: 'admin-dashboard.rejectPendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Backward-compatible aliases (old pending-agencies URLs)
    {
      method: 'GET',
      path: '/admin-dashboard/pending-agencies',
      handler: 'admin-dashboard.getPendingAgencies',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/pending-agencies/:id',
      handler: 'admin-dashboard.getPendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-agencies/:id/approve',
      handler: 'admin-dashboard.approvePendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/pending-agencies/:id/reject',
      handler: 'admin-dashboard.rejectPendingAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

