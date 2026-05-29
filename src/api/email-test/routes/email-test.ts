/**
 * Email diagnostic routes
 * GET /api/email-test/status   — check email plugin status (no email sent)
 * POST /api/email-test/send    — send a test email (admin-only)
 */

export default {
  routes: [
    {
      method: "GET",
      path: "/email-test/status",
      handler: "email-test.status",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/email-test/send",
      handler: "email-test.send",
      config: {
        auth: false, // protect via secret in body instead, for easy curl testing
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/email-test/send-get",
      handler: "email-test.sendGet",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
