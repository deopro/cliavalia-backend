import crypto from "crypto";
import authController from "./controllers/auth";
import userController from "./controllers/user";
import { ACCOUNT_DELETION_GRACE_DAYS, scheduleUserAccountDeletion } from "./services/account-deletion";
import { getLocalizedEmailText, resolveEmailLocale } from "../../utils/email-locale";
import { renderEmailTemplate } from "../../utils/email-template-renderer";
import { getRequestAcceptLanguage } from "../../utils/request-email-locale-context";
import { consumerSendConfirmationEmail } from "../../utils/consumer-send-confirmation-email";
import { applyConsumerAuthEmailPatches } from "../../utils/consumer-auth-email-patches";

export { consumerSendConfirmationEmail } from "../../utils/consumer-send-confirmation-email";

// Module-level log
console.log("🔵 [MODULE] strapi-server.ts extension file loaded");

// Helper function to capture original callback
function captureOriginalCallback(plugin: any): any {
  if (plugin?.controllers?.auth?.callback) {
    console.log("✅ [INIT] Original callback captured before override");
    return plugin.controllers.auth.callback;
  } else {
    console.log(
      "⚠️ [INIT] Original callback not available yet - will be handled in controller"
    );
    return null;
  }
}

// Helper function to setup deleteMe controller
function setupDeleteMeController(plugin: any): void {
  plugin.controllers.user.deleteMe = async (ctx: any) => {
    const userId = ctx?.state?.user?.id;
    if (!userId) {
      return ctx.unauthorized("Unauthorized");
    }

    try {
      const result = await scheduleUserAccountDeletion(
        strapi,
        userId,
        ctx.request?.headers?.["accept-language"],
      );

      ctx.body = {
        success: true,
        status: "pending_deletion",
        gracePeriodDays: ACCOUNT_DELETION_GRACE_DAYS,
        scheduledDeletionAt: result.scheduledDeletionAt,
        alreadyPending: result.alreadyPending,
      };
    } catch (error: any) {
      if (error?.status === 403) {
        return ctx.forbidden(error.message);
      }
      if (error?.status === 404) {
        return ctx.notFound(error.message);
      }
      if (error?.status === 400) {
        return ctx.badRequest(error.message);
      }

      strapi.log?.error("[ACCOUNT-DELETION] Failed to schedule user deletion", error);
      return ctx.internalServerError("Failed to schedule account deletion.");
    }
  };
}

// Note: Business registration is now handled by a standalone API at src/api/business-auth
// This provides better Strapi 5 compatibility
// Note: Business confirmation email is sent from the controller override in controllers/auth.ts

