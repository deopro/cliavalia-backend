/**
 * guest-session custom routes
 * Public endpoints for anonymous content access metering.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/guest-sessions/by-identity',
      handler: 'guest-session.getByIdentity',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/guest-sessions/check-access',
      handler: 'guest-session.checkAccess',
      config: {
        policies: [],
        middlewares: [],
        auth: false,
      },
    },
  ],
};
