/**
 * Custom reviewer-verification routes
 * Path uses /account/me to avoid conflict with findOne's /:documentId (which would
 * match /me as documentId and return 403). auth: false - we verify JWT manually.
 */

export default {
  routes: [
    {
      method: "GET",
      path: "/reviewer-verifications/account/me",
      handler: "reviewer-verification.me",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
