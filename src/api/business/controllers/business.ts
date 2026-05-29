/**
 * business controller
 */

import { factories } from '@strapi/strapi';
import { businessUpdateContext } from '../../../utils/business-update-middleware';
import {
  applyBusinessCategoriesConnectToData,
  applyBusinessCategoriesToData,
  enrichBusinessCategoryFields,
  enrichBusinessListCategoryFields,
  getBusinessCategoriesPopulate,
  parseCategoryIdsFromInput,
  resolveCategoriesAndSector,
} from '../../../utils/business-categories';

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeBusinessName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function generateSlug(text: string): string {
  const s = String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'business';
}

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export default factories.createCoreController('api::business.business', ({ strapi }) => ({

  /**
   * List businesses — public queries only see approved businesses.
   * GET /api/businesses
   */
  async find(ctx) {
    const user = ctx.state.user;
    const { query } = ctx;
    const filters = ((query as any).filters || {}) as any;

    // For public / general listing: only show approved (or legacy null) businesses.
    const isAdminQuery = user && (user.role?.type === 'admin' || user.role?.type === 'super-admin');

    if (!isAdminQuery) {
      const existingAnd = filters.$and || [];
      existingAnd.push({
        $or: [
          { approvalStatus: { $eq: 'approved' } },
          { approvalStatus: { $null: true } },   // legacy records without status
        ],
      });
      filters.$and = existingAnd;
      (query as any).filters = filters;
    }

    return await super.find(ctx);
  },

  /**
   * Return the authenticated user's submitted businesses.
   * GET /api/businesses/my-submissions
   */
  async mySubmissions(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in.');
    }

    try {
      const businesses = await strapi.db.query('api::business.business').findMany({
        where: { submittedBy: user.id },
        populate: {
          sector: { fields: ['id', 'name'] },
          ...getBusinessCategoriesPopulate(strapi),
          provinces: { fields: ['id', 'name'] },
          municipalities: { fields: ['id', 'name'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      return { data: enrichBusinessListCategoryFields(businesses) };
    } catch (error) {
      strapi.log.error('[BUSINESS] mySubmissions error:', error);
      return ctx.internalServerError('Error fetching your submitted businesses.');
    }
  },

  /**
   * Find similar businesses by name (Levenshtein + case-insensitive partial match)
   * GET /api/businesses/similar?name=xxx
   */
  async findSimilar(ctx) {
    const { name } = ctx.query as { name?: string };
    if (!name || String(name).trim().length < 2) {
      return { data: [] };
    }

    const normalized = normalizeBusinessName(String(name));
    const LEVENSHTEIN_THRESHOLD = 4;
    const PARTIAL_MATCH_MIN_LEN = 4;

    try {
      // Fetch all approved business names (lightweight query)
      const allBusinesses = await strapi.db.query('api::business.business').findMany({
        where: { approvalStatus: { $in: ['approved', null] } },
        select: ['id', 'name', 'slug'],
        limit: 2000,
        orderBy: { name: 'asc' },
      });

      const similar: Array<{ id: number; name: string; slug: string; distance: number }> = [];

      for (const biz of allBusinesses) {
        const bizNorm = normalizeBusinessName(biz.name || '');
        if (bizNorm === normalized) {
          // Exact duplicate — already handled by unique constraint; flag as top match
          similar.push({ id: biz.id, name: biz.name, slug: biz.slug, distance: 0 });
          continue;
        }
        const dist = levenshtein(normalized, bizNorm);
        const isPartialMatch =
          normalized.length >= PARTIAL_MATCH_MIN_LEN &&
          (bizNorm.includes(normalized) || normalized.includes(bizNorm));

        if (dist <= LEVENSHTEIN_THRESHOLD || isPartialMatch) {
          similar.push({ id: biz.id, name: biz.name, slug: biz.slug, distance: dist });
        }
      }

      // Sort by distance asc, limit to 5
      similar.sort((a, b) => a.distance - b.distance);

      return { data: similar.slice(0, 5) };
    } catch (error) {
      strapi.log.error('[BUSINESS] findSimilar error:', error);
      return ctx.internalServerError('Error checking for similar businesses.');
    }
  },

  /**
   * Find one business by ID or slug
   * GET /api/businesses/:id
   * 
   * Supports both numeric ID and slug lookups
   */
  async findOne(ctx) {
    const { id } = ctx.params;
    const { query } = ctx;
    const user = ctx.state.user;

    if (!id) {
      return ctx.badRequest('Business ID or slug is required.');
    }

    try {
      // Check if id is numeric (ID) or string (slug)
      const isNumericId = /^\d+$/.test(String(id));
      
      let business;
      if (isNumericId) {
        // Lookup by ID
        business = await strapi.db.query('api::business.business').findOne({
          where: { id: Number.parseInt(id, 10) },
          populate: query.populate || {},
        });
      } else {
        // Lookup by slug
        business = await strapi.db.query('api::business.business').findOne({
          where: { slug: id },
          populate: query.populate || {},
        });
      }

      if (!business) {
        return ctx.notFound(`Business with ${isNumericId ? 'ID' : 'slug'} "${id}" not found`);
      }

      // Hide non-approved businesses from public view.
      // Only the submitter, owner, or an admin can see a pending / rejected business.
      if (business.approvalStatus && business.approvalStatus !== 'approved') {
        const isOwnerOrSubmitter = user && (
          (business.submittedBy && (business.submittedBy === user.id || business.submittedBy?.id === user.id)) ||
          (business.owner && (business.owner === user.id || business.owner?.id === user.id))
        );
        const isAdmin = user && (user.role?.type === 'admin' || user.role?.type === 'super-admin');

        if (!isOwnerOrSubmitter && !isAdmin) {
          return ctx.notFound(`Business with ${isNumericId ? 'ID' : 'slug'} "${id}" not found`);
        }
      }

      return { data: enrichBusinessCategoryFields(business) };
    } catch (error) {
      strapi.log.error('Error fetching business:', error);
      return ctx.internalServerError('An error occurred while fetching the business.');
    }
  },

  /**
   * Create a new business (pending moderation)
   * POST /api/businesses
   */
  async create(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in to create a business.');
    }

    const rawData = ctx.request.body?.data ?? ctx.request.body ?? {};
    const bodyData = rawData?.attributes ? { ...rawData, ...rawData.attributes } : rawData;
    const {
      name: nameFromBody,
      sector: sectorFromBody,
      province: provinceFromBody,
      municipality: municipalityFromBody,
      address,
      logoUrl,
      website,
      phone,
      verified,
      slug: slugFromBody,
      possibleDuplicate: clientFlaggedDuplicate,
      acronym: acronymFromBody,
    } = bodyData;

    const rawName = nameFromBody;
    if (!rawName) {
      return ctx.badRequest('Business name is required.');
    }

    // Normalize
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length < 3 || name.length > 100) {
      return ctx.badRequest('Business name must be between 3 and 100 characters.');
    }

    const sector = sectorFromBody != null ? Number(sectorFromBody) : null;
    const categoryIds = parseCategoryIdsFromInput(bodyData as Record<string, unknown>);
    const province = provinceFromBody != null ? Number(provinceFromBody) : null;
    const municipality = municipalityFromBody != null ? Number(municipalityFromBody) : null;

    const slug = (slugFromBody && String(slugFromBody).trim()) ? String(slugFromBody).trim() : generateSlug(name);

    try {
      const resolvedCategories =
        categoryIds.length > 0
          ? await resolveCategoriesAndSector(strapi, categoryIds)
          : { categoryIds: [], categories: [], sectorId: null };

      const businessData: any = {
        name,
        slug,
        verified: verified ?? false,
        approvalStatus: 'pending',
        submittedBy: user.id,
        possibleDuplicate: clientFlaggedDuplicate === true,
        gallery: [],
      };

      if (address !== undefined && address !== null) businessData.address = address;
      if (logoUrl !== undefined && logoUrl !== null) businessData.logoUrl = logoUrl;
      if (website !== undefined && website !== null) businessData.website = website;
      if (phone !== undefined && phone !== null) businessData.phone = phone;
      if (acronymFromBody) businessData.acronym = String(acronymFromBody).trim().substring(0, 50);
      if (resolvedCategories.categoryIds.length > 0) {
        applyBusinessCategoriesConnectToData(
          strapi,
          businessData,
          resolvedCategories.categoryIds,
        );
      }
      const sectorId =
        sector != null && !Number.isNaN(sector)
          ? sector
          : resolvedCategories.sectorId;
      if (sectorId != null && !Number.isNaN(sectorId)) {
        businessData.sector = { connect: [sectorId] };
      }
      if (province !== undefined && province !== null && !Number.isNaN(province)) businessData.provinces = { connect: [province] };
      if (municipality !== undefined && municipality !== null && !Number.isNaN(municipality)) businessData.municipalities = { connect: [municipality] };

      const business = await strapi.db.query('api::business.business').create({
        data: businessData,
        populate: {
          sector: { fields: ['id', 'name', 'slug'] },
          ...getBusinessCategoriesPopulate(strapi),
          provinces: { fields: ['id', 'name'] },
          municipalities: { fields: ['id', 'name'] },
          submittedBy: { fields: ['id', 'username', 'email'] },
        },
      });

      // Ensure slug/relations are persisted
      const finalSlug = slug || generateSlug(business.name ?? name);
      const needsSlug = !business.slug || String(business.slug).trim() !== finalSlug;
      const needsCategory = resolvedCategories.categoryIds.length > 0;
      const needsSector = sectorId != null && !Number.isNaN(sectorId);
      if (needsSlug || needsCategory || needsSector) {
        const updateData: Record<string, unknown> = {};
        if (needsSlug) { updateData.slug = finalSlug; business.slug = finalSlug; }
        if (needsCategory) {
          applyBusinessCategoriesConnectToData(
            strapi,
            updateData,
            resolvedCategories.categoryIds,
          );
        }
        if (needsSector) updateData.sector = { connect: [sectorId] };
        await strapi.db.query('api::business.business').update({
          where: { id: business.id },
          data: updateData,
        });
      }

      strapi.log.info(`[BUSINESS] New business submitted for approval: "${business.name}" (ID: ${business.id}) by user ${user.id}`);

      // Notify admin
      try {
        const businessService = strapi.service('api::business.business') as any;
        if (businessService?.sendNewBusinessSubmissionEmail) {
          await businessService.sendNewBusinessSubmissionEmail(business, user);
        }
      } catch (emailError) {
        strapi.log.error('[BUSINESS] Failed to send admin notification email:', emailError);
      }

      ctx.status = 201;
      return {
        data: enrichBusinessCategoryFields(business),
        message: 'O seu negócio foi submetido e aguarda aprovação do administrador.',
      };
    } catch (error) {
      strapi.log.error('Error creating business:', error);
      return ctx.internalServerError('An error occurred while creating the business.');
    }
  },

  /**
   * Update a business by ID, documentId, or slug
   * PUT /api/businesses/:id
   *
   * Strapi v5 Content API expects documentId, but the frontend uses numeric id.
   * This override resolves numeric id (or slug) to documentId before delegating to the core update.
   */
  async update(ctx) {
    const paramId = ctx.params.documentId ?? ctx.params.id;
    if (!paramId) {
      return ctx.badRequest('Business ID or documentId is required.');
    }

    const isNumericId = /^\d+$/.test(String(paramId));
    const looksLikeDocumentId = /^[a-z0-9]{20,}$/i.test(String(paramId));

    let documentId = paramId;

    if (isNumericId || (!looksLikeDocumentId && paramId.length < 20)) {
      // Resolve numeric id or slug to documentId via Document Service
      const filters = isNumericId
        ? { id: Number.parseInt(paramId, 10) }
        : { slug: paramId };

      let business;
      try {
        business = await strapi
          .documents('api::business.business')
          .findFirst({ filters, fields: ['documentId'] });
      } catch (findErr: any) {
        throw findErr;
      }

      if (!business?.documentId) {
        return ctx.notFound(
          `Business with ${isNumericId ? 'ID' : 'slug'} "${paramId}" not found`
        );
      }

      documentId = business.documentId;
      ctx.params.documentId = documentId;
      if (ctx.params.id) ctx.params.id = documentId;
    }

    // Verify JWT and set ctx.state.user for lifecycle ownership checks (route has no policy)
    if (!ctx.state.user) {
      const authHeader =
        ctx.request?.header?.authorization ||
        ctx.request?.headers?.authorization;
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '').trim();
          const jwt = strapi.plugin('users-permissions').service('jwt');
          const payload = await jwt.verify(token);
          const userId = payload.id ?? payload.user?.id;
          if (userId) {
            const user = await strapi.db
              .query('plugin::users-permissions.user')
              .findOne({ where: { id: userId }, populate: ['role'] });
            if (user) ctx.state.user = user;
          }
        } catch {
          // Token invalid
        }
      }
      // Require auth for business update (lifecycle expects user for ownership checks)
      if (!ctx.state.user) {
        return ctx.unauthorized('Authentication required to update this business.');
      }
    }

    const reqBody = ctx.request?.body;
    // Bypass super.update: core controller builds lifecycle where from route params;
    // our route uses :id so where.documentId is missing. Call document service directly.
    const updateData = { ...(reqBody?.data as Record<string, unknown>) };
    if (!updateData || typeof updateData !== 'object') {
      return ctx.badRequest('Request body must contain { data: {...} }');
    }

    const hasCategoryInput =
      'category' in updateData ||
      'categoryId' in updateData ||
      'categories' in updateData ||
      'categoryIds' in updateData;

    if (hasCategoryInput) {
      const categoryIds = parseCategoryIdsFromInput(updateData);
      if (categoryIds.length > 0) {
        const resolved = await resolveCategoriesAndSector(strapi, categoryIds, {
          required: true,
        });
        applyBusinessCategoriesToData(strapi, updateData, resolved.categoryIds);
        if (resolved.sectorId != null) {
          updateData.sector = resolved.sectorId;
        }
      } else {
        applyBusinessCategoriesToData(strapi, updateData, []);
      }
    }

    let result;
    try {
      result = await businessUpdateContext.run({ user: ctx.state?.user }, () =>
        strapi.documents('api::business.business').update({
          documentId,
          data: updateData,
          populate: {
            sector: true,
            ...getBusinessCategoriesPopulate(strapi),
          },
        })
      );
    } catch (updateErr: any) {
      throw updateErr;
    }

    return { data: enrichBusinessCategoryFields(result as Record<string, unknown>) };
  },

  /**
   * Claim a business
   * POST /api/businesses/:id/claim
   * 
   * Links an unclaimed business to the authenticated user
   */
  async claim(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;

    // Check if user is authenticated
    if (!user) {
      return ctx.unauthorized('You must be logged in to claim a business.');
    }

    if (!id) {
      return ctx.badRequest('Business ID is required.');
    }

    try {
      // Check if id is numeric (ID) or string (slug)
      const isNumericId = /^\d+$/.test(String(id));
      
      let business;
      if (isNumericId) {
        business = await strapi.db.query('api::business.business').findOne({
          where: { id: Number.parseInt(id, 10) },
          populate: ['owner'],
        });
      } else {
        business = await strapi.db.query('api::business.business').findOne({
          where: { slug: id },
          populate: ['owner'],
        });
      }

      if (!business) {
        return ctx.notFound(`Business with ${isNumericId ? 'ID' : 'slug'} "${id}" not found`);
      }

      // Check if business is already claimed
      if (business.owner && business.owner.id) {
        return ctx.badRequest('This business is already claimed by another user.');
      }

      // Link business to user
      const updatedBusiness = await strapi.db.query('api::business.business').update({
        where: { id: business.id },
        data: {
          owner: user.id,
        },
        populate: {
          owner: {
            fields: ['id', 'email', 'username'],
          },
        },
      });

      strapi.log.info(`Business claimed: ${updatedBusiness.name} (ID: ${updatedBusiness.id}) by user ${user.id}`);

      return {
        data: updatedBusiness,
        message: 'Business claimed successfully.',
      };
    } catch (error) {
      strapi.log.error('Error claiming business:', error);
      return ctx.internalServerError('An error occurred while claiming the business.');
    }
  },

  // ─── Gallery management ────────────────────────────────────────────────────

  /**
   * Add one or more image URLs to the business gallery (max 20 total).
   * POST /api/businesses/:id/gallery
   * Body: { urls: string[] }
   */
  async addGalleryImages(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in.');

    const { id } = ctx.params;
    if (!id) return ctx.badRequest('Business ID is required.');

    const GALLERY_LIMIT = 20;

    try {
      const business = await strapi.db.query('api::business.business').findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { slug: String(id) },
        populate: { owner: true, submittedBy: true },
      });

      if (!business) return ctx.notFound('Business not found.');

      // Only the owner or admin may manage gallery
      const isAdmin = user.role?.type === 'admin' || user.role?.type === 'super-admin';
      const isOwner = business.owner === user.id || business.owner?.id === user.id;
      const isSubmitter = business.submittedBy === user.id || business.submittedBy?.id === user.id;
      if (!isAdmin && !isOwner && !isSubmitter) {
        return ctx.forbidden('You do not have permission to manage this gallery.');
      }

      const body = ctx.request.body as { urls?: unknown };
      const incoming: string[] = [];
      if (Array.isArray(body?.urls)) {
        for (const u of body.urls) {
          if (typeof u === 'string' && u.trim()) incoming.push(u.trim());
        }
      }
      if (incoming.length === 0) return ctx.badRequest('No image URLs provided.');

      const existing: string[] = Array.isArray(business.gallery) ? business.gallery : [];
      const combined = [...existing, ...incoming].slice(0, GALLERY_LIMIT);

      const updated = await strapi.db.query('api::business.business').update({
        where: { id: business.id },
        data: { gallery: combined },
      });

      return { data: { gallery: updated.gallery } };
    } catch (error) {
      strapi.log.error('[BUSINESS] addGalleryImages error:', error);
      return ctx.internalServerError('Error updating gallery.');
    }
  },

  /**
   * Remove an image from the gallery by its URL.
   * DELETE /api/businesses/:id/gallery
   * Body: { url: string }
   */
  async removeGalleryImage(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in.');

    const { id } = ctx.params;
    if (!id) return ctx.badRequest('Business ID is required.');

    try {
      const business = await strapi.db.query('api::business.business').findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { slug: String(id) },
        populate: { owner: true, submittedBy: true },
      });

      if (!business) return ctx.notFound('Business not found.');

      const isAdmin = user.role?.type === 'admin' || user.role?.type === 'super-admin';
      const isOwner = business.owner === user.id || business.owner?.id === user.id;
      const isSubmitter = business.submittedBy === user.id || business.submittedBy?.id === user.id;
      if (!isAdmin && !isOwner && !isSubmitter) {
        return ctx.forbidden('You do not have permission to manage this gallery.');
      }

      const body = ctx.request.body as { url?: unknown };
      const urlToRemove = typeof body?.url === 'string' ? body.url.trim() : null;
      if (!urlToRemove) return ctx.badRequest('No image URL provided.');

      const existing: string[] = Array.isArray(business.gallery) ? business.gallery : [];
      const updated = await strapi.db.query('api::business.business').update({
        where: { id: business.id },
        data: { gallery: existing.filter((u: string) => u !== urlToRemove) },
      });

      return { data: { gallery: updated.gallery } };
    } catch (error) {
      strapi.log.error('[BUSINESS] removeGalleryImage error:', error);
      return ctx.internalServerError('Error removing gallery image.');
    }
  },

  /**
   * Reorder gallery images.
   * PUT /api/businesses/:id/gallery/reorder
   * Body: { urls: string[] }
   */
  async reorderGallery(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in.');

    const { id } = ctx.params;
    if (!id) return ctx.badRequest('Business ID is required.');

    try {
      const business = await strapi.db.query('api::business.business').findOne({
        where: /^\d+$/.test(String(id)) ? { id: Number(id) } : { slug: String(id) },
        populate: { owner: true, submittedBy: true },
      });

      if (!business) return ctx.notFound('Business not found.');

      const isAdmin = user.role?.type === 'admin' || user.role?.type === 'super-admin';
      const isOwner = business.owner === user.id || business.owner?.id === user.id;
      const isSubmitter = business.submittedBy === user.id || business.submittedBy?.id === user.id;
      if (!isAdmin && !isOwner && !isSubmitter) {
        return ctx.forbidden('You do not have permission to manage this gallery.');
      }

      const body = ctx.request.body as { urls?: unknown };
      const urls: string[] = Array.isArray(body?.urls)
        ? body.urls.filter((u): u is string => typeof u === 'string' && !!u.trim()).slice(0, 20)
        : [];

      // Only keep URLs that were already in the existing gallery (security: no injection of arbitrary URLs)
      const existing: Set<string> = new Set(Array.isArray(business.gallery) ? business.gallery : []);
      const safe = urls.filter((u) => existing.has(u));

      const updated = await strapi.db.query('api::business.business').update({
        where: { id: business.id },
        data: { gallery: safe },
      });

      return { data: { gallery: updated.gallery } };
    } catch (error) {
      strapi.log.error('[BUSINESS] reorderGallery error:', error);
      return ctx.internalServerError('Error reordering gallery.');
    }
  },
}));

