/**
 * Payment controller — handles manual bank transfer payment flow
 *
 * Business user endpoints (users-permissions auth):
 *   POST /api/payments/create — submit a new payment proof
 *   GET  /api/payments/my     — get payments for the authenticated user's business
 *
 * Admin endpoints (admin token auth, auth:false in routes):
 *   GET  /api/payments/list    — list all payments (with optional status filter)
 *   POST /api/payments/approve — approve a payment and activate subscription
 *   POST /api/payments/reject  — reject a payment
 */

import { upgradeToPro, upgradeToEnterprise } from '../../business/services/subscription';

// ─── User token verification (for auth:false routes) ─────────────────────────
async function authenticateUserFromToken(ctx: any): Promise<any> {
  if (ctx.state.user) return ctx.state.user;

  const authHeader =
    ctx.request?.header?.authorization ||
    ctx.request?.headers?.authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.replace('Bearer ', '').trim();
    const jwt = strapi.plugin('users-permissions').service('jwt');
    const payload = await jwt.verify(token);
    const userId = payload.id || payload.user?.id || payload;

    const user = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: userId }, populate: ['role'] });

    if (user) {
      ctx.state.user = user;
      return user;
    }
  } catch {
    // Token verification failed
  }

  return null;
}

// ─── Admin token verification (same pattern as admin-dashboard) ───────────────
async function verifyAdminToken(ctx: any): Promise<any | null> {
  const authHeader = ctx.request.header.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  try {
    // Try admin auth service first (Strapi v5)
    const adminAuthService = strapi.admin?.services?.auth;
    if (adminAuthService && typeof adminAuthService.verify === 'function') {
      try {
        const adminUser = await adminAuthService.verify(token);
        if (adminUser) {
          const userId = adminUser.id || adminUser.userId;
          if (userId) {
            const adminUserService = strapi.admin?.services?.user;
            if (adminUserService) {
              const fullAdminUser = await adminUserService.findOne(userId);
              if (fullAdminUser && fullAdminUser.id && !fullAdminUser.blocked) {
                return fullAdminUser;
              }
            }
            return adminUser;
          }
        }
      } catch {
        // Fall through to alternative verification
      }
    }

    // Fallback: decode token manually
    const adminTokenService = strapi.admin?.services?.token;
    if (adminTokenService && typeof adminTokenService.decode === 'function') {
      let decoded: any;
      try {
        decoded = await adminTokenService.decode(token);
      } catch {
        decoded = adminTokenService.decode(token);
      }
      if (decoded?.id) {
        const adminUserService = strapi.admin?.services?.user;
        if (adminUserService) {
          const adminUser = await adminUserService.findOne(decoded.id);
          if (adminUser && !adminUser.blocked) return adminUser;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default {
  /**
   * POST /api/payments/create
   * Business user submits a payment proof for a plan upgrade.
   */
  async create(ctx: any) {
    const user = await authenticateUserFromToken(ctx);
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const business = await strapi.db.query('api::business.business').findOne({
      where: { owner: user.id },
      select: ['id', 'documentId', 'name', 'subscriptionPlan'],
    });

    if (!business) {
      return ctx.notFound('No business found for this user');
    }

    const { plan, proofUrl, reference, notes, amount } = ctx.request.body as {
      plan?: string;
      proofUrl?: string;
      reference?: string;
      notes?: string;
      amount?: number;
    };

    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return ctx.badRequest('Valid plan is required (pro or enterprise)');
    }
    if (!proofUrl) {
      return ctx.badRequest('proofUrl is required');
    }
    if (!amount || amount <= 0) {
      return ctx.badRequest('A valid amount is required');
    }

    // Check for existing pending payment
    const existingPending = await strapi.db.query('api::payment.payment').findOne({
      where: {
        business: business.id,
        paymentStatus: 'pending',
      },
    });

    if (existingPending) {
      return ctx.badRequest('You already have a payment pending review');
    }

    const payment = await strapi.documents('api::payment.payment').create({
      data: {
        business: business.id,
        plan,
        amount,
        paymentStatus: 'pending',
        proofUrl,
        reference: reference || null,
        notes: notes || null,
      } as any,
    });

    ctx.body = {
      data: {
        id: payment.documentId,
        plan: payment.plan,
        amount: payment.amount,
        paymentStatus: payment.paymentStatus,
        createdAt: payment.createdAt,
      },
    };
  },

  /**
   * GET /api/payments/my
   * Returns payments for the authenticated user's business.
   */
  async my(ctx: any) {
    const user = await authenticateUserFromToken(ctx);
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const business = await strapi.db.query('api::business.business').findOne({
      where: { owner: user.id },
      select: ['id'],
    });

    if (!business) {
      return ctx.notFound('No business found for this user');
    }

    const payments = await strapi.db.query('api::payment.payment').findMany({
      where: { business: business.id },
      orderBy: { createdAt: 'desc' },
      limit: 10,
    });

    ctx.body = {
      data: payments.map((p: any) => ({
        id: p.documentId,
        plan: p.plan,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        proofUrl: p.proofUrl,
        reference: p.reference,
        notes: p.notes,
        rejectionReason: p.rejectionReason,
        createdAt: p.createdAt,
        reviewedAt: p.reviewedAt,
      })),
    };
  },

  /**
   * GET /api/payments/list
   * Admin-only. Returns all payments with optional status filter.
   */
  async list(ctx: any) {
    const admin = await verifyAdminToken(ctx);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Admin authentication required' } };
      return;
    }

    const { status: statusFilter, page = '1', pageSize = '25' } = ctx.query as {
      status?: string;
      page?: string;
      pageSize?: string;
    };

    const where: any = {};
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      where.paymentStatus = statusFilter;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));

    const [payments, total] = await Promise.all([
      strapi.db.query('api::payment.payment').findMany({
        where,
        orderBy: { createdAt: 'desc' },
        offset: (pageNum - 1) * size,
        limit: size,
        populate: ['business'],
      }),
      strapi.db.query('api::payment.payment').count({ where }),
    ]);

    ctx.body = {
      data: payments.map((p: any) => ({
        id: p.documentId,
        plan: p.plan,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        proofUrl: p.proofUrl,
        reference: p.reference,
        notes: p.notes,
        rejectionReason: p.rejectionReason,
        createdAt: p.createdAt,
        reviewedAt: p.reviewedAt,
        business: p.business
          ? { documentId: p.business.documentId, name: p.business.name }
          : null,
      })),
      meta: {
        pagination: {
          page: pageNum,
          pageSize: size,
          pageCount: Math.ceil(total / size),
          total,
        },
      },
    };
  },

  /**
   * POST /api/payments/approve
   * Admin-only. Approves a payment and activates the corresponding subscription.
   */
  async approve(ctx: any) {
    const admin = await verifyAdminToken(ctx);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Admin authentication required' } };
      return;
    }

    const { paymentId } = ctx.request.body as { paymentId?: string };
    if (!paymentId) {
      return ctx.badRequest('paymentId is required');
    }

    const payment = await strapi.documents('api::payment.payment').findFirst({
      filters: { documentId: paymentId },
      populate: ['business'],
    });

    if (!payment) {
      return ctx.notFound('Payment not found');
    }

    if (payment.paymentStatus !== 'pending') {
      return ctx.badRequest('Only pending payments can be approved');
    }

    const businessDocumentId = (payment as any).business?.documentId;
    if (!businessDocumentId) {
      return ctx.badRequest('Payment has no associated business');
    }

    // Update payment status
    await strapi.documents('api::payment.payment').update({
      documentId: payment.documentId,
      data: {
        paymentStatus: 'approved',
        reviewedAt: new Date(),
      } as any,
    });

    // Activate subscription based on plan
    if (payment.plan === 'enterprise') {
      await upgradeToEnterprise(businessDocumentId);
    } else {
      await upgradeToPro(businessDocumentId, 30);
    }

    ctx.body = {
      data: { success: true, message: `Payment approved and ${payment.plan} subscription activated` },
    };
  },

  /**
   * POST /api/payments/reject
   * Admin-only. Rejects a payment with an optional reason.
   */
  async reject(ctx: any) {
    const admin = await verifyAdminToken(ctx);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Admin authentication required' } };
      return;
    }

    const { paymentId, rejectionReason } = ctx.request.body as {
      paymentId?: string;
      rejectionReason?: string;
    };

    if (!paymentId) {
      return ctx.badRequest('paymentId is required');
    }

    const payment = await strapi.documents('api::payment.payment').findFirst({
      filters: { documentId: paymentId },
    });

    if (!payment) {
      return ctx.notFound('Payment not found');
    }

    if (payment.paymentStatus !== 'pending') {
      return ctx.badRequest('Only pending payments can be rejected');
    }

    await strapi.documents('api::payment.payment').update({
      documentId: payment.documentId,
      data: {
        paymentStatus: 'rejected',
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || null,
      } as any,
    });

    ctx.body = {
      data: { success: true, message: 'Payment rejected' },
    };
  },
};
