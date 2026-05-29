/**
 * Contact (support) form routes
 * POST /api/contact - submit contact form, sends email to support (no auth)
 */

export default {
  routes: [
    {
      method: "POST",
      path: "/contact",
      handler: "contact.submit",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
