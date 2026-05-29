/**
 * reviewer-verification service
 */

import { factories } from "@strapi/strapi";
import { normalizeEmailLocale } from '../../../utils/email-locale';
import { renderEmailTemplate } from '../../../utils/email-template-renderer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "notificacoes@cliavalia.com";

export default factories.createCoreService(
  "api::reviewer-verification.reviewer-verification",
  ({ strapi }) => ({
    /**
     * Send email to admin when a new verification request is submitted
     */
    async sendNewVerificationNotificationEmail(verification: any) {
      const user = verification.user ?? (verification.userId && await strapi.db.query("plugin::users-permissions.user").findOne({ where: { id: verification.userId } }));
      const userEmail = user?.email ?? "N/A";
      const id = verification.documentId ?? verification.id;
      const submissionDate = verification.createdAt
        ? new Date(verification.createdAt).toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Desconhecido";
      const adminDashboardUrl = (process.env.FRONTEND_URL || '') + "/shaolin/profile-verifications/pending";

      const { subject, html, from } = await renderEmailTemplate('admin-new-reviewer-verification', {
        userEmail,
        submissionDate,
        verificationId: String(id ?? "N/A"),
        adminDashboardUrl,
      });

      await strapi.plugins.email.services.email.send({ to: ADMIN_EMAIL, subject, html, from });
      strapi.log.info(`New verification notification email sent to: ${ADMIN_EMAIL}`);
    },

    /**
     * Send approval email to the reviewer
     */
    async sendApprovalEmail(verification: any) {
      const user = verification.user ?? (verification.userId && await strapi.db.query("plugin::users-permissions.user").findOne({ where: { id: verification.userId } }));
      const email = user?.email;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        strapi.log.warn("[REVIEWER-VERIFICATION] Cannot send approval email: invalid or missing user email");
        return;
      }

      const { subject, html, from } = await renderEmailTemplate('reviewer-verification-approved', {}, normalizeEmailLocale(user?.emailLocale));

      await strapi.plugins.email.services.email.send({ to: email, subject, html, from });
      strapi.log.info(`Approval email sent to: ${email}`);
    },

    /**
     * Send rejection email to the reviewer (with optional reason)
     */
    async sendRejectionEmail(verification: any, rejectionReason?: string) {
      const user = verification.user ?? (verification.userId && await strapi.db.query("plugin::users-permissions.user").findOne({ where: { id: verification.userId } }));
      const email = user?.email;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        strapi.log.warn("[REVIEWER-VERIFICATION] Cannot send rejection email: invalid or missing user email");
        return;
      }

      const reason = rejectionReason || verification.rejectionReason || "";
      const reasonBlock = reason
        ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:4px;"><p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Motivo:</p><p style="margin:0;color:#7f1d1d;font-size:14px;">${reason.replace(/\n/g, '<br>')}</p></div>`
        : '';

      const { subject, html, from } = await renderEmailTemplate('reviewer-verification-rejected', {
        reasonBlock,
      }, normalizeEmailLocale(user?.emailLocale));

      await strapi.plugins.email.services.email.send({ to: email, subject, html, from });
      strapi.log.info(`Rejection email sent to: ${email}`);
    },
  })
);
