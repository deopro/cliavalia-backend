import { activateTrial } from '../../services/subscription';

/**
 * Business lifecycle hooks
 *
 * NOTE: Ownership verification and one-time name change restriction are handled by
 * Document Service middleware (business-update-middleware.ts) which receives the
 * correct context.params.documentId structure. The database lifecycle receives
 * params from the query layer which may use a different structure in Strapi 5.
 *
 * This lifecycle is kept as a fallback when documentId is available (e.g. Admin UI,
 * REST API using documentId in URL). When documentId is missing, validation is
 * skipped since the middleware already ran for our custom PUT /businesses/:id route.
 */

import { errors } from '@strapi/utils';

function generateSlug(text: string): string {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'business';
}

export default {
  beforeCreate(event) {
    // Strapi may pass { data } or the data object directly depending on layer
    const data = event.params?.data ?? event.params;
    if (!data || typeof data !== 'object') return;
    const name = data.name;
    if (!name) return;
    const existingSlug = data.slug != null ? String(data.slug).trim() : '';
    if (!existingSlug) {
      data.slug = generateSlug(name);
    }
  },

  async beforeUpdate(event) {
    const { data, where = {} } = event.params;
    const user = event.state?.user;

    // documentId can be in where (core controller) or at params root (document service)
    const documentId = where.documentId ?? (event.params as { documentId?: string }).documentId;

    // When documentId is missing, our Document Service middleware has already validated.
    // This happens when the custom controller calls documents().update() - the database
    // lifecycle receives a different param structure.
    if (!documentId) {
      return;
    }

    // If no name is being updated, skip name change logic
    if (!data.name) {
      if (user) {
        const existing = await strapi.documents('api::business.business').findOne({
          documentId,
          populate: ['owner'],
        });

        if (existing && existing.owner?.id !== user.id) {
          throw new errors.ForbiddenError('Only the business owner can update this business.');
        }
      }
      return;
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

      data.nameUpdateCount = currentUpdateCount + 1;
    }
  },

  async afterUpdate(event: any) {
    const { data, result } = event;
    const documentId = result?.documentId;
    if (!documentId || !data) return;

    // Activate 60-day Pro trial when a business is approved or verified
    const shouldActivateTrial =
      data.approvalStatus === 'approved' || data.verified === true;

    if (shouldActivateTrial) {
      // Fire-and-forget; errors are caught inside activateTrial
      activateTrial(documentId).catch((err: unknown) => {
        console.error('[Lifecycle] activateTrial failed:', (err as Error)?.message);
      });
    }
  },
};

