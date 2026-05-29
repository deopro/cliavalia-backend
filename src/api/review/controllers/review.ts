/**
 * review controller
 */

import { factories } from "@strapi/strapi";
import { getBusinessCategoriesPopulate } from "../../../utils/business-categories";


const DIRECT_FLAGGED_STATUSES = new Set(["Sinalizada", "Flagged"]);
const APPROVED_STATUSES = new Set(["Aprovada", "Approved"]);


// Helper functions to reduce cognitive complexity

/**
 * Extract error message from various error object structures
 */
function extractErrorMessage(error: any): string {
  return (
    error?.message ||
    error?.error?.message ||
    error?.original?.message ||
    error?.response?.data?.error?.message ||
    error?.sqlMessage ||
    "Ocorreu um erro ao criar a avaliação."
  );
}

/**
 * Check if error is a lifecycle hook validation error
 */
function isValidationError(errorMessage: string): boolean {
  return (
    errorMessage.includes("já avaliaste") ||
    errorMessage.includes("obrigatório") ||
    errorMessage.includes("classificação deve estar") ||
    errorMessage.includes("Utilizador e empresa são obrigatórios")
  );
}

/**
 * Extract user ID from filter structure
 */
function extractUserIdFromFilter(userFilter: any): number | null {
  if (!userFilter) return null;

  if (typeof userFilter === "object") {
    if (userFilter.id) {
      if (
        typeof userFilter.id === "object" &&
        userFilter.id.$eq !== undefined
      ) {
        return userFilter.id.$eq;
      }
      if (typeof userFilter.id === "number") {
        return userFilter.id;
      }
    }
  } else if (typeof userFilter === "number") {
    return userFilter;
  }

  return null;
}

/**
 * Normalize user ID to number for comparison
 */
function normalizeUserId(userId: string | number): number {
  return typeof userId === "string" ? Number.parseInt(userId, 10) : userId;
}

/**
 * Extract business ID from filter structure
 */
function extractBusinessIdFromFilter(businessFilter: any): number | null {
  if (!businessFilter) return null;

  if (typeof businessFilter === "number") {
    return businessFilter;
  }

  if (typeof businessFilter !== "object") {
    return null;
  }

  if (typeof businessFilter.id === "number") {
    return businessFilter.id;
  }

  if (businessFilter.id && typeof businessFilter.id === "object") {
    if (typeof businessFilter.id.$eq === "number") {
      return businessFilter.id.$eq;
    }
    if (typeof businessFilter.id.$in?.[0] === "number") {
      return businessFilter.id.$in[0];
    }
  }

  if (typeof businessFilter.$eq === "number") {
    return businessFilter.$eq;
  }

  return null;
}

function hasModerationReason(review: any): boolean {
  return typeof review?.moderation_reason === "string" && review.moderation_reason.trim().length > 0;
}

function getNormalizedModeration(review: any): {
  normalizedStatus: string | null;
  moderationState: "none" | "pending" | "approved" | "flagged";
  visibility: "visible" | "hidden";
  isFlagged: boolean;
  isModerated: boolean;
} {
  const rawStatus =
    typeof review?.moderation_status === "string"
      ? review.moderation_status.trim()
      : "";
  const isPublished = review?.is_published;
  const hiddenWithReason = isPublished === false && hasModerationReason(review);

  if (DIRECT_FLAGGED_STATUSES.has(rawStatus) || hiddenWithReason) {
    return {
      normalizedStatus: "Flagged",
      moderationState: "flagged",
      visibility: "hidden",
      isFlagged: true,
      isModerated: true,
    };
  }

  if (APPROVED_STATUSES.has(rawStatus)) {
    return {
      normalizedStatus: "Approved",
      moderationState: "approved",
      visibility: isPublished === false ? "hidden" : "visible",
      isFlagged: false,
      isModerated: true,
    };
  }

  if (rawStatus === "Pending") {
    return {
      normalizedStatus: "Pending",
      moderationState: "pending",
      visibility: isPublished === false ? "hidden" : "visible",
      isFlagged: false,
      isModerated: true,
    };
  }

  return {
    normalizedStatus: rawStatus || null,
    moderationState: "none",
    visibility: isPublished === false ? "hidden" : "visible",
    isFlagged: false,
    isModerated: false,
  };
}

function normalizeReviewForResponse<T extends Record<string, any>>(review: T): T & {
  normalized_moderation_status: string | null;
  moderation_state: "none" | "pending" | "approved" | "flagged";
  moderation_visibility: "visible" | "hidden";
  is_flagged: boolean;
  is_moderated: boolean;
} {
  const normalized = getNormalizedModeration(review);

  return {
    ...review,
    normalized_moderation_status: normalized.normalizedStatus,
    moderation_state: normalized.moderationState,
    moderation_visibility: normalized.visibility,
    is_flagged: normalized.isFlagged,
    is_moderated: normalized.isModerated,
  };
}

async function isOwnedBusinessQuery(user: any, filters: any, strapi: any): Promise<boolean> {
  if (!user) return false;

  const businessFilter = filters.business || filters["business"];
  const businessId = extractBusinessIdFromFilter(businessFilter);

  if (!businessId) return false;

  const business = await strapi.db.query("api::business.business").findOne({
    where: {
      id: businessId,
      owner: user.id,
    },
    select: ["id"],
  });

  return !!business;
}

/**
 * Extract text content from review blocks structure
 */
function extractTextFromBlocks(reviewText: any): string {
  if (!reviewText || !Array.isArray(reviewText)) {
    return "";
  }

  return reviewText
    .map((block: any) => {
      if (block.type === "paragraph" && block.children) {
        return block.children.map((child: any) => child.text || "").join("");
      }
      return "";
    })
    .join("\n\n")
    .trim();
}

/**
 * Authenticate user from JWT token in header
 */
async function authenticateUserFromToken(ctx: any, strapi: any): Promise<any> {
  const authHeader =
    ctx.request?.header?.authorization ||
    ctx.request?.headers?.authorization ||
    ctx.headers?.authorization ||
    ctx.request?.header?.["authorization"] ||
    ctx.request?.headers?.["authorization"];

  if (
    !authHeader ||
    typeof authHeader !== "string" ||
    !authHeader.startsWith("Bearer ")
  ) {
    return null;
  }

  try {
    const token = authHeader.replace("Bearer ", "").trim();
    const jwt = strapi.plugin("users-permissions").service("jwt");
    const payload = await jwt.verify(token);
    const userId = payload.id || payload.user?.id || payload;

    const user = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { id: userId },
        populate: ["role"],
      });

    if (user) {
      ctx.state.user = user;
      return user;
    }
  } catch (error: unknown) {
    strapi.log.debug("Token validation failed:", error);
  }

  return null;
}

/**
 * Validate review text input
 */
function validateReviewText(
  reviewText: any,
  strapi: any,
  hasAudio = false
): { valid: boolean; text?: string; error?: string } {
  if (reviewText && typeof reviewText === "object") {
    strapi.log.error(
      "Review create - reviewText is an object/array (invalid for text field):",
      {
        reviewTextType: typeof reviewText,
        isArray: Array.isArray(reviewText),
        reviewText: reviewText,
      }
    );
    return {
      valid: false,
      error:
        "O texto da avaliação deve ser uma string, não um objeto ou array.",
    };
  }

  if (typeof reviewText === "string") {
    const trimmedText = reviewText.trim().replace(/\n{3,}/g, "\n\n");
    if (trimmedText.length === 0) {
      // Text is optional when an audio review is provided
      if (hasAudio) return { valid: true, text: "" };
      return {
        valid: false,
        error: "O texto da avaliação é obrigatório.",
      };
    }
    return { valid: true, text: trimmedText };
  }

  // reviewText is missing entirely — allowed when audio is provided
  if (hasAudio) return { valid: true, text: "" };

  return {
    valid: false,
    error: "O texto da avaliação é obrigatório e deve ser uma string.",
  };
}

/**
 * Validate experience photos array
 */
function validateExperiencePhotos(experiencePhotos: any): {
  valid: boolean;
  error?: string;
} {
  if (experiencePhotos === undefined || experiencePhotos === null) {
    return { valid: true };
  }

  if (!Array.isArray(experiencePhotos)) {
    return {
      valid: false,
      error: "As fotos da experiência devem ser um array de IDs de media.",
    };
  }

  if (experiencePhotos.some((id) => typeof id !== "number")) {
    return {
      valid: false,
      error: "Todos os IDs das fotos da experiência devem ser números.",
    };
  }

  return { valid: true };
}

/**
 * Validate audio review file ID (single numeric media ID)
 */
function validateAudioReview(audioReview: any): {
  valid: boolean;
  error?: string;
} {
  if (audioReview === undefined || audioReview === null) {
    return { valid: true };
  }

  if (typeof audioReview !== "number") {
    return {
      valid: false,
      error: "O ID do áudio deve ser um número.",
    };
  }

  return { valid: true };
}

/**
 * Prepare review data object
 */
function prepareReviewData(
  title: string,
  rating: number,
  reviewText: string,
  business: number | string,
  userId: number,
  experiencePhotos?: number[],
  experienceTags?: any[],
  audioReview?: number
): any {
  const reviewData: any = {
    title,
    rating,
    reviewText,
    business,
    users_permissions_user: userId,
  };

  if (
    experiencePhotos &&
    Array.isArray(experiencePhotos) &&
    experiencePhotos.length > 0
  ) {
    reviewData.experiencePhotos = experiencePhotos;
  }

  if (
    experienceTags &&
    Array.isArray(experienceTags) &&
    experienceTags.length > 0
  ) {
    reviewData.experienceTags = experienceTags;
  }

  if (audioReview) {
    reviewData.audioReview = audioReview;
  }

  return reviewData;
}

