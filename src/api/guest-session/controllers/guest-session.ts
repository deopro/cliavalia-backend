/**
 * guest-session controller
 *
 * Exposes two public endpoints consumed by the Nuxt server proxy:
 * - GET  /api/guest-sessions/by-identity — returns current session state
 * - POST /api/guest-sessions/check-access — checks/records a content view
 */

import { factories } from '@strapi/strapi';
import { GUEST_CONTENT_LIMIT } from '../services/guest-session';

/** 1-minute in-memory cache so every review card view doesn't hit the DB. */
let _limitEnabledCache: { value: boolean; expiresAt: number } | null = null;

async function isGuestLimitEnabled(strapi: any): Promise<boolean> {
  const now = Date.now();
  if (_limitEnabledCache && now < _limitEnabledCache.expiresAt) {
    return _limitEnabledCache.value;
  }
  const store = strapi.store({ type: 'core', name: 'site-settings' });
  const stored = await store.get({ key: 'guestLimitEnabled' });
  const value = stored === null ? true : Boolean(stored);
  _limitEnabledCache = { value, expiresAt: now + 60_000 };
  return value;
}

/** Call this when the setting is changed so the cache doesn't lag. */
export function invalidateGuestLimitCache() {
  _limitEnabledCache = null;
}

export default factories.createCoreController(
  'api::guest-session.guest-session',
  ({ strapi }) => ({
    /**
     * GET /api/guest-sessions/by-identity?sessionId=...&ipFingerprint=...
     *
     * Finds or creates the guest session and returns its current state.
     */
    async getByIdentity(ctx) {
      const { sessionId, ipFingerprint } = ctx.query as {
        sessionId?: string;
        ipFingerprint?: string;
      };

      if (!sessionId) {
        return ctx.badRequest('sessionId query parameter is required');
      }

      try {
        // If the guest limit feature is disabled, return unlimited access immediately.
        const limitEnabled = await isGuestLimitEnabled(strapi);
        if (!limitEnabled) {
          return {
            data: {
              viewedContentIds: [],
              viewCount: 0,
              remaining: 999,
              limit: 0,
            },
          };
        }

        const service = strapi.service('api::guest-session.guest-session') as any;
        const session = await service.findOrCreateSession(
          sessionId,
          ipFingerprint || ''
        );

        const viewedContentIds: string[] = Array.isArray(session.viewedContentIds)
          ? session.viewedContentIds
          : [];
        const viewCount: number = session.viewCount || 0;

        return {
          data: {
            viewedContentIds,
            viewCount,
            remaining: Math.max(0, GUEST_CONTENT_LIMIT - viewCount),
            limit: GUEST_CONTENT_LIMIT,
          },
        };
      } catch (error: any) {
        strapi.log.error('guest-session getByIdentity error:', {
          sessionId,
          error: error.message,
        });
        return ctx.internalServerError('Failed to retrieve guest session');
      }
    },

    /**
     * POST /api/guest-sessions/check-access
     * Body: { sessionId, ipFingerprint, contentId }
     *
     * Checks whether the guest may view the given content.
     * If allowed, records the view. Returns the access decision.
     */
    async checkAccess(ctx) {
      const { sessionId, ipFingerprint, contentId } = ctx.request.body as {
        sessionId?: string;
        ipFingerprint?: string;
        contentId?: string;
      };

      if (!sessionId) {
        return ctx.badRequest('sessionId is required');
      }
      if (!contentId) {
        return ctx.badRequest('contentId is required');
      }

      try {
        // If the guest limit feature is disabled, always allow.
        const limitEnabled = await isGuestLimitEnabled(strapi);
        if (!limitEnabled) {
          return {
            data: {
              allowed: true,
              remaining: 999,
              alreadyViewed: false,
              limit: 0,
            },
          };
        }

        const service = strapi.service('api::guest-session.guest-session') as any;
        const session = await service.findOrCreateSession(
          sessionId,
          ipFingerprint || ''
        );
        const result = await service.checkAccess(session, contentId);

        return {
          data: {
            allowed: result.allowed,
            remaining: result.remaining,
            alreadyViewed: result.alreadyViewed,
            limit: GUEST_CONTENT_LIMIT,
          },
        };
      } catch (error: any) {
        strapi.log.error('guest-session checkAccess error:', {
          sessionId,
          contentId,
          error: error.message,
        });
        return ctx.internalServerError('Failed to check content access');
      }
    },
  })
);
