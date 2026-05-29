import type { Core } from '@strapi/strapi';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  cancelScheduledAccountDeletion,
  orphanReviewsForUsers,
  runScheduledAccountDeletionPurge,
  scheduleUserAccountDeletion,
} from './extensions/users-permissions/services/account-deletion';
import { createBusinessUpdateMiddleware } from './utils/business-update-middleware';
import { checkAndExpireTrials, sendTrialWarningSoon } from './api/business/services/subscription';
import { patchCloudinaryProviderForRawPdfs } from './utils/cloudinary-upload-raw-pdf-patch';
import { requestEmailLocaleStorage } from './utils/request-email-locale-context';
import { scheduleConsumerAuthEmailPatches } from './utils/consumer-auth-email-patches';

// Ensure the extension is loaded by importing it
// Strapi 5 auto-loads extensions from src/extensions/, but we import to ensure it's available

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // Document Service middleware for business update (ownership + name-change validation)
    strapi.documents.use(createBusinessUpdateMiddleware(strapi));

    // Ensure proxy trust is enabled for secure cookies behind proxy
    // This is required when Strapi is behind a load balancer/proxy (like Strapi Cloud)
    // that terminates TLS and forwards HTTP requests with X-Forwarded-Proto headers
    if (strapi.server?.app) {
      strapi.server.app.proxy = true;
      console.log('✅ [REGISTER] Proxy trust enabled for secure cookies behind proxy');
    }

    if (strapi.server) {
      strapi.server.use(async (ctx: any, next: any) => {
        const acceptLanguage =
          ctx.get?.('accept-language') ??
          ctx.request?.header?.['accept-language'] ??
          ctx.request?.headers?.['accept-language'];
        const store: { acceptLanguage?: string } = {};
        if (typeof acceptLanguage === 'string' && acceptLanguage.trim()) {
          store.acceptLanguage = acceptLanguage.trim();
        }
        return requestEmailLocaleStorage.run(store, () => next());
      });
      console.log('✅ [REGISTER] Request email locale (Accept-Language) middleware registered');
    }

    if (strapi.server) {
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'DELETE' || !url.startsWith('/api/users/me')) {
          return next();
        }

        const authHeader =
          ctx.request?.header?.authorization ||
          ctx.request?.headers?.authorization ||
          ctx.headers?.authorization;

        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
          return ctx.unauthorized('Unauthorized');
        }

        try {
          const token = authHeader.replace('Bearer ', '').trim();
          const jwtService = strapi.plugin('users-permissions').service('jwt');
          const payload = await jwtService.verify(token);
          const userId = Number(payload?.id || payload?.user?.id || payload);

          if (!Number.isInteger(userId) || userId <= 0) {
            return ctx.unauthorized('Unauthorized');
          }

          const result = await scheduleUserAccountDeletion(
            strapi,
            userId,
            ctx.request?.headers?.['accept-language'],
          );

          ctx.status = 200;
          ctx.body = {
            success: true,
            status: 'pending_deletion',
            gracePeriodDays: ACCOUNT_DELETION_GRACE_DAYS,
            scheduledDeletionAt: result.scheduledDeletionAt,
            alreadyPending: result.alreadyPending,
          };
          return;
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

          strapi.log?.error('[ACCOUNT-DELETION] Early self-delete middleware failed', error);
          return ctx.internalServerError('Failed to schedule account deletion.');
        }
      });

      console.log('✅ [REGISTER] Early DELETE /api/users/me middleware registered');
    }
    
    // Register middleware EARLY to intercept OAuth callbacks BEFORE Grant middleware
    // This runs in register() phase, before plugins load, so it will run FIRST
    if (strapi.server) {
      // Store callback handler reference for bootstrap to set
      (strapi as any).__googleOAuthCallbackHandler = null;
      
      // Register middleware that will intercept the callback
      // We'll handle it directly here or use the handler from bootstrap
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (url.includes('/connect/google/callback') && ctx.method === 'GET') {
          console.log('🔵 [REGISTER MIDDLEWARE] Intercepting Google OAuth callback (running FIRST)');
          
          // Check if callback handler is available (set by bootstrap)
          const callbackHandler = (strapi as any).__googleOAuthCallbackHandler;
          if (callbackHandler && typeof callbackHandler === 'function') {
            console.log('✅ [REGISTER MIDDLEWARE] Using callback handler from bootstrap');
            return callbackHandler(ctx, next);
          } else {
            // Handler not ready yet - this shouldn't happen in normal flow
            // but if it does, we'll let Grant handle it (which will fail)
            // Better to return an error redirect
            console.warn('⚠️ [REGISTER MIDDLEWARE] Callback handler not ready, this should not happen');
            const redirectUrl = ctx.query?.redirect || ctx.query?.state || (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/callback?provider=google` : '');
            if (!redirectUrl) {
              return ctx.badRequest('FRONTEND_URL is not set in .env. Set it for OAuth redirects.');
            }
            try {
              const redirect = new URL(redirectUrl);
              redirect.searchParams.set('error', 'callback_not_initialized');
              return ctx.redirect(redirect.toString());
            } catch {
              return ctx.redirect(`${redirectUrl}?error=callback_not_initialized`);
            }
          }
        }
        return next();
      });
      console.log('✅ [REGISTER] Early callback interception middleware registered (will run FIRST)');

      // Email confirmation: intercept /api/auth/email-confirmation
      // Intercept email confirmation requests to redirect to the correct
      // frontend page for both success and error cases. The Strapi default
      // controller redirects to FRONTEND_URL root on success and returns raw
      // JSON on error — we override both to route business and consumer users
      // to their dedicated verification pages.
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (!url.startsWith('/api/auth/email-confirmation')) {
          return next();
        }

        console.log('🔵 [EMAIL-CONFIRM-MW] Intercepting email confirmation request');

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const confirmationToken = ctx.query?.confirmation;

        // Look up the user BEFORE the controller runs, because
        // on success Strapi clears the confirmationToken field.
        let isBusinessUser = false;
        let preUser: any = null;
        if (confirmationToken) {
          try {
            preUser = await strapi.query('plugin::users-permissions.user').findOne({
              where: { confirmationToken },
              populate: { role: true },
            });
            if (preUser) {
              isBusinessUser = preUser.role?.type === 'business-user';
              console.log(`🔵 [EMAIL-CONFIRM-MW] Pre-lookup: user=${preUser.email}, role=${preUser.role?.type}, isBusinessUser=${isBusinessUser}`);
            } else {
              console.log('🔵 [EMAIL-CONFIRM-MW] Pre-lookup: no user found for token');
            }
          } catch (e: any) {
            console.log(`🔵 [EMAIL-CONFIRM-MW] Pre-lookup error: ${e.message}`);
          }
        }

        // ── Confirmation token TTL check ──────────────────────────────────────
        // Reject expired tokens BEFORE Strapi confirms the user in the DB.
        if (preUser?.confirmationTokenSentAt) {
          const parseDurationMs = (value: string | undefined, fallbackMs: number): number => {
            if (!value) return fallbackMs;
            const match = value.trim().match(/^(\d+)([smhd])$/);
            if (!match) return fallbackMs;
            const amount = parseInt(match[1], 10);
            const unit = match[2];
            const mul: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
            return amount * mul[unit];
          };
          const ttlMs = parseDurationMs(process.env.CONFIRMATION_TOKEN_EXPIRES_IN, 86_400_000); // 24h default
          const age = Date.now() - new Date(preUser.confirmationTokenSentAt).getTime();
          if (age > ttlMs) {
            strapi.log?.warn(`[EMAIL-CONFIRM-MW] Token expired for ${preUser.email} (age ${Math.round(age / 60000)}m)`);
            const redirectUrl = isBusinessUser
              ? `${frontendUrl}/business/verify?status=error&reason=token_expired`
              : `${frontendUrl}/auth/verify?status=error&reason=token_expired`;
            ctx.status = 302;
            ctx.set('Location', redirectUrl);
            ctx.body = `Redirecting to ${redirectUrl}`;
            return;
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Let Strapi's default controller handle the confirmation
        await next();

        console.log(`🔵 [EMAIL-CONFIRM-MW] After controller: status=${ctx.status}, hasBody=${!!ctx.body}`);

        // --- ERROR CASE (400+) ---
        if (ctx.status >= 400) {
          const errorBody = ctx.body?.error || {};
          const errorMessage = errorBody.message || 'Unknown error';
          const isInvalidToken = errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('token');
          const errorParam = isInvalidToken ? 'invalid_token' : 'error';

          console.log(`🔴 [EMAIL-CONFIRM-MW] Error detected: ${ctx.status} - ${errorMessage}`);

          const redirectUrl = isBusinessUser
            ? `${frontendUrl}/business/verify?status=error&reason=${errorParam}`
            : `${frontendUrl}/auth/verify?status=error&reason=${errorParam}`;

          console.log(`🔵 [EMAIL-CONFIRM-MW] Redirecting to: ${redirectUrl}`);
          ctx.status = 302;
          ctx.set('Location', redirectUrl);
          ctx.body = `Redirecting to ${redirectUrl}`;
          return;
        }

        // --- SUCCESS CASE (302 redirect or 200) ---
        if (ctx.status === 302 || ctx.status === 200) {
          // Explicitly clear the token — Strapi 5 does not reliably null it after use.
          if (preUser?.id) {
            try {
              await strapi.db.query('plugin::users-permissions.user').update({
                where: { id: preUser.id },
                data: { confirmationToken: null, confirmationTokenSentAt: null },
              });
            } catch (clearErr: any) {
              strapi.log?.warn(`[EMAIL-CONFIRM-MW] Failed to clear confirmationToken: ${clearErr?.message}`);
            }
          }

          if (isBusinessUser && preUser) {
            // Generate a JWT so the business user is auto-logged-in
            let jwt = '';
            try {
              const jwtService = strapi.plugin('users-permissions').service('jwt');
              jwt = jwtService.issue({ id: preUser.id });
            } catch (e: any) {
              console.log(`🔵 [EMAIL-CONFIRM-MW] JWT generation failed: ${e.message}`);
            }

            const redirectUrl = `${frontendUrl}/business/verify?status=success${jwt ? '&jwt=' + jwt : ''}`;
            console.log(`✅ [EMAIL-CONFIRM-MW] Business success, redirecting to: ${redirectUrl}`);
            ctx.status = 302;
            ctx.set('Location', redirectUrl);
            ctx.body = `Redirecting to ${redirectUrl}`;
            return;
          }

          // Consumer success — redirect to consumer verify-email page
          if (preUser) {
            let jwt = '';
            try {
              const jwtService = strapi.plugin('users-permissions').service('jwt');
              jwt = jwtService.issue({ id: preUser.id });
            } catch (e: any) {
              console.log(`🔵 [EMAIL-CONFIRM-MW] JWT generation failed: ${e.message}`);
            }

            const redirectUrl = `${frontendUrl}/auth/verify-email?success=true${jwt ? '&jwt=' + jwt : ''}`;
            console.log(`✅ [EMAIL-CONFIRM-MW] Consumer success, redirecting to: ${redirectUrl}`);
            ctx.status = 302;
            ctx.set('Location', redirectUrl);
            ctx.body = `Redirecting to ${redirectUrl}`;
            return;
          }

          console.log(`✅ [EMAIL-CONFIRM-MW] Success (unknown user type): status=${ctx.status}`);
        }
      });
      console.log('✅ [REGISTER] Email confirmation redirect middleware registered');

      // ── POST /api/auth/local/register → stamp confirmationTokenSentAt ─────────
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'POST' || !url.startsWith('/api/auth/local/register')) return next();
        await next();
        if (ctx.status < 400) {
          try {
            const email = ctx.request?.body?.email;
            if (email) {
              await strapi.db.query('plugin::users-permissions.user').updateMany({
                where: { email: email.toLowerCase() },
                data: { confirmationTokenSentAt: new Date() },
              });
            }
          } catch (e: any) {
            strapi.log?.warn(`[REGISTER-MW] Failed to stamp confirmationTokenSentAt: ${e.message}`);
          }
        }
      });

      // ── POST /api/auth/local → cancel pending account deletion on successful login ──
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'POST' || !url.startsWith('/api/auth/local')) return next();

        const identifier = String(ctx.request?.body?.identifier || '').trim().toLowerCase();
        await next();

        if (ctx.status >= 400) {
          return;
        }

        const authBody = ctx.body as any;
        if (!authBody?.jwt && !authBody?.user) {
          return;
        }

        try {
          let authenticatedUserId = ctx.state?.user?.id ?? authBody?.user?.id;

          if (!authenticatedUserId && identifier) {
            const resolvedUser = await strapi.db.query('plugin::users-permissions.user').findOne({
              where: {
                $or: [
                  { email: identifier },
                  { username: identifier },
                ],
              },
              select: ['id'],
            });

            authenticatedUserId = resolvedUser?.id;
          }

          if (!authenticatedUserId) {
            strapi.log?.warn(
              `[ACCOUNT-DELETION] Login middleware could not resolve user for identifier: ${identifier}`,
            );
            return;
          }

          const didCancelDeletion = await cancelScheduledAccountDeletion(strapi, authenticatedUserId);

          if (didCancelDeletion) {
            strapi.log?.info(
              `[ACCOUNT-DELETION] Cancelled scheduled deletion on login for user ${authenticatedUserId} via auth middleware`,
            );

            if (authBody?.user) {
              authBody.user = {
                ...authBody.user,
                isDeletionPending: false,
                scheduledDeletionAt: null,
              };
            }
          }
        } catch (e: any) {
          strapi.log?.warn(`[ACCOUNT-DELETION] Login middleware cancellation failed: ${e.message}`);
        }
      });

      // ── POST /api/auth/send-email-confirmation → stamp confirmationTokenSentAt ─
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'POST' || !url.startsWith('/api/auth/send-email-confirmation')) return next();
        await next();
        if (ctx.status < 400) {
          try {
            const email = ctx.request?.body?.email;
            if (email) {
              await strapi.db.query('plugin::users-permissions.user').updateMany({
                where: { email: email.toLowerCase() },
                data: { confirmationTokenSentAt: new Date() },
              });
            }
          } catch (e: any) {
            strapi.log?.warn(`[RESEND-CONFIRM-MW] Failed to stamp confirmationTokenSentAt: ${e.message}`);
          }
        }
      });

      // ── POST /api/auth/forgot-password → stamp resetPasswordTokenSentAt ────────
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'POST' || !url.startsWith('/api/auth/forgot-password')) return next();
        await next();
        if (ctx.status < 400) {
          try {
            const email = ctx.request?.body?.email;
            if (email) {
              await strapi.db.query('plugin::users-permissions.user').updateMany({
                where: { email: email.toLowerCase() },
                data: { resetPasswordTokenSentAt: new Date() },
              });
              strapi.log?.info(`[FORGOT-PW-MW] Stamped resetPasswordTokenSentAt for ${email}`);
            }
          } catch (e: any) {
            strapi.log?.warn(`[FORGOT-PW-MW] Failed to stamp resetPasswordTokenSentAt: ${e.message}`);
          }
        }
      });
      console.log('✅ [REGISTER] forgotPassword stamp middleware registered');

      // ── POST /api/auth/reset-password → TTL check + one-time-use enforcement ───
      const parseDurationMs = (v: string | undefined, fb: number): number => {
        if (!v) return fb;
        const m = v.trim().match(/^(\d+)([smhd])$/);
        if (!m) return fb;
        const mul: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
        return parseInt(m[1], 10) * mul[m[2]];
      };
      strapi.server.use(async (ctx: any, next: any) => {
        const url = ctx.request?.url || ctx.url || '';
        if (ctx.method !== 'POST' || !url.startsWith('/api/auth/reset-password')) return next();
        const code = ctx.request?.body?.code;
        if (code) {
          try {
            const user = await strapi.db.query('plugin::users-permissions.user').findOne({
              where: { resetPasswordToken: code },
              select: ['id', 'email', 'resetPasswordTokenSentAt'],
            });
            if (user?.resetPasswordTokenSentAt) {
              const ttlMs = parseDurationMs(process.env.RESET_PASSWORD_TOKEN_EXPIRES_IN, 3_600_000);
              const age = Date.now() - new Date(user.resetPasswordTokenSentAt).getTime();
              if (age > ttlMs) {
                strapi.log?.warn(`[RESET-PW-MW] Token expired for ${user.email} (age ${Math.round(age / 60000)}m)`);
                ctx.status = 400;
                ctx.body = { error: { status: 400, name: 'ValidationError', message: 'Reset password token has expired. Please request a new one.', details: { error: 'token_expired' } } };
                return;
              }
            }
          } catch (e: any) {
            strapi.log?.warn(`[RESET-PW-MW] TTL check error: ${e.message}`);
          }
        }
        await next();
        // Clear the token after successful use so it cannot be reused
        if (ctx.status < 400 && code) {
          try {
            await strapi.db.query('plugin::users-permissions.user').updateMany({
              where: { resetPasswordToken: code },
              data: { resetPasswordToken: null, resetPasswordTokenSentAt: null },
            });
            console.log('✅ [RESET-PW-MW] Cleared resetPasswordToken after successful use');
          } catch (e: any) {
            strapi.log?.warn(`[RESET-PW-MW] Failed to clear token: ${e.message}`);
          }
        }
      });
      console.log('✅ [REGISTER] resetPassword TTL + one-time-use middleware registered');
    }
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    console.log('🔵 [BOOTSTRAP] Bootstrapping application...');

    patchCloudinaryProviderForRawPdfs(strapi);

    const resolveDeletedUserIds = async (where: any): Promise<number[]> => {
      const directId = where?.id;
      const candidates = [
        directId,
        directId?.$eq,
        directId?.$in,
      ].flat().filter((value) => value !== undefined && value !== null);

      const normalizedDirectIds = candidates
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

      if (normalizedDirectIds.length > 0) {
        return [...new Set(normalizedDirectIds)];
      }

      const matches = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: where || {},
        select: ['id'],
      });

      return matches
        .map((row: any) => Number(row?.id))
        .filter((value: number) => Number.isInteger(value) && value > 0);
    };

    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],
      async beforeDelete(event: any) {
        const userIds = await resolveDeletedUserIds(event?.params?.where);
        if (userIds.length === 0) {
          return;
        }

        await orphanReviewsForUsers(strapi, userIds);
        strapi.log?.info(
          `[ACCOUNT-DELETION] Orphaned reviews before direct user delete for user IDs: ${userIds.join(', ')}`,
        );
      },
      async beforeDeleteMany(event: any) {
        const userIds = await resolveDeletedUserIds(event?.params?.where);
        if (userIds.length === 0) {
          return;
        }

        await orphanReviewsForUsers(strapi, userIds);
        strapi.log?.info(
          `[ACCOUNT-DELETION] Orphaned reviews before bulk user delete for user IDs: ${userIds.join(', ')}`,
        );
      },
    });

    // ── Email plugin diagnostics ──────────────────────────────────────
    try {
      const emailPlugin = strapi.plugin('email');
      const emailConfig = strapi.config.get('plugin::email') as any;
      if (emailPlugin?.provider?.send) {
        const providerName = emailConfig?.provider || '(unknown)';
        const isBrevoApi = typeof providerName === 'string' && providerName.includes('brevo-api');
        console.log(`✅ [BOOTSTRAP] Email plugin loaded — provider: ${isBrevoApi ? 'brevo-api (HTTP)' : providerName}`);
        if (isBrevoApi) {
          console.log('   Brevo API key:', emailConfig?.providerOptions?.apiKey ? emailConfig.providerOptions.apiKey.slice(0, 12) + '...' : '(not set)');
        } else {
          console.log('   SMTP host:', emailConfig?.providerOptions?.host || '(not set)');
          console.log('   SMTP port:', emailConfig?.providerOptions?.port || '(not set)');
          console.log('   SMTP user:', emailConfig?.providerOptions?.auth?.user ? emailConfig.providerOptions.auth.user.slice(0, 6) + '***' : '(not set)');
        }
        console.log('   Default from:', emailConfig?.settings?.defaultFrom || '(not set)');
      } else {
        console.error('❌ [BOOTSTRAP] Email plugin loaded but provider.send() is NOT available!');
        console.error('   Plugin loaded:', !!emailPlugin);
        console.error('   Provider:', emailPlugin?.provider);
        console.error('   Config:', JSON.stringify(emailConfig, null, 2));
      }
    } catch (err: any) {
      console.error('❌ [BOOTSTRAP] Email plugin check failed:', err.message);
    }
    // ──────────────────────────────────────────────────────────────────

    // Consumer auth emails: Strapi defaults use plugin-store templates; re-apply our handlers
    // after any late plugin/controller binds (see consumer-auth-email-patches.ts).
    scheduleConsumerAuthEmailPatches(strapi);

    // ── Sync email confirmation redirect URL in database with FRONTEND_URL ──
    // Strapi stores the "Redirection url" for email confirmation in the plugin
    // store (core_store table), configured via Admin Panel → Settings → Users &
    // Permissions → Advanced Settings. If this DB value is stale (e.g. localhost),
    // the built-in emailConfirmation handler will redirect there.
    // This hook ensures the DB value always matches the FRONTEND_URL env var.
    try {
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl) {
        const advancedSettings = await strapi
          .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
          .get() as Record<string, any> | null;

        if (advancedSettings) {
          const currentRedirect = advancedSettings.email_confirmation_redirection;
          console.log('🔵 [BOOTSTRAP] Email confirmation redirect in DB:', currentRedirect);
          console.log('🔵 [BOOTSTRAP] FRONTEND_URL env var:', frontendUrl);

          // Update if missing, empty, or pointing to localhost
          if (
            !currentRedirect ||
            currentRedirect.includes('localhost') ||
            currentRedirect !== frontendUrl
          ) {
            advancedSettings.email_confirmation_redirection = frontendUrl;
            await strapi
              .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
              .set({ value: advancedSettings });
            console.log(
              '✅ [BOOTSTRAP] Updated email confirmation redirect in DB:',
              currentRedirect, '→', frontendUrl
            );
          } else {
            console.log('✅ [BOOTSTRAP] Email confirmation redirect already correct');
          }

          // Sync JWT token expiration from env — the UI field is hidden.
          // This ensures the store value the JWT service reads always matches the code config.
          const codeExpiry = process.env.JWT_EXPIRES_IN || '30d';
          if (advancedSettings.jwt_token !== codeExpiry) {
            advancedSettings.jwt_token = codeExpiry;
            await strapi
              .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
              .set({ value: advancedSettings });
            console.log('✅ [BOOTSTRAP] Synced JWT token expiration in DB to:', codeExpiry);
          } else {
            console.log('✅ [BOOTSTRAP] JWT token expiration already correct:', codeExpiry);
          }
        } else {
          console.warn('⚠️ [BOOTSTRAP] No advanced settings found in plugin store');
        }
      } else {
        console.warn('⚠️ [BOOTSTRAP] FRONTEND_URL not set — cannot sync email confirmation redirect');
      }
    } catch (syncErr: unknown) {
      console.error('❌ [BOOTSTRAP] Failed to sync email confirmation redirect:', (syncErr as Error)?.message);
    }
    // ──────────────────────────────────────────────────────────────────

    // CRITICAL: Update the stored Google OAuth scope in database to include 'profile'
    // Without this, Google only returns email, not name fields (given_name, family_name)
    try {
      const grantStore = await strapi.store({ type: 'plugin', name: 'users-permissions', key: 'grant' }).get() as Record<string, any> | null;
      if (grantStore && grantStore.google) {
        const currentScope = grantStore.google.scope;
        const requiredScope = 'openid email profile';
        console.log('🔵 [BOOTSTRAP] Current Google OAuth scope in DB:', currentScope);
        if (currentScope !== requiredScope) {
          grantStore.google.scope = requiredScope;
          await strapi.store({ type: 'plugin', name: 'users-permissions', key: 'grant' }).set({ value: grantStore });
          console.log('✅ [BOOTSTRAP] Updated Google OAuth scope in DB to:', requiredScope);
        } else {
          console.log('✅ [BOOTSTRAP] Google OAuth scope already correct:', requiredScope);
        }
      } else {
        console.warn('⚠️ [BOOTSTRAP] No Google OAuth config found in database store');
      }
    } catch (scopeErr: unknown) {
      console.error('❌ [BOOTSTRAP] Failed to update Google OAuth scope:', (scopeErr as Error)?.message);
    }

    // Extend Google OAuth provider to fetch firstname, lastname, avatar from userinfo API
    // Uses providers-registry.add() to override the default Google provider
    try {
      const registry = strapi.plugin('users-permissions').service('providers-registry');
      const existingGoogle = registry.get('google');
      if (existingGoogle) {
        console.log('🔵 [BOOTSTRAP] Existing Google provider grantConfig:', JSON.stringify(existingGoogle.grantConfig, null, 2));
        registry.add('google', {
          ...existingGoogle,
          grantConfig: {
            ...existingGoogle.grantConfig,
            scope: ['openid', 'email', 'profile'], // openid + profile scope provides given_name, family_name, picture
          },
          async authCallback({ accessToken }: { accessToken: string }) {
            console.log('🔵 [PROVIDER authCallback] Called with accessToken:', accessToken ? 'present' : 'missing');
            // Fetch from https://www.googleapis.com/oauth2/v3/userinfo (Google userinfo endpoint)
            const userinfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';
            const response = await fetch(userinfoUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!response.ok) {
              console.error('❌ [PROVIDER authCallback] Userinfo fetch failed:', response.status);
              throw new Error(`Google userinfo failed: ${response.status}`);
            }
            const body = (await response.json()) as Record<string, unknown>;
            console.log('✅ [PROVIDER authCallback] Userinfo response:', JSON.stringify(body, null, 2));
            const email = ((body.email as string) || '').toLowerCase();
            const givenName = (body.given_name as string) || '';
            const familyName = (body.family_name as string) || '';
            // Also try full "name" field if given_name/family_name are missing
            let finalGivenName = givenName;
            let finalFamilyName = familyName;
            if ((!givenName || !familyName) && body.name && typeof body.name === 'string') {
              const nameParts = String(body.name).trim().split(/\s+/).filter(Boolean);
              if (!givenName && nameParts.length >= 1) finalGivenName = nameParts[0] || '';
              if (!familyName && nameParts.length >= 2) finalFamilyName = nameParts.slice(1).join(' ') || '';
              console.log('🔵 [PROVIDER authCallback] Derived names from full name:', { finalGivenName, finalFamilyName });
            }
            const picture = (body.picture as string) || '';
            const username = email ? email.split('@')[0] : String(body.sub || 'user');
            const result = {
              username: username.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255),
              email,
              firstName: finalGivenName || username,
              lastName: finalFamilyName || 'User',
              profileImage: picture || undefined,
            };
            console.log('✅ [PROVIDER authCallback] Returning profile:', result);
            return result;
          },
        });
        console.log('✅ [BOOTSTRAP] Extended Google provider: firstname, lastname, profileImage from userinfo');
      }
    } catch (err: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not extend Google provider:', (err as Error)?.message);
    }

    // Override Google OAuth callback IMMEDIATELY (synchronously) before routes are registered
    // This must happen before Grant middleware registers its routes
    try {
      console.log('🔵 [BOOTSTRAP SYNC] Attempting immediate callback override...');
      const authPlugin = strapi.plugin('users-permissions');
      
      if (authPlugin?.controllers?.auth?.callback) {
        const originalCallback = authPlugin.controllers.auth.callback;
        console.log('✅ [BOOTSTRAP SYNC] Found callback, creating override...');
        
        // Helper function to extract redirect URL from query params
        const getRedirectUrl = (query: any): string => {
          let redirectUrl = query?.redirect || query?.state;
          if (redirectUrl && typeof redirectUrl === 'string') {
            try {
              redirectUrl = decodeURIComponent(redirectUrl);
            } catch (e) {
              // If decoding fails, use as-is
            }
          }
          return redirectUrl || (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/callback?provider=google` : '');
        };

        // Create our custom callback
        const ourCustomCallback = async (ctx: any, next: any) => {
          console.log('🔵🔵🔵 [BOOTSTRAP CALLBACK] CALLBACK OVERRIDE IS RUNNING!!!');
          console.log('🔵 [BOOTSTRAP CALLBACK] Provider from params:', ctx.params?.provider);
          console.log('🔵 [BOOTSTRAP CALLBACK] Query:', JSON.stringify(ctx.query || {}));
          console.log('🔵 [BOOTSTRAP CALLBACK] URL path:', ctx.request?.url || ctx.url);
          
          // Extract provider from params or URL path
          let provider = ctx.params?.provider;
          if (!provider && (ctx.request?.url || ctx.url)) {
            const url = ctx.request?.url || ctx.url || '';
            const urlMatch = url.match(/\/connect\/([^\/]+)\/callback/);
            if (urlMatch && urlMatch[1]) {
              provider = urlMatch[1];
              console.log('🔵 [BOOTSTRAP CALLBACK] Extracted provider from URL:', provider);
            }
          }
          
          // Only override for Google provider
          if (provider !== 'google') {
            console.log('🔵 [BOOTSTRAP CALLBACK] Not Google provider, using original callback');
            return originalCallback(ctx, next);
          }
          
          console.log('🔵 [BOOTSTRAP CALLBACK] Handling Google provider...');
          
          const providersService = strapi.plugin('users-permissions').service('providers');

          // Check if we have a code (needs to be exchanged) or access_token
          const authCode = ctx.query?.code;
          let accessToken = ctx.query?.access_token;
          
          if (authCode && !accessToken) {
            console.log('🔵 [BOOTSTRAP CALLBACK] Have authorization code, exchanging for access token...');
            
            // Get Google OAuth configuration
            const grantSettings = await strapi.store({
              type: 'plugin',
              name: 'users-permissions',
              key: 'grant'
            }).get() as Record<string, { key?: string; secret?: string }> | null;
            
            const googleConfig = grantSettings?.google;
            if (!googleConfig || !googleConfig.key || !googleConfig.secret) {
              console.error('❌ [BOOTSTRAP CALLBACK] Google OAuth not properly configured');
              const redirectUrl = getRedirectUrl(ctx.query);
              try {
                const redirect = new URL(redirectUrl);
                redirect.searchParams.set('error', 'configuration_error');
                return ctx.redirect(redirect.toString());
              } catch (urlError) {
                return ctx.redirect(`${redirectUrl}?error=configuration_error`);
              }
            }
            
            // Must match Grant's redirect_uri from connect (buildRedirectUri uses server.absoluteUrl)
            const redirectUri = providersService.buildRedirectUri('google');
            console.log('🔵 [BOOTSTRAP CALLBACK] Exchanging code with redirect_uri:', redirectUri);

            // Exchange authorization code for access token
            try {
              const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  code: authCode,
                  client_id: googleConfig.key,
                  client_secret: googleConfig.secret,
                  redirect_uri: redirectUri,
                  grant_type: 'authorization_code',
                }).toString(),
              });
              
              const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
              
              if (!tokenResponse.ok || tokenData.error) {
                console.error('❌ [BOOTSTRAP CALLBACK] Token exchange failed:', tokenData);
                throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
              }
              
              accessToken = tokenData.access_token;
              console.log('✅ [BOOTSTRAP CALLBACK] Token exchange successful');
            } catch (tokenError: any) {
              console.error('❌ [BOOTSTRAP CALLBACK] Token exchange error:', tokenError);
              const redirectUrl = getRedirectUrl(ctx.query);
              try {
                const redirect = new URL(redirectUrl);
                redirect.searchParams.set('error', 'token_exchange_failed');
                redirect.searchParams.set(
                  'error_description',
                  encodeURIComponent(tokenError?.message || 'Failed to exchange authorization code'),
                );
                return ctx.redirect(redirect.toString());
              } catch (urlError) {
                return ctx.redirect(`${redirectUrl}?error=token_exchange_failed`);
              }
            }
          }
          
          if (!accessToken) {
            console.error('❌ [BOOTSTRAP CALLBACK] No access token available');
            const redirectUrl = getRedirectUrl(ctx.query);
            try {
              const redirect = new URL(redirectUrl);
              redirect.searchParams.set('error', 'no_token');
              return ctx.redirect(redirect.toString());
            } catch (urlError) {
              return ctx.redirect(`${redirectUrl}?error=no_token`);
            }
          }
          
          // Get user profile using providers service (providersService from token exchange above)
          const queryWithToken = { ...ctx.query, access_token: accessToken };
          delete queryWithToken.code;
          
          let profile: any;
          try {
            profile = await providersService.connect('google', queryWithToken);
            console.log('✅ [BOOTSTRAP CALLBACK] Profile retrieved from Google');
          } catch (error: any) {
            console.error('❌ [BOOTSTRAP CALLBACK] Error connecting with Google:', error);
            const redirectUrl = getRedirectUrl(ctx.query);

            // Build a user-friendly, safe error message that the frontend can show.
            // Default to the original error.message when available so the callback
            // page can distinguish specific cases like "Email is already taken.".
            let errorMessage =
              (error && typeof error.message === 'string' && error.message) ||
              'Unable to connect with Google';

            // In the special case where Strapi reports "Email is already taken.",
            // we want to guide the user to log in with email/password instead of
            // repeatedly attempting Google OAuth. We still keep this message
            // generic enough to avoid leaking which emails are registered.
            if (
              typeof errorMessage === 'string' &&
              errorMessage.toLowerCase().includes('email is already taken')
            ) {
              errorMessage =
                "It looks like you've already registered with a password. Please sign in using your email and password to link your accounts.";
            }

            try {
              const redirect = new URL(redirectUrl);
              redirect.searchParams.set('error', 'authentication_failed');
              redirect.searchParams.set(
                'error_description',
                encodeURIComponent(errorMessage),
              );
              return ctx.redirect(redirect.toString());
            } catch (urlError) {
              const separator = redirectUrl.includes('?') ? '&' : '?';
              return ctx.redirect(
                `${redirectUrl}${separator}error=authentication_failed&error_description=${encodeURIComponent(
                  errorMessage,
                )}`,
              );
            }
          }
          
          if (!profile || !profile.email) {
            console.warn('❌ [BOOTSTRAP CALLBACK] No valid profile retrieved');
            const redirectUrl = getRedirectUrl(ctx.query);
            try {
              const redirect = new URL(redirectUrl);
              redirect.searchParams.set('error', 'no_profile');
              return ctx.redirect(redirect.toString());
            } catch (urlError) {
              return ctx.redirect(`${redirectUrl}?error=no_profile`);
            }
          }
          
          // Fetch Google userinfo (given_name, family_name) — connect() may not return them when using access_token
          let googleUserinfo: Record<string, unknown> = {};
          try {
            const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userinfoRes.ok) {
              googleUserinfo = (await userinfoRes.json()) as Record<string, unknown>;
              console.log('✅ [BOOTSTRAP CALLBACK] Fetched Google userinfo - FULL RESPONSE:', JSON.stringify(googleUserinfo, null, 2));
              console.log('✅ [BOOTSTRAP CALLBACK] Userinfo fields:', {
                given_name: googleUserinfo.given_name || '(empty)',
                family_name: googleUserinfo.family_name || '(empty)',
                name: googleUserinfo.name || '(empty)',
                email: googleUserinfo.email || '(empty)',
              });
            } else {
              console.error('❌ [BOOTSTRAP CALLBACK] Userinfo fetch failed with status:', userinfoRes.status);
            }
          } catch (userinfoErr: unknown) {
            console.warn('⚠️ [BOOTSTRAP CALLBACK] Could not fetch Google userinfo:', (userinfoErr as Error)?.message);
          }
          const _gn = googleUserinfo.given_name ? String(googleUserinfo.given_name).trim() : '';
          const _fn = googleUserinfo.family_name ? String(googleUserinfo.family_name).trim() : '';
          
          // Extract firstName and lastName: prefer userinfo API (given_name, family_name), then userinfo.name (full name)
          let firstName = _gn || profile.given_name || profile.first_name || '';
          let lastName = _fn || profile.family_name || profile.last_name || '';
          if ((!firstName || !lastName) && googleUserinfo.name && typeof googleUserinfo.name === 'string') {
            const fullName = String(googleUserinfo.name).trim().split(/\s+/).filter(Boolean);
            if (fullName.length >= 1 && !firstName) firstName = fullName[0] || '';
            if (fullName.length >= 2 && !lastName) lastName = fullName.slice(1).join(' ') || '';
          }
          if (!firstName && profile.name && typeof profile.name === 'object') {
            firstName = profile.name.givenName || profile.name.firstName || '';
            lastName = profile.name.familyName || profile.name.lastName || '';
          }
          if ((!firstName || !lastName) && profile.name && typeof profile.name === 'string') {
            const profileNameParts = String(profile.name).trim().split(/\s+/).filter(Boolean);
            if (profileNameParts.length >= 1 && !firstName) firstName = profileNameParts[0] || '';
            if (profileNameParts.length >= 2 && !lastName) lastName = profileNameParts.slice(1).join(' ') || '';
          }
          if (!firstName && profile.displayName) {
            const nameParts = profile.displayName.trim().split(/\s+/);
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          }
          
          // DEBUG: Log what we extracted before fallbacks
          console.log('🔵 [BOOTSTRAP CALLBACK] Profile object keys:', Object.keys(profile || {}));
          console.log('🔵 [BOOTSTRAP CALLBACK] Profile fields:', {
            given_name: profile?.given_name || '(empty)',
            family_name: profile?.family_name || '(empty)',
            first_name: profile?.first_name || '(empty)',
            last_name: profile?.last_name || '(empty)',
            name: typeof profile?.name === 'string' ? profile.name : JSON.stringify(profile?.name) || '(empty)',
            displayName: profile?.displayName || '(empty)',
          });
          console.log('🔵 [BOOTSTRAP CALLBACK] Extracted names BEFORE fallback:', { firstName, lastName });
          
          if (!firstName || firstName.length < 3) {
            const emailPrefix = profile.email ? profile.email.split('@')[0] : 'user';
            firstName = emailPrefix.length >= 3 ? emailPrefix.substring(0, 80) : emailPrefix.padEnd(3, 'x').substring(0, 80);
          }
          
          if (!lastName || lastName.length < 3) {
            if (firstName.length > 3) {
              lastName = firstName.substring(0, 30);
            } else {
              lastName = 'User';
            }
          }
          
          firstName = firstName.trim().substring(0, 80);
          lastName = lastName.trim().substring(0, 30);
          console.log('🔵 [BOOTSTRAP CALLBACK] FINAL names AFTER fallback (will be saved to DB):', { firstName, lastName });
          
          // Get or create user
          const userService = strapi.plugin('users-permissions').service('user');
          const normalizedEmail = String(profile.email || '').trim().toLowerCase();
          const existingUserLookup = await strapi.db.connection('up_users')
            .select('id')
            .whereRaw('LOWER(email) = ?', [normalizedEmail])
            .first();
          const existingUser = existingUserLookup?.id
            ? await strapi.db.query('plugin::users-permissions.user').findOne({
                where: { id: Number(existingUserLookup.id) },
              })
            : null;
          
          let user: any;
          
          if (existingUser) {
            const currentProviders = Array.isArray(existingUser.providers) ? [...existingUser.providers] : [];
            if (!currentProviders.includes('google')) {
              currentProviders.push('google');
            }
            
            const updateData: any = {
              provider: 'google',
              providers: currentProviders,
              confirmed: true,
            };
            // Always refresh firstName/lastName from Google so we correct placeholder data (e.g. email prefix / "User")
            if (firstName && firstName.length >= 3) {
              updateData.firstName = firstName;
            }
            if (lastName && lastName.length >= 3) {
              updateData.lastName = lastName;
            }
            const willUpdateFirst = !!updateData.firstName;
            const willUpdateLast = !!updateData.lastName;
            
            user = await strapi.db.query('plugin::users-permissions.user').update({
              where: { id: existingUser.id },
              data: updateData,
            });
          } else {
            const emailPrefix = normalizedEmail?.split('@')[0] || 'user';
            let baseUsername = emailPrefix;
            let username = baseUsername;
            let usernameExists = true;
            let usernameAttempts = 0;
            
            while (usernameExists && usernameAttempts < 10) {
              const existingUserWithUsername = await strapi.db.query('plugin::users-permissions.user').findOne({
                where: { username },
              });
              
              if (!existingUserWithUsername) {
                usernameExists = false;
              } else {
                usernameAttempts++;
                username = `${baseUsername}${usernameAttempts}`;
              }
            }
            
            const defaultRole = await strapi.db.query('plugin::users-permissions.role').findOne({
              where: { type: 'authenticated' },
            });
            
            const userData: any = {
              email: normalizedEmail,
              username: username,
              confirmed: true,
              provider: 'google',
              providers: ['google'],
              firstName: firstName,
              lastName: lastName,
            };
            
            if (defaultRole) {
              userData.role = defaultRole.id;
            }
            
            try {
              user = await userService.add(userData);
            } catch (error: any) {
              user = await strapi.db.query('plugin::users-permissions.user').create({
                data: userData,
              });
            }
          }
          
          try {
            const didCancelDeletion = await cancelScheduledAccountDeletion(strapi, user.id);
            if (didCancelDeletion) {
              console.log(`[ACCOUNT-DELETION] Cancelled scheduled deletion on Google login for user ${user.id}`);
            }
          } catch (cancelError: any) {
            console.warn(
              `[ACCOUNT-DELETION] Failed to cancel scheduled deletion on Google login for user ${user.id}: ${cancelError?.message || cancelError}`,
            );
          }

          // Generate JWT token
          const jwtService = strapi.plugin('users-permissions').service('jwt');
          const jwt = jwtService.issue({ id: user.id });
          
          // Get redirect URL
          const redirectUrl = getRedirectUrl(ctx.query);
          
          console.log('🔵 [BOOTSTRAP CALLBACK] Redirecting to:', redirectUrl);
          
          // Build redirect URL with JWT token
          try {
            const redirect = new URL(redirectUrl);
            redirect.searchParams.set('jwt', jwt);
            redirect.searchParams.set('provider', 'google');
            return ctx.redirect(redirect.toString());
          } catch (urlError: any) {
            const separator = redirectUrl.includes('?') ? '&' : '?';
            const fallbackUrl = `${redirectUrl}${separator}jwt=${jwt}&provider=google`;
            return ctx.redirect(fallbackUrl);
          }
        };
        
        // Override the callback immediately
        authPlugin.controllers.auth.callback = ourCustomCallback;
        console.log('✅ [BOOTSTRAP SYNC] Google OAuth callback override applied successfully');
        
        // Store callback handler for middleware to use
        (strapi as any).__googleOAuthCallbackHandler = ourCustomCallback;
        
        // Register middleware that intercepts BEFORE Grant middleware
        // This must be registered AFTER the callback is ready
        strapi.server.use(async (ctx: any, next: any) => {
          const url = ctx.request?.url || ctx.url || '';
          if (url.includes('/connect/google/callback') && ctx.method === 'GET') {
            console.log('🔵 [BOOTSTRAP MIDDLEWARE] Intercepting Google OAuth callback');
            
            // Use our custom callback handler
            const callbackHandler = (strapi as any).__googleOAuthCallbackHandler;
            if (callbackHandler && typeof callbackHandler === 'function') {
              return callbackHandler(ctx, next);
            } else {
              console.warn('⚠️ [BOOTSTRAP MIDDLEWARE] Callback handler not available');
            }
          }
          return next();
        });
        
        // Also register a route handler to ensure it takes precedence
        try {
          strapi.server.routes([
            {
              method: 'GET',
              path: '/api/connect/google/callback',
              handler: ourCustomCallback,
              config: { auth: false }
            }
          ]);
          console.log('✅ [BOOTSTRAP SYNC] Custom route handler registered');
        } catch (routeError: any) {
          console.warn('⚠️ [BOOTSTRAP SYNC] Could not register custom route:', routeError.message);
        }
        
        console.log('✅ [BOOTSTRAP SYNC] Google OAuth callback override and middleware registered');
      } else {
        console.warn('⚠️ [BOOTSTRAP SYNC] Auth plugin or callback not found');
      }
    } catch (error: any) {
      console.error('❌ [BOOTSTRAP SYNC] Error applying callback override:', error);
    }
    
    // Handle business_claims status to claimStatus migration
    try {
      console.log('🔵 [BOOTSTRAP] Checking for business_claims status migration...');
      const knex = strapi.db.connection;
      
      // Check if we need to migrate data
      const hasOldColumn = await knex.schema.hasColumn('business_claims', 'status');
      const hasNewColumn = await knex.schema.hasColumn('business_claims', 'claim_status');
      
      if (hasOldColumn && !hasNewColumn) {
        console.log('🔵 [BOOTSTRAP] Migrating status -> claim_status in business_claims...');
        await knex.schema.alterTable('business_claims', (table: any) => {
          table.renameColumn('status', 'claim_status');
        });
        console.log('✅ [BOOTSTRAP] Column renamed successfully');
      } else if (hasOldColumn && hasNewColumn) {
        // Both columns exist - copy data from old to new, then drop old
        console.log('🔵 [BOOTSTRAP] Both columns exist, copying data...');
        await knex.raw('UPDATE business_claims SET claim_status = status WHERE claim_status IS NULL OR claim_status = ""');
        console.log('✅ [BOOTSTRAP] Data copied from status to claim_status');
      } else if (hasNewColumn) {
        console.log('✅ [BOOTSTRAP] Column claim_status already exists');
      } else {
        console.log('⚠️ [BOOTSTRAP] Neither status nor claim_status column found - Strapi will create it');
      }
    } catch (migrationError: any) {
      console.warn('⚠️ [BOOTSTRAP] Migration check failed (this is okay on first run):', migrationError.message);
    }
    
    // Override Google OAuth callback immediately and also after delay
    // First attempt: try immediately
    try {
      console.log('🔵 [BOOTSTRAP IMMEDIATE] Attempting immediate callback override...');
      const authPluginImmediate = strapi.plugin('users-permissions');
      if (authPluginImmediate?.controllers?.auth?.callback) {
        const originalCallbackImmediate = authPluginImmediate.controllers.auth.callback;
        console.log('✅ [BOOTSTRAP IMMEDIATE] Found callback, will override after routes are ready');
      }
    } catch (e: any) {
      console.log('⚠️ [BOOTSTRAP IMMEDIATE] Immediate override not possible:', e.message);
    }
    
    // Override Google OAuth callback after Strapi is fully loaded
    // Use setTimeout to ensure this runs after all plugins are fully initialized
    setTimeout(() => {
      try {
        console.log('🔵 [BOOTSTRAP TIMEOUT] Attempting to override callback after delay...');
        
        // Try multiple ways to access the plugin
        const authPlugin = strapi.plugin('users-permissions');
        const pluginDirect = strapi.plugins['users-permissions'];
        
        console.log('🔵 [BOOTSTRAP TIMEOUT] Plugin access:', {
          viaPlugin: !!authPlugin,
          viaPlugins: !!pluginDirect,
          hasControllers: !!(authPlugin?.controllers),
          hasAuthController: !!(authPlugin?.controllers?.auth),
          hasCallback: !!(authPlugin?.controllers?.auth?.callback)
        });
        
        if (authPlugin && authPlugin.controllers && authPlugin.controllers.auth) {
          const originalCallback = authPlugin.controllers.auth.callback;
          
          if (originalCallback && typeof originalCallback === 'function') {
            console.log('✅ [BOOTSTRAP TIMEOUT] Original callback found, applying override...');
            
            // Store the original callback
            const originalCallbackRef = originalCallback;
          
          // Helper function to extract redirect URL from query params
          const getRedirectUrl = (query: any): string => {
            // Check both 'redirect' and 'state' parameters (state is used when passed via Google OAuth)
            let redirectUrl = query?.redirect || query?.state;
            
            // If state is URL-encoded, decode it
            if (redirectUrl && typeof redirectUrl === 'string') {
              try {
                redirectUrl = decodeURIComponent(redirectUrl);
              } catch (e) {
                // If decoding fails, use as-is
              }
            }
            
            // Fallback from env if no redirect URL found
            return redirectUrl || (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/callback?provider=google` : '');
          };

          // Store our wrapper function reference so we can verify it
          const ourCustomCallback = async (ctx: any, next: any) => {
            console.log('🔵🔵🔵 [BOOTSTRAP CALLBACK] CALLBACK OVERRIDE IS RUNNING!!!');
            console.log('🔵 [BOOTSTRAP CALLBACK] Provider from params:', ctx.params?.provider);
            console.log('🔵 [BOOTSTRAP CALLBACK] Full params:', JSON.stringify(ctx.params || {}));
            console.log('🔵 [BOOTSTRAP CALLBACK] Query:', JSON.stringify(ctx.query || {}));
            console.log('🔵 [BOOTSTRAP CALLBACK] URL path:', ctx.request?.url || ctx.url);
            
            // Extract provider from params or URL path
            let provider = ctx.params?.provider;
            if (!provider && (ctx.request?.url || ctx.url)) {
              // Try to extract from URL path like /api/connect/google/callback
              const url = ctx.request?.url || ctx.url || '';
              const urlMatch = url.match(/\/connect\/([^\/]+)\/callback/);
              if (urlMatch && urlMatch[1]) {
                provider = urlMatch[1];
                console.log('🔵 [BOOTSTRAP CALLBACK] Extracted provider from URL:', provider);
              }
            }
            
            // Only override for Google provider
            if (provider !== 'google') {
              console.log('🔵 [BOOTSTRAP CALLBACK] Not Google provider, using original callback');
              return originalCallbackRef(ctx, next);
            }
            
            console.log('🔵 [BOOTSTRAP CALLBACK] Handling Google provider...');
            
            // Check if we have a code (needs to be exchanged) or access_token (already have token)
            const authCode = ctx.query?.code;
            let accessToken = ctx.query?.access_token;
            
            if (authCode && !accessToken) {
              console.log('🔵 [BOOTSTRAP CALLBACK] Have authorization code, exchanging for access token...');
              
              // Get Google OAuth configuration from Strapi store
              const grantSettings = await strapi.store({
                type: 'plugin',
                name: 'users-permissions',
                key: 'grant'
              }).get() as Record<string, { key?: string; secret?: string }> | null;
              
              const googleConfig = grantSettings?.google;
              if (!googleConfig || !googleConfig.key || !googleConfig.secret) {
                console.error('❌ [BOOTSTRAP CALLBACK] Google OAuth not properly configured');
                const redirectUrl = getRedirectUrl(ctx.query);
                try {
                  const redirect = new URL(redirectUrl);
                  redirect.searchParams.set('error', 'configuration_error');
                  redirect.searchParams.set('error_description', encodeURIComponent('Google OAuth not properly configured'));
                  return ctx.redirect(redirect.toString());
                } catch (urlError) {
                  return ctx.redirect(`${redirectUrl}?error=configuration_error`);
                }
              }
              
              // Must match Grant's redirect_uri from connect (buildRedirectUri uses server.absoluteUrl)
              const oauthProvidersService = strapi.plugin('users-permissions').service('providers');
              const redirectUri = oauthProvidersService.buildRedirectUri('google');

              console.log('🔵 [BOOTSTRAP CALLBACK] Exchanging code with redirect_uri:', redirectUri);
              
              // Exchange authorization code for access token
              try {
                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    code: authCode,
                    client_id: googleConfig.key,
                    client_secret: googleConfig.secret,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                  }).toString(),
                });
                
                const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
                
                if (!tokenResponse.ok || tokenData.error) {
                  console.error('❌ [BOOTSTRAP CALLBACK] Token exchange failed:', tokenData);
                  throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
                }
                
                accessToken = tokenData.access_token;
                console.log('✅ [BOOTSTRAP CALLBACK] Token exchange successful, got access_token');
              } catch (tokenError: any) {
                console.error('❌ [BOOTSTRAP CALLBACK] Token exchange error:', tokenError);
                const redirectUrl = getRedirectUrl(ctx.query);
                try {
                  const redirect = new URL(redirectUrl);
                  redirect.searchParams.set('error', 'token_exchange_failed');
                  redirect.searchParams.set('error_description', encodeURIComponent(tokenError?.message || 'Failed to exchange authorization code'));
                  return ctx.redirect(redirect.toString());
                } catch (urlError) {
                  return ctx.redirect(`${redirectUrl}?error=token_exchange_failed`);
                }
              }
            }
            
            if (!accessToken) {
              console.error('❌ [BOOTSTRAP CALLBACK] No access token available');
              const redirectUrl = getRedirectUrl(ctx.query);
              try {
                const redirect = new URL(redirectUrl);
                redirect.searchParams.set('error', 'no_token');
                redirect.searchParams.set('error_description', encodeURIComponent('No access token received from Google'));
                return ctx.redirect(redirect.toString());
              } catch (urlError) {
                return ctx.redirect(`${redirectUrl}?error=no_token`);
              }
            }
            
            // Now we have an access_token, use it to get user profile
            console.log('🔵 [BOOTSTRAP CALLBACK] Getting user profile with access token...');
            
            // Use the 'providers' service which has the connect() method
            const providersService = strapi.plugin('users-permissions').service('providers');
            
            // Create a modified query with the access_token instead of code
            const queryWithToken = { ...ctx.query, access_token: accessToken };
            delete queryWithToken.code; // Remove the code since we've already exchanged it

            // Connect with Google and get user profile
            let profile: any;
            try {
              profile = await providersService.connect('google', queryWithToken);
              console.log('✅ [BOOTSTRAP CALLBACK] Profile retrieved from Google:', {
                email: profile?.email,
                hasEmail: !!profile?.email
              });
            } catch (error: any) {
              console.error('❌ [BOOTSTRAP CALLBACK] Error connecting with Google provider:', error);
              console.error('❌ [BOOTSTRAP CALLBACK] Error message:', error?.message);
              console.error('❌ [BOOTSTRAP CALLBACK] Error stack:', error?.stack);
              
              // Redirect to frontend with error instead of falling back to original callback
              const redirectUrl = getRedirectUrl(ctx.query);
              try {
                const redirect = new URL(redirectUrl);
                redirect.searchParams.set('error', 'authentication_failed');
                redirect.searchParams.set('error_description', encodeURIComponent(error?.message || 'Unable to connect with Google'));
                return ctx.redirect(redirect.toString());
              } catch (urlError) {
                const separator = redirectUrl.includes('?') ? '&' : '?';
                return ctx.redirect(`${redirectUrl}${separator}error=authentication_failed&error_description=${encodeURIComponent(error?.message || 'Unable to connect with Google')}`);
              }
            }

            if (!profile || !profile.email) {
              console.warn('❌ [BOOTSTRAP CALLBACK] No valid profile retrieved from Google');
              
              // Redirect to frontend with error instead of falling back to original callback
              const redirectUrl = getRedirectUrl(ctx.query);
              try {
                const redirect = new URL(redirectUrl);
                redirect.searchParams.set('error', 'authentication_failed');
                redirect.searchParams.set('error_description', encodeURIComponent('No profile returned from Google'));
                return ctx.redirect(redirect.toString());
              } catch (urlError) {
                const separator = redirectUrl.includes('?') ? '&' : '?';
                return ctx.redirect(`${redirectUrl}${separator}error=authentication_failed&error_description=No+profile+returned+from+Google`);
              }
            }

            // Fetch Google userinfo (given_name, family_name) — connect() may not return them when using access_token
            let googleUserinfo: Record<string, unknown> = {};
            try {
              const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (userinfoRes.ok) {
                googleUserinfo = (await userinfoRes.json()) as Record<string, unknown>;
                console.log('✅ [BOOTSTRAP CALLBACK] Fetched Google userinfo:', {
                  hasGivenName: !!googleUserinfo.given_name,
                  hasFamilyName: !!googleUserinfo.family_name,
                });
              }
            } catch (userinfoErr: unknown) {
              console.warn('⚠️ [BOOTSTRAP CALLBACK] Could not fetch Google userinfo:', (userinfoErr as Error)?.message);
            }
            const _gnDel = googleUserinfo.given_name ? String(googleUserinfo.given_name).trim() : '';
            const _fnDel = googleUserinfo.family_name ? String(googleUserinfo.family_name).trim() : '';

            // Extract firstName and lastName: prefer userinfo API (given_name, family_name), then userinfo.name (full name)
            let firstName = _gnDel || profile.given_name || profile.first_name || '';
            let lastName = _fnDel || profile.family_name || profile.last_name || '';
            if ((!firstName || !lastName) && googleUserinfo.name && typeof googleUserinfo.name === 'string') {
              const fullNameDel = String(googleUserinfo.name).trim().split(/\s+/).filter(Boolean);
              if (fullNameDel.length >= 1 && !firstName) firstName = fullNameDel[0] || '';
              if (fullNameDel.length >= 2 && !lastName) lastName = fullNameDel.slice(1).join(' ') || '';
            }

            // Fallback to nested name object
            if (!firstName && profile.name && typeof profile.name === 'object') {
              firstName = profile.name.givenName || profile.name.firstName || '';
              lastName = profile.name.familyName || profile.name.lastName || '';
            }
            if ((!firstName || !lastName) && profile.name && typeof profile.name === 'string') {
              const profileNamePartsDel = String(profile.name).trim().split(/\s+/).filter(Boolean);
              if (profileNamePartsDel.length >= 1 && !firstName) firstName = profileNamePartsDel[0] || '';
              if (profileNamePartsDel.length >= 2 && !lastName) lastName = profileNamePartsDel.slice(1).join(' ') || '';
            }

            // Fallback to displayName
            if (!firstName && profile.displayName) {
              const nameParts = profile.displayName.trim().split(/\s+/);
              firstName = nameParts[0] || '';
              lastName = nameParts.slice(1).join(' ') || '';
            }

            // Ensure firstName meets minimum length (3 characters) - required by schema
            if (!firstName || firstName.length < 3) {
              const emailPrefix = profile.email ? profile.email.split('@')[0] : 'user';
              firstName = emailPrefix.length >= 3 ? emailPrefix.substring(0, 80) : emailPrefix.padEnd(3, 'x').substring(0, 80);
            }

            // Ensure lastName meets minimum length (3 characters) - required by schema
            if (!lastName || lastName.length < 3) {
              if (firstName.length > 3) {
                lastName = firstName.substring(0, 30);
              } else {
                lastName = 'User'; // Default lastName that meets minLength: 3
              }
            }

            // Trim and limit lengths
            firstName = firstName.trim().substring(0, 80);
            lastName = lastName.trim().substring(0, 30);

            console.log('🔵 [BOOTSTRAP CALLBACK] Extracted names:', { firstName, lastName, email: profile.email });

            // Get user service
            const userService = strapi.plugin('users-permissions').service('user');
            const normalizedEmail = String(profile.email || '').trim().toLowerCase();

            // Look for existing user by email (case-insensitive)
            const existingUserLookup = await strapi.db.connection('up_users')
              .select('id')
              .whereRaw('LOWER(email) = ?', [normalizedEmail])
              .first();
            const existingUser = existingUserLookup?.id
              ? await strapi.db.query('plugin::users-permissions.user').findOne({
                  where: { id: Number(existingUserLookup.id) },
                })
              : null;

            let user: any;

            if (existingUser) {
              console.log('🔵 [BOOTSTRAP CALLBACK] Updating existing user:', existingUser.id);
              
              // Existing user: update providers array and names if missing
              const currentProviders = Array.isArray(existingUser.providers) ? [...existingUser.providers] : [];
              if (!currentProviders.includes('google')) {
                currentProviders.push('google');
              }

              const updateData: any = {
                provider: 'google',
                providers: currentProviders,
                confirmed: true,
              };
              // Always refresh firstName/lastName from Google so we correct placeholder data (e.g. email prefix / "User")
              if (firstName && firstName.length >= 3) {
                updateData.firstName = firstName;
              }
              if (lastName && lastName.length >= 3) {
                updateData.lastName = lastName;
              }
              const willUpdateFirstDel = !!updateData.firstName;
              const willUpdateLastDel = !!updateData.lastName;

              // Update existing user
              user = await strapi.db.query('plugin::users-permissions.user').update({
                where: { id: existingUser.id },
                data: updateData,
              });
              
              console.log('✅ [BOOTSTRAP CALLBACK] Existing user updated successfully:', user.id);
            } else {
              console.log('🔵 [BOOTSTRAP CALLBACK] Creating new user...');
              
              // New user: create with Google data
              // Generate unique username
              const emailPrefix = normalizedEmail?.split('@')[0] || 'user';
              let baseUsername = emailPrefix;
              let username = baseUsername;
              let usernameExists = true;
              let usernameAttempts = 0;
              
              while (usernameExists && usernameAttempts < 10) {
                const existingUserWithUsername = await strapi.db.query('plugin::users-permissions.user').findOne({
                  where: { username },
                });
                
                if (!existingUserWithUsername) {
                  usernameExists = false;
                } else {
                  usernameAttempts++;
                  username = `${baseUsername}${usernameAttempts}`;
                }
              }

              const userData: any = {
                email: normalizedEmail,
                username: username,
                confirmed: true,
                provider: 'google',
                providers: ['google'],
                firstName: firstName,
                lastName: lastName,
              };

              // Get default role for new users
              const defaultRole = await strapi.db.query('plugin::users-permissions.role').findOne({
                where: { type: 'authenticated' },
              });
              
              if (defaultRole) {
                userData.role = defaultRole.id;
              }

              // Create user
              try {
                user = await userService.add(userData);
                console.log('✅ [BOOTSTRAP CALLBACK] User created successfully:', user.id);
              } catch (error: any) {
                console.error('❌ [BOOTSTRAP CALLBACK] Error creating user:', error);
                // Fallback to direct database query
                user = await strapi.db.query('plugin::users-permissions.user').create({
                  data: userData,
                });
                console.log('✅ [BOOTSTRAP CALLBACK] User created via query:', user.id);
              }
            }

            try {
              const didCancelDeletion = await cancelScheduledAccountDeletion(strapi, user.id);
              if (didCancelDeletion) {
                console.log(`[ACCOUNT-DELETION] Cancelled scheduled deletion on Google login for user ${user.id}`);
              }
            } catch (cancelError: any) {
              console.warn(
                `[ACCOUNT-DELETION] Failed to cancel scheduled deletion on Google login for user ${user.id}: ${cancelError?.message || cancelError}`,
              );
            }

            // Generate JWT token
            const jwtService = strapi.plugin('users-permissions').service('jwt');
            const jwt = jwtService.issue({ id: user.id });

            // Get redirect URL from query params
            const redirectUrl = getRedirectUrl(ctx.query);
            
            console.log('🔵 [BOOTSTRAP CALLBACK] Redirecting to:', redirectUrl);
            
            // Build redirect URL with JWT token
            try {
              const redirect = new URL(redirectUrl);
              redirect.searchParams.set('jwt', jwt);
              redirect.searchParams.set('provider', 'google');
              return ctx.redirect(redirect.toString());
            } catch (urlError: any) {
              // Fallback error redirect
              const separator = redirectUrl.includes('?') ? '&' : '?';
              const fallbackUrl = `${redirectUrl}${separator}jwt=${jwt}&provider=google`;
              return ctx.redirect(fallbackUrl);
            }
          };
          
          // Now assign our custom callback
          authPlugin.controllers.auth.callback = ourCustomCallback;
          
          console.log('✅ [BOOTSTRAP TIMEOUT] Google OAuth callback override applied successfully');
          console.log('🔵 [BOOTSTRAP TIMEOUT] Override verification:', {
            controllerExists: !!authPlugin.controllers?.auth,
            callbackIsFunction: typeof authPlugin.controllers.auth.callback === 'function',
            isOurFunction: authPlugin.controllers.auth.callback === ourCustomCallback,
            isOriginal: authPlugin.controllers.auth.callback === originalCallbackRef
          });
            
            // Also register a custom route that takes precedence
            // This ensures our callback runs before Grant middleware
            try {
              // Register middleware that intercepts the callback route
              strapi.server.use(async (ctx: any, next: any) => {
                const url = ctx.request?.url || ctx.url || '';
                if (url.includes('/connect/google/callback') && ctx.method === 'GET') {
                  console.log('🔵 [MIDDLEWARE] Intercepting Google OAuth callback');
                  // Call our custom callback directly
                  return authPlugin.controllers.auth.callback(ctx, next);
                }
                return next();
              });
              
              // Also register as a route for extra safety
              const customRoute = strapi.server.routes([
                {
                  method: 'GET',
                  path: '/api/connect/google/callback',
                  handler: authPlugin.controllers.auth.callback,
                  config: { auth: false }
                }
              ]);
              console.log('✅ [BOOTSTRAP TIMEOUT] Custom route and middleware registered');
            } catch (routeError: any) {
              console.warn('⚠️ [BOOTSTRAP TIMEOUT] Could not register custom route:', routeError.message);
            }
            
            // Also verify the override is set
            setTimeout(() => {
              const currentCallback = authPlugin.controllers.auth.callback;
              console.log('🔵 [BOOTSTRAP VERIFY] Current callback after override:', {
                isFunction: typeof currentCallback === 'function',
                isOriginal: currentCallback === originalCallbackRef,
                isOurOverride: currentCallback !== originalCallbackRef
              });
            }, 1000);
          } else {
            console.warn('⚠️ [BOOTSTRAP TIMEOUT] Original callback not found or invalid');
          }
        } else {
          console.warn('⚠️ [BOOTSTRAP TIMEOUT] Could not find auth plugin or controller');
        }
      } catch (error: any) {
        console.error('❌ [BOOTSTRAP TIMEOUT] Error applying callback override:', error);
        console.error('❌ [BOOTSTRAP TIMEOUT] Error stack:', error.stack);
      }
    }, 2000); // Wait 2 seconds after bootstrap to ensure everything is loaded
    
    // Extend users-permissions plugin to support admin tokens for content API
    setTimeout(() => {
      try {
        console.log('🔵 [BOOTSTRAP] Extending users-permissions plugin for admin token support...');
        
        const usersPermissionsPlugin = strapi.plugin('users-permissions');
        
        if (usersPermissionsPlugin) {
          // Try to extend JWT service
          const jwtService = usersPermissionsPlugin.service('jwt');
          
          if (jwtService && jwtService.verify) {
            const originalVerify = jwtService.verify.bind(jwtService);
            
            jwtService.verify = async (token: string) => {
              try {
                // First try normal JWT verification
                return await originalVerify(token);
              } catch (jwtError: any) {
                // If normal JWT verification fails, try admin token
                try {
                  const adminTokenService = strapi.admin?.services?.token;
                  
                  if (adminTokenService) {
                    console.log(`🔵 [JWT-SERVICE] Attempting to verify admin token`);
                    
                    // Decode the admin JWT token
                    let decoded: any;
                    
                    if (typeof adminTokenService.decode === 'function') {
                      // Try as async first, then sync
                      try {
                        decoded = await adminTokenService.decode(token);
                      } catch {
                        decoded = adminTokenService.decode(token);
                      }
                    } else {
                      // Manual decode: split token and decode base64 payload
                      const parts = token.split('.');
                      if (parts.length === 3) {
                        try {
                          const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
                          decoded = JSON.parse(payload);
                        } catch (parseError) {
                          throw new Error('Failed to decode admin token');
                        }
                      }
                    }
                    
                    if (!decoded || !decoded.id) {
                      throw new Error('Invalid admin token');
                    }
                    
                    // Fetch admin user from database using admin user service
                    const adminUserService = strapi.admin?.services?.user;
                    if (!adminUserService) {
                      throw jwtError;
                    }
                    
                    // Use findOne with just the ID (not wrapped in an object)
                    const adminUser = await adminUserService.findOne(decoded.id);
                    
                    if (adminUser && adminUser.id) {
                      // Valid admin token - get authenticated role
                      const authenticatedRole = await strapi.db
                        .query('plugin::users-permissions.role')
                        .findOne({ where: { type: 'authenticated' } });

                      if (authenticatedRole) {
                        // Return user object that content API can use
                        console.log(`✅ [JWT-SERVICE] Admin token verified: ${adminUser.email}`);
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
            
            console.log('✅ [BOOTSTRAP] Extended JWT service to support admin tokens');
          } else {
            console.log('⚠️ [BOOTSTRAP] JWT service not found or verify method not available');
          }
        } else {
          console.log('⚠️ [BOOTSTRAP] users-permissions plugin not found');
        }
      } catch (error: any) {
        console.error('❌ [BOOTSTRAP] Error extending users-permissions plugin:', error);
      }
    }, 3000); // Wait 3 seconds to ensure plugin is fully loaded

    // ── Auto-grant permissions for location routes (Strapi content type: api::agency.agency) ──
    // Ensures custom location/agency actions are enabled for the Authenticated role
    // without requiring manual admin-panel changes.
    try {
      // Strapi v5 may register action UIDs in different case formats depending
      // on version and plugin behaviour. We try both camelCase and lowercase.
      const agencyActions = [
        'api::agency.agency.myBusinessAgencies',  // kept as-is: Strapi content type UID
        'api::agency.agency.mybusinessagencies',
        'api::agency.agency.update',
        'api::agency.agency.create',
        'api::agency.agency.mySubmissions',
        'api::agency.agency.mysubmissions',
      ];

      const authenticatedRole = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({
          where: { type: 'authenticated' },
          populate: { permissions: true },
        }) as { id: number; permissions: { action: string }[] } | null;

      if (authenticatedRole) {
        const existingActions = new Set(
          (authenticatedRole.permissions ?? []).map((p: { action: string }) => p.action),
        );

        // Log existing location-related permissions for diagnostics
        const agencyPerms = [...existingActions].filter(a => a.includes('agency'));
        console.log('🔵 [BOOTSTRAP] Existing location (agency) permissions:', agencyPerms);

        for (const actionUid of agencyActions) {
          // Skip if already granted (exact match or case-insensitive match)
          const alreadyGranted = existingActions.has(actionUid) ||
            [...existingActions].some(a => a.toLowerCase() === actionUid.toLowerCase());
          if (!alreadyGranted) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: actionUid, role: authenticatedRole.id },
            });
            existingActions.add(actionUid);
            console.log(`✅ [BOOTSTRAP] Granted permission: ${actionUid}`);
          }
        }
      }
    } catch (permError: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not auto-grant location permissions:', (permError as Error)?.message);
    }
    // ─────────────────────────────────────────────────────────────────

    // ── Auto-grant permissions for business gallery routes ────────────
    try {
      const galleryActions = [
        'api::business.business.addGalleryImages',
        'api::business.business.addgalleryimages',
        'api::business.business.removeGalleryImage',
        'api::business.business.removegalleryimage',
        'api::business.business.reorderGallery',
        'api::business.business.reordergallery',
      ];

      // Grant to both 'authenticated' and 'business-user' roles
      for (const roleType of ['authenticated', 'business-user']) {
        const role = await strapi.db
          .query('plugin::users-permissions.role')
          .findOne({
            where: { type: roleType },
            populate: { permissions: true },
          }) as { id: number; permissions: { action: string }[] } | null;

        if (!role) {
          console.log(`⚠️ [BOOTSTRAP] Role '${roleType}' not found, skipping gallery permissions`);
          continue;
        }

        const existingActions = new Set(
          (role.permissions ?? []).map((p: { action: string }) => p.action),
        );

        for (const actionUid of galleryActions) {
          const alreadyGranted =
            existingActions.has(actionUid) ||
            [...existingActions].some(a => a.toLowerCase() === actionUid.toLowerCase());
          if (!alreadyGranted) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: actionUid, role: role.id },
            });
            existingActions.add(actionUid);
            console.log(`✅ [BOOTSTRAP] Granted gallery permission to '${roleType}': ${actionUid}`);
          } else {
            console.log(`✅ [BOOTSTRAP] Gallery permission already granted to '${roleType}': ${actionUid}`);
          }
        }
      }
    } catch (permError: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not auto-grant gallery permissions:', (permError as Error)?.message);
    }

    // ── Auto-grant permissions for custom-upload route ─────────────────
    try {
      const customUploadActions = [
        'api::custom-upload.custom-upload.upload',
        'api::custom-upload.custom-upload.Upload',
      ];

      for (const roleType of ['authenticated', 'business-user']) {
        const role = await strapi.db
          .query('plugin::users-permissions.role')
          .findOne({
            where: { type: roleType },
            populate: { permissions: true },
          }) as { id: number; permissions: { action: string }[] } | null;

        if (!role) {
          console.log(`⚠️ [BOOTSTRAP] Role '${roleType}' not found, skipping custom-upload permissions`);
          continue;
        }

        const existingActions = new Set(
          (role.permissions ?? []).map((p: { action: string }) => p.action),
        );

        for (const actionUid of customUploadActions) {
          const alreadyGranted =
            existingActions.has(actionUid) ||
            [...existingActions].some(a => a.toLowerCase() === actionUid.toLowerCase());
          if (!alreadyGranted) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: actionUid, role: role.id },
            });
            existingActions.add(actionUid);
            console.log(`✅ [BOOTSTRAP] Granted custom-upload permission to '${roleType}': ${actionUid}`);
          } else {
            console.log(`✅ [BOOTSTRAP] custom-upload permission already granted to '${roleType}': ${actionUid}`);
          }
        }
      }
    } catch (permError: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not auto-grant custom-upload permissions:', (permError as Error)?.message);
    }

    // ── Auto-grant permissions for subscription routes ─────────────────
    // Ensures business-user role can call GET /api/subscription/status
    // without requiring manual changes in the Strapi admin panel.
    try {
      const subscriptionActions = [
        'api::subscription.subscription.status',
        'api::subscription.subscription.Status', // try alternate casing
      ];

      const businessUserRole = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({
          where: { type: 'business-user' },
          populate: { permissions: true },
        }) as { id: number; permissions: { action: string }[] } | null;

      if (businessUserRole) {
        const existingActions = new Set(
          (businessUserRole.permissions ?? []).map((p: { action: string }) => p.action),
        );

        const normalizedAction = 'api::subscription.subscription.status';
        const alreadyGranted =
          existingActions.has(normalizedAction) ||
          [...existingActions].some(a => a.toLowerCase() === normalizedAction.toLowerCase());

        if (!alreadyGranted) {
          await strapi.db.query('plugin::users-permissions.permission').create({
            data: { action: normalizedAction, role: businessUserRole.id },
          });
          console.log(`✅ [BOOTSTRAP] Granted subscription.status permission to 'business-user'`);
        } else {
          console.log(`✅ [BOOTSTRAP] subscription.status permission already granted to 'business-user'`);
        }
      } else {
        console.warn(`⚠️ [BOOTSTRAP] Role 'business-user' not found, skipping subscription permissions`);
      }
    } catch (permError: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not auto-grant subscription permissions:', (permError as Error)?.message);
    }
    // ──────────────────────────────────────────────────────────────────

    // ── Auto-grant permissions for review-draft routes ───────────────
    // Ensures authenticated users can create/read/update/delete their own drafts
    // without requiring manual admin-panel changes.
    try {
      const reviewDraftActions = [
        'api::review-draft.review-draft.create',
        'api::review-draft.review-draft.find',
        'api::review-draft.review-draft.findOne',
        'api::review-draft.review-draft.update',
        'api::review-draft.review-draft.delete',
      ];

      const authenticatedRoleForDrafts = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({
          where: { type: 'authenticated' },
          populate: { permissions: true },
        }) as { id: number; permissions: { action: string }[] } | null;

      if (authenticatedRoleForDrafts) {
        const existingDraftActions = new Set(
          (authenticatedRoleForDrafts.permissions ?? []).map((p: { action: string }) => p.action),
        );

        for (const actionUid of reviewDraftActions) {
          const alreadyGranted =
            existingDraftActions.has(actionUid) ||
            [...existingDraftActions].some(a => a.toLowerCase() === actionUid.toLowerCase());
          if (!alreadyGranted) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: actionUid, role: authenticatedRoleForDrafts.id },
            });
            existingDraftActions.add(actionUid);
            console.log(`✅ [BOOTSTRAP] Granted review-draft permission: ${actionUid}`);
          } else {
            console.log(`✅ [BOOTSTRAP] review-draft permission already granted: ${actionUid}`);
          }
        }
      } else {
        console.warn('⚠️ [BOOTSTRAP] authenticated role not found, skipping review-draft permissions');
      }
    } catch (permError: unknown) {
      console.warn('⚠️ [BOOTSTRAP] Could not auto-grant review-draft permissions:', (permError as Error)?.message);
    }
    // ─────────────────────────────────────────────────────────────────

    // ── Subscription cron jobs ─────────────────────────────────────────
    // Catch-up: expire any trials/pro plans that lapsed while the server was down
    try {
      await checkAndExpireTrials();
      console.log('✅ [BOOTSTRAP] Trial expiry catch-up complete');
    } catch (err: unknown) {
      console.error('⚠️ [BOOTSTRAP] Trial expiry catch-up failed:', (err as Error)?.message);
    }

    try {
      const purgeResult = await runScheduledAccountDeletionPurge(strapi);
      console.log(
        `✅ [BOOTSTRAP] Account deletion catch-up complete (deleted: ${purgeResult.finalized}, scrubbed: ${purgeResult.scrubbed})`,
      );
    } catch (err: unknown) {
      console.error('⚠️ [BOOTSTRAP] Account deletion catch-up failed:', (err as Error)?.message);
    }

    // Pure-JS daily scheduler — no external packages required
    const scheduleDailyAtUTC = (hourUTC: number, minuteUTC: number, task: () => void): void => {
      const scheduleNext = () => {
        const now = new Date();
        const next = new Date(Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
          hourUTC, minuteUTC, 0, 0,
        ));
        if (next.getTime() <= now.getTime()) {
          next.setUTCDate(next.getUTCDate() + 1);
        }
        const delay = next.getTime() - now.getTime();
        setTimeout(() => { task(); scheduleNext(); }, delay);
      };
      scheduleNext();
    };

    // Daily at 02:00 UTC — expire trials that have ended
    scheduleDailyAtUTC(2, 0, async () => {
      console.log('[Cron] Running trial expiry check...');
      try {
        await checkAndExpireTrials();
        console.log('[Cron] Trial expiry check complete');
      } catch (err: unknown) {
        console.error('[Cron] Trial expiry check failed:', (err as Error)?.message);
      }
    });

    // Daily at 08:00 UTC — send 3-day trial warning emails
    scheduleDailyAtUTC(8, 0, async () => {
      console.log('[Cron] Running trial warning email job...');
      try {
        await sendTrialWarningSoon();
        console.log('[Cron] Trial warning emails sent');
      } catch (err: unknown) {
        console.error('[Cron] Trial warning email job failed:', (err as Error)?.message);
      }
    });

    scheduleDailyAtUTC(3, 0, async () => {
      console.log('[Cron] Running scheduled account deletion purge...');
      try {
        const purgeResult = await runScheduledAccountDeletionPurge(strapi);
        console.log(
          `[Cron] Scheduled account deletion purge complete (deleted: ${purgeResult.finalized}, scrubbed: ${purgeResult.scrubbed})`,
        );
      } catch (err: unknown) {
        console.error('[Cron] Scheduled account deletion purge failed:', (err as Error)?.message);
      }
    });

    console.log('✅ [BOOTSTRAP] Subscription cron jobs registered');
    // ─────────────────────────────────────────────────────────────────

    // ─── Seed email templates (idempotent — only creates if not exists) ───────
    try {
      const { DEFAULT_TEMPLATES } = await import('./api/email-template/services/email-template-defaults.js');
      for (const tmpl of DEFAULT_TEMPLATES) {
        const existing = await strapi.db.query('api::email-template.email-template').findOne({
          where: { key: tmpl.key, locale: tmpl.locale },
        });
        if (!existing) {
          await strapi.db.query('api::email-template.email-template').create({
            data: {
              key: tmpl.key,
              locale: tmpl.locale,
              subject: tmpl.subject,
              htmlBody: tmpl.htmlBody,
              description: tmpl.description,
              availableVariables: tmpl.availableVariables,
              isActive: true,
            },
          });
        }
      }
      strapi.log.info('[BOOTSTRAP] Email templates seeded successfully');
    } catch (err: any) {
      strapi.log.warn('[BOOTSTRAP] Email template seeding failed:', err.message);
    }
    // ─────────────────────────────────────────────────────────────────
  },
};
