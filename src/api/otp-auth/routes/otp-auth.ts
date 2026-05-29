/**
 * OTP Auth Routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/otp-auth/send-otp',
      handler: 'otp-auth.sendOTP',
      config: {
        auth: false, // Public endpoint
        policies: [],
        middlewares: ['global::otp-rate-limit'],
      },
    },
    {
      method: 'POST',
      path: '/otp-auth/verify-otp',
      handler: 'otp-auth.verifyOTP',
      config: {
        auth: false, // Public endpoint
        policies: [],
        middlewares: [],
      },
    },
  ],
};
