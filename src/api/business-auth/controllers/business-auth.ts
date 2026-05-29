/**
 * Business Authentication Controller
 * Handles business user registration
 *
 * Note: This is a custom controller without a content-type,
 * so we don't use factories.createCoreController
 */

import crypto from "crypto";
import businessEmailService from "../services/business-email";
import { uploadFilesWithFunctionType } from "../../../utils/upload-with-function-type";
import {
  applyBusinessCategoriesConnectToData,
  enrichBusinessCategoryFields,
  getBusinessCategoriesPopulate,
  parseCategoryIdsFromInput,
  resolveCategoriesAndSector,
} from "../../../utils/business-categories";

// Helper functions
function validateBusinessRegistrationData(data: {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
}): void {
  const { email, password, firstName, lastName, businessName } = data;

  if (!email || !password || !firstName || !lastName || !businessName) {
    throw new Error(
      "Missing required fields: email, password, firstName, lastName, businessName"
    );
  }
}

async function checkExistingUser(email: string): Promise<void> {
  const existingUser = await strapi.db
    .query("plugin::users-permissions.user")
    .findOne({
      where: { email: email.toLowerCase() },
      populate: { role: true },
    });

  if (existingUser) {
    const roleType = existingUser.role?.type || "";
    
    // If existing user is NOT a business-user (i.e., is a consumer), reject business registration
    if (roleType !== "business-user") {
      throw new Error(
        "Este e-mail já está registado como uma conta de consumidor. Por favor, utilize um email diferente para a conta empresa."
      );
    }
    
    // If existing user IS a business-user, also reject (email already taken)
    throw new Error("Já existe uma conta empresarial com este e-mail.");
  }
}

async function checkExistingBusiness(businessName: string): Promise<void> {
  const existingBusiness = await strapi.db
    .query("api::business.business")
    .findOne({
      where: { name: businessName },
    });

  if (existingBusiness) {
    throw new Error("O nome da empresa já está registado.");
  }
}

async function getOrCreateBusinessUserRole(): Promise<any> {
  let businessUserRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({
      where: { type: "business-user" },
    });

  if (!businessUserRole) {
    console.log("🔵 [BUSINESS REGISTER] Creating business-user role...");
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
    console.log(
      "✅ [BUSINESS REGISTER] Business-user role created:",
      businessUserRole.id
    );
  }

  return businessUserRole;
}

async function generateUniqueUsername(email: string): Promise<string> {
  const emailPrefix = email.split("@")[0] || "user";
  let baseUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  let username = baseUsername;
  let usernameExists = true;
  let usernameAttempts = 0;

  while (usernameExists && usernameAttempts < 10) {
    const existingUserWithUsername = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { username },
      });

    if (existingUserWithUsername) {
      usernameAttempts++;
      username = `${baseUsername}${usernameAttempts}`;
    } else {
      usernameExists = false;
    }
  }

  return username;
}

async function generateConfirmationToken(): Promise<string> {
  // Generate a secure random token for email confirmation
  // Strapi uses 20 bytes (40 hex characters) for confirmation tokens
  return crypto.randomBytes(20).toString("hex");
}

async function createUser(userData: any): Promise<any> {
  const userService = strapi.plugin("users-permissions").service("user");

  try {
    // Generate confirmation token if not already provided
    if (!userData.confirmationToken) {
      userData.confirmationToken = await generateConfirmationToken();
      console.log("🔵 [BUSINESS REGISTER] Generated confirmation token");
    }

    // Create user - the global sendConfirmationEmail override will skip default email for business users
    const user = await userService.add(userData);
    console.log("✅ [BUSINESS REGISTER] User created:", user.id);
    
    // Fetch the user again to ensure we have the confirmation token and role
    // Sometimes userService.add doesn't return all fields
    let userWithToken = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { id: user.id },
        populate: { role: true },
      });
    
    // If confirmation token is missing, update the user with it
    if (userWithToken && !userWithToken.confirmationToken && userData.confirmationToken) {
      console.log("🔵 [BUSINESS REGISTER] Updating user with confirmation token");
      userWithToken = await strapi.db
        .query("plugin::users-permissions.user")
        .update({
          where: { id: user.id },
          data: { confirmationToken: userData.confirmationToken },
        });
    }
    
    // Verify role is set correctly (safety check)
    if (userWithToken && userWithToken.role?.type !== "business-user") {
      console.log("⚠️ [BUSINESS REGISTER] Role mismatch detected, fixing...");
      const businessUserRole = await getOrCreateBusinessUserRole();
      userWithToken = await strapi.db
        .query("plugin::users-permissions.user")
        .update({
          where: { id: user.id },
          data: { role: businessUserRole.id },
        });
      console.log("✅ [BUSINESS REGISTER] Role fixed to business-user");
    }
    
    return userWithToken || user;
  } catch (userError: any) {
    console.error("❌ [BUSINESS REGISTER] Error creating user:", userError);
    throw new Error(userError.message || "Error creating user account");
  }
}

