/**
 * Extended Auth Controller for users-permissions plugin
 * Overrides Google OAuth callback to properly map firstName and lastName
 */

import crypto from "crypto";
import { validateYupSchema, yup } from "@strapi/utils";
import { cancelScheduledAccountDeletion } from "../services/account-deletion";
import { buildConsumerPasswordResetLink } from "../../../utils/consumer-auth-reset-url";
import { getLocalizedEmailText, resolveEmailLocale } from "../../../utils/email-locale";
import { renderEmailTemplate } from "../../../utils/email-template-renderer";
import { getRequestAcceptLanguage } from "../../../utils/request-email-locale-context";

/** Mark handlers applied by CliAvalia so bootstrap can re-patch only when Strapi restored defaults. */
export const CLIAVA_CONSUMER_AUTH_EMAIL_PATCH = "__cliavaliaConsumerAuthEmailPatch";

const validateForgotPasswordBody = validateYupSchema(
  yup
    .object({
      email: yup.string().email().required(),
    })
    .noUnknown(),
);

// Module-level log to verify file is loaded
console.log("🔵 [MODULE] Google OAuth callback extension file loaded");

const sanitizeUsername = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 255);

const resolveLoginIdentifier = async (strapi: any, identifier?: string) => {
  const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
  if (!normalizedIdentifier) {
    return null;
  }

  return strapi.db.query("plugin::users-permissions.user").findOne({
    where: {
      $or: [
        { email: normalizedIdentifier },
        { username: normalizedIdentifier },
      ],
    },
    select: ["id"],
  });
};

const ensureUniqueUsername = async (strapi: any, requestedUsername?: string, email?: string) => {
  const emailLocalPart = String(email || "")
    .split("@")[0]
    .trim();

  const baseUsername =
    sanitizeUsername(requestedUsername || "") ||
    sanitizeUsername(emailLocalPart) ||
    `user_${crypto.randomBytes(4).toString("hex")}`;

  let candidateUsername = baseUsername;

  for (let attempt = 0; attempt < 25; attempt++) {
    const existingUser = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { username: candidateUsername },
        select: ["id"],
      });

    if (!existingUser) {
      return candidateUsername;
    }

    const suffix = attempt === 0 ? crypto.randomBytes(2).toString("hex") : `${attempt + 1}`;
    const maxBaseLength = Math.max(1, 255 - suffix.length - 1);
    candidateUsername = `${baseUsername.slice(0, maxBaseLength)}_${suffix}`;
  }

  return `user_${crypto.randomBytes(6).toString("hex")}`;
};

/** Consumer forgot-password handler (exported so bootstrap can re-apply after Strapi 5 re-binds the plugin). */
export function createConsumerForgotPasswordController(strapiInstance: any) {
  const fn = async (ctx: any) => {
    const { email } = await validateForgotPasswordBody(ctx.request.body);

    const user = await strapiInstance.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { email: email.toLowerCase() },
        populate: { role: true },
      });

    if (user && user.role?.type === "business-user") {
      return ctx.badRequest(
        "Esta conta é uma conta empresarial. Para recuperar a sua palavra-passe, aceda ao Portal Empresarial.",
      );
    }

    if (!user || user.blocked) {
      return ctx.send({ ok: true });
    }

    const resetPasswordToken = crypto.randomBytes(64).toString("hex");

    const pluginStore = await strapiInstance.store({
      type: "plugin",
      name: "users-permissions",
    });
    const advancedSettings = (await pluginStore.get({ key: "advanced" })) as {
      email_reset_password?: string;
    } | null;

    const resetUrl = buildConsumerPasswordResetLink(
      advancedSettings?.email_reset_password,
      resetPasswordToken,
    );

    if (!resetUrl) {
      strapiInstance.log?.error(
        "[FORGOT-PW] Missing advanced.email_reset_password and FRONTEND_URL; cannot build reset link.",
      );
      return ctx.send({ ok: true });
    }

    await strapiInstance.plugin("users-permissions").service("user").edit(user.id, {
      resetPasswordToken,
    });

    // Same as consumer confirmation: prefer Accept-Language from middleware (ALS), then raw header,
    // then user profile. Using only (header, user) let DB user locale override UI language when ctx
    // header shape differed, so EN UI could still get PT email.
    const locale = resolveEmailLocale(
      getRequestAcceptLanguage(),
      typeof ctx.get === "function" ? ctx.get("accept-language") : undefined,
      ctx.request?.headers?.["accept-language"],
      user.emailLocale,
      user,
    );
    const firstName =
      user.firstName ||
      getLocalizedEmailText(locale, { pt: "Utilizador", en: "User" });

    try {
      const { subject, html, from } = await renderEmailTemplate(
        "consumer-forgot-password",
        { firstName, resetUrl },
        locale,
      );
      await strapiInstance.plugin("email").service("email").send({
        to: user.email,
        from,
        subject,
        html,
      });
    } catch (err: any) {
      strapiInstance.log?.error(`[FORGOT-PW] Failed to send consumer reset email: ${err?.message}`);
    }

    return ctx.send({ ok: true });
  };
  (fn as any)[CLIAVA_CONSUMER_AUTH_EMAIL_PATCH] = true;
  return fn;
}

/**
 * Resend confirmation: business users get business-email; consumers use `user.sendConfirmationEmail`
 * (Shaolin templates). Must wrap whatever handler Strapi currently exposes (core or extended).
 */
