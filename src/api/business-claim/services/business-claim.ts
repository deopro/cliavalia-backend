/**
 * business-claim service
 */

import { factories } from "@strapi/strapi";
import crypto from "crypto";
import { renderEmailTemplate } from '../../../utils/email-template-renderer';
import { BUSINESS_BRAND_SENDER } from '../../../utils/site-email-sender';

const CLAIM_BUSINESS_SENDER_OPTS = { defaultSender: BUSINESS_BRAND_SENDER };

export default factories.createCoreService(
  "api::business-claim.business-claim",
  ({ strapi }) => ({
    /**
     * Handle approved business claim
     * - Check if user exists, create if not
     * - Generate password reset token
     * - Send welcome email with password setup link
     */
    async handleApprovedClaim(claim: any) {
      const contactEmail = claim?.contactEmail ?? claim?.contact_email;
      const businessName = claim?.businessName ?? claim?.business_name;
      const businessId = claim?.businessId ?? claim?.business_id;
      const id = claim?.id ?? claim?.documentId;
      const documentId = claim?.documentId ?? claim?.document_id;
      // Support Strapi document service (flat) and db.query (snake_case) shapes
      const documentType = claim?.documentType ?? claim?.document_type ?? claim?.attributes?.documentType ?? claim?.attributes?.document_type;
      
      strapi.log.info(`[BUSINESS-CLAIM] handleApprovedClaim called for claim: ${id || documentId}, email: ${contactEmail}, business: ${businessName}, documentType: ${documentType}`);

      // Validate required fields
      if (!contactEmail) {
        strapi.log.warn(
          `[BUSINESS-CLAIM] Claim ${id || documentId} approved but no contactEmail provided`
        );
        return;
      }

      // Automatically verify the business if businessId is provided
      if (businessId) {
        try {
          strapi.log.info(`[BUSINESS-CLAIM] Verifying business with ID/slug: ${businessId}`);
          
          // Check if businessId is numeric (ID) or string (slug)
          const isNumericId = /^\d+$/.test(String(businessId));
          
          let business;
          if (isNumericId) {
            // Lookup by ID
            business = await strapi.db.query('api::business.business').findOne({
              where: { id: Number.parseInt(String(businessId), 10) },
            });
          } else {
            // Lookup by slug
            business = await strapi.db.query('api::business.business').findOne({
              where: { slug: businessId },
            });
          }

          if (business) {
            // Update business to verified and store document type used for verification
            const updateData: { verified: boolean; verifiedDocumentType?: string } = { verified: true };
            if (documentType && ['business_license', 'utility_bill', 'tax_filing'].includes(documentType)) {
              updateData.verifiedDocumentType = documentType;
            }
            await strapi.db.query('api::business.business').update({
              where: { id: business.id },
              data: updateData,
            });
            strapi.log.info(`[BUSINESS-CLAIM] Business ${business.id} (${business.name}) has been verified${documentType ? ` (document: ${documentType})` : ''}`);
          } else {
            strapi.log.warn(`[BUSINESS-CLAIM] Business with ID/slug "${businessId}" not found, skipping verification`);
          }
        } catch (verifyError: any) {
          strapi.log.error(`[BUSINESS-CLAIM] Error verifying business ${businessId}:`, verifyError);
          // Don't throw - continue with user creation even if business verification fails
        }
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail)) {
        strapi.log.warn(
          `Business claim ${id} approved but invalid email format: ${contactEmail}`
        );
        return;
      }

      try {
        // Check if user exists with this email
        let user = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({
            where: { email: contactEmail.toLowerCase() },
            populate: { role: true },
          });

        // Store original resetPasswordToken if user exists (for duplicate check)
        const originalResetToken = user?.resetPasswordToken;

        // Guard: Check if user already has a resetPasswordToken (email was likely already sent)
        // This prevents duplicate emails if the lifecycle hook is triggered multiple times
        if (user && user.resetPasswordToken) {
          strapi.log.info(
            `[BUSINESS-CLAIM] User ${user.id} already has resetPasswordToken. Email was likely already sent. Skipping duplicate processing.`
          );
          // Still ensure the user has the correct role
          const roleType = user.role?.type || "";
          if (roleType !== "business-user") {
            strapi.log.warn(
              `[BUSINESS-CLAIM] User ${user.id} has wrong role '${roleType}', updating to business-user`
            );
            let businessUserRole = await strapi.db
              .query("plugin::users-permissions.role")
              .findOne({
                where: { type: "business-user" },
              });

            if (!businessUserRole) {
              businessUserRole = await strapi.db
                .query("plugin::users-permissions.role")
                .create({
                  data: {
                    name: "Business User",
                    description:
                      "Role for business owners who can manage their business profile and respond to reviews",
                    type: "business-user",
                  },
                });
            }
            
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: user.id },
              data: { role: businessUserRole.id },
            });
          }
          return; // Skip entire process to prevent duplicates
        }

        // Create user if doesn't exist
        if (!user) {
          strapi.log.info(
            `Creating new user account for approved business claim: ${contactEmail}`
          );

          // Generate unique username
          const emailPrefix = contactEmail.split("@")[0] || "user";
          let baseUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, "_");
          let username = baseUsername;
          let usernameExists = true;
          let usernameAttempts = 0;

          while (usernameExists && usernameAttempts < 10) {
            const existingUser = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { username },
              });

            if (existingUser) {
              usernameAttempts++;
              username = `${baseUsername}${usernameAttempts}`;
            } else {
              usernameExists = false;
            }
          }

          // Get business-user role (required for business claim users)
          let businessUserRole = await strapi.db
            .query("plugin::users-permissions.role")
            .findOne({
              where: { type: "business-user" },
            });

          // Create business-user role if it doesn't exist
          if (!businessUserRole) {
            strapi.log.info("Business-user role not found, creating it...");
            businessUserRole = await strapi.db
              .query("plugin::users-permissions.role")
              .create({
                data: {
                  name: "Business User",
                  description:
                    "Role for business owners who can manage their business profile and respond to reviews",
                  type: "business-user",
                },
              });
            strapi.log.info(
              `Business-user role created: ${businessUserRole.id}`
            );
          }

          // Create user without password (will be set via reset token)
          const userService = strapi.plugin("users-permissions").service("user");
          
          // Extract first and last name from business name or use defaults
          const nameParts = businessName?.trim().split(/\s+/) || [];
          const firstName = nameParts[0] || "Business";
          const lastName = nameParts.slice(1).join(" ") || "Owner";

          const userData: any = {
            username,
            email: contactEmail.toLowerCase(),
            provider: "local",
            confirmed: false, // User needs to set password first
            blocked: false,
            role: businessUserRole.id, // Assign business-user role
            firstName: firstName.substring(0, 80), // Enforce max length
            lastName: lastName.substring(0, 30), // Enforce max length
          };

          try {
            user = await userService.add(userData);
            strapi.log.info(`User created for business claim ${id}: ${user.id}`);
            
            // Verify role is set correctly (userService.add might override it)
            const createdUser = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: user.id },
                populate: { role: true },
              });
            
            const roleType = createdUser?.role?.type || "";
            if (roleType !== "business-user") {
              strapi.log.warn(
                `[BUSINESS-CLAIM] User ${user.id} created with wrong role '${roleType}', fixing to business-user`
              );
              await strapi.db.query("plugin::users-permissions.user").update({
                where: { id: user.id },
                data: { role: businessUserRole.id },
              });
              // Refresh user data
              user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                  where: { id: user.id },
                  populate: { role: true },
                });
            }
          } catch (userError: any) {
            strapi.log.error(
              `Error creating user for business claim ${id}:`,
              userError
            );
            throw userError;
          }
        } else {
          strapi.log.info(
            `User already exists for approved business claim: ${user.id}`
          );
          
          // If user exists but doesn't have business-user role, update it
          const existingUserWithRole = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
              where: { id: user.id },
              populate: { role: true },
            });
          
          const roleType = existingUserWithRole?.role?.type || "";
          if (roleType !== "business-user") {
            strapi.log.warn(
              `User ${user.id} exists but has role '${roleType}', updating to business-user`
            );
            
            // Get or create business-user role
            let businessUserRole = await strapi.db
              .query("plugin::users-permissions.role")
              .findOne({
                where: { type: "business-user" },
              });

            if (!businessUserRole) {
              businessUserRole = await strapi.db
                .query("plugin::users-permissions.role")
                .create({
                  data: {
                    name: "Business User",
                    description:
                      "Role for business owners who can manage their business profile and respond to reviews",
                    type: "business-user",
                  },
                });
            }
            
            // Update user role
            await strapi.db.query("plugin::users-permissions.user").update({
              where: { id: user.id },
              data: { role: businessUserRole.id },
            });
            
            strapi.log.info(
              `Updated user ${user.id} role to business-user`
            );
          }
        }

        // Link business to user if businessId was provided and business exists
        if (businessId && user?.id) {
          try {
            const isNumericId = /^\d+$/.test(String(businessId));
            let businessToLink;
            
            if (isNumericId) {
              businessToLink = await strapi.db.query('api::business.business').findOne({
                where: { id: Number.parseInt(String(businessId), 10) },
              });
            } else {
              businessToLink = await strapi.db.query('api::business.business').findOne({
                where: { slug: businessId },
              });
            }
            
            if (businessToLink) {
              // Link business to user by setting owner; preserve/set verifiedDocumentType from claim
              const linkData: { owner: number; verified: boolean; verifiedDocumentType?: string } = {
                owner: user.id,
                verified: true,
              };
              if (documentType && ['business_license', 'utility_bill', 'tax_filing'].includes(documentType)) {
                linkData.verifiedDocumentType = documentType;
              }
              await strapi.db.query('api::business.business').update({
                where: { id: businessToLink.id },
                data: linkData,
              });

              strapi.log.info(`[BUSINESS-CLAIM] Business ${businessToLink.id} (${businessToLink.name}) linked to user ${user.id}${documentType ? ` (documentType: ${documentType})` : ''}`);
            } else {
              strapi.log.warn(`[BUSINESS-CLAIM] Business with ID/slug "${businessId}" not found for linking to user ${user.id}`);
            }
          } catch (linkError: any) {
            strapi.log.error(`[BUSINESS-CLAIM] Error linking business ${businessId} to user ${user.id}:`, linkError);
            // Don't throw - continue with password token generation even if linking fails
          }
        }

        // Generate password reset token
        const resetToken = crypto.randomBytes(64).toString("hex");

        // Update user with reset token
        try {
          await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: user.id },
            data: {
              resetPasswordToken: resetToken,
            },
          });

          strapi.log.info(`Password reset token generated for user: ${user.id}`);
        } catch (tokenError: any) {
          strapi.log.error(
            `Error generating reset token for user ${user.id}:`,
            tokenError
          );
          throw tokenError;
        }

        // Send welcome email with password setup link
        // Guard: Only send if this is a new token (prevents duplicates if lifecycle is called multiple times)
        // If user had a token before we generated a new one, skip email (it was already sent)
        if (!originalResetToken || originalResetToken !== resetToken) {
          try {
            await this.sendPasswordSetupEmail(
              contactEmail,
              businessName,
              resetToken
            );

            strapi.log.info(
              `Password setup email sent for approved business claim: ${id}`
            );
          } catch (emailError: any) {
            // Log email error but don't fail the entire process
            // The user has been created and token generated, they can request a new one
            strapi.log.error(
              `Error sending password setup email for business claim ${id}:`,
              emailError
            );
            // Don't throw - user creation and token generation succeeded
          }
        } else {
          strapi.log.info(
            `[BUSINESS-CLAIM] Skipping email send for claim ${id} - token unchanged (email likely already sent)`
          );
        }
      } catch (error: any) {
        // Log detailed error information
        strapi.log.error(
          `Error handling approved business claim ${id}:`,
          {
            message: error?.message || "Unknown error",
            stack: error?.stack,
            claimId: id,
            contactEmail,
          }
        );
        // Don't throw - we don't want to block the claim update
        // The claim approval should succeed even if email/user creation fails
      }
    },

    /**
     * Send password setup email
     */
    async sendPasswordSetupEmail(
      email: string,
      businessName: string,
      resetToken: string
    ) {
      const frontendUrl = process.env.FRONTEND_URL;
      const passwordSetupUrl = `${frontendUrl}/business/register?code=${resetToken}`;

      const { subject, html, from } = await renderEmailTemplate('business-claim-approved', {
        businessName,
        passwordSetupUrl,
      }, undefined, CLAIM_BUSINESS_SENDER_OPTS);

      try {
        await strapi.plugins.email.services.email.send({
          to: email,
          from,
          subject,
          html,
        });
        strapi.log.info(`Password setup email sent to: ${email}`);
      } catch (emailError: any) {
        strapi.log.error(`Error sending password setup email to ${email}:`, emailError);
        throw emailError;
      }
    },

    /**
     * Handle rejected business claim
     * - Send rejection notification email with reason
     */
    async handleRejectedClaim(claim: any, rejectionReason?: string) {
      const { contactEmail, businessName, id, documentId } = claim;

      strapi.log.info(`[BUSINESS-CLAIM] handleRejectedClaim called for claim: ${id || documentId}, email: ${contactEmail}, business: ${businessName}`);

      // Validate required fields
      if (!contactEmail) {
        strapi.log.warn(
          `[BUSINESS-CLAIM] Claim ${id || documentId} rejected but no contactEmail provided`
        );
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail)) {
        strapi.log.warn(
          `Business claim ${id} rejected but invalid email format: ${contactEmail}`
        );
        return;
      }

      try {
        const reason = rejectionReason || claim.rejectionReason || '';
        await this.sendRejectionEmail(contactEmail, businessName, reason);
        strapi.log.info(`Rejection email sent for business claim: ${id}`);
      } catch (emailError: any) {
        strapi.log.error(
          `Error sending rejection email for business claim ${id}:`,
          emailError
        );
        // Don't throw - claim rejection should succeed even if email fails
      }
    },

    /**
     * Send email notification to admin when new business claim is submitted
     */
    async sendNewClaimNotificationEmail(claim: any) {
      const { businessName, contactEmail, documentType, createdAt, id, documentId } = claim;
      const adminEmail = process.env.ADMIN_EMAIL || "comercial@cliavalia.com";
      const documentTypeLabels = { business_license: "Licença de estabelecimento", utility_bill: "Fatura de serviços", tax_filing: "Declaração fiscal" };
      const documentTypeLabel = documentTypeLabels[documentType] || documentType || "Desconhecido";
      const submissionDate = createdAt ? new Date(createdAt).toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Desconhecido";
      const adminDashboardUrl = (process.env.FRONTEND_URL || '') + "/shaolin/business-claims/pending";
      const claimId = String(id || documentId || "N/A");

      const { subject, html, from } = await renderEmailTemplate('admin-new-business-claim', {
        businessName: businessName || "N/A",
        contactEmail: contactEmail || "N/A",
        documentTypeLabel,
        submissionDate,
        claimId,
        adminDashboardUrl,
      });

      try {
        await strapi.plugins.email.services.email.send({ to: adminEmail, subject, html, from });
        strapi.log.info(`New claim notification email sent to: ${adminEmail}`);
      } catch (emailError) {
        strapi.log.error(`Error sending new claim notification email:`, emailError);
        throw emailError;
      }
    },

    /**
     * Send rejection notification email with reason
     */
    async sendRejectionEmail(email: string, businessName: string, rejectionReason?: string) {
      const frontendUrl = process.env.FRONTEND_URL;
      const contactUrl = `${frontendUrl}/contact`;
      const rejectionReasonSection = rejectionReason
        ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:4px;"><p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Motivo:</p><p style="margin:0;color:#7f1d1d;font-size:14px;">${rejectionReason}</p></div>`
        : '';

      const { subject, html, from } = await renderEmailTemplate('business-claim-rejected', {
        businessName,
        contactUrl,
        rejectionReasonSection,
      }, undefined, CLAIM_BUSINESS_SENDER_OPTS);

      try {
        await strapi.plugins.email.services.email.send({
          to: email,
          from,
          subject,
          html,
        });
        strapi.log.info(`Rejection email sent to: ${email}`);
      } catch (emailError) {
        strapi.log.error(`Error sending rejection email:`, emailError);
        throw emailError;
      }
    },
  })
);