async function generateUniqueSlug(businessName: string): Promise<string> {
  const slugBase = businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);

  let slug = slugBase;
  let slugExists = true;
  let slugAttempts = 0;

  while (slugExists && slugAttempts < 10) {
    const existingBusinessWithSlug = await strapi.db
      .query("api::business.business")
      .findOne({
        where: { slug },
      });

    if (existingBusinessWithSlug) {
      slugAttempts++;
      slug = `${slugBase}-${slugAttempts}`;
    } else {
      slugExists = false;
    }
  }

  return slug;
}

async function createBusiness(businessData: any): Promise<any> {
  try {
    const business = await strapi.db.query("api::business.business").create({
      data: businessData,
    });
    console.log("✅ [BUSINESS REGISTER] Business created:", business.id);
    return business;
  } catch (businessError: any) {
    console.error(
      "❌ [BUSINESS REGISTER] Error creating business:",
      businessError
    );
    throw new Error(businessError.message || "Error creating business profile");
  }
}

async function rollbackUserCreation(userId: string): Promise<void> {
  try {
    await strapi.db.query("plugin::users-permissions.user").delete({
      where: { id: userId },
    });
  } catch (rollbackError) {
    console.error("❌ [BUSINESS REGISTER] Rollback failed:", rollbackError);
  }
}

async function sendConfirmationEmail(user: any, businessName?: string, localeLike?: unknown): Promise<void> {
  try {
    // Use the business email service
    await businessEmailService.sendBusinessRegistrationEmail(user, businessName, localeLike);
    console.log("✅ [BUSINESS REGISTER] Custom business confirmation email sent");
  } catch (emailError: any) {
    console.error(
      "⚠️ [BUSINESS REGISTER] Error sending confirmation email:",
      emailError
    );
    // Don't fail registration if email fails
  }
}

/**
 * Upload a single file via Strapi's upload service (e.g. Cloudinary).
 * Returns the uploaded file ID or null if the upload fails.
 */
