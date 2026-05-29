/**
 * OTP Auth Controller
 * Handles sendOTP and verifyOTP endpoints
 *
 * Note: This is a custom controller without a content-type,
 * so we don't use factories.createCoreController
 */

export default {
  /**
   * Send OTP to phone number
   * POST /api/otp-auth/send-otp
   */
  async sendOTP(ctx: any) {
    try {
      const { phoneNumber } = ctx.request.body;

      if (!phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }

      const otpAuthService = strapi.service('api::otp-auth.otp-auth');
      await otpAuthService.sendOTP(phoneNumber);

      return ctx.send({
        message: 'OTP sent successfully',
        phoneNumber,
      }, 200);
    } catch (error: any) {
      strapi.log.error('Error in sendOTP controller:', error);
      return ctx.badRequest(error.message || 'Failed to send OTP');
    }
  },

  /**
   * Verify OTP code
   * POST /api/otp-auth/verify-otp
   */
  async verifyOTP(ctx: any) {
    try {
      const { phoneNumber, code } = ctx.request.body;

      if (!phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }

      if (!code) {
        return ctx.badRequest('OTP code is required');
      }

      const otpAuthService = strapi.service('api::otp-auth.otp-auth');
      const result = await otpAuthService.verifyOTP(phoneNumber, code);

      return ctx.send({
        jwt: result.jwt,
        user: result.user,
      }, 200);
    } catch (error: any) {
      strapi.log.error('Error in verifyOTP controller:', error);
      return ctx.badRequest(error.message || 'Failed to verify OTP');
    }
  },
};
