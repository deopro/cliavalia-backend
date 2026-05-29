/**
 * Business Registration Email Service
 * Sends transactional emails for business user auth flows.
 * Templates are managed via the email-template collection type.
 */

import { getLocalizedEmailText, resolveEmailLocale } from '../../../utils/email-locale';
import { renderEmailTemplate } from '../../../utils/email-template-renderer';
import { BUSINESS_BRAND_SENDER } from '../../../utils/site-email-sender';

const BUSINESS_SENDER_OPTS = { defaultSender: BUSINESS_BRAND_SENDER };

export default {
  /**
   * Send business registration "pending approval" email
   */
  async sendBusinessRegistrationEmail(
    user: any,
    businessName?: string,
    localeLike?: unknown,
  ): Promise<void> {
    const locale = resolveEmailLocale(localeLike, user);
    const { subject, html, from } = await renderEmailTemplate('business-registration', {
      firstName: user.firstName || getLocalizedEmailText(locale, { pt: 'Utilizador', en: 'User' }),
      businessName: businessName || '',
    }, locale, BUSINESS_SENDER_OPTS);

    try {
      await strapi.plugins.email.services.email.send({
        to: user.email,
        from,
        subject,
        html,
      });
      strapi.log.info(`Business registration email sent to: ${user.email}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending business registration email to ${user.email}:`, emailError);
      throw emailError;
    }
  },

  /**
   * Send a branded email confirmation link to a business user.
   */
  async sendBusinessConfirmationEmail(
    user: any,
    confirmationUrl: string,
    firstName: string,
    localeLike?: unknown,
  ): Promise<void> {
    const locale = resolveEmailLocale(localeLike, user);
    const { subject, html, from } = await renderEmailTemplate('business-email-confirmation', {
      firstName: firstName || user.firstName || getLocalizedEmailText(locale, { pt: 'Utilizador', en: 'User' }),
      confirmationUrl,
    }, locale, BUSINESS_SENDER_OPTS);

    try {
      await strapi.plugins.email.services.email.send({
        to: user.email,
        from,
        subject,
        html,
      });
      strapi.log.info(`Business confirmation email sent to: ${user.email}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending business confirmation email to ${user.email}:`, emailError);
      throw emailError;
    }
  },

  /**
   * Send a branded "forgot password" email for business portal users.
   */
  async sendBusinessForgotPasswordEmail(
    user: any,
    resetUrl: string,
    localeLike?: unknown,
  ): Promise<void> {
    const locale = resolveEmailLocale(localeLike, user);
    const { subject, html, from } = await renderEmailTemplate('business-forgot-password', {
      firstName: user.firstName || getLocalizedEmailText(locale, { pt: 'Utilizador', en: 'User' }),
      resetUrl,
    }, locale, BUSINESS_SENDER_OPTS);

    try {
      await strapi.plugins.email.services.email.send({
        to: user.email,
        from,
        subject,
        html,
      });
      strapi.log.info(`Business forgot-password email sent to: ${user.email}`);
    } catch (emailError: any) {
      strapi.log.error(`Error sending business forgot-password email to ${user.email}:`, emailError);
      throw emailError;
    }
  },
};