export function createExtendedSendEmailConfirmationHandler(
  strapiInstance: any,
  originalSendEmailConfirmation: (ctx: any) => any,
) {
  const fn = async (ctx: any) => {
    const email = ctx.request?.body?.email;
    if (!email) {
      return originalSendEmailConfirmation(ctx);
    }

    const user = await strapiInstance.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { email: email.toLowerCase() },
        populate: { role: true },
      });

    if (!user) {
      return ctx.send({ email, sent: true });
    }

    if (user.confirmed) {
      throw new (strapiInstance as any).errors.ApplicationError("Already confirmed");
    }

    if (user.blocked) {
      throw new (strapiInstance as any).errors.ApplicationError("User blocked");
    }

    const roleType = user.role?.type || "";
    const isBusinessUser = roleType === "business-user";

    if (isBusinessUser) {
      try {
        strapiInstance.log?.info(
          `[RESEND] Sending custom business confirmation email to: ${user.email}`,
        );

        const confirmationToken = crypto.randomBytes(20).toString("hex");
        await strapiInstance.db
          .query("plugin::users-permissions.user")
          .update({
            where: { id: user.id },
            data: { confirmationToken },
          });

        const backendUrl =
          process.env.PUBLIC_URL ||
          process.env.SERVER_URL ||
          strapiInstance.config.get("server.url");
        const confirmationUrl = `${backendUrl}/api/auth/email-confirmation?confirmation=${confirmationToken}`;
        const firstName = user.firstName || "Utilizador";

        const businessEmailSvc = strapiInstance.service("api::business-auth.business-email") as any;
        await businessEmailSvc.sendBusinessConfirmationEmail(
          user,
          confirmationUrl,
          firstName,
          resolveEmailLocale(
            getRequestAcceptLanguage(),
            typeof ctx.get === "function" ? ctx.get("accept-language") : undefined,
            ctx.request?.headers?.["accept-language"],
            user.emailLocale,
            user,
          ),
        );

        strapiInstance.log?.info(
          `[RESEND] Business confirmation email sent to: ${user.email}`,
        );
      } catch (err: any) {
        strapiInstance.log?.error(
          `[RESEND] Failed to send business confirmation email: ${err?.message}`,
        );
      }
      return ctx.send({ email: user.email, sent: true });
    }

    try {
      await strapiInstance.plugin("users-permissions").service("user").sendConfirmationEmail(user);
      return ctx.send({ email: user.email, sent: true });
    } catch (err: any) {
      const msg = err?.message ?? "";
      const isClientError =
        msg.includes("Already confirmed") ||
        msg.includes("User blocked") ||
        err?.name === "ApplicationError";
      if (isClientError) throw err;
      strapiInstance.log?.error(
        "Send consumer email confirmation failed (SMTP/network):",
        msg,
      );
      return ctx.send({ email: user.email, sent: true });
    }
  };
  (fn as any)[CLIAVA_CONSUMER_AUTH_EMAIL_PATCH] = true;
  return fn;
}

