/**
 * Reviewer Verification lifecycle hooks
 *
 * Handles business logic when reviewer verifications are updated:
 * - Detects when status changes to "approved" or "rejected"
 * - Sends approval or rejection email to the reviewer
 */

export default {
  /**
   * After update hook - detects status changes and sends emails to reviewer
   */
  async afterUpdate(event: any) {
    const { result, params } = event;
    const { data, where } = params;

    const statusToProcess = data?.status ?? result?.status;
    const identifier = where?.documentId ?? where?.id;

    if (!result) {
      return;
    }

    try {
      let fullVerification: any;

      if (where?.documentId) {
        fullVerification = await strapi.documents("api::reviewer-verification.reviewer-verification").findOne({
          documentId: where.documentId,
          populate: { user: true },
        });
      } else {
        fullVerification = await strapi.db
          .query("api::reviewer-verification.reviewer-verification")
          .findOne({
            where: { id: where.id },
            populate: ["user"],
          });
      }

      if (!fullVerification) {
        strapi.log.warn(`Reviewer verification ${identifier} not found after update`);
        return;
      }

      const user = fullVerification.user;
      const userId = typeof user === "object" && user !== null ? (user as any).id : user;
      const service = strapi.service("api::reviewer-verification.reviewer-verification");

      // Revert to pending: clear user's verified badge
      if (statusToProcess === "pending" && userId) {
        try {
          await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: userId },
            data: { verified: false },
          });
          strapi.log.info(`[reviewer-verification] Set user ${userId} verified=false after revert to pending`);
        } catch (userUpdateErr: any) {
          strapi.log.error(
            `[reviewer-verification] Failed to set user ${userId} verified=false:`,
            userUpdateErr?.message ?? userUpdateErr
          );
        }
        return;
      }

      if (statusToProcess !== "approved" && statusToProcess !== "rejected") {
        return;
      }

      if (statusToProcess === "approved") {
        // Set the reviewer's verified field to true in users-permissions
        if (userId) {
          try {
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: userId },
              data: { verified: true },
            });
            strapi.log.info(`[reviewer-verification] Set user ${userId} verified=true after approval`);
          } catch (userUpdateErr: any) {
            strapi.log.error(
              `[reviewer-verification] Failed to set user ${userId} verified=true:`,
              userUpdateErr?.message ?? userUpdateErr
            );
          }
        }
        service.sendApprovalEmail(fullVerification).catch((err: any) => {
          strapi.log.error(`Error sending approval email for verification ${identifier}:`, err);
        });
      } else if (statusToProcess === "rejected") {
        const reason = data?.rejectionReason ?? fullVerification.rejectionReason;
        service.sendRejectionEmail(fullVerification, reason).catch((err: any) => {
          strapi.log.error(`Error sending rejection email for verification ${identifier}:`, err);
        });
      }
    } catch (error: any) {
      strapi.log.error(
        `Error in afterUpdate lifecycle for reviewer verification ${identifier}:`,
        error
      );
    }
  },
};