export default factories.createCoreController(
  "api::review.review",
  ({ strapi }) => ({
    /**
     * Create a new review
     * POST /api/reviews
     *
     * Requirements:
     * - User must be authenticated
     * - User can only create one review per business
     * - Rating must be between 1 and 5
     */
    async create(ctx) {
      // Manually authenticate - route uses auth:false to bypass admin permission config
      if (!ctx.state.user) {
        await authenticateUserFromToken(ctx, strapi);
      }
      const user = ctx.state.user;

      // Check if user is authenticated
      if (!user) {
        return ctx.unauthorized("Deves fazer login para criar uma avaliação.");
      }

      // Extract data from request body
      const {
        title,
        rating,
        reviewText,
        business,
        experiencePhotos,
        experienceTags,
        agency,
        awaitingEntityApproval,
        audioReview,
      } = ctx.request.body.data;

      // Validate required fields
      if (!rating || !business) {
        return ctx.badRequest(
          "Classificação e empresa são obrigatórios."
        );
      }

      // Validate rating range
      if (rating < 1 || rating > 5) {
        return ctx.badRequest("A classificação deve estar entre 1 e 5.");
      }

      // Validate reviewText — text is optional when an audio review is provided
      const hasAudio = typeof audioReview === "number";
      const reviewTextValidation = validateReviewText(reviewText, strapi, hasAudio);
      if (!reviewTextValidation.valid) {
        return ctx.badRequest(reviewTextValidation.error!);
      }
      const validatedReviewText = reviewTextValidation.text!;

      const trimmedTitle =
        typeof title === "string" ? title.trim() : "";
      const resolvedTitle =
        trimmedTitle ||
        (validatedReviewText
          ? validatedReviewText.length <= 40
            ? validatedReviewText
            : `${validatedReviewText.substring(0, 39)}…`
          : "") ||
        (hasAudio ? "Avaliação em áudio" : "Avaliação");

      // Validate business ID is a number
      if (
        !business ||
        (typeof business !== "number" && typeof business !== "string")
      ) {
        return ctx.badRequest("É necessário um ID de empresa válido.");
      }

      // Validate experiencePhotos if provided
      const photosValidation = validateExperiencePhotos(experiencePhotos);
      if (!photosValidation.valid) {
        return ctx.badRequest(photosValidation.error!);
      }

      // Validate audioReview if provided
      const audioValidation = validateAudioReview(audioReview);
      if (!audioValidation.valid) {
        return ctx.badRequest(audioValidation.error!);
      }

      // Verify business exists
      const businessExists = await strapi.db
        .query("api::business.business")
        .findOne({
          where: { id: business },
        });

      if (!businessExists) {
        return ctx.badRequest("Empresa não encontrada.");
      }

      // Check if the business is pending approval (user-submitted, not yet approved by admin)
      const isBusinessPending = businessExists.approvalStatus === 'pending';

      // Resolve agency ID early so we can use it in the duplicate check
      let resolvedAgencyId: number | null = null;
      if (agency) {
        if (typeof agency === 'number') {
          resolvedAgencyId = agency;
        } else if (typeof agency === 'string') {
          const parsed = Number.parseInt(agency, 10);
          if (!Number.isNaN(parsed)) {
            resolvedAgencyId = parsed;
          } else {
            // Treat as documentId — look up the numeric ID
            const agencyDoc = await strapi.db.query('api::agency.agency').findOne({ where: { documentId: agency } });
            if (agencyDoc) {
              resolvedAgencyId = agencyDoc.id;
            } else {
              strapi.log.warn(`[REVIEW] Agency with documentId "${agency}" not found — skipping agency attachment`);
            }
          }
        }
      }

      // Check if user has already reviewed this business (agency-aware).
      // When an agency is specified, allow one review per business+agency combo.
      // When no agency is specified, only match reviews that also have no agency.
      const duplicateWhere: Record<string, unknown> = {
        users_permissions_user: user.id,
        business: business,
      };
      if (resolvedAgencyId) {
        duplicateWhere.agency = resolvedAgencyId;
      } else {
        duplicateWhere.agency = { $null: true };
      }
      const existingReview = await strapi.db
        .query("api::review.review")
        .findOne({ where: duplicateWhere });

      if (existingReview) {
        return ctx.badRequest(
          resolvedAgencyId
            ? "Já avaliaste esta agência."
            : "Já avaliaste esta empresa."
        );
      }

      try {
        // Prepare data for review creation
        // Convert business to number if it's a string
        const businessId =
          typeof business === "string"
            ? Number.parseInt(business, 10)
            : business;
        const reviewData = prepareReviewData(
          resolvedTitle,
          rating,
          validatedReviewText,
          businessId,
          user.id,
          experiencePhotos,
          experienceTags,
          audioReview
        );

        // Attach resolved agency relation
        if (resolvedAgencyId) {
          reviewData.agency = resolvedAgencyId;
        }

        // If the business is pending approval or the frontend flagged awaitingEntityApproval,
        // hold the review for admin moderation instead of publishing immediately
        if (isBusinessPending || awaitingEntityApproval) {
          reviewData.is_published = false;
          reviewData.moderation_status = 'Pending';
          reviewData.awaitingEntityApproval = true;
          strapi.log.info(
            `[REVIEW] Review held for moderation: business "${businessExists.name}" (ID: ${businessId}) is pending approval`
          );
        }

        // Create the review
        const review = await strapi.db.query("api::review.review").create({
          data: reviewData,
        });

        // Send email to business owner — only when review is NOT held for entity approval
        if (!reviewData.awaitingEntityApproval) {
          try {
            const business = await strapi.db
              .query("api::business.business")
              .findOne({
                where: { id: businessId },
                populate: { owner: { fields: ["id", "email", "emailLocale"] } },
              });

            if (business?.owner?.email) {
              const reviewerName =
                user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`.trim()
                  : user.username || null;
              const reviewService = strapi.service("api::review.review");
              const reviewId = review.documentId ?? review.id;
              if (reviewService && typeof reviewService.sendNewReviewEmailToBusiness === "function") {
                await reviewService.sendNewReviewEmailToBusiness(
                  business.owner.email,
                  business.name || "O seu negócio",
                  title,
                  validatedReviewText,
                  rating,
                  reviewerName,
                  reviewId,
                  (business.owner as { emailLocale?: string }).emailLocale,
                );
              }
            }
          } catch (emailError: any) {
            strapi.log.error("Error sending new review email to business:", emailError);
            // Don't fail the request if email fails
          }
        } else {
          strapi.log.info(`[REVIEW] Skipping email — review held for entity approval (business ${businessId})`);
        }

        // After creation, fetch with populate if needed
        const populatedReview = await strapi.db
          .query("api::review.review")
          .findOne({
            where: { id: review.id },
            populate: {
              business: {
                fields: ["id", "name", "logoUrl"],
              },
              users_permissions_user: {
                fields: ["id", "username", "email"],
              },
            },
          });

        return ctx.created({ data: populatedReview || review });
      } catch (error: any) {
        // Log the entire error object to see all properties
        let errorString: string;
        try {
          errorString = JSON.stringify(
            error,
            (key, value) => {
              // Skip circular references and functions
              if (key === "stack" || typeof value === "function") {
                return undefined;
              }
              return value;
            },
            2
          );
        } catch (e: unknown) {
          // If stringify fails, just log the message
          errorString = String(error);
          strapi.log.warn("Failed to stringify error object:", e);
        }

        const errorDetails = {
          message: error?.message,
          name: error?.name,
          code: error?.code,
          errno: error?.errno,
          sqlState: error?.sqlState,
          sqlMessage: error?.sqlMessage,
          original: error?.original?.message,
          errorString,
        };

        strapi.log.error("Error creating review - Full details:", errorDetails);
        strapi.log.error("Error creating review - Request data:", {
          title,
          rating,
          reviewText:
            typeof reviewText === "string"
              ? reviewText.substring(0, 100) + "..."
              : JSON.stringify(reviewText).substring(0, 100) + "...",
          business,
          userId: user.id,
          businessType: typeof business,
          ratingType: typeof rating,
        });

        // Extract error message from various possible locations
        let errorMessage = extractErrorMessage(error);

        // If we have a SQL error, include more details
        if (error?.sqlMessage) {
          errorMessage = `Erro da base de dados: ${error.sqlMessage}`;
        }

        // Check if it's a lifecycle hook error (these are usually validation errors)
        if (isValidationError(errorMessage)) {
          return ctx.badRequest(errorMessage);
        }

        // Return the error message in the response with more details in development
        const isDevelopment = process.env.NODE_ENV === "development";
        const responseMessage = isDevelopment
          ? `${errorMessage} (Verifica os logs do servidor para mais detalhes)`
          : errorMessage;

        return ctx.internalServerError(responseMessage);
      }
    },

    /**
     * Find reviews - override to add custom filters
     * GET /api/reviews
     * Only returns published reviews (filters out flagged reviews)
     */
    async find(ctx) {
      const user = ctx.state.user;
      const { query } = ctx;

      // Type assertion for query.filters to handle Strapi's dynamic query structure
      const filters = (query.filters || {}) as any;

      // Check if query explicitly requests flagged reviews
      // Strapi parses filters[$or][0][moderation_status][$eq] into { $or: [{ moderation_status: { $eq: "Sinalizada" } }] }
      // Also check raw query params and request URL
      const rawQuery = ctx.query as any;
      const rawQueryString = JSON.stringify(rawQuery);
      const requestUrl = ctx.request?.url || '';
      const hasFlaggedInRawQuery = (rawQueryString.includes('moderation_status') && 
        (rawQueryString.includes('Sinalizada') || rawQueryString.includes('Flagged'))) ||
        (requestUrl.includes('moderation_status') && (requestUrl.includes('Sinalizada') || requestUrl.includes('Flagged')));
      
      const checkOrArray = (orArray: any[]): boolean => {
        return orArray.some((orItem: any) => {
          const modStatus = orItem?.moderation_status;
          if (!modStatus) return false;
          const eqValue = modStatus.$eq || modStatus["$eq"];
          return eqValue === "Sinalizada" || eqValue === "Flagged";
        });
      };
      
      // Check if filters already have a moderation_status filter requesting flagged reviews
      // This handles cases where Strapi parses the query differently
      const hasModerationStatusFilter = !!(filters.moderation_status || filters["moderation_status"]);
      const moderationStatusValue = filters.moderation_status?.$eq || filters["moderation_status"]?.$eq || 
        filters.moderation_status || filters["moderation_status"];
      const isRequestingFlagged = moderationStatusValue === "Sinalizada" || moderationStatusValue === "Flagged";
      
      const hasFlaggedFilter = 
        hasFlaggedInRawQuery ||
        isRequestingFlagged ||
        (filters.$or && Array.isArray(filters.$or) && checkOrArray(filters.$or)) ||
        (filters["$or"] && Array.isArray(filters["$or"]) && checkOrArray(filters["$or"]));

      // Check if querying by business ID
      const hasBusinessFilter = !!(filters.business || filters["business"]);

      // Log initial state for debugging
      strapi.log.info("Review find - Initial query state", {
        hasUser: !!user,
        userId: user?.id,
        filters: JSON.stringify(filters),
        filtersUsersPerms: filters.users_permissions_user,
        hasBusinessFilter,
        hasFlaggedFilter,
      });

      // Check if user is querying their own reviews
      let isQueryingOwnReviews = false;
      const isQueryingOwnedBusiness = await isOwnedBusinessQuery(user, filters, strapi);
      if (user && filters.users_permissions_user) {
        const userFilter = filters.users_permissions_user;
        const userId = extractUserIdFromFilter(userFilter);
        const currentUserId = normalizeUserId(user.id);
        const queriedUserId = userId !== null ? normalizeUserId(userId) : null;

        if (queriedUserId && currentUserId === queriedUserId) {
          isQueryingOwnReviews = true;
          strapi.log.info(
            "User querying own reviews - showing all reviews including flagged",
            {
              currentUserId: user.id,
              queriedUserId: userId,
              normalizedCurrent: currentUserId,
              normalizedQueried: queriedUserId,
            }
          );
        } else {
          strapi.log.info(
            "User querying other user reviews or mismatch - filtering flagged reviews",
            {
              currentUserId: user.id,
              queriedUserId: userId,
              normalizedCurrent: currentUserId,
              normalizedQueried: queriedUserId,
              userFilterType: typeof userFilter,
              userFilter: JSON.stringify(userFilter),
            }
          );
        }
      } else if (user) {
        strapi.log.info(
          "Authenticated user but no user filter - treating as public query"
        );
      } else {
        strapi.log.info("Public query (no auth) - filtering flagged reviews");
      }

      if (hasFlaggedFilter && !isQueryingOwnReviews && !isQueryingOwnedBusiness) {
        return ctx.forbidden("Não tens permissão para ver avaliações sinalizadas.");
      }

      // For public queries (non-authenticated or not the review owner), filter out flagged reviews
      // Only show published reviews to the public
      // Users querying their own reviews can see all reviews (including flagged ones)
      // BUT: If query explicitly requests flagged reviews (hasFlaggedFilter), allow them through
      if (isQueryingOwnReviews === false && !hasFlaggedFilter) {
        // Filter logic:
        // Show reviews where:
        // - moderation_status is NOT 'Flagged' (or null for old reviews)
        // - AND (is_published is true OR null for backward compatibility)
        //
        // This ensures:
        // - New moderated reviews: only show if approved (is_published = true)
        // - Old reviews (before moderation): show if moderation_status is not 'Flagged'

        // Preserve existing filters (like business filter) by checking if $and already exists
        const existingAndFilters = filters.$and || [];

        // Exclude reviews with moderation_status = 'Sinalizada' (or 'Flagged' for backward compatibility) and only show published reviews
        existingAndFilters.push(
          {
            $or: [
              { moderation_status: { $null: true } },
              {
                $and: [
                  { moderation_status: { $ne: "Sinalizada" } },
                  { moderation_status: { $ne: "Flagged" } }, // Backward compatibility
                ],
              },
            ],
          },
          {
            $or: [
              { is_published: { $eq: true } },
              { is_published: { $null: true } },
            ],
          }
        );

        filters.$and = existingAndFilters;
        query.filters = filters;

        strapi.log.info(
          "Applied filters to exclude flagged and unpublished reviews",
          {
            filters: JSON.stringify(query.filters),
          }
        );
      } else {
        strapi.log.info(
          isQueryingOwnReviews 
            ? "Skipping is_published filter - user viewing own reviews"
            : "Skipping exclusion filters - query explicitly requests flagged reviews"
        );
      }

      // Call the default find method with sanitized query
      const { data, meta } = await super.find(ctx);
      const normalizedData = Array.isArray(data)
        ? data.map((review: any) => normalizeReviewForResponse(review))
        : data;

      // Bulk-attach reactionSummary to all reviews so clients get helpful +
      // similar_experience counts without an extra round-trip per review.
      if (Array.isArray(normalizedData) && normalizedData.length > 0) {
        try {
          const reactionService = strapi.service("api::review-reaction.review-reaction");
          const reviewIds = normalizedData.map((r: any) => r.id).filter(Boolean);
          const summaryMap = await reactionService.getSummariesForReviews(reviewIds, user?.id ?? null);
          for (const review of normalizedData as any[]) {
            review.reactionSummary = summaryMap.get(review.id) ?? {
              counts: { helpful: 0, similar_experience: 0 },
              userSignals: { helpful: false, similar_experience: false },
              total: 0,
            };
          }
        } catch (e) {
          strapi.log.debug("Bulk reaction summary attach failed:", e);
        }
      }

      // Log result for debugging
      strapi.log.info("Review find - Result", {
        resultCount: Array.isArray(normalizedData) ? normalizedData.length : 0,
        isQueryingOwnReviews,
        hasFlaggedFilter,
        isQueryingOwnedBusiness,
      });

      // Log reviewText for debugging corrupted data
      if (normalizedData && Array.isArray(normalizedData)) {
        normalizedData.forEach((review: any) => {
          if (review.reviewText) {
            strapi.log.info("Review find - reviewText:", {
              reviewId: review.id,
              reviewTextType: typeof review.reviewText,
              reviewTextIsArray: Array.isArray(review.reviewText),
              reviewTextValue:
                typeof review.reviewText === "string" &&
                review.reviewText.length > 50
                  ? review.reviewText.substring(0, 50) + "..."
                  : review.reviewText,
            });
          }
        });
      }

      return { data: normalizedData, meta };
    },

    /**
     * Find one review
     * GET /api/reviews/:id
     * Supports both numeric ID and documentId
     */
    async findOne(ctx) {
      const { id } = ctx.params;

      if (!id) {
        return ctx.badRequest("Identificador da avaliação é obrigatório");
      }

      // Manually authenticate so ctx.state.user is set when Bearer token is present (like incrementView)
      let user = ctx.state.user;
      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      try {
        // Try to find by documentId first (string), then fall back to numeric ID
        // In Strapi v5, documentId is a string identifier
        const isNumericId = /^\d+$/.test(String(id));

        // Base populate structure - includes experiencePhotos
        const basePopulate = {
          business: {
            populate: {
              owner: {
                fields: ["id"],
              },
              sector: {
                fields: ["id", "name", "slug"],
              },
              ...getBusinessCategoriesPopulate(strapi),
            },
            fields: ["id", "name", "logoUrl", "address"],
          },
          users_permissions_user: {
            fields: [
              "id",
              "username",
              "email",
              "firstName",
              "lastName",
              "documentId",
              "profileImage",
              "verified",
              "showProvinceOnPublicProfile",
            ],
            populate: {
              province: {
                fields: ["id", "name"],
              },
            },
          },
          helpfulVotedBy: {
            fields: ["id"],
          },
          experiencePhotos: true, // Populate media field
          audioReview: true, // Populate audio media field
        };

        let review;

        // First try documentId (preferred method)
        review = await strapi.db.query("api::review.review").findOne({
          where: { documentId: String(id) },
          populate: basePopulate,
        });

        // If not found and it's numeric, try by numeric ID (backward compatibility)
        if (!review && isNumericId) {
          const numericId = Number.parseInt(String(id), 10);
          review = await strapi.db.query("api::review.review").findOne({
            where: { id: numericId },
            populate: basePopulate,
          });
        }

        if (!review) {
          return ctx.notFound("Avaliação não encontrada");
        }

        // Check if review is flagged and user permissions
        let user = ctx.state.user;
        if (!user) user = await authenticateUserFromToken(ctx, strapi);
        const isOwner = user && review.users_permissions_user?.id === user.id;
        const isBusinessOwner = user && review.business?.owner?.id === user.id;

        // If review is flagged and user is not the owner, return not found or 410 for policy-removed
        // Owners can see their flagged reviews to view the reason and appeal
        if (!review.is_published && !isOwner && !isBusinessOwner) {
          const removedByReport =
            getNormalizedModeration(review).isFlagged &&
            review.reportStatus === "resolved";
          if (removedByReport) {
            ctx.status = 410;
            ctx.body = {
              error: {
                code: "REVIEW_REMOVED_POLICY_VIOLATION",
                message: "This review was removed for violating CliAvalia review policy.",
              },
            };
            return;
          }
          return ctx.notFound("Avaliação não encontrada");
        }

        // Log experiencePhotos for debugging
        strapi.log.info("Review findOne - experiencePhotos:", {
          reviewId: review.id,
          hasExperiencePhotos: !!review.experiencePhotos,
          experiencePhotosType: typeof review.experiencePhotos,
          experiencePhotosValue: review.experiencePhotos,
        });

        // Attach reaction summary only for authenticated users.
        // Guests must not see engagement signals.
        if (user) {
          try {
            const reactionService = strapi.service("api::review-reaction.review-reaction");
            const reactionSummary = await reactionService.getSummaryForReview(
              review.id,
              user.id
            );
            (review as any).reactionSummary = reactionSummary;
          } catch (e) {
            strapi.log.debug("Reaction summary attach failed:", e);
          }
        }

        return { data: normalizeReviewForResponse(review) };
      } catch (error: any) {
        strapi.log.error("Error fetching review:", {
          error: error.message,
          stack: error.stack,
          identifier: id,
        });

        const errorMessage =
          error?.message ||
          error?.error?.message ||
          "Ocorreu um erro ao buscar a avaliação.";

        return ctx.internalServerError(errorMessage);
      }
    },

    /**
     * Update a review
     * PUT /api/reviews/:id
     *
     * Users can only update their own reviews
     */
    async update(ctx) {
      const user = ctx.state.user;
      const { id } = ctx.params;

      if (!user) {
        return ctx.unauthorized(
          "Deves fazer login para atualizar uma avaliação."
        );
      }

      // Find the review with business populated
      const review = await strapi.db.query("api::review.review").findOne({
        where: { id },
        populate: ["users_permissions_user", "business"],
      });

      if (!review) {
        return ctx.notFound("Review not found");
      }

      // Get user role to check if they're a business user
      const userWithRole = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          where: { id: user.id },
          populate: ["role"],
        });

      const isBusinessUser = userWithRole?.role?.type === "business-user";
      const isReviewOwner = review.users_permissions_user?.id === user.id;
      
      // Check if user is updating businessReply (business user replying to review)
      const bodyData = ctx.request.body?.data ?? ctx.request.body ?? {};
      const {
        businessReply,
        businessReplyDate,
        title,
        rating,
        reviewText,
        isRead,
        experienceTags,
        experiencePhotos,
      } = bodyData;
      const isUpdatingBusinessReply = businessReply !== undefined || businessReplyDate !== undefined;
      const isUpdatingReviewContent =
        title !== undefined ||
        rating !== undefined ||
        reviewText !== undefined ||
        experienceTags !== undefined ||
        experiencePhotos !== undefined;
      const isUpdatingIsRead = isRead !== undefined;

      // Business users can update businessReply or isRead for reviews of their business
      if (isBusinessUser && (isUpdatingBusinessReply || isUpdatingIsRead)) {
        // Check if user owns the business
        if (!review.business) {
          return ctx.badRequest("Review business not found.");
        }

        // Handle both number and object business references
        const businessId = typeof review.business === "object" ? review.business.id : review.business;
        
        const business = await strapi.db
          .query("api::business.business")
          .findOne({
            where: { id: businessId },
            select: ["id", "documentId", "subscriptionPlan", "subscriptionStatus", "trialExpiresAt", "subscriptionEndsAt"],
            populate: ["owner"],
          });

        if (!business) {
          return ctx.badRequest("Business not found.");
        }

        // Normalize IDs for comparison (handle string/number differences)
        const businessOwnerId = typeof business.owner?.id === "string" 
          ? Number.parseInt(business.owner.id, 10) 
          : business.owner?.id;
        const userId = typeof user.id === "string" 
          ? Number.parseInt(user.id, 10) 
          : user.id;

        if (businessOwnerId !== userId) {
          return ctx.forbidden("Só podes responder a avaliações da tua empresa.");
        }

        // Business user can only update businessReply or isRead fields
        if (isUpdatingReviewContent) {
          return ctx.forbidden("Não podes atualizar o conteúdo da avaliação.");
        }

        // Subscription gate: only trial/pro/enterprise businesses can add or edit a reply
        if (isUpdatingBusinessReply && businessReply) {
          const plan = business.subscriptionPlan ?? 'free';
          const subStatus = business.subscriptionStatus ?? 'active';
          const now = new Date();
          const trialExp = business.trialExpiresAt ? new Date(business.trialExpiresAt) : null;
          const proExp = business.subscriptionEndsAt ? new Date(business.subscriptionEndsAt) : null;
          const canReply =
            subStatus === 'active' &&
            (
              (plan === 'trial' && trialExp !== null && trialExp > now) ||
              (plan === 'pro' && (proExp === null || proExp > now)) ||
              plan === 'enterprise'
            );
          if (!canReply) {
            return ctx.paymentRequired({
              error: 'SUBSCRIPTION_REQUIRED',
              message: 'Responder a avaliações requer um plano activo (Trial, Pro ou Enterprise).',
              upgradeUrl: '/business/plans',
            });
          }
        }

        // Update only businessReply or isRead fields
        try {
          // Check if this is a new reply (not a deletion)
          const isNewReply = businessReply !== undefined && 
            businessReply !== null && 
            businessReply.trim() !== "" &&
            (!review.businessReply || review.businessReply.trim() === "");

          const updatedReview = await strapi.db
            .query("api::review.review")
            .update({
              where: { id },
              data: {
                ...(businessReply !== undefined && { businessReply: businessReply === null || businessReply === "" ? null : businessReply.trim().replace(/\n{3,}/g, "\n\n") }),
                ...(businessReplyDate !== undefined && { businessReplyDate }),
                ...(isRead !== undefined && { isRead }),
              },
              populate: {
                business: {
                  fields: ["id", "name", "logoUrl"],
                },
                users_permissions_user: {
                  fields: ["id", "username", "email", "firstName", "lastName", "emailLocale"],
                },
              },
            });

          // Send email notification to reviewer if this is a new reply
          if (isNewReply && updatedReview) {
            try {
              const reviewer = updatedReview.users_permissions_user;
              const business = updatedReview.business;
              
              if (reviewer?.email && business) {
                const reviewerName = reviewer.firstName && reviewer.lastName
                  ? `${reviewer.firstName} ${reviewer.lastName}`
                  : reviewer.username || reviewer.email.split("@")[0];
                
                const businessName = typeof business === "object" ? business.name : "";
                const reviewTitle = updatedReview.title || "Sem título";
                const replyText = businessReply.trim();
                const reviewDocumentId = updatedReview.documentId || String(id);

                // Get the review service and send email
                const reviewService = strapi.service("api::review.review");
                if (reviewService && reviewService.sendBusinessReplyEmail) {
                  await reviewService.sendBusinessReplyEmail(
                    reviewer.email,
                    reviewerName,
                    businessName,
                    reviewTitle,
                    replyText,
                    reviewDocumentId,
                    (reviewer as { emailLocale?: string }).emailLocale,
                  );
                }
              }
            } catch (emailError: any) {
              // Log error but don't fail the request
              strapi.log.error("Error sending business reply email notification:", emailError);
            }
          }

          return { data: updatedReview };
        } catch (error) {
          strapi.log.error("Error updating business reply:", error);
          return ctx.internalServerError(
            "Ocorreu um erro ao atualizar a resposta."
          );
        }
      }

      // Regular users can only update their own reviews
      // BUT: Business users updating isRead should be handled above, so if we reach here
      // and it's a business user trying to update isRead, something went wrong
      if (!isReviewOwner) {
        // If business user is trying to update isRead but didn't match the condition above,
        // check business ownership here as a fallback
        if (isBusinessUser && isUpdatingIsRead && review.business) {
          const businessId = typeof review.business === "object" ? review.business.id : review.business;
          const business = await strapi.db
            .query("api::business.business")
            .findOne({
              where: { id: businessId },
              populate: ["owner"],
            });

          if (business && business.owner) {
            const businessOwnerId = typeof business.owner.id === "string" 
              ? Number.parseInt(business.owner.id, 10) 
              : business.owner.id;
            const userId = typeof user.id === "string" 
              ? Number.parseInt(user.id, 10) 
              : user.id;

            if (businessOwnerId === userId) {
              // Business user owns the business, allow isRead update
              try {
                const updatedReview = await strapi.db
                  .query("api::review.review")
                  .update({
                    where: { id },
                    data: { isRead },
                    populate: {
                      business: {
                        fields: ["id", "name", "logoUrl"],
                      },
                      users_permissions_user: {
                        fields: ["id", "username"],
                      },
                    },
                  });
                return { data: updatedReview };
              } catch (error) {
                strapi.log.error("Error updating isRead:", error);
                return ctx.internalServerError("Ocorreu um erro ao atualizar a avaliação.");
              }
            }
          }
        }
        
        return ctx.forbidden("Só podes atualizar as tuas próprias avaliações.");
      }

      // Business users cannot update review content
      if (isBusinessUser && isUpdatingReviewContent) {
        return ctx.forbidden("Não podes atualizar o conteúdo da avaliação.");
      }

      // Validate rating if provided
      if (rating && (rating < 1 || rating > 5)) {
        return ctx.badRequest("A classificação deve estar entre 1 e 5.");
      }

      // Log reviewText for debugging
      strapi.log.info("Review update - reviewText received:", {
        reviewId: id,
        reviewTextType: typeof reviewText,
        reviewTextValue: reviewText,
        isString: typeof reviewText === "string",
        isObject: typeof reviewText === "object" && reviewText !== null,
        isArray: Array.isArray(reviewText),
      });

      // Validate and prepare reviewText - schema is "text" type, so save as plain string
      let validatedReviewText = reviewText;

      // If reviewText is an object or array, reject it (should be string for text field)
      if (reviewText && typeof reviewText === "object") {
        strapi.log.error(
          "Review update - reviewText is an object/array (invalid for text field):",
          {
            reviewId: id,
            reviewTextType: typeof reviewText,
            isArray: Array.isArray(reviewText),
            reviewText: reviewText,
          }
        );
        return ctx.badRequest(
          "O texto da avaliação deve ser uma string, não um objeto ou array."
        );
      }

      if (reviewText && typeof reviewText === "string") {
        const trimmedText = reviewText.trim();
        if (trimmedText.length === 0) {
          return ctx.badRequest("O texto da avaliação é obrigatório.");
        }
        // Save as plain string (schema is "text" type, not "json" or "blocks")
        validatedReviewText = trimmedText;
      } else if (!reviewText) {
        return ctx.badRequest("Review text is required.");
      }

      // Validate experiencePhotos if provided (same as create: array of media IDs)
      const photosValidation = validateExperiencePhotos(experiencePhotos);
      if (!photosValidation.valid) {
        return ctx.badRequest(photosValidation.error);
      }

      // Validate experienceTags if provided (array of strings)
      if (
        experienceTags !== undefined &&
        experienceTags !== null &&
        !Array.isArray(experienceTags)
      ) {
        return ctx.badRequest(
          "As etiquetas da experiência devem ser um array de strings."
        );
      }

      try {
        // Build update data: title, rating, reviewText, experienceTags, experiencePhotos
        const updateData: Record<string, unknown> = {
          ...(title && { title }),
          ...(rating && { rating }),
          ...(reviewText && { reviewText: validatedReviewText }),
        };
        if (experienceTags !== undefined) {
          updateData.experienceTags = experienceTags;
        }
        if (
          experiencePhotos &&
          Array.isArray(experiencePhotos) &&
          experiencePhotos.length > 0
        ) {
          updateData.experiencePhotos = experiencePhotos;
        } else if (experiencePhotos !== undefined && Array.isArray(experiencePhotos) && experiencePhotos.length === 0) {
          updateData.experiencePhotos = [];
        }

        const updatedReview = await strapi.db
          .query("api::review.review")
          .update({
            where: { id },
            data: updateData,
            populate: {
              business: {
                fields: ["id", "name", "logoUrl"],
              },
              users_permissions_user: {
                fields: ["id", "username", "firstName", "lastName"],
              },
            },
          });

        // Send email to business owner when a user updates their review
        try {
          const businessId =
            typeof updatedReview.business === "object"
              ? updatedReview.business.id
              : updatedReview.business;
          const business = await strapi.db
            .query("api::business.business")
            .findOne({
              where: { id: businessId },
              populate: { owner: { fields: ["id", "email", "emailLocale"] } },
            });

          if (business?.owner?.email) {
            const reviewer = updatedReview.users_permissions_user;
            const reviewerName =
              reviewer &&
              (reviewer as any).firstName &&
              (reviewer as any).lastName
                ? `${(reviewer as any).firstName} ${(reviewer as any).lastName}`.trim()
                : reviewer && (reviewer as any).username
                  ? (reviewer as any).username
                  : null;
            const reviewService = strapi.service("api::review.review");
            const reviewId = updatedReview.documentId ?? updatedReview.id ?? id;
            if (reviewService && typeof reviewService.sendReviewUpdatedEmailToBusiness === "function") {
              await reviewService.sendReviewUpdatedEmailToBusiness(
                business.owner.email,
                business.name || "O seu negócio",
                updatedReview.title || "Sem título",
                updatedReview.reviewText || "",
                updatedReview.rating ?? 0,
                reviewerName,
                reviewId,
                (business.owner as { emailLocale?: string }).emailLocale,
              );
            }
          }
        } catch (emailError: any) {
          strapi.log.error("Error sending review updated email to business:", emailError);
          // Don't fail the request if email fails
        }

        return { data: updatedReview };
      } catch (error) {
        strapi.log.error("Error updating review:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao atualizar a avaliação."
        );
      }
    },

    /**
     * Delete a review
     * DELETE /api/reviews/:id
     *
     * Users can only delete their own reviews
     */
    async delete(ctx) {
      const user = ctx.state.user;
      const { id } = ctx.params;

      if (!user) {
        return ctx.unauthorized(
          "Deves fazer login para eliminar uma avaliação."
        );
      }

      // Find the review
      const review = await strapi.db.query("api::review.review").findOne({
        where: { id },
        populate: ["users_permissions_user"],
      });

      if (!review) {
        return ctx.notFound("Review not found");
      }

      // Check if user owns this review
      if (review.users_permissions_user?.id !== user.id) {
        return ctx.forbidden("Só podes eliminar as tuas próprias avaliações.");
      }

      try {
        // Delete the review
        await strapi.db.query("api::review.review").delete({
          where: { id },
        });

        return { data: { id } };
      } catch (error) {
        strapi.log.error("Error deleting review:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao eliminar a avaliação."
        );
      }
    },

    /**
     * Get current user's reviews
     * GET /api/reviews/me
     *
     * Returns all reviews by the authenticated user with formatted data
     */
    async me(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized(
          "Deves fazer login para ver as tuas avaliações."
        );
      }

      try {
        // Fetch user's reviews with populated relations
        const reviews = await strapi.db.query("api::review.review").findMany({
          where: {
            users_permissions_user: user.id,
          },
          populate: {
            business: {
              populate: {
                sector: {
                  fields: ["id", "name"],
                },
                ...getBusinessCategoriesPopulate(strapi),
              },
            },
            users_permissions_user: {
              fields: ["id", "username", "email"],
            },
          },
          orderBy: { createdAt: "DESC" },
        });

        // Format reviews for frontend
        const reviewIds = reviews.map((r: any) => r.id).filter(Boolean);
        const reactionService = strapi.service("api::review-reaction.review-reaction");
        let summaryMap: Map<number, any> = new Map();
        try {
          summaryMap = await reactionService.getSummariesForReviews(reviewIds, user.id);
        } catch (e) {
          strapi.log.debug("me() reaction summary fetch failed:", e);
        }

        const formattedReviews = reviews.map((review) => {
          // Convert Strapi blocks to plain text
          let content = "";
          if (review.reviewText && Array.isArray(review.reviewText)) {
            content = extractTextFromBlocks(review.reviewText);
          }

          const normalizedReview = normalizeReviewForResponse(review as any);
          const reactionSummary = summaryMap.get(review.id) ?? {
            counts: { helpful: 0, similar_experience: 0 },
            userSignals: { helpful: false, similar_experience: false },
            total: 0,
          };

          return {
            id: review.id,
            documentId: review.documentId,
            title: review.title,
            content: content || "Sem conteúdo",
            rating: review.rating,
            company: review.business?.name || "Empresa não especificada",
            companyId: review.business?.id,
            industry:
              review.business?.sector?.name ||
              (Array.isArray(review.business?.categories) &&
              review.business.categories.length > 0
                ? review.business.categories
                    .map((c: { name?: string }) => c?.name)
                    .filter(Boolean)
                    .join(", ")
                : review.business?.category?.name) ||
              "Indústria não especificada",
            createdAt: review.createdAt,
            updatedAt: review.updatedAt,
            views: review.views || 0,
            helpfulVotes: reactionSummary.counts.helpful,
            reactionSummary,
            moderation_status: review.moderation_status,
            moderation_reason: review.moderation_reason,
            is_published: review.is_published,
            normalized_moderation_status:
              normalizedReview.normalized_moderation_status,
            moderation_state: normalizedReview.moderation_state,
            moderation_visibility: normalizedReview.moderation_visibility,
            is_flagged: normalizedReview.is_flagged,
            is_moderated: normalizedReview.is_moderated,
          };
        });

        // Calculate statistics from reaction service data
        const statistics = {
          totalReviews: formattedReviews.length,
          totalViews: formattedReviews.reduce((sum, r) => sum + r.views, 0),
          totalHelpful: formattedReviews.reduce(
            (sum, r) => sum + r.helpfulVotes,
            0
          ),
        };

        return {
          data: formattedReviews,
          meta: {
            statistics,
          },
        };
      } catch (error) {
        strapi.log.error("Error fetching user reviews:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao buscar as tuas avaliações."
        );
      }
    },

    /**
     * Increment view count for a review
     * POST /api/reviews/:id/view
     *
     * For authenticated users: Uses 24-hour unique view throttle via ReviewViewLog
     * For anonymous users: Increments view count directly (no throttle)
     */
    async incrementView(ctx) {
      const { id } = ctx.params;
      const reviewId = Number.parseInt(id, 10);

      if (Number.isNaN(reviewId)) {
        return ctx.badRequest("ID de avaliação inválido");
      }

      // Since auth: false, we need to manually authenticate
      let user = ctx.state.user;

      if (!user) {
        // Extract JWT token from Authorization header
        const authHeader =
          ctx.request.header?.authorization ||
          ctx.request.headers?.authorization;

        if (
          authHeader &&
          typeof authHeader === "string" &&
          authHeader.startsWith("Bearer ")
        ) {
          try {
            const token = authHeader.replace("Bearer ", "").trim();

            // Verify token using Strapi's JWT service
            const jwtService = strapi
              .plugin("users-permissions")
              .service("jwt");
            const payload = await jwtService.verify(token);
            const userId = payload.id || payload.user?.id || payload;

            user = await strapi.db
              .query("plugin::users-permissions.user")
              .findOne({
                where: { id: userId },
                populate: ["role"],
              });

            if (user) {
              ctx.state.user = user;
            }
          } catch (error: unknown) {
            // Token invalid or expired - user remains null (anonymous)
            strapi.log.debug("Token validation failed:", error);
          }
        }
      }

      try {
        // Verify review exists
        const review = await strapi.db.query("api::review.review").findOne({
          where: { id: reviewId },
          select: ["id", "views"],
        });

        if (!review) {
          return ctx.notFound("Avaliação não encontrada");
        }

        // TEMP SAFE MODE: always perform a simple increment to avoid 500s if the throttle log table is missing
        // When review-view-log is available, re-enable incrementUniqueViews in a try/catch above this block.
        const currentViews = review.views || 0;
        const updatedReview = await strapi.db
          .query("api::review.review")
          .update({
            where: { id: reviewId },
            data: {
              views: currentViews + 1,
            },
            select: ["views"],
          });

        return {
          data: {
            views: updatedReview?.views ?? currentViews + 1,
          },
        };
      } catch (error: any) {
        strapi.log.error("Error incrementing view:", {
          reviewId,
          userId: user?.id,
          error: error.message,
          stack: error.stack,
        });
        return ctx.internalServerError(
          "Ocorreu um erro ao atualizar a contagem de visualizações."
        );
      }
    },

    /**
     * Increment share count for a review
     * POST /api/reviews/:id/share
     *
     * Public endpoint - no dedup needed since shares are intentional user actions.
     */
    async incrementShare(ctx) {
      const { id } = ctx.params;
      const reviewId = Number.parseInt(id, 10);

      if (Number.isNaN(reviewId)) {
        return ctx.badRequest("ID de avaliação inválido");
      }

      try {
        const review = await strapi.db.query("api::review.review").findOne({
          where: { id: reviewId },
          select: ["id", "shareCount"],
        });

        if (!review) {
          return ctx.notFound("Avaliação não encontrada");
        }

        const currentCount = review.shareCount || 0;
        const updatedReview = await strapi.db
          .query("api::review.review")
          .update({
            where: { id: reviewId },
            data: {
              shareCount: currentCount + 1,
            },
            select: ["shareCount"],
          });

        return {
          data: {
            shareCount: updatedReview?.shareCount ?? currentCount + 1,
          },
        };
      } catch (error: any) {
        strapi.log.error("Error incrementing share count:", {
          reviewId,
          error: error.message,
        });
        return ctx.internalServerError(
          "Ocorreu um erro ao atualizar a contagem de partilhas."
        );
      }
    },

    /**
     * Toggle helpful vote for a review
     * POST /api/reviews/:id/helpful
     */
    async toggleHelpful(ctx) {
      // Since auth: false, we need to manually authenticate
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized("Deves fazer login para votar.");
      }

      const { id } = ctx.params;

      try {
        const review = await strapi.db.query("api::review.review").findOne({
          where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { documentId: String(id) },
          select: ["id"],
        });

        if (!review) {
          return ctx.notFound("Avaliação não encontrada");
        }

        const reactionService = strapi.service("api::review-reaction.review-reaction");
        const summary = await reactionService.toggleSignal(review.id, user.id, "helpful");

        return {
          data: {
            helpfulVotes: summary.counts.helpful,
            voted: summary.userSignals.helpful,
          },
        };
      } catch (error) {
        strapi.log.error("Error toggling helpful vote:", error);
        return ctx.internalServerError("Ocorreu um erro ao votar.");
      }
    },

    /**
     * Get reaction summary for a review
     * GET /api/reviews/:id/reactions
     * Auth required.
     */
    async getReactions(ctx) {
      const { id } = ctx.params;
      let user = ctx.state.user;
      if (!user) user = await authenticateUserFromToken(ctx, strapi);
      if (!user) return ctx.unauthorized("Deves fazer login para ver sinais de engagement.");

      const review = await strapi.db.query("api::review.review").findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { documentId: String(id) },
        select: ["id"],
      });
      if (!review) return ctx.notFound("Avaliação não encontrada");

      const reactionService = strapi.service("api::review-reaction.review-reaction");
      const summary = await reactionService.getSummaryForReview(review.id, user.id);
      return { data: summary };
    },

    /**
     * Toggle an engagement signal on a review (dual independent signals per user)
     * POST /api/reviews/:id/reaction
     * Body: { data: { signalType: "helpful" | "similar_experience" } }
     * Each signal type is toggled independently.
     */
    async setReaction(ctx) {
      let user = ctx.state.user;
      if (!user) user = await authenticateUserFromToken(ctx, strapi);
      if (!user) return ctx.unauthorized("Deves fazer login para reagir.");

      const { id } = ctx.params;
      const body = ctx.request.body?.data ?? ctx.request.body ?? {};
      // Accept both signalType (new) and emojiType (legacy) for compatibility
      const signalType = body.signalType ?? body.emojiType;
      const valid = ["helpful", "similar_experience"];
      if (!signalType || !valid.includes(signalType)) {
        return ctx.badRequest("signalType obrigatório: um de helpful, similar_experience.");
      }

      const review = await strapi.db.query("api::review.review").findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { documentId: String(id) },
        select: ["id"],
      });
      if (!review) return ctx.notFound("Avaliação não encontrada");

      const reactionService = strapi.service("api::review-reaction.review-reaction");
      const summary = await reactionService.toggleSignal(review.id, user.id, signalType);
      return { data: summary };
    },

    /**
     * Get list of users who reacted to a review
     * GET /api/reviews/:id/reactors
     */
    async getReactors(ctx) {
      let user = ctx.state.user;
      if (!user) user = await authenticateUserFromToken(ctx, strapi);
      if (!user) return ctx.unauthorized("Deves fazer login para ver quem reagiu.");

      const { id } = ctx.params;
      
      const review = await strapi.db.query("api::review.review").findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { documentId: String(id) },
        select: ["id"],
      });
      if (!review) return ctx.notFound("Avaliação não encontrada");

      const reactionService = strapi.service("api::review-reaction.review-reaction");
      const reactors = await reactionService.getReactorsByType(review.id);
      return { data: reactors };
    },

    /**
     * Get current user's reaction stats (for gamification / user level)
     * GET /api/reviews/reaction-stats/me
     */
    async getReactionStatsMe(ctx) {
      let user = ctx.state.user;
      if (!user) user = await authenticateUserFromToken(ctx, strapi);
      if (!user) return ctx.unauthorized("Deves fazer login para ver as tuas estatísticas.");

      const reactionService = strapi.service("api::review-reaction.review-reaction");
      const reactionsGiven = await reactionService.getReactionsGivenCount(user.id);

      // Count published reviews for user-level gamification (exclude flagged reviews)
      const reviewCount = await strapi.db.query("api::review.review").count({
        where: {
          users_permissions_user: { id: user.id },
          publishedAt: { $notNull: true },
          $and: [
            { moderation_status: { $ne: "Sinalizada" } },
            { moderation_status: { $ne: "Flagged" } },
          ],
        },
      });

      // Fetch stored reviewer_level relation (authoritative backend level)
      const userWithLevel = await strapi.db.query("plugin::users-permissions.user").findOne({
        where: { id: user.id },
        populate: { reviewer_level: true },
      }) as any;

      const reactionsReceived = await reactionService.getReactionsReceivedForUser(user.id);
      return { data: { reactionsGiven, reviewCount: reviewCount ?? 0, reactionsReceived, reviewerLevel: userWithLevel?.reviewer_level ?? null } };
    },

    /**
     * Get public user stats (published review count) for any user
     * GET /api/reviews/stats/:userId
     */
    async getPublicUserStats(ctx) {
      const { userId } = ctx.params;
      if (!userId) {
        return ctx.badRequest("userId is required.");
      }

      // Support both numeric IDs and Strapi v5 documentId strings
      const numericId = Number(userId);
      const isNumeric = !Number.isNaN(numericId) && String(numericId) === String(userId).trim();

      let resolvedNumericId: number;

      if (isNumeric) {
        resolvedNumericId = numericId;
      } else {
        // Look up the user by documentId
        const user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { documentId: userId },
          select: ["id"],
        }) as any;
        if (!user) {
          return ctx.badRequest("User not found.");
        }
        resolvedNumericId = user.id;
      }

      const reviewCount = await strapi.db.query("api::review.review").count({
        where: {
          users_permissions_user: { id: resolvedNumericId },
          publishedAt: { $notNull: true },
          $and: [
            { moderation_status: { $ne: "Sinalizada" } },
            { moderation_status: { $ne: "Flagged" } },
          ],
        },
      });

      // Fetch stored reviewer_level relation (authoritative backend level)
      const userWithLevel = await strapi.db.query("plugin::users-permissions.user").findOne({
        where: { id: resolvedNumericId },
        populate: { reviewer_level: true },
      }) as any;

      return { data: { reviewCount: reviewCount ?? 0, reviewerLevel: userWithLevel?.reviewer_level ?? null } };
    },

    /**
     * Submit an appeal for a flagged review
     * POST /api/reviews/:id/appeal
     *
     * Requirements:
     * - User must be authenticated
     * - User must be the owner of the review
     * - Review must be flagged
     */
    async appeal(ctx) {
      // Since auth: false, we need to manually authenticate
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized("Deves fazer login para submeter um recurso.");
      }

      const { id } = ctx.params;
      // Support both 'message' and 'appealMessage' for compatibility
      const { message, appealMessage, evidenceUrl } = ctx.request.body.data || {};
      const appealMessageText = message || appealMessage;

      if (!id) {
        return ctx.badRequest("ID da avaliação é obrigatório.");
      }

      if (
        !appealMessageText ||
        typeof appealMessageText !== "string" ||
        appealMessageText.trim().length === 0
      ) {
        return ctx.badRequest("Mensagem do recurso é obrigatória.");
      }

      try {
        // Find the review
        const review = await strapi.db.query("api::review.review").findOne({
          where: { id: Number.parseInt(id, 10) },
          populate: {
            users_permissions_user: {
              fields: ["id"],
            },
          },
        });

        if (!review) {
          return ctx.notFound("Avaliação não encontrada.");
        }

        // Check if user is the owner
        if (review.users_permissions_user?.id !== user.id) {
          return ctx.forbidden(
            "Só podes recorrer das tuas próprias avaliações."
          );
        }

        // Check if review is flagged (check both Portuguese and English for backward compatibility)
        const isFlagged =
          review.moderation_status === "Sinalizada" ||
          review.moderation_status === "Flagged";
        const isPublished = review.is_published === true;
        if (isFlagged === false && isPublished) {
          return ctx.badRequest(
            "Esta avaliação não está sinalizada e não requer recurso."
          );
        }

        // Check if appeal already submitted
        if (review.appeal_submitted) {
          return ctx.badRequest(
            "An appeal has already been submitted for this review."
          );
        }

        // Update review with appeal
        const updatedReview = await strapi.db
          .query("api::review.review")
          .update({
            where: { id: review.id },
            data: {
              appeal_submitted: true,
              appeal_message: appealMessageText.trim(),
              appeal_evidence_url: evidenceUrl ?? null,
              appeal_status: "Pending",
            },
          });

        strapi.log.info(
          `Appeal submitted for review ${review.id} by user ${user.id}`
        );

        // Send email notification to moderation team
        try {
          await strapi.plugins.email.services.email.send({
            to: "notificacoes@cliavalia.com",
            subject: `Recurso de avaliação submetido - Avaliação #${review.id}`,
            text: `Foi submetido um recurso de avaliação.\n\nID da avaliação: ${review.id}\nTítulo da avaliação: ${review.title || "N/A"}\nUtilizador: ${user.email || user.username || "N/A"}\nID do utilizador: ${user.id}\nMensagem do recurso: ${appealMessageText.trim()}`,
            html: `
            <h2>Recurso de avaliação submetido</h2>
            <p>Foi submetido um recurso de avaliação e requer análise.</p>
            <ul>
              <li><strong>ID da avaliação:</strong> ${review.id}</li>
              <li><strong>Título da avaliação:</strong> ${review.title || "N/A"}</li>
            <li><strong>Utilizador:</strong> ${user.email || user.username || "N/A"}</li>
            <li><strong>ID do utilizador:</strong> ${user.id}</li>
          </ul>
          <h3>Mensagem do recurso:</h3>
          <p>${appealMessageText.trim().replace(/\n/g, "<br>")}</p>
          `,
          });
          strapi.log.info(
            `Appeal notification email sent for review ${review.id}`
          );
        } catch (emailError: unknown) {
          // Log email error but don't fail the appeal submission
          let errorMessage: string;
          if (emailError instanceof Error) {
            errorMessage = emailError.message;
          } else if (
            emailError &&
            typeof emailError === "object" &&
            "message" in emailError &&
            typeof (emailError as { message: unknown }).message === "string"
          ) {
            errorMessage = (emailError as { message: string }).message;
          } else if (emailError && typeof emailError === "object") {
            try {
              errorMessage = JSON.stringify(emailError);
            } catch {
              errorMessage = "Unknown error object";
            }
          } else {
            errorMessage = String(emailError);
          }
          strapi.log.error(
            "Error sending appeal notification email:",
            errorMessage
          );
        }

        return ctx.created({
          data: {
            id: updatedReview.id,
            appeal_submitted: true,
            appeal_status: "Pending",
            message:
              "Your appeal has been submitted and will be reviewed by our moderation team.",
          },
        });
      } catch (error: any) {
        strapi.log.error("Error submitting appeal:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao submeter o recurso."
        );
      }
    },

    /**
     * Get all appeals submitted by the authenticated user
     * GET /api/reviews/appeals
     */
    async getUserAppeals(ctx) {
      // Since auth: false, we need to manually authenticate
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized("Deves fazer login para ver os teus recursos.");
      }

      try {
        const reviews = await strapi.db.query("api::review.review").findMany({
          where: {
            users_permissions_user: user.id,
            appeal_submitted: true,
          },
          populate: {
            business: {
              fields: ["id", "name", "slug"],
            },
          },
          orderBy: { createdAt: "desc" },
        });

        ctx.body = {
          data: reviews.map((review) => {
            const normalizedReview = normalizeReviewForResponse(review as any);

            return {
              id: review.id,
              documentId: review.documentId,
              title: review.title,
              appeal_message: review.appeal_message,
              appeal_status: review.appeal_status,
              appeal_reason: review.appeal_reason,
              appeal_reviewed_at: review.appeal_reviewed_at,
              moderation_status: review.moderation_status,
              is_published: review.is_published,
              createdAt: review.createdAt,
              business: review.business,
              normalized_moderation_status:
                normalizedReview.normalized_moderation_status,
              moderation_state: normalizedReview.moderation_state,
              moderation_visibility: normalizedReview.moderation_visibility,
              is_flagged: normalizedReview.is_flagged,
              is_moderated: normalizedReview.is_moderated,
            };
          }),
        };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching user appeals:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao carregar os teus recursos."
        );
      }
    },

    /**
     * Get a specific appeal by review ID
     * GET /api/reviews/appeals/:id
     */
    async getAppeal(ctx) {
      // Since auth: false, we need to manually authenticate
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized("Deves fazer login para ver este recurso.");
      }

      const { id } = ctx.params;

      if (!id) {
        return ctx.badRequest("ID da avaliação é obrigatório.");
      }

      try {
        const review = await strapi.db.query("api::review.review").findOne({
          where: {
            id: Number.parseInt(id, 10),
            users_permissions_user: user.id,
            appeal_submitted: true,
          },
          populate: {
            business: {
              fields: ["id", "name", "slug"],
            },
          },
        });

        if (!review) {
          return ctx.notFound("Recurso não encontrado.");
        }

        const normalizedReview = normalizeReviewForResponse(review as any);

        ctx.body = {
          data: {
            id: review.id,
            documentId: review.documentId,
            title: review.title,
            reviewText: review.reviewText,
            rating: review.rating,
            appeal_message: review.appeal_message,
            appeal_status: review.appeal_status,
            appeal_reason: review.appeal_reason,
            appeal_reviewed_at: review.appeal_reviewed_at,
            moderation_status: review.moderation_status,
            is_published: review.is_published,
            createdAt: review.createdAt,
            business: review.business,
            normalized_moderation_status:
              normalizedReview.normalized_moderation_status,
            moderation_state: normalizedReview.moderation_state,
            moderation_visibility: normalizedReview.moderation_visibility,
            is_flagged: normalizedReview.is_flagged,
            is_moderated: normalizedReview.is_moderated,
          },
        };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching appeal:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao carregar o recurso."
        );
      }
    },

    /**
     * Get flagged reviews for the authenticated business owner.
     * GET /api/reviews/business/flagged
     */
    async getBusinessFlaggedReviews(ctx) {
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized(
          "Deves fazer login para ver avaliações sinalizadas do teu negócio."
        );
      }

      try {
        const reviewService = strapi.service("api::review.review") as any;
        const business = await reviewService.getOwnedBusinessByUser(user.id);

        if (!business) {
          return ctx.notFound("Negócio não encontrado para este utilizador.");
        }

        const reviews = await reviewService.getFlaggedReviewsForBusinessOwner(
          user.id
        );
        const normalizedReviews = reviews.map((review: any) =>
          normalizeReviewForResponse(review)
        );

        ctx.body = {
          data: normalizedReviews,
          meta: {
            business: {
              id: business.id,
              name: business.name,
              slug: business.slug,
            },
            total: normalizedReviews.length,
            unreadCount: normalizedReviews.filter(
              (review: any) => review.isRead === false || review.isRead === undefined
            ).length,
          },
        };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching business flagged reviews:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao carregar as avaliações sinalizadas do negócio."
        );
      }
    },

    /**
     * Reviews for the authenticated business that have open consumer review-reports
     * (pending / analysing). Complements GET /api/reviews filters because reportReview()
     * does not set review.reportStatus.
     * GET /api/reviews/business/pending-consumer-reports
     */
    async getBusinessPendingConsumerReportedReviews(ctx) {
      let user = ctx.state.user;

      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }

      if (!user) {
        return ctx.unauthorized(
          "Deves fazer login para ver avaliações com reportes pendentes."
        );
      }

      try {
        const reviewService = strapi.service("api::review.review") as any;
        const business = await reviewService.getOwnedBusinessByUser(user.id);

        if (!business) {
          return ctx.notFound("Negócio não encontrado para este utilizador.");
        }

        const reviews = await reviewService.getReviewsWithPendingConsumerReportsForBusiness(
          business.id,
        );
        const normalizedReviews = reviews.map((review: any) => {
          const normalized = normalizeReviewForResponse(review);
          return {
            ...normalized,
            hasPendingConsumerReport: true,
            consumerReportReason: review.consumerReportReason,
            consumerReportSubReason: review.consumerReportSubReason,
            consumerReportedAt: review.consumerReportedAt,
            consumerReportCount: review.consumerReportCount,
          };
        });

        ctx.body = {
          data: normalizedReviews,
          meta: {
            business: {
              id: business.id,
              name: business.name,
              slug: business.slug,
            },
            total: normalizedReviews.length,
          },
        };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching pending consumer-reported reviews:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao carregar avaliações com reportes de utilizadores."
        );
      }
    },

    /**
     * Submit a report for a review (consumer report)
     * POST /api/reviews/:id/report
     */
    async reportReview(ctx) {
      let user = ctx.state.user;
      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }
      if (!user) {
        return ctx.unauthorized("Deves fazer login para reportar uma avaliação.");
      }

      const { id } = ctx.params;
      const body = ctx.request.body?.data || ctx.request.body || {};
      const {
        reason,
        subReason,
        highlightedText,
        confirmedNotFromCompany,
        confirmedInfoTrue,
        evidence,
      } = body;

      if (!id) {
        return ctx.badRequest("ID da avaliação é obrigatório.");
      }
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return ctx.badRequest("Motivo do report é obrigatório.");
      }
      if (confirmedNotFromCompany !== true || confirmedInfoTrue !== true) {
        return ctx.badRequest("Confirmações obrigatórias não foram aceites.");
      }

      const reviewId = Number.parseInt(String(id), 10);
      if (Number.isNaN(reviewId)) {
        return ctx.badRequest("ID da avaliação inválido.");
      }

      try {
        const review = await strapi.db.query("api::review.review").findOne({
          where: { id: reviewId },
          populate: {
            business: {
              fields: ["id", "name"],
              populate: { owner: { fields: ["id", "email", "firstName"] } },
            },
            users_permissions_user: { fields: ["id", "email", "firstName"] },
          },
        });
        if (!review) {
          return ctx.notFound("Avaliação não encontrada.");
        }

        const existingReport = await strapi.db
          .query("api::review-report.review-report")
          .findOne({
            where: {
              review: review.id,
              reporter: user.id,
            },
            select: ["id"],
          });

        if (existingReport) {
          return ctx.badRequest(
            "Já submeteste um reporte para esta avaliação.",
          );
        }

        const reportData: any = {
          review: review.id,
          reporter: user.id,
          reason: reason.trim(),
          status: "pending",
        };
        if (subReason && typeof subReason === "string" && subReason.trim()) {
          reportData.subReason = subReason.trim();
        }
        if (
          highlightedText &&
          typeof highlightedText === "string" &&
          highlightedText.trim()
        ) {
          reportData.highlightedText = highlightedText.trim();
        }

        if (Array.isArray(evidence) && evidence.length > 0) {
          const evidenceIds = evidence
            .map((id: unknown) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0);
          if (evidenceIds.length > 0) {
            reportData.evidence = evidenceIds;
          }
        }

        const report = await strapi.db
          .query("api::review-report.review-report")
          .create({ data: reportData });

        // Set reportStatus on the review so business and review author see it in their bells
        try {
          await strapi.db.query("api::review.review").update({
            where: { id: review.id },
            data: { reportStatus: "pending" },
          });
        } catch (updateErr: unknown) {
          strapi.log.error("Error setting review reportStatus:", updateErr instanceof Error ? updateErr.message : String(updateErr));
        }

        const frontendUrl = process.env.FRONTEND_URL || "";
        const businessName = (review.business as any)?.name || "N/A";
        const reviewTitle = review.title || "N/A";

        // Email to admin
        const adminEmail = "notificacoes@cliavalia.com";
        try {
          await strapi.plugins.email.services.email.send({
            to: adminEmail,
            subject: `Reporte de avaliação submetido - Avaliação #${review.id}`,
            text: `Foi submetido um reporte de uma avaliação.\n\nID da avaliação: ${review.id}\nTítulo: ${reviewTitle}\nEmpresa: ${businessName}\nReportante: ${user.email || user.username || "N/A"}\nMotivo: ${reason}\n${subReason ? `Sub-motivo: ${subReason}\n` : ""}${highlightedText ? `Texto destacado: ${highlightedText}\n` : ""}`,
            html: `
            <h2>Reporte de avaliação submetido</h2>
            <p>Um utilizador reportou uma avaliação e requer análise.</p>
            <ul>
              <li><strong>ID da avaliação:</strong> ${review.id}</li>
              <li><strong>Título:</strong> ${reviewTitle}</li>
              <li><strong>Empresa:</strong> ${businessName}</li>
              <li><strong>Reportante:</strong> ${user.email || user.username || "N/A"}</li>
              <li><strong>Motivo:</strong> ${reason}</li>
              ${subReason ? `<li><strong>Sub-motivo:</strong> ${subReason}</li>` : ""}
              ${highlightedText ? `<li><strong>Texto destacado:</strong> ${String(highlightedText).replace(/\n/g, "<br>")}</li>` : ""}
            </ul>
            <p><a href="${frontendUrl}/admin/review-reports">Ver reports no admin</a></p>
            `,
          });
          strapi.log.info(`Report notification email sent for review ${review.id}`);
        } catch (emailErr: unknown) {
          const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          strapi.log.error("Error sending report notification email:", msg);
        }

        // Email to business owner
        const businessOwner = (review.business as any)?.owner;
        const businessOwnerEmail = businessOwner?.email;
        if (businessOwnerEmail) {
          try {
            const flaggedUrl = `${frontendUrl}/business/dashboard/reviews/flagged`;
            await strapi.plugins.email.services.email.send({
              to: businessOwnerEmail,
              subject: `Uma avaliação foi reportada - ${businessName}`,
              text: `Uma avaliação sobre ${businessName} foi reportada por um utilizador e está a ser analisada pela equipa CliAvalia.\n\nA avaliação continuará visível durante o processo de análise.\n\nVer avaliações reportadas: ${flaggedUrl}`,
              html: `
              <h2>Avaliação reportada</h2>
              <p>Uma avaliação sobre <strong>${businessName}</strong> foi reportada por um utilizador e está a ser analisada pela equipa CliAvalia.</p>
              <p>A avaliação continuará visível durante o processo de análise.</p>
              <p><a href="${flaggedUrl}">Ver avaliações reportadas</a></p>
              `,
            });
            strapi.log.info(`Business owner report email sent for review ${review.id}`);
          } catch (emailErr: unknown) {
            strapi.log.error("Error sending business owner report email:", emailErr instanceof Error ? emailErr.message : String(emailErr));
          }
        }

        // Email to review author
        const reviewAuthor = (review as any).users_permissions_user;
        const reviewAuthorEmail = reviewAuthor?.email;
        if (reviewAuthorEmail && reviewAuthorEmail !== user.email) {
          try {
            const myReviewsUrl = `${frontendUrl}/user/my-reviews`;
            await strapi.plugins.email.services.email.send({
              to: reviewAuthorEmail,
              subject: `A tua avaliação foi reportada - CliAvalia`,
              text: `A tua avaliação sobre ${businessName} foi reportada por outro utilizador e está a ser analisada pela equipa CliAvalia.\n\nA avaliação continuará visível durante o processo de análise.\n\nVer as minhas avaliações: ${myReviewsUrl}`,
              html: `
              <h2>A tua avaliação foi reportada</h2>
              <p>A tua avaliação sobre <strong>${businessName}</strong> foi reportada por outro utilizador e está a ser analisada pela equipa CliAvalia.</p>
              <p>A avaliação continuará visível durante o processo de análise.</p>
              <p><a href="${myReviewsUrl}">Ver as minhas avaliações</a></p>
              `,
            });
            strapi.log.info(`Review author report email sent for review ${review.id}`);
          } catch (emailErr: unknown) {
            strapi.log.error("Error sending review author report email:", emailErr instanceof Error ? emailErr.message : String(emailErr));
          }
        }

        return ctx.created({
          data: {
            id: report.id,
            status: "pending",
            message: "O seu reporte foi submetido e será analisado pela equipa.",
          },
        });
      } catch (error: any) {
        strapi.log.error("Error submitting report:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao submeter o reporte."
        );
      }
    },

    /**
     * Get all reports submitted by the authenticated user
     * GET /api/reviews/reports/me
     */
    async getMyReports(ctx) {
      let user = ctx.state.user;
      if (!user) {
        user = await authenticateUserFromToken(ctx, strapi);
      }
      if (!user) {
        return ctx.unauthorized("Deves fazer login para ver os teus reports.");
      }

      try {
        const reports = await strapi.db
          .query("api::review-report.review-report")
          .findMany({
            where: { reporter: user.id },
            orderBy: { createdAt: "desc" },
            populate: {
              review: {
                populate: {
                  business: { fields: ["id", "name", "slug"] },
                },
              },
            },
          });

        ctx.body = {
          data: (reports || []).map((r: any) => ({
            id: r.id,
            documentId: r.documentId,
            reason: r.reason,
            subReason: r.subReason,
            highlightedText: r.highlightedText,
            status: r.status,
            reviewedAt: r.reviewedAt,
            rejectionReason: r.rejectionReason,
            createdAt: r.createdAt,
            review: r.review
              ? {
                  id: r.review.id,
                  documentId: r.review.documentId,
                  title: r.review.title,
                  business: r.review.business,
                }
              : null,
          })),
        };
        return;
      } catch (error: any) {
        strapi.log.error("Error fetching my reports:", error);
        return ctx.internalServerError(
          "Ocorreu um erro ao carregar os teus reports."
        );
      }
    },
  })
);
