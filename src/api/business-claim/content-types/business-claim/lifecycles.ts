/**
 * Business Claim lifecycle hooks
 *
 * Handles business logic when business claims are updated:
 * - Detects when claimStatus changes from "pending" to "approved"
 * - Triggers user account creation and password setup email
 */

export default {
  /**
   * After update hook - detects claimStatus changes and handles approved claims
   * Using afterUpdate instead of beforeUpdate to ensure the claim is fully updated
   * and to prevent duplicate processing if the update is called multiple times
   */
  async afterUpdate(event: any) {
    const { result, params } = event;
    const { data, where } = params;

    // Only process if claimStatus was updated to "approved"
      // Check both data.claimStatus (what was sent) and result.claimStatus (what was saved)
      const claimStatusToProcess = data.claimStatus || result?.claimStatus;
      const identifier = where.documentId || where.id; // Declare at function scope for error handling
      if (claimStatusToProcess === "approved" && result) {
        try {
          const claim = result;
          const contactEmail = claim.contactEmail;

          if (!contactEmail) {
            strapi.log.warn(
              `Business claim ${identifier} approved but no contactEmail to process`
            );
            return;
          }

        // Fetch the full claim to ensure we have all data
        // Use documentId if available (Strapi 5), otherwise use id
        let fullClaim;
        
        if (where.documentId) {
          // Strapi 5 document API - use documents().findOne with documentId
          fullClaim = await strapi.documents('api::business-claim.business-claim').findOne({
            documentId: where.documentId,
          });
        } else {
          // Fallback to query API with id
          fullClaim = await strapi.db
            .query("api::business-claim.business-claim")
            .findOne({
              where: { id: where.id },
            });
        }

        if (!fullClaim) {
          strapi.log.warn(
            `Business claim ${identifier} not found after update`
          );
          return;
        }

        strapi.log.info(
          `Business claim ${identifier} approved - processing user creation and email`
        );

        // Call service to handle approved claim
        // Don't await to avoid blocking the update operation
        const businessClaimService = strapi.service(
          "api::business-claim.business-claim"
        );
        
        // Execute asynchronously without blocking
        businessClaimService.handleApprovedClaim(fullClaim).catch((error: any) => {
          // Log error but don't fail the update
          strapi.log.error(
            `Error handling approved business claim ${identifier}:`,
            error
          );
        });
      } catch (error: any) {
        // Log error but don't fail the update
        strapi.log.error(
          `Error in afterUpdate lifecycle for business claim ${identifier || where.id || where.documentId}:`,
          error
        );
      }
    }
  },
};

