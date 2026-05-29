/**
 * reviewer-verification controller
 */

import { factories } from "@strapi/strapi";
import { uploadFilesWithFunctionType } from "../../../utils/upload-with-function-type";

export default factories.createCoreController(
  "api::reviewer-verification.reviewer-verification",
  ({ strapi }) => ({
    /**
     * Create a new reviewer verification request (authenticated user)
     * POST /api/reviewer-verifications
     */
    async create(ctx: any) {
      const user = ctx.state.user;
      if (!user?.id) {
        return ctx.unauthorized("You must be logged in to submit a verification request.");
      }

      try {
        let selfieId: number | null = null;
        let identityDocumentId: number | null = null;

        // Support pre-uploaded media IDs (frontend uploads to Cloudinary via /api/upload first)
        const body = ctx.request?.body || {};
        if (typeof body.selfie === "number" && typeof body.identityDocument === "number") {
          selfieId = body.selfie;
          identityDocumentId = body.identityDocument;
        }

        // Fallback: accept multipart files (backend uploads via Strapi/Cloudinary)
        if (!selfieId || !identityDocumentId) {
          const selfieFile = ctx.request.files?.selfie;
          const identityDocumentFile = ctx.request.files?.identityDocument;

          if (!selfieFile) {
            return ctx.badRequest("Selfie image is required.");
          }
          if (!identityDocumentFile) {
            return ctx.badRequest("Identity document is required.");
          }

          const fileToUpload = (file: any) => (Array.isArray(file) ? file[0] : file);
          const selfie = fileToUpload(selfieFile);
          const identityDocument = fileToUpload(identityDocumentFile);

          try {
            const selfieResponse = await uploadFilesWithFunctionType(
              strapi,
              [selfie],
              "user-verification-image",
              {
                name: (selfie as any).originalFilename || "selfie",
                alternativeText: null,
                caption: null,
              },
            );
            if (selfieResponse?.length > 0 && selfieResponse[0].id) {
              selfieId = selfieResponse[0].id;
            }
          } catch (e: any) {
            strapi.log.error("Selfie upload failed:", e?.message || e);
            return ctx.badRequest("Failed to upload selfie. Please try again.");
          }

          try {
            const idDocResponse = await uploadFilesWithFunctionType(
              strapi,
              [identityDocument],
              "user-verification-doc",
              {
                name: (identityDocument as any).originalFilename || "identity-document",
                alternativeText: null,
                caption: null,
              },
            );
            if (idDocResponse?.length > 0 && idDocResponse[0].id) {
              identityDocumentId = idDocResponse[0].id;
            }
          } catch (e: any) {
            strapi.log.error("Identity document upload failed:", e?.message || e);
            return ctx.badRequest("Failed to upload identity document. Please try again.");
          }
        }

        if (!selfieId || !identityDocumentId) {
          return ctx.badRequest("File upload failed. Please try again.");
        }

        const verificationData: any = {
          user: user.id,
          selfie: selfieId,
          identityDocument: identityDocumentId,
          status: "pending",
        };

        const verification = await strapi.db
          .query("api::reviewer-verification.reviewer-verification")
          .create({
            data: verificationData,
            populate: { user: true, selfie: true, identityDocument: true },
          });

        try {
          const service = strapi.service("api::reviewer-verification.reviewer-verification");
          if (service?.sendNewVerificationNotificationEmail) {
            await service.sendNewVerificationNotificationEmail(verification);
          }
        } catch (emailError: any) {
          strapi.log.error("Error sending new verification notification email:", emailError);
        }

        return ctx.created({
          data: verification,
          message: "Verification request submitted successfully. We will review it and contact you soon.",
        });
      } catch (error: any) {
        strapi.log.error("Error creating reviewer verification:", error);
        return ctx.internalServerError("An error occurred while submitting the verification request.");
      }
    },

    /**
     * Get current user's verification(s)
     * GET /api/reviewer-verifications/me
     * Route has auth: false; we verify JWT manually to bypass permission checks.
     */
    async me(ctx: any) {
      let user = ctx.state.user;
      if (!user?.id) {
        const authHeader =
          ctx.request?.header?.authorization ||
          ctx.request?.headers?.authorization;
        if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
          try {
            const token = authHeader.replace("Bearer ", "").trim();
            const jwt = strapi.plugin("users-permissions").service("jwt");
            const payload = await jwt.verify(token);
            const userId = payload.id ?? payload.user?.id;
            if (userId) {
              user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id: userId }, populate: ["role"] });
              if (user) ctx.state.user = user;
            }
          } catch {
            // Token invalid
          }
        }
      }
      if (!user?.id) {
        return ctx.unauthorized("You must be logged in to view your verification status.");
      }

      try {
        const verifications = await strapi.db
          .query("api::reviewer-verification.reviewer-verification")
          .findMany({
            where: { user: user.id },
            orderBy: { createdAt: "desc" },
            populate: ["user", "selfie", "identityDocument"],
          });

        ctx.body = { data: verifications };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching reviewer verifications for user:", error);
        return ctx.internalServerError("An error occurred while fetching your verification status.");
      }
    },
  })
);
