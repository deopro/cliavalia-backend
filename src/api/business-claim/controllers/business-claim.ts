/**
 * business-claim controller
 */

import { factories } from "@strapi/strapi";
import { uploadFilesWithFunctionType } from "../../../utils/upload-with-function-type";

export default factories.createCoreController(
  "api::business-claim.business-claim",
  ({ strapi }) => ({
    /**
     * Create a new business claim
     * POST /api/business-claims
     */
    async create(ctx) {
      try {
        // Extract form data - handle both JSON body and multipart form data
        const { businessName, businessId, contactEmail, note } =
          ctx.request.body;
        const officialLetterFile = ctx.request.files?.officialLetter;
        const idCopyFile = ctx.request.files?.idCopy;

        // Validate required fields
        if (!businessName) {
          return ctx.badRequest("Business name is required.");
        }

        if (!contactEmail) {
          return ctx.badRequest("Contact email is required.");
        }

        // Validate required documents
        if (!officialLetterFile) {
          return ctx.badRequest("A carta oficial é obrigatória.");
        }

        if (!idCopyFile) {
          return ctx.badRequest("A cópia do documento de identificação é obrigatória.");
        }

        // Check if there's already a pending claim for this email
        const existingPendingClaim = await strapi.db
          .query("api::business-claim.business-claim")
          .findOne({
            where: {
              contactEmail: contactEmail.toLowerCase(),
              claimStatus: "pending",
            },
          });

        if (existingPendingClaim) {
          return ctx.badRequest(
            "Já existe um pedido de verificação pendente para este email. Por favor, aguarde a análise do pedido anterior."
          );
        }

        // Prepare claim data - claimStatus is always 'pending' for new claims
        const claimData: any = {
          businessName,
          contactEmail: contactEmail.toLowerCase(),
          claimStatus: "pending",
        };

        // Add optional fields
        if (businessId) claimData.businessId = businessId;
        if (note) claimData.note = note;

        // Upload officialLetter
        try {
          const fileToUpload = Array.isArray(officialLetterFile) ? officialLetterFile[0] : officialLetterFile;
          const formidableFile = fileToUpload as any;

          strapi.log.info(
            `Uploading officialLetter: ${formidableFile.originalFilename || 'official-letter'}, size: ${formidableFile.size || 'unknown'}`
          );

          const uploadResponse = await uploadFilesWithFunctionType(
            strapi,
            [fileToUpload],
            'business-verification',
            {
              name: formidableFile.originalFilename || 'official-letter',
              alternativeText: null,
              caption: null,
            },
          );

          if (uploadResponse && uploadResponse.length > 0 && uploadResponse[0].id) {
            claimData.officialLetter = uploadResponse[0].id;
            strapi.log.info(`officialLetter uploaded successfully. File ID: ${uploadResponse[0].id}`);
          }
        } catch (uploadError: any) {
          strapi.log.error("officialLetter upload failed:", uploadError.message);
          return ctx.badRequest("Falha no carregamento da carta oficial.");
        }

        // Upload idCopy
        try {
          const fileToUpload = Array.isArray(idCopyFile) ? idCopyFile[0] : idCopyFile;
          const formidableFile = fileToUpload as any;

          strapi.log.info(
            `Uploading idCopy: ${formidableFile.originalFilename || 'id-copy'}, size: ${formidableFile.size || 'unknown'}`
          );

          const uploadResponse = await uploadFilesWithFunctionType(
            strapi,
            [fileToUpload],
            'business-verification',
            {
              name: formidableFile.originalFilename || 'id-copy',
              alternativeText: null,
              caption: null,
            },
          );

          if (uploadResponse && uploadResponse.length > 0 && uploadResponse[0].id) {
            claimData.idCopy = uploadResponse[0].id;
            strapi.log.info(`idCopy uploaded successfully. File ID: ${uploadResponse[0].id}`);
          }
        } catch (uploadError: any) {
          strapi.log.error("idCopy upload failed:", uploadError.message);
          return ctx.badRequest("Falha no carregamento da cópia do BI.");
        }

        // Create the business claim
        const claim = await strapi.db
          .query("api::business-claim.business-claim")
          .create({
            data: claimData,
            populate: {
              officialLetter: {
                fields: ["id", "name", "url"],
              },
              idCopy: {
                fields: ["id", "name", "url"],
              },
            },
          });

        strapi.log.info(
          `Business claim submitted: ${businessName} (${contactEmail})`
        );

        // Send email notification to admin
        try {
          const businessClaimService = strapi.service("api::business-claim.business-claim");
          if (businessClaimService && businessClaimService.sendNewClaimNotificationEmail) {
            await businessClaimService.sendNewClaimNotificationEmail(claim);
          }
        } catch (emailError: any) {
          // Log email error but don't fail the claim creation
          strapi.log.error(
            "Error sending new claim notification email:",
            emailError
          );
        }

        return ctx.created({
          data: claim,
          message:
            "Business claim submitted successfully. We will review it and contact you soon.",
        });
      } catch (error) {
        strapi.log.error("Error creating business claim:", error);
        return ctx.internalServerError(
          "An error occurred while submitting the business claim."
        );
      }
    },
  })
);





