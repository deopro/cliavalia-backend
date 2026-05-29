/**
 * Business Authentication Routes
 * Custom API routes for business user registration
 */

export default {
  routes: [
    {
      method: "POST",
      path: "/auth/business/register",
      handler: "business-auth.register",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/auth/business/setup-password",
      handler: "business-auth.setupPassword",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PUT",
      path: "/auth/business/resubmit",
      handler: "business-auth.resubmit",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/auth/business/forgot-password",
      handler: "business-auth.forgotPassword",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/auth/business/resend-confirmation",
      handler: "business-auth.resendConfirmation",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};















