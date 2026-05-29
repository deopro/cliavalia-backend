/**
 * reviewer-level custom routes — public read-only endpoint
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/reviewer-levels/public',
      handler: 'reviewer-level.find',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
