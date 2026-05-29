/**
 * guest-session service
 *
 * Server-side metered access: tracks which content IDs an anonymous guest
 * has already viewed, using a session cookie + IP/UA fingerprint as identity.
 */

import { factories } from '@strapi/strapi';

/** Maximum free content items a guest can view per session. Single source of truth. */
export const GUEST_CONTENT_LIMIT = 10;

export default factories.createCoreService(
  'api::guest-session.guest-session',
  ({ strapi }) => ({
    /**
     * Find an existing guest-session by sessionId, falling back to ipFingerprint.
     * If found by fingerprint (cookie was cleared), updates the sessionId.
     * If nothing found, creates a new session.
     */
    async findOrCreateSession(
      sessionId: string,
      ipFingerprint: string
    ): Promise<any> {
      // 1. Primary lookup: by sessionId (from HttpOnly cookie)
      let session = await strapi.db
        .query('api::guest-session.guest-session')
        .findOne({ where: { sessionId } });

      if (session) {
        // Update fingerprint if it changed (e.g. different network)
        if (session.ipFingerprint !== ipFingerprint) {
          session = await strapi.db
            .query('api::guest-session.guest-session')
            .update({
              where: { id: session.id },
              data: { ipFingerprint, lastAccessAt: new Date().toISOString() },
            });
        }
        return session;
      }

      // 2. Fallback: lookup by fingerprint (guest cleared cookies)
      if (ipFingerprint) {
        session = await strapi.db
          .query('api::guest-session.guest-session')
          .findOne({ where: { ipFingerprint } });

        if (session) {
          // Re-link to the new cookie sessionId
          session = await strapi.db
            .query('api::guest-session.guest-session')
            .update({
              where: { id: session.id },
              data: { sessionId, lastAccessAt: new Date().toISOString() },
            });
          return session;
        }
      }

      // 3. Brand new guest — create session
      return await strapi.db
        .query('api::guest-session.guest-session')
        .create({
          data: {
            sessionId,
            ipFingerprint,
            viewedContentIds: [],
            viewCount: 0,
            lastAccessAt: new Date().toISOString(),
          },
        });
    },

    /**
     * Check whether the guest is allowed to view the given content.
     *
     * Rules:
     * 1. If contentId is already in viewedContentIds → allowed (re-view, no cost)
     * 2. If viewCount < GUEST_CONTENT_LIMIT → append contentId, increment count, allowed
     * 3. Otherwise → denied
     *
     * Returns { allowed, remaining, alreadyViewed }
     */
    async checkAccess(
      session: any,
      contentId: string
    ): Promise<{ allowed: boolean; remaining: number; alreadyViewed: boolean }> {
      const viewedIds: string[] = Array.isArray(session.viewedContentIds)
        ? session.viewedContentIds
        : [];
      const currentCount: number = session.viewCount || 0;

      // Already viewed — free re-access
      if (viewedIds.includes(contentId)) {
        return {
          allowed: true,
          remaining: Math.max(0, GUEST_CONTENT_LIMIT - currentCount),
          alreadyViewed: true,
        };
      }

      // Within quota — grant access and record the view
      if (currentCount < GUEST_CONTENT_LIMIT) {
        const updatedIds = [...viewedIds, contentId];
        const newCount = currentCount + 1;

        await strapi.db
          .query('api::guest-session.guest-session')
          .update({
            where: { id: session.id },
            data: {
              viewedContentIds: updatedIds,
              viewCount: newCount,
              lastAccessAt: new Date().toISOString(),
            },
          });

        return {
          allowed: true,
          remaining: GUEST_CONTENT_LIMIT - newCount,
          alreadyViewed: false,
        };
      }

      // Quota exhausted
      return {
        allowed: false,
        remaining: 0,
        alreadyViewed: false,
      };
    },
  })
);