// Named export function for better error reporting and reduced cognitive complexity
function loadUsersPermissionsExtension(plugin: any): any {
  console.log("🔵 [INIT] Loading users-permissions extension...");

  // Extend the users-permissions plugin to handle admin tokens for content API
  // This allows admin tokens from /admin/login to work with content API endpoints
  // We'll extend the JWT service to also check for admin tokens
  const jwtService = plugin.services?.jwt;
  
  if (jwtService && jwtService.verify) {
    const originalVerify = jwtService.verify.bind(jwtService);
    
    jwtService.verify = async (token: string) => {
      try {
        // First try normal JWT verification
        return await originalVerify(token);
      } catch (jwtError: any) {
        // If normal JWT verification fails, try admin token
        try {
          const adminAuthService = strapi.admin?.services?.auth;
          
          if (adminAuthService) {
            const adminUser = await adminAuthService.verify(token);
            
            if (adminUser && adminUser.id) {
              // Valid admin token - return user-like object for content API
              const authenticatedRole = await strapi.db
                .query('plugin::users-permissions.role')
                .findOne({ where: { type: 'authenticated' } });

              if (authenticatedRole) {
                // Return user object that content API can use
                return {
                  id: adminUser.id,
                  email: adminUser.email,
                  username: adminUser.email,
                  isAdmin: true,
                  role: authenticatedRole,
                };
              }
            }
          }
        } catch (adminError: any) {
          // Not an admin token either - throw original error
          throw jwtError;
        }
        
        // Re-throw original JWT error if admin verification also failed
        throw jwtError;
      }
    };
    
    console.log("✅ [INIT] Extended JWT service to support admin tokens");
  } else {
    console.log("⚠️ [INIT] JWT service not found, trying policy extension");
    
    // Fallback: extend authenticate policy
    const originalAuthenticate = plugin.policies?.authenticate;
    
    if (originalAuthenticate) {
      console.log("🔵 [INIT] Extending authenticate policy to support admin tokens");
      plugin.policies.authenticate = async (ctx: any, next: any) => {
        // Only process content API requests
        const url = ctx.request.url.split('?')[0];
        
        // If this is a content API request and no user is authenticated yet
        if (url.startsWith('/api/') && !url.startsWith('/api/auth/') && !ctx.state.user) {
          const authHeader = ctx.request.header.authorization;
          
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '').trim();
            
            if (token) {
              try {
                // Try to verify as admin token
                const adminAuthService = strapi.admin?.services?.auth;
                
                if (adminAuthService) {
                  console.log(`🔵 [AUTH-POLICY] Attempting to verify admin token for ${url}`);
                  const adminUser = await adminAuthService.verify(token);
                  
                  if (adminUser && adminUser.id) {
                    // Valid admin token - get authenticated role
                    const authenticatedRole = await strapi.db
                      .query('plugin::users-permissions.role')
                      .findOne({ where: { type: 'authenticated' } });

                    if (authenticatedRole) {
                      // Set user context with authenticated role
                      ctx.state.user = {
                        id: adminUser.id,
                        email: adminUser.email,
                        username: adminUser.email,
                        isAdmin: true,
                        role: authenticatedRole,
                      };

                      console.log(`✅ [AUTH-POLICY] Admin token authenticated for content API: ${adminUser.email}`);
                      strapi.log.info(`✅ Admin token authenticated for content API: ${adminUser.email}`);
                      return next();
                    } else {
                      console.log('⚠️ [AUTH-POLICY] Authenticated role not found');
                    }
                  }
                } else {
                  console.log('⚠️ [AUTH-POLICY] Admin auth service not available');
                }
              } catch (error: any) {
                // Not an admin token or verification failed - continue with normal auth
                console.log(`🔵 [AUTH-POLICY] Admin token verification failed: ${error.message}`);
                strapi.log.debug('Admin token verification failed, trying normal auth');
              }
            }
          }
        }
        
        // Continue with original authentication
        return originalAuthenticate(ctx, next);
      };
      
      console.log("✅ [INIT] Extended users-permissions authenticate policy to support admin tokens");
    } else {
      console.log("⚠️ [INIT] authenticate policy not found, cannot extend");
    }
  }

  // Setup self-delete route and controller.
  // The plugin already ships a DELETE /users/me route, so appending another one
  // leaves the built-in route first in precedence and our handler never runs.
  // Replace the existing route in place when present, otherwise add it.
  setupDeleteMeController(plugin);

  const contentApiRoutes = plugin.routes?.["content-api"]?.routes || [];
  const existingDeleteMeRoute = contentApiRoutes.find(
    (route: any) => route?.method === "DELETE" && route?.path === "/users/me",
  );

  if (existingDeleteMeRoute) {
    existingDeleteMeRoute.handler = "user.deleteMe";
    existingDeleteMeRoute.config = {
      ...(existingDeleteMeRoute.config || {}),
      auth: { scope: ["plugin::users-permissions.user"] },
      policies: [],
      middlewares: [],
    };
    console.log("✅ [INIT] Rewired existing DELETE /users/me route to user.deleteMe");
  } else {
    contentApiRoutes.push({
      method: "DELETE",
      path: "/users/me",
      handler: "user.deleteMe",
      config: {
        auth: { scope: ["plugin::users-permissions.user"] },
        policies: [],
        middlewares: [],
      },
    });
    console.log("✅ [INIT] Added custom DELETE /users/me route for user.deleteMe");
  }

  // Store the original callback BEFORE applying our override
  const originalCallback = captureOriginalCallback(plugin);

  // Ensure controllers.auth exists before attaching businessRegister
  if (!plugin.controllers) {
    plugin.controllers = {};
  }
  if (!plugin.controllers.auth) {
    plugin.controllers.auth = {};
  }

  // Business registration is now handled by a standalone API at src/api/business-auth
  // This provides better Strapi 5 compatibility
  console.log("✅ [INIT] Business registration is handled by api::business-auth");

  try {
    // Apply controller extensions (Google OAuth callback override)
    plugin = authController(plugin, originalCallback);
    console.log(
      "✅ [INIT] Google OAuth callback extension loaded successfully"
    );

    if (strapi?.log) {
      strapi.log.info("✅ Google OAuth callback extension loaded successfully");
    }
  } catch (error: unknown) {
    console.error(
      "❌ [INIT] Error loading Google OAuth callback extension:",
      error
    );
    const err = error as any;
    console.error("❌ [INIT] Error stack:", err?.stack);

    if (strapi?.log) {
      strapi.log.error(
        "❌ Error loading Google OAuth callback extension:",
        error
      );
    }
    throw error;
  }

  // Override auth.connect so frontend callback/redirect is used as grant post-OAuth redirect.
  // Strapi's validator only allows same-origin callback; we handle frontend URL by calling grant
  // ourselves with grantConfig[provider].callback set, bypassing validation.
  // NOTE: This MUST be outside the try-catch above so it always runs!
  console.log("🔵 [INIT] Attempting to override auth.connect...");
  console.log("🔵 [INIT] plugin.controllers.auth:", !!plugin.controllers?.auth);
  console.log("🔵 [INIT] plugin.controllers.auth.connect:", typeof plugin.controllers?.auth?.connect);
  const originalConnect = plugin.controllers.auth.connect;
  if (originalConnect && typeof originalConnect === "function") {
    console.log("✅ [INIT] Found originalConnect, applying override...");
    plugin.controllers.auth.connect = async (ctx: any, next: any) => {
      console.log("🔵🔵🔵 [AUTH-CONNECT-OVERRIDE] Override is running!");
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] URL:", ctx.request?.url || ctx.url);
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] Query:", JSON.stringify(ctx.query || {}));
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] Session grant:", JSON.stringify(ctx.session?.grant || {}));
      
      // Callback/redirect/state (state is set by our custom route when initiating OAuth)
      // Also check session.grant.dynamic.callback (grant stores query.callback there)
      let raw = ctx.query?.callback ?? ctx.query?.redirect ?? ctx.query?.state ?? ctx.session?.grant?.dynamic?.callback;
      if (Array.isArray(raw)) raw = raw[0];
      let customCallback: string | undefined = typeof raw === "string" ? raw : undefined;
      if (customCallback) {
        try {
          customCallback = decodeURIComponent(customCallback);
        } catch (_) {
          /* use as-is */
        }
      }
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] customCallback:", customCallback);
      const frontendUrl = process.env.FRONTEND_URL;
      const hostsMatch = (urlA: string, urlB: string) => {
        try {
          const a = new URL(urlA).hostname.replace(/^www\./i, "").toLowerCase();
          const b = new URL(urlB).hostname.replace(/^www\./i, "").toLowerCase();
          return a === b && a.length > 0;
        } catch {
          return false;
        }
      };
      let useFrontendCallback = false;
      if (customCallback && typeof customCallback === "string") {
        try {
          const parsed = new URL(customCallback);
          const callbackHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
          const frontendHost = frontendUrl
            ? new URL(frontendUrl).hostname.replace(/^www\./i, "").toLowerCase()
            : "";
          console.log(
            "🔵 [AUTH-CONNECT-OVERRIDE] callbackHost:",
            callbackHost,
            "frontendHost:",
            frontendHost || "(unset)",
          );
          // cliavalia.com / www and FRONTEND_URL (www vs bare host)
          if (
            callbackHost === "cliavalia.com" ||
            (frontendHost && callbackHost === frontendHost) ||
            (frontendUrl && hostsMatch(customCallback, frontendUrl))
          ) {
            useFrontendCallback = true;
            console.log("✅ [AUTH-CONNECT-OVERRIDE] Using frontend callback!");
          }
        } catch (_) {
          /* ignore */
        }
      }
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] useFrontendCallback:", useFrontendCallback);
      if (useFrontendCallback) {
        const grant = require("grant").koa();
        let providers = (await strapi
          .store({ type: "plugin", name: "users-permissions", key: "grant" })
          .get()) as Record<string, { enabled?: boolean; key?: string; secret?: string }> | null;
        if (!providers || typeof providers !== "object") {
          providers = (await strapi
            .store({ type: "plugin", name: "users-permissions" })
            .get({ key: "grant" })) as Record<string, { enabled?: boolean; key?: string; secret?: string }> | null;
        }
        const apiPrefix = strapi.config.get("api.rest.prefix") || "/api";
        const grantConfig = {
          defaults: { prefix: `${apiPrefix}/connect` },
          ...(providers || {}),
        };
        const [requestPath] = (ctx.request?.url || ctx.url || "").split("?");
        const pathMatch = requestPath.match(/\/connect\/([^/]+)/);
        const provider = pathMatch ? pathMatch[1] : "";
        if (!provider || !(grantConfig as any)[provider]?.enabled) {
          return ctx.badRequest("Google provider is not configured. Enable it in Settings → Users & Permissions → Providers.");
        }
        // Never let DB grant settings override OAuth redirect_uri (must be Strapi API callback).
        delete (grantConfig as any)[provider].redirect_uri;
        grantConfig[provider].transport = "querystring";
        grantConfig[provider].callback = customCallback || "";
        // Pass frontend URL as OAuth state so callback request has it in ctx.query.state
        if (customCallback) (grantConfig as any)[provider].state = customCallback;
        const providersService = strapi.plugin("users-permissions").service("providers");
        const redirectUri = providersService.buildRedirectUri(provider);
        if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) {
          const msg =
            "OAuth redirect_uri is invalid. Set SERVER_URL (or PUBLIC_URL) on the backend to your public Strapi API origin.";
          console.error(`❌ [AUTH-CONNECT-OVERRIDE] ${msg} Got: ${redirectUri || "(empty)"}`);
          strapi.log?.error(`[AUTH-CONNECT-OVERRIDE] ${msg}`);
          return ctx.badRequest(msg);
        }
        grantConfig[provider].redirect_uri = redirectUri;
        console.log("✅ [AUTH-CONNECT-OVERRIDE] Calling grant() with frontend callback:", grantConfig[provider].callback);
        console.log(
          "🔵 [AUTH-CONNECT-OVERRIDE] Google redirect_uri (must be in Google Cloud → Authorized redirect URIs):",
          redirectUri,
        );
        strapi.log?.info(
          `[AUTH-CONNECT-OVERRIDE] Google redirect_uri for Console: ${redirectUri}`,
        );
        return grant(grantConfig)(ctx, next);
      }
      console.log("🔵 [AUTH-CONNECT-OVERRIDE] Not using frontend callback, calling originalConnect");
      return originalConnect(ctx, next);
    };
    console.log("✅ [INIT] auth.connect override applied (frontend callback bypass)");
  } else {
    console.error("❌ [INIT] Could not override auth.connect - originalConnect not found or not a function");
  }

  try {
    // Apply user controller extension (user update override)
    plugin = userController(plugin);
    console.log("✅ [INIT] User controller extension loaded successfully");

    if (strapi?.log) {
      strapi.log.info("✅ User controller extension loaded successfully");
    }
  } catch (error: unknown) {
    console.error("❌ [INIT] Error loading user controller extension:", error);
    const err = error as any;
    console.error("❌ [INIT] Error stack:", err?.stack);

    if (strapi?.log) {
      strapi.log.error("❌ Error loading user controller extension:", error);
    }
    throw error;
  }

  // Override the email confirmation controller to redirect business users correctly
  const originalEmailConfirmation = plugin.controllers.auth.emailConfirmation;
  
  plugin.controllers.auth.emailConfirmation = async (ctx: any) => {
    try {
      // Get the confirmation token from query
      const confirmationToken = ctx.query.confirmation;
      
      if (!confirmationToken) {
        // If no token, let original handle the error
        return originalEmailConfirmation(ctx);
      }
      
      // Find user by confirmation token to check role before confirmation
      const userWithToken = await strapi
        .query("plugin::users-permissions.user")
        .findOne({
          where: { confirmationToken },
          populate: { role: true },
        });
      
      if (!userWithToken) {
        // If user not found, let original handle the error
        return originalEmailConfirmation(ctx);
      }
      
      const roleType = userWithToken?.role?.type || "";
      const isBusinessUser = roleType === "business-user";
      const businessUserRoleId = userWithToken?.role?.id || null;
      
      // Call the original email confirmation (confirms user in DB)
      // Note: the original handler may set ctx.redirect to whatever is stored
      // in the admin panel DB (core_store). We ALWAYS override it below.
      await originalEmailConfirmation(ctx);
      
      // Check if the original handler returned an error (e.g., invalid token)
      // Strapi sets ctx.status = 400 without throwing, so we must check explicitly
      if (ctx.status >= 400) {
        const frontendUrl = process.env.FRONTEND_URL;
        const errorMessage = ctx.body?.error?.message || "Unknown error";
        const isInvalidToken = errorMessage.includes("Invalid token") || errorMessage.includes("invalid");
        
        strapi.log?.error(
          `[EMAIL-CONFIRM] Original handler returned error ${ctx.status}: ${errorMessage}`
        );

        if (frontendUrl) {
          const errorParam = isInvalidToken ? "invalid_token" : "error";
          const redirectUrl = isBusinessUser
            ? `${frontendUrl}/business/verify?status=error&reason=${errorParam}`
            : `${frontendUrl}/auth/verify?status=error&reason=${errorParam}`;
          
          strapi.log?.info(`[EMAIL-CONFIRM] Redirecting to error page: ${redirectUrl}`);
          ctx.status = 302;
          ctx.set("Location", redirectUrl);
          ctx.body = `Redirecting to ${redirectUrl}`;
          return;
        }
        // If no FRONTEND_URL, let the original error response through
        return;
      }

      // CRITICAL: Preserve business-user role after confirmation
      // The original email confirmation might reset the role to default "authenticated"
      if (isBusinessUser && businessUserRoleId) {
        // Fetch user again after confirmation to check if role was changed
        const userAfterConfirmation = await strapi
          .query("plugin::users-permissions.user")
          .findOne({
            where: { id: userWithToken.id },
            populate: { role: true },
          });
        
        // If role was changed, restore it
        if (userAfterConfirmation && userAfterConfirmation.role?.type !== "business-user") {
          strapi.log?.warn(
            `Business user role was reset during email confirmation. Restoring role for user: ${userWithToken.email}`
          );
          await strapi.db
            .query("plugin::users-permissions.user")
            .update({
              where: { id: userWithToken.id },
              data: { role: businessUserRoleId },
            });
        }
      }
      
      // ALWAYS redirect using FRONTEND_URL from env — never rely on the
      // admin-panel DB value (which may be stale / localhost).
      const frontendUrl = process.env.FRONTEND_URL;
      const jwt = ctx.body?.jwt || "";

      strapi.log?.info(
        `[EMAIL-CONFIRM] User ${userWithToken.email} confirmed. ` +
        `Role: ${roleType}, FRONTEND_URL: ${frontendUrl}`
      );

      if (frontendUrl) {
        if (isBusinessUser) {
          const redirectUrl = `${frontendUrl}/business/verify?status=success${jwt ? `&jwt=${jwt}` : ""}`;
          strapi.log?.info(`[EMAIL-CONFIRM] Redirecting business user to: ${redirectUrl}`);
          ctx.status = 302;
          ctx.set("Location", redirectUrl);
          ctx.body = `Redirecting to ${redirectUrl}`;
          return;
        }
        const redirectUrl = `${frontendUrl}/auth/verify-email?success=true${jwt ? `&jwt=${jwt}` : ""}`;
        strapi.log?.info(`[EMAIL-CONFIRM] Redirecting user to: ${redirectUrl}`);
        ctx.status = 302;
        ctx.set("Location", redirectUrl);
        ctx.body = `Redirecting to ${redirectUrl}`;
        return;
      }

      // If FRONTEND_URL is not set, log a warning — the original redirect
      // (which may point to localhost) will be used as a last resort.
      strapi.log?.warn(
        `[EMAIL-CONFIRM] FRONTEND_URL not set! ` +
        `Falling back to original redirect for user: ${userWithToken.email}`
      );
    } catch (error: any) {
      // Instead of throwing and showing raw JSON to the user,
      // redirect to the frontend with error information
      const frontendUrl = process.env.FRONTEND_URL;
      const errorMessage = error?.message || "Unknown error";
      const isInvalidToken = errorMessage.includes("Invalid token") || errorMessage.includes("invalid");
      
      strapi.log?.error(
        `[EMAIL-CONFIRM] Error during email confirmation: ${errorMessage}`
      );

      if (frontendUrl) {
        // Determine if this was a business user attempt
        const confirmationToken = ctx.query.confirmation;
        let isBusinessUser = false;
        
        if (confirmationToken) {
          try {
            const tokenUser = await strapi
              .query("plugin::users-permissions.user")
              .findOne({
                where: { confirmationToken },
                populate: { role: true },
              });
            isBusinessUser = tokenUser?.role?.type === "business-user";
          } catch {
            // Ignore lookup errors — user may already be confirmed (token cleared)
          }
        }

        const errorParam = isInvalidToken ? "invalid_token" : "error";
        if (isBusinessUser) {
          const redirectUrl = `${frontendUrl}/business/verify?status=error&reason=${errorParam}`;
          strapi.log?.info(`[EMAIL-CONFIRM] Redirecting business user to error page: ${redirectUrl}`);
          ctx.status = 302;
          ctx.set("Location", redirectUrl);
          ctx.body = `Redirecting to ${redirectUrl}`;
          return;
        }
        
        const redirectUrl = `${frontendUrl}/auth/verify?status=error&reason=${errorParam}`;
        strapi.log?.info(`[EMAIL-CONFIRM] Redirecting user to error page: ${redirectUrl}`);
        ctx.status = 302;
        ctx.set("Location", redirectUrl);
        ctx.body = `Redirecting to ${redirectUrl}`;
        return;
      }

      // If no FRONTEND_URL, fall back to throwing
      throw error;
    }
  };

  // Override the sendConfirmationEmail service method
  plugin.services.user.sendConfirmationEmail = async (user: any, _options: any = {}) =>
    consumerSendConfirmationEmail(strapi, user, _options);

  // Business registration is now handled by standalone API at src/api/business-auth
  // No need to attach businessRegister controller to users-permissions plugin

  // Token stamping and TTL/one-time-use enforcement for forgotPassword and resetPassword
  // are handled via HTTP middleware in src/index.ts — plugin.controllers.auth references
  // are not guaranteed to be populated at extension load time in Strapi 5.

  // Do NOT add a custom route for /connect/google — let the default auth.connect (our override)
  // handle both GET /api/connect/google and GET /api/connect/google/callback via the grant library,
  // so the frontend callback URL is set from query.callback / query.redirect / query.state.

  applyConsumerAuthEmailPatches(strapi);

  return plugin;
}

export default loadUsersPermissionsExtension;
