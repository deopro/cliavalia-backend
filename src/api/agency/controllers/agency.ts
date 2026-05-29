/**
 * agency controller
 */

import { factories } from '@strapi/strapi';

function normalizeAgencyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function generateSlug(text: string): string {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'agency';
}

export default factories.createCoreController('api::agency.agency', ({ strapi }) => ({
  /**
   * Return the authenticated user's submitted agencies.
   * GET /api/agencies/my-submissions
   */
  async mySubmissions(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in.');
    }

    try {
      const agencies = await strapi.db.query('api::agency.agency').findMany({
        where: { submittedBy: user.id },
        populate: {
          business: { fields: ['id', 'name', 'slug'] },
          municipality: { fields: ['id', 'name'] },
          province: { fields: ['id', 'name'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      return { data: agencies };
    } catch (error) {
      strapi.log.error('[AGENCY] mySubmissions error:', error);
      return ctx.internalServerError('Error fetching your submitted agencies.');
    }
  },

  /**
   * Search agencies by businessId + municipalityId
   * GET /api/agencies/search?businessId=xxx&municipalityId=yyy
   */
  async search(ctx) {
    const { businessId, municipalityId } = ctx.query as Record<string, string>;

    if (!businessId) {
      return ctx.badRequest('businessId is required');
    }

    try {
      const where: any = { approvalStatus: 'approved' };

      // Resolve businessId (numeric or slug)
      const isNumericBusinessId = /^\d+$/.test(String(businessId));
      let resolvedBusiness: any;
      if (isNumericBusinessId) {
        resolvedBusiness = await strapi.db.query('api::business.business').findOne({
          where: { id: Number.parseInt(businessId, 10) },
        });
      } else {
        resolvedBusiness = await strapi.db.query('api::business.business').findOne({
          where: { slug: businessId },
        });
      }
      if (!resolvedBusiness) {
        return ctx.notFound('Business not found');
      }
      where.business = resolvedBusiness.id;

      if (municipalityId) {
        where.municipality = Number.parseInt(String(municipalityId), 10);
      }

      const agencies = await strapi.db.query('api::agency.agency').findMany({
        where,
        populate: { municipality: { fields: ['id', 'name'] }, province: { fields: ['id', 'name'] } },
        orderBy: { name: 'asc' },
      });

      return { data: agencies };
    } catch (error) {
      strapi.log.error('[AGENCY] search error:', error);
      return ctx.internalServerError('Error searching agencies');
    }
  },

  /**
   * Create a new agency (pending moderation)
   * POST /api/agencies
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to add an agency.');
    }

    const rawData = ctx.request.body?.data ?? ctx.request.body ?? {};

    const {
      name,
      businessId,
      municipalityId,
      provinceId,
      address,
      phone,
      possibleDuplicate: clientFlaggedDuplicate,
    } = rawData as Record<string, any>;

    if (!name || String(name).trim().length < 2) {
      return ctx.badRequest('Agency name is required (minimum 2 characters).');
    }
    if (!businessId) {
      return ctx.badRequest('businessId is required.');
    }
    if (!municipalityId) {
      return ctx.badRequest('municipalityId is required.');
    }

    const normalizedName = normalizeAgencyName(String(name));

    try {
      // Resolve business
      const isNumericBId = /^\d+$/.test(String(businessId));
      const business = isNumericBId
        ? await strapi.db.query('api::business.business').findOne({ where: { id: Number.parseInt(businessId, 10) } })
        : await strapi.db.query('api::business.business').findOne({ where: { slug: businessId } });

      if (!business) {
        return ctx.notFound('Business not found.');
      }

      // Only approved businesses can have agencies submitted against them
      if (business.approvalStatus && business.approvalStatus !== 'approved') {
        return ctx.badRequest('Cannot add an agency to a business that is not yet approved.');
      }

      const municipalityIdNum = Number.parseInt(String(municipalityId), 10);

      // Check for existing agency (same business + municipality + normalizedName)
      const existing = await strapi.db.query('api::agency.agency').findOne({
        where: {
          normalizedName,
          business: business.id,
          municipality: municipalityIdNum,
        },
      });

      if (existing) {
        return ctx.conflict('An agency with this name already exists at this location for the selected business.', {
          existing: {
            id: existing.id,
            name: existing.name,
            approvalStatus: existing.approvalStatus,
          },
        });
      }

      const slug = generateSlug(String(name));

      const agencyData: any = {
        name: String(name).trim(),
        normalizedName,
        slug,
        approvalStatus: 'pending',
        possibleDuplicate: clientFlaggedDuplicate === true,
        submittedBy: user.id,
        business: business.id,
        municipality: municipalityIdNum,
      };

      if (provinceId) agencyData.province = Number.parseInt(String(provinceId), 10);
      if (address) agencyData.address = String(address).trim();
      if (phone) agencyData.phone = String(phone).trim();

      const agency = await strapi.db.query('api::agency.agency').create({
        data: agencyData,
        populate: {
          business: { fields: ['id', 'name', 'slug'] },
          municipality: { fields: ['id', 'name'] },
          province: { fields: ['id', 'name'] },
          submittedBy: { fields: ['id', 'username', 'email'] },
        },
      });

      strapi.log.info(`[AGENCY] New agency submitted for approval: "${agency.name}" (ID: ${agency.id}) by user ${user.id}`);

      // Notify admin
      try {
        const agencyService = strapi.service('api::agency.agency') as any;
        if (agencyService?.sendNewAgencySubmissionEmail) {
          await agencyService.sendNewAgencySubmissionEmail(agency, user);
        }
      } catch (emailError) {
        strapi.log.error('[AGENCY] Failed to send admin notification email:', emailError);
      }

      ctx.status = 201;
      return {
        data: agency,
        message: 'A sua agência foi submetida e aguarda aprovação do administrador.',
      };
    } catch (error: any) {
      if (error.status === 409 || error.name === 'ConflictError') throw error;
      strapi.log.error('[AGENCY] create error:', error);
      return ctx.internalServerError('An error occurred while creating the agency.');
    }
  },

  /**
   * Return all agencies belonging to the authenticated user's business.
   * GET /api/agencies/my-business-agencies
   */
  async myBusinessAgencies(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in.');
    }

    try {
      // Find the business owned by this user
      const business = await strapi.db.query('api::business.business').findOne({
        where: { owner: user.id },
        select: ['id'],
      });

      if (!business) {
        return { data: [] };
      }

      const agencies = await strapi.db.query('api::agency.agency').findMany({
        where: { business: business.id },
        populate: {
          municipality: {
            fields: ['id', 'name'],
            populate: { province: { fields: ['id'] } },
          },
          province: { fields: ['id', 'name'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (agencies.length === 0) {
        return { data: [] };
      }

      // Fetch all reviews for this business that have an agency relation
      const agencyIds = agencies.map((a: any) => a.id);
      const allReviews = await strapi.db.query('api::review.review').findMany({
        where: {
          agency: { id: { $in: agencyIds } },
        },
        select: ['id', 'rating', 'createdAt'],
        populate: { agency: { select: ['id'] } },
      });

      // Group reviews by agency ID
      const now = Date.now();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

      const reviewsByAgency = new Map<number, typeof allReviews>();
      for (const review of allReviews) {
        const agencyId = (review as any).agency?.id;
        if (!agencyId) continue;
        const list = reviewsByAgency.get(agencyId) || [];
        list.push(review);
        reviewsByAgency.set(agencyId, list);
      }

      // Compute stats per agency
      const enriched = agencies.map((agency: any) => {
        const agencyReviews = reviewsByAgency.get(agency.id) || [];
        if (agencyReviews.length === 0) {
          return { ...agency, _stats: { rating: null, totalReviews: 0, trend: null } };
        }

        const totalReviews = agencyReviews.length;
        const sumRating = agencyReviews.reduce((s: number, r: any) => s + (r.rating || 0), 0);
        const rating = Math.round((sumRating / totalReviews) * 10) / 10;

        // Trend: compare last-30-day avg vs prior-30-day avg
        const recent: number[] = [];
        const prior: number[] = [];
        for (const r of agencyReviews) {
          const age = now - new Date(r.createdAt).getTime();
          if (age <= THIRTY_DAYS) recent.push(r.rating || 0);
          else if (age <= SIXTY_DAYS) prior.push(r.rating || 0);
        }

        let trend: 'up' | 'down' | 'neutral' | null = null;
        if (recent.length > 0 && prior.length > 0) {
          const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
          const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
          const diff = recentAvg - priorAvg;
          trend = diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'neutral';
        } else if (recent.length > 0) {
          trend = 'neutral';
        }

        return { ...agency, _stats: { rating, totalReviews, trend } };
      });

      return { data: enriched };
    } catch (error) {
      strapi.log.error('[AGENCY] myBusinessAgencies error:', error);
      return ctx.internalServerError('Error fetching your business agencies.');
    }
  },

  /**
   * Update an agency (ownership-validated, no re-approval required).
   * PUT /api/agencies/:id
   */
  async update(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in.');
    }

    const agencyId = Number(ctx.params.id);
    if (!agencyId || Number.isNaN(agencyId)) {
      return ctx.badRequest('Invalid agency ID.');
    }

    try {
      // Load the agency with its business relation
      const existing = await strapi.db.query('api::agency.agency').findOne({
        where: { id: agencyId },
        populate: { business: { populate: { owner: { fields: ['id'] } } } },
      });

      if (!existing) {
        return ctx.notFound('Agency not found.');
      }

      const businessOwner = (existing.business as any)?.owner;
      if (!businessOwner || businessOwner.id !== user.id) {
        return ctx.forbidden('You do not have permission to update this agency.');
      }

      const rawData = ctx.request.body?.data ?? ctx.request.body ?? {};
      const { name, address, phone, provinceId, municipalityId, operationalStatus } = rawData as Record<string, any>;

      const updateData: Record<string, any> = {};

      if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (trimmedName.length < 2) {
          return ctx.badRequest('Agency name must be at least 2 characters.');
        }
        updateData.name = trimmedName;
        updateData.normalizedName = trimmedName.toLowerCase().replace(/\s+/g, ' ');
        updateData.slug = generateSlug(trimmedName);
      }

      if (address !== undefined) updateData.address = address ? String(address).trim() : null;
      if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
      if (provinceId !== undefined) updateData.province = provinceId ? Number(provinceId) : null;
      if (municipalityId !== undefined) updateData.municipality = municipalityId ? Number(municipalityId) : null;

      const allowedStatuses = ['open', 'temporarily_closed', 'permanently_closed'];
      if (operationalStatus !== undefined) {
        if (!allowedStatuses.includes(operationalStatus)) {
          return ctx.badRequest(`Invalid operationalStatus. Allowed: ${allowedStatuses.join(', ')}`);
        }
        updateData.operationalStatus = operationalStatus;
      }

      const updated = await strapi.db.query('api::agency.agency').update({
        where: { id: agencyId },
        data: updateData,
        populate: {
          municipality: { fields: ['id', 'name'] },
          province: { fields: ['id', 'name'] },
        },
      });

      strapi.log.info(`[AGENCY] Agency ${agencyId} updated by user ${user.id}`);

      return { data: updated };
    } catch (error) {
      strapi.log.error('[AGENCY] update error:', error);
      return ctx.internalServerError('An error occurred while updating the agency.');
    }
  },
}));