async function uploadFile(file: any, label: string): Promise<number | null> {
  if (!file) return null;
  try {
    const fileToUpload = Array.isArray(file) ? file[0] : file;
    const formidableFile = fileToUpload as any;

    strapi.log.info(
      `[BUSINESS REGISTER] Uploading ${label}: ${formidableFile.originalFilename || label}, size: ${formidableFile.size || "unknown"}`
    );

    const fileInfo = {
      name: formidableFile.originalFilename || label,
      alternativeText: null,
      caption: null,
    };

    const uploadResponse = await uploadFilesWithFunctionType(
      strapi,
      [fileToUpload],
      "business-verification",
      fileInfo,
    );

    if (uploadResponse && uploadResponse.length > 0 && uploadResponse[0].id) {
      strapi.log.info(
        `[BUSINESS REGISTER] ${label} uploaded successfully. File ID: ${uploadResponse[0].id}`
      );
      return uploadResponse[0].id;
    }
    strapi.log.error(`[BUSINESS REGISTER] ${label} upload returned empty response`);
    return null;
  } catch (err: any) {
    strapi.log.error(`[BUSINESS REGISTER] ${label} upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Send admin notification about a new pending business registration.
 */
async function sendAdminNotification(business: any, user: any): Promise<void> {
  try {
    const businessService = strapi.service("api::business.business") as any;
    if (businessService?.sendNewBusinessSubmissionEmail) {
      await businessService.sendNewBusinessSubmissionEmail(business, user);
    }
  } catch (e: any) {
    strapi.log.error(`[BUSINESS REGISTER] Admin notification email failed: ${e.message}`);
  }
}

export default {
  async register(ctx: any) {
    console.log("🔵 [BUSINESS REGISTER] Business registration started");

    try {
      // Support both JSON body and multipart FormData
      const body = ctx.request.body;
      const files = ctx.request.files || {};

      const email = body.email;
      const password = body.password;
      const firstName = body.firstName;
      const lastName = body.lastName;
      const businessName = body.businessName;
      const phone = body.phone;
      const companySize = body.companySize;
      const acronym = body.acronym;

      // Validate required fields
      validateBusinessRegistrationData({
        email,
        password,
        firstName,
        lastName,
        businessName,
      });

      // Validate required documents
      if (!files.officialLetter) {
        return ctx.badRequest("A carta oficial é obrigatória.");
      }
      if (!files.idCopy) {
        return ctx.badRequest("A cópia do documento de identificação é obrigatória.");
      }

      // Check for existing user and business
      await checkExistingUser(email);
      await checkExistingBusiness(businessName);

      // Upload documents first (fail fast if upload fails)
      const officialLetterId = await uploadFile(files.officialLetter, "officialLetter");
      const idCopyId = await uploadFile(files.idCopy, "idCopy");

      if (!officialLetterId || !idCopyId) {
        return ctx.badRequest("Falha no carregamento dos documentos. Por favor, tente novamente.");
      }

      // Get or create business user role
      const businessUserRole = await getOrCreateBusinessUserRole();

      // Generate unique username
      const username = await generateUniqueUsername(email);

      // Create user
      const userData: any = {
        username,
        email: email.toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        provider: "local",
        confirmed: false, // Requires email verification
        blocked: false,
        role: businessUserRole.id,
      };

      console.log("🔵 [BUSINESS REGISTER] Creating user with data:", {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      });

      const user = await createUser(userData);

      // Generate slug for business
      const slug = await generateUniqueSlug(businessName);

      // Prepare business data — pending approval by default
      const businessData: any = {
        name: businessName,
        slug,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone || null,
        companySize: companySize || null,
        verified: false,
        owner: user.id,
        submittedBy: user.id,
        approvalStatus: "pending",
        officialLetter: officialLetterId,
        idCopy: idCopyId,
      };

      if (acronym) {
        businessData.acronym = String(acronym).trim().substring(0, 50);
      }

      const categoryIds = parseCategoryIdsFromInput(body as Record<string, unknown>);
      if (categoryIds.length > 0) {
        const resolved = await resolveCategoriesAndSector(strapi, categoryIds, {
          required: true,
        });
        applyBusinessCategoriesConnectToData(
          strapi,
          businessData,
          resolved.categoryIds,
        );
        if (resolved.sectorId != null) {
          businessData.sector = resolved.sectorId;
        }
      }

      console.log("🔵 [BUSINESS REGISTER] Creating business with data:", {
        name: businessData.name,
        slug: businessData.slug,
        owner: businessData.owner,
        approvalStatus: businessData.approvalStatus,
      });

      // Create business
      let business: any;
      try {
        business = await createBusiness(businessData);
      } catch (businessError: any) {
        // Rollback: delete user if business creation fails
        await rollbackUserCreation(user.id);
        throw businessError;
      }

      // Send email confirmation with business name
      await sendConfirmationEmail(user, businessName, ctx.request?.headers?.['accept-language']);

      // Send admin notification about new pending business
      await sendAdminNotification(business, user);

      // Return success
      ctx.body = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          confirmed: user.confirmed,
        },
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          approvalStatus: "pending",
        },
        message:
          "Registo efetuado com sucesso. A sua empresa aguarda aprovação do administrador. Por favor, verifique o seu email para confirmar a sua conta.",
        requiresVerification: true,
        requiresApproval: true,
      };
    } catch (error: any) {
      console.error("❌ [BUSINESS REGISTER] Unexpected error:", error);

      // If it's a validation error, return bad request
      if (
        error.message?.includes("already taken") ||
        error.message?.includes("already registered") ||
        error.message?.includes("required") ||
        error.message?.includes("já está registado") ||
        error.message?.includes("já existe")
      ) {
        return ctx.badRequest(error.message);
      }

      return ctx.badRequest(error.message || "Registration failed");
    }
  },

  /**
   * Setup password for approved business claim
   * POST /api/auth/business/setup-password
   * Body: { code: string, password: string, passwordConfirmation: string }
   */
  async setupPassword(ctx: any) {
    console.log("🔵 [BUSINESS SETUP PASSWORD] Setup password endpoint called");
    strapi.log.info("[BUSINESS SETUP PASSWORD] Setup password endpoint called");
    try {
      const { code, password, passwordConfirmation } = ctx.request.body;

      // Validate required fields
      if (!code) {
        return ctx.badRequest("Código de configuração é obrigatório.");
      }

      if (!password || !passwordConfirmation) {
        return ctx.badRequest("Palavra-passe e confirmação são obrigatórias.");
      }

      if (password !== passwordConfirmation) {
        return ctx.badRequest("As palavras-passe não coincidem.");
      }

      // Validate password strength
      if (password.length < 8) {
        return ctx.badRequest("A palavra-passe deve ter pelo menos 8 caracteres.");
      }

      // Find user by resetPasswordToken
      let user = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          where: { resetPasswordToken: code },
          populate: { role: true },
        });


      if (!user) {
        return ctx.badRequest("Código inválido ou expirado.");
      }

      // Verify user is a business user
      let roleType = user.role?.type || "";
      
      // If user doesn't have business-user role but has a valid reset token from business claim,
      // update their role (this handles users created before the role fix)
      if (roleType !== "business-user") {
        strapi.log.warn(
          `User ${user.id} has role '${roleType}' but valid business claim reset token. Updating role to business-user.`
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
        
        // Refresh user data with updated role
        const updatedUser = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({
            where: { id: user.id },
            populate: { role: true },
          });
        
        user = updatedUser;
        roleType = user.role?.type || "";
        
        strapi.log.info(
          `Updated user ${user.id} role to business-user during password setup`
        );
      }

      // Hash password using bcryptjs (available via Strapi's dependencies)
      const bcrypt = require('bcryptjs');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Strategy: Update password and resetPasswordToken first, then update confirmed separately
      // This avoids potential conflicts in Strapi 5
      
      // Step 1: Update password and clear reset token
      await strapi.db.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
        },
      });
      
      // Step 2: Update confirmed field in a separate operation
      // Wait a small moment to ensure password update is committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let confirmedSuccess = false;
      
      // Try multiple methods to update confirmed with retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const confirmedUpdateResult = await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: user.id },
            data: { confirmed: true },
          });
          
          if (confirmedUpdateResult && confirmedUpdateResult.confirmed === true) {
            confirmedSuccess = true;
            break;
          }
        } catch (queryError: any) {
          // Silently retry
        }
        
        // Wait before retry
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Method 2: If query API didn't work, try entity service
      if (!confirmedSuccess) {
        try {
          const entityService = strapi.entityService;
          if (entityService) {
            // Input<"plugin::users-permissions.user"> excludes confirmed; schema allows it. Cast to satisfy TS.
            const confirmedUpdateResult = await entityService.update('plugin::users-permissions.user', user.id, {
              data: { confirmed: true } as any,
            });
            if (confirmedUpdateResult && confirmedUpdateResult.confirmed === true) {
              confirmedSuccess = true;
            }
          }
        } catch (entityError: any) {
          // Continue to next method
        }
      }
      
      // Method 3: Last resort - direct database update using multiple approaches
      if (!confirmedSuccess) {
        try {
          const db = strapi.db.connection;
          
          if (db) {
            // Method 3a: Raw SQL (works with most databases)
            if (typeof db.raw === 'function') {
              try {
                const result = await db.raw('UPDATE up_users SET confirmed = ? WHERE id = ?', [true, user.id]);
                const affectedRows = result?.[0]?.affectedRows || result?.rowCount || result?.[1] || 0;
                if (affectedRows > 0) {
                  confirmedSuccess = true;
                }
              } catch (rawError: any) {
                // Try next method
              }
            }
            
            // Method 3b: Knex-style query (if raw didn't work)
            if (!confirmedSuccess && typeof (db as any).query === 'function') {
              try {
                const knexResult = await db('up_users').where('id', user.id).update({ confirmed: true });
                if (knexResult > 0) {
                  confirmedSuccess = true;
                }
              } catch (knexError: any) {
                // Try next method
              }
            }
            
            // Method 3c: TypeORM-style (if available)
            if (!confirmedSuccess && (db as any).manager) {
              try {
                await (db as any).manager.query('UPDATE up_users SET confirmed = ? WHERE id = ?', [true, user.id]);
                confirmedSuccess = true;
              } catch (ormError: any) {
                // All methods failed
              }
            }
          }
        } catch (sqlError: any) {
          strapi.log.error(`Failed to confirm user email after password setup:`, sqlError.message || sqlError);
        }
      }

      // Generate JWT token for immediate login
      const jwt = strapi.plugin("users-permissions").service("jwt").issue({
        id: user.id,
      });

      // Fetch updated user data
      const updatedUser = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      // Final verification - check one more time and force update if needed
      // Wait a moment to ensure all updates are committed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const finalCheck = await strapi.db.query("plugin::users-permissions.user").findOne({
        where: { id: user.id },
      });
      
      // If still not confirmed, try one final direct database update
      if (!finalCheck || !finalCheck.confirmed) {
        try {
          const db = strapi.db.connection;
          
          if (db) {
            if (typeof db.raw === 'function') {
              await db.raw('UPDATE up_users SET confirmed = ? WHERE id = ?', [true, user.id]);
            } else if (typeof (db as any).query === 'function') {
              await db('up_users').where('id', user.id).update({ confirmed: true });
            } else if ((db as any).manager) {
              await (db as any).manager.query('UPDATE up_users SET confirmed = ? WHERE id = ?', [true, user.id]);
            }
            
            // Verify one more time
            const afterFinalUpdate = await strapi.db.query("plugin::users-permissions.user").findOne({
              where: { id: user.id },
            });
            if (afterFinalUpdate) {
              updatedUser.confirmed = afterFinalUpdate.confirmed;
            }
          }
        } catch (finalError: any) {
          strapi.log.error(`Failed to confirm user email after password setup:`, finalError.message || finalError);
        }
      } else {
        updatedUser.confirmed = finalCheck.confirmed;
      }

      // Remove sensitive fields
      const { password: _, resetPasswordToken: __, confirmationToken: ___, ...userResponse } = updatedUser;

      return ctx.send({
        jwt,
        user: userResponse,
      });
    } catch (error: any) {
      strapi.log.error("Error setting up password:", error);
      return ctx.internalServerError(
        error.message || "Erro ao configurar palavra-passe."
      );
    }
  },

  /**
   * Resubmit a rejected business application
   * PUT /api/auth/business/resubmit
   * Authenticated — business user must be logged in.
   * Accepts multipart FormData with updated fields + new document uploads.
   */
  async resubmit(ctx: any) {
    console.log("🔵 [BUSINESS RESUBMIT] Resubmission started");

    try {
      // Authenticated user
      const userId = ctx.state?.user?.id;
      if (!userId) {
        return ctx.unauthorized("Autenticação necessária.");
      }

      // Find the user's business
      const business = await strapi.db.query("api::business.business").findOne({
        where: { owner: userId },
        populate: { owner: true, sector: true, ...getBusinessCategoriesPopulate(strapi) },
      });

      if (!business) {
        return ctx.notFound("Nenhuma empresa encontrada para este utilizador.");
      }

      if (business.approvalStatus !== "rejected") {
        return ctx.badRequest(
          "Apenas empresas rejeitadas podem ser re-submetidas."
        );
      }

      const body = ctx.request.body;
      const files = ctx.request.files || {};

      // Upload new documents if provided
      let officialLetterId = undefined;
      let idCopyId = undefined;

      if (files.officialLetter) {
        officialLetterId = await uploadFile(files.officialLetter, "officialLetter");
        if (!officialLetterId) {
          return ctx.badRequest("Falha no carregamento da carta oficial.");
        }
      }

      if (files.idCopy) {
        idCopyId = await uploadFile(files.idCopy, "idCopy");
        if (!idCopyId) {
          return ctx.badRequest("Falha no carregamento da cópia do BI.");
        }
      }

      // Build update data
      const updateData: any = {
        approvalStatus: "pending",
        rejectionReason: null,
        verified: false,
      };

      // Allow updating basic fields
      if (body.businessName) updateData.name = body.businessName;
      if (body.phone !== undefined) updateData.phone = body.phone || null;
      if (body.companySize !== undefined) updateData.companySize = body.companySize || null;
      if (body.acronym !== undefined) updateData.acronym = String(body.acronym).trim().substring(0, 50);

      const categoryIds = parseCategoryIdsFromInput(body as Record<string, unknown>);
      if (categoryIds.length > 0) {
        const resolved = await resolveCategoriesAndSector(strapi, categoryIds, {
          required: true,
        });
        applyBusinessCategoriesConnectToData(
          strapi,
          updateData,
          resolved.categoryIds,
        );
        if (resolved.sectorId != null) {
          updateData.sector = resolved.sectorId;
        }
      }

      if (officialLetterId) updateData.officialLetter = officialLetterId;
      if (idCopyId) updateData.idCopy = idCopyId;

      // Update business
      const updated = await strapi.db.query("api::business.business").update({
        where: { id: business.id },
        data: updateData,
      });

      console.log(`✅ [BUSINESS RESUBMIT] Business ${business.id} resubmitted`);

      // Send admin notification
      await sendAdminNotification(updated, ctx.state.user);

      ctx.body = {
        data: {
          id: updated.id,
          name: updated.name,
          approvalStatus: updated.approvalStatus,
        },
        message: "Candidatura re-submetida com sucesso. Aguarde a análise do administrador.",
      };
    } catch (error: any) {
      console.error("❌ [BUSINESS RESUBMIT] Error:", error);
      return ctx.badRequest(error.message || "Falha na re-submissão.");
    }
  },

  /**
   * Request a password reset link for a business user.
   * POST /api/auth/business/forgot-password
   * Body: { email: string }
   *
   * Always returns { sent: true } to prevent user enumeration.
   */
  async forgotPassword(ctx: any) {
    console.log("🔵 [BUSINESS FORGOT PASSWORD] Forgot password endpoint called");

    try {
      const { email } = ctx.request.body;

      if (!email) {
        return ctx.send({ sent: true });
      }

      const user = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          where: { email: email.toLowerCase() },
          populate: { role: true },
        });

      // Always return success — do not reveal whether the email is registered
      if (!user) {
        return ctx.send({ sent: true });
      }

      // Only process business users; silently succeed for other roles
      const roleType = user.role?.type || "";
      if (roleType !== "business-user") {
        return ctx.send({ sent: true });
      }

      if (user.blocked) {
        return ctx.send({ sent: true });
      }

      // Generate a reset token and persist it
      const resetPasswordToken = crypto.randomBytes(20).toString("hex");
      await strapi.db.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: { resetPasswordToken },
      });

      const frontendUrl =
        process.env.FRONTEND_URL ||
        process.env.PUBLIC_URL ||
        "https://www.cliavalia.com";

      const resetUrl = `${frontendUrl}/business/reset-password?code=${resetPasswordToken}`;

      await businessEmailService.sendBusinessForgotPasswordEmail(user, resetUrl, ctx.request?.headers?.['accept-language']);

      return ctx.send({ sent: true });
    } catch (error: any) {
      console.error("❌ [BUSINESS FORGOT PASSWORD] Error:", error);
      // Return generic success even on error to avoid leaking information
      return ctx.send({ sent: true });
    }
  },

  async resendConfirmation(ctx: any) {
    console.log("🔵 [BUSINESS RESEND CONFIRMATION] Resend confirmation endpoint called");

    try {
      const { email } = ctx.request.body;

      if (!email) {
        return ctx.send({ sent: true });
      }

      const user = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          where: { email: email.toLowerCase() },
          populate: { role: true },
        });

      // Always return success — do not reveal whether the email is registered
      if (!user) {
        return ctx.send({ sent: true });
      }

      // Only process business users; silently succeed for other roles
      const roleType = user.role?.type || "";
      if (roleType !== "business-user") {
        return ctx.send({ sent: true });
      }

      if (user.confirmed) {
        return ctx.send({ sent: true });
      }

      if (user.blocked) {
        return ctx.send({ sent: true });
      }

      // Generate a fresh confirmation token and persist it
      const confirmationToken = crypto.randomBytes(20).toString("hex");
      await strapi.db.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: { confirmationToken },
      });

      const backendUrl =
        process.env.PUBLIC_URL ||
        process.env.SERVER_URL ||
        strapi.config.get("server.url");

      const confirmationUrl = `${backendUrl}/api/auth/email-confirmation?confirmation=${confirmationToken}`;
      const firstName = user.firstName || "Utilizador";

      await businessEmailService.sendBusinessConfirmationEmail(user, confirmationUrl, firstName, ctx.request?.headers?.['accept-language']);

      return ctx.send({ sent: true });
    } catch (error: any) {
      console.error("❌ [BUSINESS RESEND CONFIRMATION] Error:", error);
      // Return generic success even on error to avoid leaking information
      return ctx.send({ sent: true });
    }
  },
};
