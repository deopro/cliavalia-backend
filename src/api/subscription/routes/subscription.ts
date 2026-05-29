/**
 * Subscription API routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/subscription/status',
      handler: 'subscription.status',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/subscription/upgrade',
      handler: 'subscription.upgrade',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/subscription/cancel',
      handler: 'subscription.cancel',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
