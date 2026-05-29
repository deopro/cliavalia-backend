/**
 * Document Service middleware for business update validation.
 *
 * Strapi 5 Document Service middleware receives context.params with documentId and data
 * for update actions. This runs before the database lifecycle and has the correct param structure.
 *
 * The lifecycle (lifecycles.ts) receives params from the database layer which may have
 * a different structure - hence we perform validation here.
 */

import type { Core } from '@strapi/strapi';
import { AsyncLocalStorage } from 'async_hooks';
import { errors } from '@strapi/utils';

export const businessUpdateContext = new AsyncLocalStorage<{ user?: { id: number } }>();

export function createBusinessUpdateMiddleware(strapi: Core.Strapi) {
  return async (context: any, next: () => Promise<any>) => {
    if (context.uid !== 'api::business.business' || context.action !== 'update') {
      return next();
    }

    // Debug logging to understand params structure
    console.log('[BUSINESS-MIDDLEWARE] Running for business update');
    console.log('[BUSINESS-MIDDLEWARE] context.params:', JSON.stringify(context.params, null, 2));
    console.log('[BUSINESS-MIDDLEWARE] context.action:', context.action);
    console.log('[BUSINESS-MIDDLEWARE] context.uid:', context.uid);

    const { documentId, data } = context.params;
    const user = businessUpdateContext.getStore()?.user;
    
    console.log('[BUSINESS-MIDDLEWARE] Extracted documentId:', documentId);
    console.log('[BUSINESS-MIDDLEWARE] Has user from AsyncLocalStorage:', !!user);

    if (!documentId) {
      console.error('[BUSINESS-MIDDLEWARE] ERROR: documentId is missing from context.params');
      console.error('[BUSINESS-MIDDLEWARE] This should not happen - skipping validation');
      // Skip validation when documentId is missing - lifecycle will handle it
      return next();
    }

    // If no name is being updated, only check ownership for other updates
    if (!data?.name) {
      if (user) {
        const existing = await strapi.documents('api::business.business').findOne({
          documentId,
          populate: ['owner'],
        });

        if (existing && existing.owner?.id !== user.id) {
          throw new errors.ForbiddenError('Only the business owner can update this business.');
        }
      }
      return next();
    }

    const existing = await strapi.documents('api::business.business').findOne({
      documentId,
      populate: ['owner'],
    });

    if (!existing) {
      throw new errors.NotFoundError('Business not found.');
    }

    if (user && existing.owner?.id !== user.id) {
      throw new errors.ForbiddenError('Only the business owner can update this business.');
    }

    if (existing.name !== data.name) {
      const currentUpdateCount = existing.nameUpdateCount || 0;

      if (currentUpdateCount >= 1) {
        throw new errors.ValidationError('Business name can only be updated once.');
      }

      (data as Record<string, unknown>).nameUpdateCount = currentUpdateCount + 1;
    }

    return next();
  };
}
