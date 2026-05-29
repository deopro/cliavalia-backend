/**
 * Platform public routes
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/platform/stats',
      handler: 'platform.stats',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