export default (plugin: any, originalCallbackRefParam?: any) => {
  // Use console.log first in case strapi.log isn't available during initialization
  console.log("🔵 [INIT] Initializing Google OAuth callback extension...");

  // Verify plugin structure
  if (!plugin) {
    console.error("❌ [INIT] Plugin is null/undefined");
    return plugin;
  }

  // Store the original callback - use the parameter if provided, otherwise try to get it
  let originalCallbackRef: any = originalCallbackRefParam || null;

  // Try to get the original callback if not provided as parameter
  if (
    !originalCallbackRef &&
    plugin.controllers &&
    plugin.controllers.auth &&
    plugin.controllers.auth.callback
  ) {
    originalCallbackRef = plugin.controllers.auth.callback;
    console.log("✅ [INIT] Original callback found from plugin");
  } else if (originalCallbackRef) {
    console.log("✅ [INIT] Original callback provided as parameter");
  } else {
    console.log(
      "⚠️ [INIT] Original callback not available - will try to get it at runtime"
    );
  }

  // Override the callback controller
  // Strapi 5 controllers expect (ctx, next) signature
  // First, let's verify we can override it
  console.log(
    "🔵 [INIT] About to override callback. Current callback type:",
    typeof plugin.controllers.auth.callback
  );

  const originalCallbackRefWrapper = plugin.controllers.auth.callback;
  const originalRegisterRef = plugin.controllers.auth.register;

  // Business registration controller is now attached directly in strapi-server.ts
  // to ensure it's available synchronously before routes are processed

  // Override register method to assign role based on portal
  plugin.controllers.auth.register = async (ctx: any, next: any) => {
    try {
      const { email, username } = ctx.request.body;
      // Get portal from ctx.state (set by middleware) or from body as fallback
      const portal = ctx.state?.portal || ctx.request.body?.portal;
      
      // Remove portal from request body if still present
      // Middleware should have removed it, but ensure it's gone before validation
      if (ctx.request.body?.portal !== undefined) {
        delete ctx.request.body.portal;
      }

      // Never set verified on registration; users get verified only by requesting verification
      ctx.request.body.verified = false;

      // Strapi enforces unique usernames. Consumer signup may send name-based usernames
      // that collide across different users, so normalize and uniquify here.
      ctx.request.body.username = await ensureUniqueUsername(
        strapi,
        username,
        email,
      );

      // Validate portal field if provided
      if (portal && portal !== 'business' && portal !== 'consumer') {
        return ctx.badRequest("Invalid portal. Must be 'business' or 'consumer'.");
      }

      // Check if email exists and is a business user
      if (email) {
        const existingUser = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({
            where: { email: email.toLowerCase() },
            populate: { role: true },
          });

        if (existingUser) {
          const roleType = existingUser.role?.type || "";
          
          // If existing user is a business-user, reject consumer registration
          if (roleType === "business-user") {
            return ctx.badRequest(
              "This email is already registered as a business account. Please use the business login."
            );
          }
        }
      }

      // If portal is provided, fetch and assign the appropriate role
      if (portal) {
        let targetRole = null;
        
        if (portal === 'business') {
          // Fetch Business User role by type or name
          targetRole = await strapi.db
            .query("plugin::users-permissions.role")
            .findOne({
              where: {
                $or: [
                  { type: 'business-user' },
                  { name: 'Business User' }
                ]
              }
            });

          if (!targetRole) {
            strapi.log?.warn("Business User role not found, creating it...");
            // Create Business User role if it doesn't exist
            targetRole = await strapi.db
              .query("plugin::users-permissions.role")
              .create({
                data: {
                  name: "Business User",
                  type: "business-user",
                  description: "Business user role"
                }
              });
          }
        } else if (portal === 'consumer') {
          // Fetch Consumers role by name
          targetRole = await strapi.db
            .query("plugin::users-permissions.role")
            .findOne({
              where: { name: 'Consumers' }
            });

          if (!targetRole) {
            strapi.log?.warn("Consumers role not found, creating it...");
            // Create Consumers role if it doesn't exist
            targetRole = await strapi.db
              .query("plugin::users-permissions.role")
              .create({
                data: {
                  name: "Consumers",
                  type: "authenticated",
                  description: "Consumer user role"
                }
              });
          }
        }

        if (targetRole) {
          // Assign the role to the user in the request body
          ctx.request.body.role = targetRole.id;
          strapi.log?.info(`[REGISTER] Assigning ${portal} role (ID: ${targetRole.id}) to new user`);
        }
      }

      // Call the original register method
      // Try stored reference first
      if (originalRegisterRef && typeof originalRegisterRef === "function") {
        try {
          const result = await originalRegisterRef(ctx, next);
          return result;
        } catch (regErr: any) {
          throw regErr;
        }
      }

      // Fallback: try to get original from plugin service
      try {
        const authPlugin = strapi.plugin("users-permissions");
        if (
          authPlugin &&
          authPlugin.controllers &&
          authPlugin.controllers.auth &&
          authPlugin.controllers.auth.register &&
          authPlugin.controllers.auth.register !== plugin.controllers.auth.register
        ) {
          return authPlugin.controllers.auth.register(ctx, next);
        }
      } catch (e: any) {
        console.error("❌ [REGISTER] Error accessing original register:", e);
      }

      // Last resort: return error
      return ctx.badRequest("Registration endpoint not available");
    } catch (error: any) {
      console.error("❌ [REGISTER] Error in register override:", error);
      strapi.log?.error("Error in register override:", error);
      
      // CRITICAL FIX: Do NOT retry originalRegisterRef here.
      // If the original register threw an error (e.g., SMTP failure during
      // sendConfirmationEmail), the user was ALREADY created in the database.
      // Retrying would attempt to create the same user again, resulting in
      // "Email or Username are already taken" — which is the bug we're fixing.
      
      // FALLBACK: If the error indicates the user was already created (email send
      // failure or duplicate from retry), find user by email and return 200.
      const errMsg = (error?.message || "").toLowerCase();
      const errStack = (error?.stack || "").toLowerCase();
      const isEmailSendError =
        errMsg.includes("confirmation email") ||
        errMsg.includes("sending confirmation") ||
        errMsg.includes("socket close") ||
        errMsg.includes("smtp");
      const isAlreadyTaken =
        errMsg.includes("already taken") ||
        errMsg.includes("already exists") ||
        errMsg.includes("já está registado") ||
        errStack.includes("already taken") ||
        errStack.includes("socket close");
      const shouldTryFallback = (isEmailSendError || isAlreadyTaken) && ctx.request.body?.email;
      strapi.log?.info(
        `[REGISTER] Catch fallback check: errMsg="${error?.message}", shouldTryFallback=${shouldTryFallback}, email=${!!ctx.request.body?.email}`
      );
      if (shouldTryFallback) {
        try {
          const existingUser = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
              where: { email: (ctx.request.body.email as string).toLowerCase() },
              populate: { role: true },
            });
          if (existingUser) {
            strapi.log?.info(
              `[REGISTER] User ${existingUser.email} was created but confirmation email failed. Returning success.`
            );
            const userSchema = strapi.getModel("plugin::users-permissions.user");
            const sanitized =
              userSchema && typeof strapi.contentAPI?.sanitize?.output === "function"
                ? await strapi.contentAPI.sanitize.output(existingUser, userSchema, {
                    auth: ctx.state?.auth,
                  })
                : {
                    id: existingUser.id,
                    username: existingUser.username,
                    email: existingUser.email,
                    confirmed: existingUser.confirmed,
                    blocked: existingUser.blocked,
                    createdAt: existingUser.createdAt,
                    updatedAt: existingUser.updatedAt,
                  };
            return ctx.send({ user: sanitized });
          }
          strapi.log?.warn(
            `[REGISTER] Fallback: no user found for email ${(ctx.request.body.email as string)?.toLowerCase?.()}`
          );
        } catch (fallbackErr: any) {
          strapi.log?.warn("[REGISTER] Fallback user lookup failed:", fallbackErr?.message);
        }
      }
      
      return ctx.badRequest(error.message || "Registration failed");
    }
  };

  // Override local login method to verify portal matches user role
  const originalLocalRef = plugin.controllers.auth.local;
  plugin.controllers.auth.local = async (ctx: any, next: any) => {
    try {
      const { identifier } = ctx.request.body;
      // Get portal from ctx.state (set by middleware) or from body as fallback
      const portal = ctx.state?.portal || ctx.request.body?.portal;
      
      // Remove portal from body if present to prevent validation errors
      if (ctx.request.body?.portal !== undefined) {
        delete ctx.request.body.portal;
      }
      
      console.log("🔵 [LOCAL] Login attempt:", { portal, identifier, hasPortal: !!portal });

      // Store portal for verification after authentication
      const portalToCheck = (portal === 'business' || portal === 'consumer') ? portal : null;

      // Call the original local method first to authenticate
      if (originalLocalRef && typeof originalLocalRef === "function") {
        await originalLocalRef(ctx, next);
      } else {
        // Fallback: try to get original from plugin service
        try {
          const authPlugin = strapi.plugin("users-permissions");
          if (
            authPlugin &&
            authPlugin.controllers &&
            authPlugin.controllers.auth &&
            authPlugin.controllers.auth.local &&
            authPlugin.controllers.auth.local !== plugin.controllers.auth.local
          ) {
            await authPlugin.controllers.auth.local(ctx, next);
          } else {
            // If we can't find original, just call next
            return next();
          }
        } catch (e: any) {
          console.error("❌ [LOCAL] Error accessing original local:", e);
          return next();
        }
      }

      // After successful authentication, verify portal matches role if portal was provided.
      // NOTE: ctx.state.user is NOT set by the local handler — the user ID must be read from
      // ctx.body.user.id which is set by originalLocalRef on a successful login.
      const authBody = ctx.body as any;
      let authenticatedUserId = ctx.state?.user?.id ?? authBody?.user?.id;

      if (!authenticatedUserId && (!ctx.status || ctx.status < 400) && (authBody?.jwt || authBody?.user)) {
        const resolvedUser = await resolveLoginIdentifier(strapi, identifier);
        authenticatedUserId = resolvedUser?.id;
      }

      if (!authenticatedUserId && (!ctx.status || ctx.status < 400) && (authBody?.jwt || authBody?.user)) {
        strapi.log?.warn(
          `[ACCOUNT-DELETION] Could not resolve authenticated user for local login identifier: ${String(identifier || "")}`,
        );
      }

      if (portalToCheck && authenticatedUserId && (!ctx.status || ctx.status < 400)) {
        const userId = authenticatedUserId;
        console.log("🔵 [LOCAL] Portal check for user:", { userId, portalToCheck });

        // Fetch user with role populated
        const userWithRole = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({
            where: { id: userId },
            populate: { role: true },
          });

        console.log("🔵 [LOCAL] User with role:", { 
          userId, 
          roleType: userWithRole?.role?.type, 
          roleName: userWithRole?.role?.name 
        });

        // Self-heal: if a user attempts the business portal but has the wrong role,
        // and they own a business entity, their role was likely lost/never assigned — fix it.
        // NOTE: This only sets a flag; it does NOT permanently change the user's role
        // since role-swapping breaks consumer portal access.
        const checkBusinessOwnership = async (): Promise<boolean> => {
          try {
            const linkedBusiness = await strapi.db
              .query("api::business.business")
              .findOne({ where: { owner: userId } });
            return !!linkedBusiness;
          } catch (e: any) {
            strapi.log?.error("[LOCAL] Business ownership check failed:", e?.message);
            return false;
          }
        };

        if (!userWithRole || !userWithRole.role) {
          strapi.log?.warn(`[LOCAL] User ${userId} has no role assigned`);
          if (portalToCheck === 'business') {
            const ownsBusiness = await checkBusinessOwnership();
            if (ownsBusiness) return; // user owns a business, allow login
          }
          console.log("🔴 [LOCAL] BLOCKING login - no role assigned");
          ctx.status = 403;
          ctx.body = {
            data: null,
            error: {
              status: 403,
              name: "ForbiddenError",
              message: "User role not found. Please contact support.",
            },
          };
          return;
        }

        const roleType = userWithRole.role.type || "";
        const roleName = userWithRole.role.name || "";

        // Check if role matches portal
        let roleMatches = false;
        if (portalToCheck === 'business') {
          // Business portal requires business-user role
          const roleNameLower = roleName.toLowerCase();
          roleMatches = roleType === 'business-user' || roleNameLower === 'business user' || roleNameLower.includes('business');
          
          if (!roleMatches) {
            // If user owns a business entity, allow access to business portal
            // regardless of their Strapi role type
            const ownsBusiness = await checkBusinessOwnership();
            if (ownsBusiness) roleMatches = true;
          }

          if (!roleMatches) {
            // Get language from Accept-Language header or default to Portuguese
            const acceptLanguage = ctx.request.headers['accept-language'] || 'pt';
            const isEnglish = acceptLanguage.includes('en');
            
            const errorMessage = isEnglish
              ? "This account does not have access to the Business Portal. Please use the Consumer Portal."
              : "Esta conta não tem acesso ao Portal Empresarial. Por favor, use o Portal do Consumidor.";
            
            strapi.log?.warn(`[LOCAL] User ${userId} (role: ${roleName}, type: ${roleType}) attempted to access business portal`);
            console.log("🔴 [LOCAL] BLOCKING business portal access for non-business user");
            
            ctx.status = 403;
            ctx.body = {
              data: null,
              error: {
                status: 403,
                name: "ForbiddenError",
                message: errorMessage,
              },
            };
            return;
          }
        } else if (portalToCheck === 'consumer') {
          // Consumer portal: any authenticated user can use it, including business users.
          // A consumer who claimed/owns a business should still access the consumer portal
          // for browsing, writing reviews, etc.
          roleMatches = true;
        }
      }

      if (authenticatedUserId && (!ctx.status || ctx.status < 400)) {
        try {
          const didCancelDeletion = await cancelScheduledAccountDeletion(
            strapi,
            authenticatedUserId,
          );

          if (didCancelDeletion) {
            strapi.log?.info(
              `[ACCOUNT-DELETION] Cancelled scheduled deletion on login for user ${authenticatedUserId}`,
            );
            if (authBody?.user) {
              authBody.user = {
                ...authBody.user,
                isDeletionPending: false,
                scheduledDeletionAt: null,
              };
            }
          }
        } catch (cancelError: any) {
          strapi.log?.warn(
            `[ACCOUNT-DELETION] Failed to cancel scheduled deletion on local login for user ${authenticatedUserId}: ${cancelError?.message || cancelError}`,
          );
        }
      }

      // If we got here, authentication succeeded and portal check passed (if portal was provided)
      return;
    } catch (error: any) {
      console.error("❌ [LOCAL] Error in local override:", error);
      strapi.log?.error("Error in local override:", error);
      
      // If it's a forbidden error we set, re-throw it
      if (error.status === 403) {
        throw error;
      }
      
      // Otherwise, try to call original local
      if (originalLocalRef && typeof originalLocalRef === "function") {
        return originalLocalRef(ctx, next);
      }
      
      // Try to get original from plugin
      try {
        const authPlugin = strapi.plugin("users-permissions");
        if (
          authPlugin &&
          authPlugin.controllers &&
          authPlugin.controllers.auth &&
          authPlugin.controllers.auth.local &&
          authPlugin.controllers.auth.local !== plugin.controllers.auth.local
        ) {
          return authPlugin.controllers.auth.local(ctx, next);
        }
      } catch (e: any) {
        // Ignore and continue
      }
      
      throw error;
    }
  };

  plugin.controllers.auth.callback = async (ctx: any, next: any) => {
    // Use console.log for immediate visibility - these should ALWAYS appear
    console.log("🔵🔵🔵 [CALLBACK] CALLBACK OVERRIDE IS RUNNING!!!");
    console.log("🔵 [CALLBACK] Provider from params:", ctx.params?.provider);
    console.log(
      "🔵 [CALLBACK] Full ctx.params:",
      JSON.stringify(ctx.params || {})
    );
    console.log("🔵 [CALLBACK] Query keys:", Object.keys(ctx.query || {}));
    console.log("🔵 [CALLBACK] URL path:", ctx.request?.url || ctx.url);

    // Extract provider from params or URL path
    let provider = ctx.params?.provider;
    if (!provider) {
      // Try to extract from URL path like /api/connect/google/callback or /connect/google/callback
      const url = ctx.request?.url || ctx.url || '';
      const urlMatch = url.match(/\/connect\/([^\/\?]+)\/callback/);
      if (urlMatch && urlMatch[1]) {
        provider = urlMatch[1];
        console.log("🔵 [CALLBACK] Extracted provider from URL:", provider);
      }
    }

    // Check if this is even being called
    if (!provider) {
      console.error("❌ [CALLBACK] No provider found in params or URL!");
      console.error("❌ [CALLBACK] ctx.params:", ctx.params);
      console.error("❌ [CALLBACK] URL:", ctx.request?.url || ctx.url);
      // Fall through to original
      if (
        originalCallbackRefWrapper &&
        typeof originalCallbackRefWrapper === "function"
      ) {
        return originalCallbackRefWrapper(ctx, next);
      }
      return next();
    }

    try {

      console.log("🔵 [CALLBACK] Callback invoked - Provider:", provider);
      console.log("🔵 [CALLBACK] Has code:", !!ctx.query?.code);
      console.log("🔵 [CALLBACK] Redirect URL:", ctx.query?.redirect);

      // Also use strapi.log for structured logging
      if (strapi && strapi.log) {
        strapi.log.info("🔵 OAuth callback started:", {
          provider,
          query: ctx.query,
          hasCode: !!ctx.query.code,
          redirect: ctx.query.redirect,
        });
      }

      if (provider === "local") {
        const authBody = ctx.request?.body as any;
        const identifier = authBody?.identifier;

        if (originalCallbackRef && typeof originalCallbackRef === "function") {
          await originalCallbackRef(ctx, next);
        } else if (
          originalCallbackRefWrapper &&
          typeof originalCallbackRefWrapper === "function"
        ) {
          await originalCallbackRefWrapper(ctx, next);
        } else {
          return next();
        }

        const localAuthBody = ctx.body as any;
        let authenticatedUserId =
          ctx.state?.user?.id ?? localAuthBody?.user?.id;

        if (!authenticatedUserId && (!ctx.status || ctx.status < 400) && (localAuthBody?.jwt || localAuthBody?.user)) {
          const resolvedUser = await resolveLoginIdentifier(strapi, identifier);
          authenticatedUserId = resolvedUser?.id;
        }

        if (authenticatedUserId && (!ctx.status || ctx.status < 400)) {
          try {
            const didCancelDeletion = await cancelScheduledAccountDeletion(
              strapi,
              authenticatedUserId,
            );

            if (didCancelDeletion) {
              strapi.log?.info(
                `[ACCOUNT-DELETION] Cancelled scheduled deletion on login for user ${authenticatedUserId}`,
              );
              if (localAuthBody?.user) {
                localAuthBody.user = {
                  ...localAuthBody.user,
                  isDeletionPending: false,
                  scheduledDeletionAt: null,
                };
              }
            }
          } catch (cancelError: any) {
            strapi.log?.warn(
              `[ACCOUNT-DELETION] Failed to cancel scheduled deletion on local login for user ${authenticatedUserId}: ${cancelError?.message || cancelError}`,
            );
          }
        } else if ((!ctx.status || ctx.status < 400) && (localAuthBody?.jwt || localAuthBody?.user)) {
          strapi.log?.warn(
            `[ACCOUNT-DELETION] Could not resolve authenticated user for local login identifier: ${String(identifier || "")}`,
          );
        }

        return;
      }

      // If not Google or Facebook provider, we need to call the original callback
      // Try to get it from the plugin service (might be our override, but that's ok for non-google/facebook)
      if (provider !== "google" && provider !== "facebook") {
        console.log(
          "🔵 [CALLBACK] Not Google/Facebook provider, attempting to use original callback"
        );

        // Try stored reference first
        if (originalCallbackRef && typeof originalCallbackRef === "function") {
          console.log("✅ [CALLBACK] Using stored original callback");
          return originalCallbackRef(ctx, next);
        }

        // If not available, try to get it from plugin service
        // Note: This might be our own override, but for non-google/facebook providers it should work
        try {
          const authPlugin = strapi.plugin("users-permissions");
          if (
            authPlugin &&
            authPlugin.controllers &&
            authPlugin.controllers.auth &&
            authPlugin.controllers.auth.callback
          ) {
            const pluginCallback = authPlugin.controllers.auth.callback;
            // Only use if it's not our override (check by comparing functions)
            if (pluginCallback !== plugin.controllers.auth.callback) {
              console.log("✅ [CALLBACK] Using plugin callback");
              return pluginCallback(ctx, next);
            }
          }
        } catch (e: any) {
          console.error(
            "❌ [CALLBACK] Error accessing plugin callback:",
            e.message
          );
        }

        // Last resort: call next() to let Strapi handle it
        console.log(
          "⚠️ [CALLBACK] Falling back to next() for non-Google/Facebook provider"
        );
        return next();
      }

      // From here on, we handle Google and Facebook providers ourselves
      console.log(`🔵 [CALLBACK] Handling ${provider} provider...`);

      // Check if we have a code (needs to be exchanged) or access_token (already have token)
      const authCode = ctx.query?.code;
      let accessToken = ctx.query?.access_token;
      
      if (authCode && !accessToken) {
        console.log("🔵 [CALLBACK] Have authorization code, exchanging for access token...");
        
        // Get OAuth configuration from Strapi store
        const grantSettings = await strapi.store({
          type: 'plugin',
          name: 'users-permissions',
          key: 'grant'
        }).get() as Record<string, { key?: string; secret?: string }> | null;
        
        const providerConfig = grantSettings?.[provider];
        if (!providerConfig || !providerConfig.key || !providerConfig.secret) {
          console.error(`❌ [CALLBACK] ${provider} OAuth not properly configured`);
          throw new Error(`${provider} OAuth not properly configured`);
        }
        
        // Must match Grant's redirect_uri from connect (buildRedirectUri uses server.absoluteUrl)
        const oauthProvidersService = strapi.plugin("users-permissions").service("providers");
        const redirectUri = oauthProvidersService.buildRedirectUri(provider);

        console.log("🔵 [CALLBACK] Exchanging code with redirect_uri:", redirectUri);
        
        // Exchange authorization code for access token
        try {
          let tokenUrl: string;
          let tokenBody: URLSearchParams;
          
          if (provider === 'google') {
            tokenUrl = 'https://oauth2.googleapis.com/token';
            tokenBody = new URLSearchParams({
              code: authCode,
              client_id: providerConfig.key,
              client_secret: providerConfig.secret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            });
          } else if (provider === 'facebook') {
            tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
            tokenBody = new URLSearchParams({
              code: authCode,
              client_id: providerConfig.key,
              client_secret: providerConfig.secret,
              redirect_uri: redirectUri,
            });
          } else {
            throw new Error(`Unsupported provider: ${provider}`);
          }
          
          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenBody.toString(),
          });
          
          const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
          
          if (!tokenResponse.ok || tokenData.error) {
            console.error("❌ [CALLBACK] Token exchange failed:", tokenData);
            throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
          }
          
          accessToken = tokenData.access_token;
          console.log("✅ [CALLBACK] Token exchange successful, got access_token");
        } catch (tokenError: any) {
          console.error("❌ [CALLBACK] Token exchange error:", tokenError);
          throw new Error(`Failed to exchange authorization code: ${tokenError?.message}`);
        }
      }
      
      if (!accessToken) {
        console.error("❌ [CALLBACK] No access token available");
        throw new Error(`No access token received from ${provider}`);
      }
      
      // Fetch userinfo from Google (given_name, family_name, picture) for our custom mapping
      // The providers service returns the user, not the raw profile - we need userinfo for avatar/names
      let googleUserinfo: Record<string, unknown> = {};
      try {
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userinfoRes.ok) {
          googleUserinfo = (await userinfoRes.json()) as Record<string, unknown>;
          strapi.log?.info("🔵 [CALLBACK] Fetched Google userinfo:", {
            hasGivenName: !!googleUserinfo.given_name,
            hasFamilyName: !!googleUserinfo.family_name,
            hasPicture: !!googleUserinfo.picture,
          });
        }
      } catch (userinfoErr: any) {
        strapi.log?.warn("⚠️ [CALLBACK] Could not fetch Google userinfo:", userinfoErr?.message);
      }

      // Use the 'providers' service which has the connect() method
      console.log("🔵 [CALLBACK] Getting user via providers.connect...");
      let providersService: any;
      try {
        providersService = strapi
          .plugin("users-permissions")
          .service("providers");
        
        if (!providersService) {
          throw new Error("providers service not available");
        }
      } catch (serviceError: any) {
        console.error("❌ [CALLBACK] Error accessing providers service:", serviceError);
        strapi.log?.error("Error accessing providers service:", serviceError);
        // Fall back to original callback
        if (originalCallbackRef && typeof originalCallbackRef === "function") {
          return originalCallbackRef(ctx, next);
        }
        throw new Error("OAuth service not available");
      }

      strapi.log?.info(`🔵 Connecting with ${provider} provider using access token...`);

      // Create a modified query with the access_token instead of code
      const queryWithToken = { ...ctx.query, access_token: accessToken };
      delete queryWithToken.code; // Remove the code since we've already exchanged it

      // Connect with provider and get user profile
      let profile: any;
      try {
        profile = await providersService.connect(provider, queryWithToken);
        strapi.log?.info(`✅ Profile retrieved from ${provider}:`, {
          email: profile?.email,
          hasEmail: !!profile?.email,
          profileKeys: profile ? Object.keys(profile) : [],
        });
      } catch (error: any) {
        console.error(`❌ [CALLBACK] Error connecting with ${provider} provider:`, error);
        strapi.log?.error(`❌ Error connecting with ${provider} provider:`, {
          message: error?.message,
          stack: error?.stack,
          error: error,
        });
        // Re-throw to be caught by outer try-catch for proper error redirect
        throw new Error(`Unable to connect with ${provider}: ${error?.message || "Unknown error"}`);
      }

      if (!profile || !profile.email) {
        strapi.log.warn(`❌ No valid profile retrieved from ${provider}:`, {
          profile: profile,
          hasProfile: !!profile,
          hasEmail: !!profile?.email,
        });
        strapi.log.info(
          "Falling back to original callback due to invalid profile"
        );
        if (originalCallbackRef && typeof originalCallbackRef === "function") {
          return originalCallbackRef(ctx, next);
        }
        return ctx.badRequest(`Unable to retrieve profile from ${provider}`);
      }

      strapi.log.info(`${provider} OAuth profile received:`, {
        email: profile.email,
        hasName: !!profile.name,
        displayName: profile.displayName,
      });

      // Extract name information: prefer googleUserinfo (from userinfo API), then profile/user
      let firstName = "";
      let lastName = "";
      const profileImage = (googleUserinfo.picture as string) || (profile as any)?.profileImage || "";

      if (provider === "google") {
        // Prefer userinfo API data (given_name, family_name)
        if (googleUserinfo.given_name) {
          firstName = String(googleUserinfo.given_name).trim();
        }
        if (googleUserinfo.family_name) {
          lastName = String(googleUserinfo.family_name).trim();
        }
        // Fallback: userinfo full "name" (e.g. "Semlimite Producoes") if given_name/family_name missing
        if ((!firstName || !lastName) && googleUserinfo.name && typeof googleUserinfo.name === "string") {
          const fullNameParts = String(googleUserinfo.name).trim().split(/\s+/).filter(Boolean);
          if (fullNameParts.length >= 1 && !firstName) firstName = fullNameParts[0] || "";
          if (fullNameParts.length >= 2 && !lastName) lastName = fullNameParts.slice(1).join(" ") || "";
        }
        // Fallback to profile (from connect - may have firstName/lastName)
        if (!firstName && profile.given_name) firstName = String(profile.given_name).trim();
        if (!lastName && profile.family_name) lastName = String(profile.family_name).trim();
        if (!firstName && (profile as any).firstName) firstName = String((profile as any).firstName).trim();
        if (!lastName && (profile as any).lastName) lastName = String((profile as any).lastName).trim();
        // Nested name object
        if (!firstName && profile.name && typeof profile.name === "object") {
          firstName = (profile.name.givenName || profile.name.firstName || "").trim();
          lastName = (profile.name.familyName || profile.name.lastName || "").trim();
        }
        if (!firstName && profile.displayName) {
          const nameParts = String(profile.displayName).trim().split(/\s+/);
          firstName = nameParts[0] || "";
          lastName = nameParts.slice(1).join(" ") || "";
        }
      } else if (provider === "facebook") {
        // Facebook profile structure: { first_name, last_name, name, email, ... }
        if (profile.first_name) {
          firstName = profile.first_name.trim();
        }
        if (profile.last_name) {
          lastName = profile.last_name.trim();
        }

        // Fallback: split name field if first_name/last_name not available
        if ((!firstName || !lastName) && profile.name) {
          const nameParts = profile.name.trim().split(/\s+/);
          if (!firstName) {
            firstName = nameParts[0] || "";
          }
          if (!lastName && nameParts.length > 1) {
            lastName = nameParts.slice(1).join(" ") || "";
          }
        }
      }

      // Final fallback: use email prefix for firstName
      // Ensure firstName meets minimum length (3 characters) - required by schema
      if (!firstName || firstName.length < 3) {
        const emailPrefix = profile.email
          ? profile.email.split("@")[0]
          : "user";
        firstName =
          emailPrefix.length >= 3
            ? emailPrefix.substring(0, 80)
            : emailPrefix.padEnd(3, "x").substring(0, 80);
      }

      // Ensure lastName meets minimum length (3 characters) - required by schema
      if (!lastName || lastName.length < 3) {
        // If we have a longer firstName, use part of it, otherwise use default
        if (firstName.length > 3) {
          lastName = firstName.substring(0, 30);
        } else {
          lastName = "User"; // Default lastName that meets minLength: 3
        }
      }

      // Trim and limit lengths to match schema constraints
      firstName = firstName.trim().substring(0, 80); // maxLength: 80
      lastName = lastName.trim().substring(0, 30); // maxLength: 30

      strapi.log.info(`Extracted names from ${provider} profile:`, {
        firstName,
        lastName,
        email: profile.email,
        hasFirstName: !!firstName && firstName.length >= 3,
        hasLastName: !!lastName && lastName.length >= 3,
      });

      // Get user service
      const userService = strapi.plugin("users-permissions").service("user");
      const normalizedEmail = String(profile.email || "").trim().toLowerCase();

      strapi.log.info(
        "🔵 Looking for existing user with email:",
        profile.email
      );

      // Look for existing user by email (case-insensitive) to avoid duplicate
      // rows when providers return different casing for the same email.
      const existingUserLookup = await strapi.db.connection("up_users")
        .select("id")
        .whereRaw("LOWER(email) = ?", [normalizedEmail])
        .first();
      const existingUser = existingUserLookup?.id
        ? await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
              where: { id: Number(existingUserLookup.id) },
            })
        : null;

      strapi.log.info("🔵 Existing user check:", {
        found: !!existingUser,
        userId: existingUser?.id,
        username: existingUser?.username,
        provider: existingUser?.provider,
        hasProvidersArray:
          !!(existingUser as any)?.providers &&
          Array.isArray((existingUser as any).providers),
        confirmed: existingUser?.confirmed,
      });

      // 🔐 Security / UX: detect Google OAuth vs existing password account conflicts
      // If a user tries to sign in/up with Google but their email already has a
      // password-based account, we DON'T want to auto-link silently or return a
      // generic "email already taken" error. Instead, when it's safe (email is
      // already confirmed) we surface a specific, user-friendly message that
      // instructs them to log in with email + password first to link accounts.
      if (existingUser && provider === "google") {
        // Heuristics for "password account":
        // - user has a password hash stored
        // - primary provider is local/password (or unset)
        // - Google is NOT already one of the linked providers
        const hasPassword = !!(existingUser as any).password;
        const primaryProvider = (existingUser as any).provider || null;
        const providersArray: string[] = Array.isArray(
          (existingUser as any).providers,
        )
          ? ((existingUser as any).providers as string[])
          : [];
        const hasGoogleLinked =
          primaryProvider === "google" || providersArray.includes("google");

        const isPasswordAccount =
          hasPassword &&
          !hasGoogleLinked &&
          (!primaryProvider ||
            primaryProvider === "local" ||
            primaryProvider === "password");

        // Only reveal this more specific message when the email is already
        // verified/confirmed to avoid account enumeration issues.
        const isEmailVerified = !!existingUser.confirmed;

        if (isPasswordAccount && isEmailVerified) {
          const conflictMessage =
            "It looks like you've already registered with a password. Please sign in using your email and password to link your accounts.";
          strapi.log.warn(
            "🔴 [CALLBACK] Google OAuth conflict with existing password account:",
            {
              userId: existingUser.id,
              email: existingUser.email,
              provider: primaryProvider,
              providersArray,
            },
          );
          // Throwing here will be caught by the outer try/catch, which will
          // redirect back to the frontend with error_description set to this
          // message. The frontend can then display a custom UX message.
          throw new Error(conflictMessage);
        }
      }

      // Prepare user data with firstName, lastName, and profileImage (avatar)
      // For new users, generate unique username. Do not set verified on sign-up; users get verified only by requesting verification.
      const userData: any = {
        email: normalizedEmail,
        confirmed: true, // OAuth users are automatically confirmed
        provider: provider, // Set provider to 'google' or 'facebook'
        firstName: firstName,
        lastName: lastName,
        verified: false, // Verified only via reviewer-verification request, not on sign-up
      };
      if (profileImage && provider === "google") {
        userData.profileImage = profileImage;
      }

      // Generate unique username for new users only
      if (!existingUser) {
        const emailPrefix = normalizedEmail?.split("@")[0] || "user";
        let baseUsername = emailPrefix;
        let username = baseUsername;
        let usernameExists = true;
        let usernameAttempts = 0;

        // Ensure username is unique (required, unique constraint)
        while (usernameExists && usernameAttempts < 10) {
          const existingUserWithUsername = await strapi.db
            .query("plugin::users-permissions.user")
            .findOne({
              where: { username },
            });

          if (!existingUserWithUsername) {
            usernameExists = false;
          } else {
            usernameAttempts++;
            username = `${baseUsername}${usernameAttempts}`;
          }
        }

        userData.username = username;
      }

      let user: any;

      // Handle existing vs new user
      if (existingUser) {
        strapi.log.info("🔵 Updating existing user:", existingUser.id);

        // Existing user: update providers array and names if missing
        const currentProviders = Array.isArray(existingUser.providers)
          ? [...existingUser.providers]
          : [];
        if (!currentProviders.includes(provider)) {
          currentProviders.push(provider);
        }

        // Prepare update data (don't update username or email for existing users)
        const updateData: any = {
          provider: provider, // Set provider to 'google' or 'facebook'
          providers: currentProviders,
          confirmed: true, // Ensure user is confirmed
        };

        // Only refresh names from OAuth when still empty or obvious bootstrap placeholders
        const userEmail = String(
          existingUser.email || profile.email || "",
        ).trim();
        const emailPrefix = userEmail.includes("@")
          ? userEmail.split("@")[0].toLowerCase()
          : "";
        const isPlaceholderFirstName = (value: unknown): boolean => {
          const v = String(value ?? "").trim();
          if (!v) return true;
          if (emailPrefix && v.toLowerCase() === emailPrefix) return true;
          if (v.toLowerCase() === "user" || v === "Utilizador") return true;
          return false;
        };
        const isPlaceholderLastName = (value: unknown): boolean => {
          const v = String(value ?? "").trim();
          if (!v) return true;
          if (v === "User" || v.toLowerCase() === "user") return true;
          if (emailPrefix && v.toLowerCase() === emailPrefix) return true;
          return false;
        };

        if (
          firstName &&
          firstName.length >= 3 &&
          isPlaceholderFirstName(existingUser.firstName)
        ) {
          updateData.firstName = firstName;
          strapi.log.info(
            "🔵 Updating firstName for existing user (placeholder):",
            firstName,
          );
        }
        if (
          lastName &&
          lastName.length >= 3 &&
          isPlaceholderLastName(existingUser.lastName)
        ) {
          updateData.lastName = lastName;
          strapi.log.info(
            "🔵 Updating lastName for existing user (placeholder):",
            lastName,
          );
        }

        // Update profileImage (avatar) from Google if missing
        if (profileImage && provider === "google" && (!existingUser.profileImage || !String(existingUser.profileImage).trim())) {
          updateData.profileImage = profileImage;
          strapi.log.info("🔵 Updating profileImage for existing user from Google");
        }

        strapi.log.info("🔵 Update data:", updateData);

        // Update existing user using Strapi 5 query API
        try {
          user = await strapi.db
            .query("plugin::users-permissions.user")
            .update({
              where: { id: existingUser.id },
              data: updateData,
            });
          strapi.log.info("✅ Existing user updated successfully:", user.id);
          try {
            await cancelScheduledAccountDeletion(strapi, user.id);
          } catch (cancelError: any) {
            strapi.log?.warn(
              `[ACCOUNT-DELETION] Failed to cancel scheduled deletion on OAuth login for user ${user.id}: ${cancelError?.message || cancelError}`,
            );
          }
        } catch (updateError: any) {
          strapi.log.error("❌ Error updating existing user:", updateError);
          throw updateError;
        }
      } else {
        strapi.log.info("🔵 Creating new user with data:", {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          username: userData.username,
        });

        // New user: create with provider data
        userData.providers = [provider];

        // Get default role for new users
        const defaultRole = await strapi.db
          .query("plugin::users-permissions.role")
          .findOne({
            where: { type: "authenticated" },
          });

        if (defaultRole) {
          userData.role = defaultRole.id;
          strapi.log.info("🔵 Using default role:", defaultRole.id);
        } else {
          strapi.log.warn("⚠️ No default role found");
        }

        // firstName and lastName are already validated above to meet schema requirements

        // Use the user service add method for proper validation and hooks
        try {
          strapi.log.info("🔵 Attempting to create user via service...");
          user = await userService.add(userData);
          strapi.log.info("✅ User created successfully via service:", user.id);
        } catch (error: any) {
          strapi.log.error("❌ Error creating user via service:", {
            message: error.message,
            stack: error.stack,
            error: error,
          });
          // Fallback to direct database query if service method fails
          try {
            strapi.log.info("🔵 Attempting to create user via direct query...");
            user = await strapi.db
              .query("plugin::users-permissions.user")
              .create({
                data: userData,
              });
            strapi.log.info("✅ User created successfully via query:", user.id);
          } catch (dbError: any) {
            strapi.log.error("❌ Error creating user via query:", {
              message: dbError.message,
              stack: dbError.stack,
              error: dbError,
            });
            throw new Error("Failed to create user account");
          }
        }
      }

      // Generate JWT token
      strapi.log?.info("🔵 Generating JWT token for user:", user.id);
      let jwt: string;
      try {
        const jwtService = strapi.plugin("users-permissions").service("jwt");
        if (!jwtService || !jwtService.issue) {
          throw new Error("JWT service not available");
        }
        jwt = jwtService.issue({ id: user.id });
        if (!jwt) {
          throw new Error("Failed to generate JWT token");
        }
      } catch (jwtError: any) {
        console.error("❌ [CALLBACK] Error generating JWT token:", jwtError);
        strapi.log?.error("Error generating JWT token:", jwtError);
        throw new Error(`Failed to generate authentication token: ${jwtError?.message || "Unknown error"}`);
      }

      // Get redirect URL from query params (set by original connect request)
      // Check both 'redirect' and 'state' parameters (state is used when passed via Google OAuth)
      let redirectUrl = ctx.query.redirect || ctx.query.state;
      
      // If state is URL-encoded, decode it
      if (redirectUrl && typeof redirectUrl === 'string') {
        try {
          redirectUrl = decodeURIComponent(redirectUrl);
        } catch (e) {
          // If decoding fails, use as-is
        }
      }
      
      // Fallback when redirect/state not passed through OAuth (e.g. from Google callback).
      // Set FRONTEND_URL in .env to your frontend origin.
      if (!redirectUrl && process.env.FRONTEND_URL) {
        redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?provider=${provider}`;
      }

      strapi.log.info("🔵 Redirecting to:", {
        redirectUrl,
        hasJWT: !!jwt,
        userId: user.id,
      });

      // Build the redirect URL with JWT token (matching Strapi's original behavior)
      // The frontend expects jwt as a query parameter
      try {
        const redirect = new URL(redirectUrl);
        redirect.searchParams.set("jwt", jwt);
        redirect.searchParams.set("provider", provider); // Ensure provider is set
        const finalUrl = redirect.toString();
        strapi.log.info("✅ Redirecting to final URL:", finalUrl);

        return ctx.redirect(finalUrl);
      } catch (urlError: any) {
        // If redirect URL is not a valid URL, append jwt as query param
        strapi.log.warn("⚠️ Redirect URL parsing error:", urlError);
        const separator = redirectUrl.includes("?") ? "&" : "?";
        const fallbackUrl = `${redirectUrl}${separator}jwt=${jwt}&provider=${provider}`;
        strapi.log.info("✅ Redirecting to fallback URL:", fallbackUrl);
        return ctx.redirect(fallbackUrl);
      }
    } catch (error: any) {
      // Log the error with full details
      console.error("❌ [CALLBACK] Google OAuth callback error:", error);
      console.error("❌ [CALLBACK] Error message:", error?.message);
      console.error("❌ [CALLBACK] Error stack:", error?.stack);
      
      if (strapi && strapi.log) {
        strapi.log.error("Google OAuth callback error:", error);
        strapi.log.error("Error details:", {
          message: error?.message,
          stack: error?.stack,
          name: error?.name,
          code: error?.code,
        });
      }

      // On error, redirect to frontend with error (matching Strapi's error handling)
      // Check both 'redirect' and 'state' parameters (state is used when passed via Google OAuth)
      let redirectUrl = ctx.query?.redirect || ctx.query?.state;
      
      // If state is URL-encoded, decode it
      if (redirectUrl && typeof redirectUrl === 'string') {
        try {
          redirectUrl = decodeURIComponent(redirectUrl);
        } catch (e) {
          // If decoding fails, use as-is
        }
      }
      
      // Fallback when redirect/state not passed through OAuth. Set FRONTEND_URL in .env.
      if (!redirectUrl && process.env.FRONTEND_URL) {
        redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?provider=${provider || "google"}`;
      }
      
      try {
        const redirect = new URL(redirectUrl);
        redirect.searchParams.set("error", "authentication_failed");
        redirect.searchParams.set(
          "error_description",
          encodeURIComponent(error?.message || "Unable to connect with Google")
        );
        console.log("🔵 [CALLBACK] Redirecting to error URL:", redirect.toString());
        return ctx.redirect(redirect.toString());
      } catch (urlError: any) {
        // If URL construction fails, try to return a JSON error response
        console.error("❌ [CALLBACK] Error constructing redirect URL:", urlError);
        
        // Try fallback error redirect
        try {
          const separator = redirectUrl.includes("?") ? "&" : "?";
          const fallbackUrl = `${redirectUrl}${separator}error=authentication_failed&error_description=${encodeURIComponent(error?.message || `Unable to connect with ${provider}`)}`;
          console.log("🔵 [CALLBACK] Redirecting to fallback error URL:", fallbackUrl);
          return ctx.redirect(fallbackUrl);
        } catch (fallbackError: any) {
          // Last resort: return JSON error response
          console.error("❌ [CALLBACK] All redirect attempts failed:", fallbackError);
          ctx.status = 500;
          ctx.body = {
            data: null,
            error: {
              status: 500,
              name: "InternalServerError",
              message: error?.message || "Internal Server Error",
              details: process.env.NODE_ENV === "development" ? {
                originalError: error?.message,
                stack: error?.stack,
              } : undefined,
            },
          };
          return;
        }
      }
    }
  };

  // Override forgotPassword: block business users; consumer uses localized Shaolin templates
  plugin.controllers.auth.forgotPassword = createConsumerForgotPasswordController(strapi);

  const originalSendEmailConfirmation = plugin.controllers.auth.sendEmailConfirmation;
  if (originalSendEmailConfirmation) {
    plugin.controllers.auth.sendEmailConfirmation = createExtendedSendEmailConfirmationHandler(
      strapi,
      originalSendEmailConfirmation,
    );
  }

  return plugin;
};
