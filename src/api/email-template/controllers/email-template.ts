import type { Context } from 'koa';

async function verifyAdminToken(ctx: Context, strapi: any): Promise<any | null> {
  const authHeader = ctx.request.header.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  try {
    const adminAuthService = strapi.admin?.services?.auth;
    if (adminAuthService && typeof adminAuthService.verify === 'function') {
      try {
        const adminUser = await adminAuthService.verify(token);
        if (adminUser) {
          const userId = adminUser.id || adminUser.userId;
          if (userId) {
            const adminUserService = strapi.admin?.services?.user;
            if (adminUserService) {
              const full = await adminUserService.findOne(userId);
              if (full && full.id && !full.blocked) return full;
            }
            return adminUser;
          }
        }
      } catch {
        // fall through
      }
    }

    const adminTokenService = strapi.admin?.services?.token;
    if (adminTokenService) {
      let decoded: any;
      if (typeof adminTokenService.decode === 'function') {
        try { decoded = await adminTokenService.decode(token); } catch { decoded = null; }
      }
      if (!decoded) {
        const parts = token.split('.');
        if (parts.length === 3) {
          try { decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8')); } catch { return null; }
        } else return null;
      }
      if (decoded) {
        const userId = decoded.id || decoded.userId || decoded.sub;
        if (userId) {
          const adminUserService = strapi.admin?.services?.user;
          if (adminUserService) {
            const full = await adminUserService.findOne(userId);
            if (full && full.id && !full.blocked) return full;
          }
          return decoded;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default ({ strapi }: { strapi: any }) => ({
  async findAll(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    try {
      const emailTemplateService = strapi.service('api::email-template.email-template');
      const templates = await emailTemplateService.findAll();
      ctx.body = { data: templates };
    } catch (err: any) {
      strapi.log.error('[EMAIL-TEMPLATE] findAll error:', err.message);
      ctx.status = 500;
      ctx.body = { error: 'Internal server error' };
    }
  },

  async findOne(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const { key, locale } = ctx.params as { key: string; locale: string };
    if (!['pt', 'en'].includes(locale)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid locale. Must be "pt" or "en".' };
      return;
    }

    try {
      const emailTemplateService = strapi.service('api::email-template.email-template');
      const template = await emailTemplateService.findOne(key, locale as 'pt' | 'en');
      if (!template) {
        ctx.status = 404;
        ctx.body = { error: 'Template not found' };
        return;
      }
      ctx.body = { data: template };
    } catch (err: any) {
      strapi.log.error('[EMAIL-TEMPLATE] findOne error:', err.message);
      ctx.status = 500;
      ctx.body = { error: 'Internal server error' };
    }
  },

  async update(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const { key, locale } = ctx.params as { key: string; locale: string };
    if (!['pt', 'en'].includes(locale)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid locale. Must be "pt" or "en".' };
      return;
    }

    const body = ctx.request.body as any;
    const { subject, htmlBody, description, isActive, senderName, senderEmail } = body;

    if (
      !subject &&
      !htmlBody &&
      description === undefined &&
      isActive === undefined &&
      senderName === undefined &&
      senderEmail === undefined
    ) {
      ctx.status = 400;
      ctx.body = { error: 'No updatable fields provided.' };
      return;
    }

    const updateData: Record<string, any> = {};
    if (subject !== undefined) updateData.subject = String(subject);
    if (htmlBody !== undefined) updateData.htmlBody = String(htmlBody);
    if (description !== undefined) updateData.description = String(description);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (senderName !== undefined) {
      const s = senderName === null ? '' : String(senderName).trim();
      updateData.senderName = s === '' ? null : s;
    }
    if (senderEmail !== undefined) {
      const s = senderEmail === null ? '' : String(senderEmail).trim();
      updateData.senderEmail = s === '' ? null : s;
    }

    try {
      const emailTemplateService = strapi.service('api::email-template.email-template');
      const result = await emailTemplateService.upsert(key, locale as 'pt' | 'en', updateData);
      ctx.body = { data: result };
    } catch (err: any) {
      strapi.log.error('[EMAIL-TEMPLATE] update error:', err.message);
      ctx.status = 500;
      ctx.body = { error: 'Internal server error' };
    }
  },

  async reset(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const { key, locale } = ctx.params as { key: string; locale: string };
    if (!['pt', 'en'].includes(locale)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid locale. Must be "pt" or "en".' };
      return;
    }

    try {
      const emailTemplateService = strapi.service('api::email-template.email-template');
      const result = await emailTemplateService.resetToDefault(key, locale as 'pt' | 'en');
      if (!result) {
        ctx.status = 404;
        ctx.body = { error: 'Template not found' };
        return;
      }
      ctx.body = { data: result };
    } catch (err: any) {
      strapi.log.error('[EMAIL-TEMPLATE] reset error:', err.message);
      ctx.status = 500;
      ctx.body = { error: 'Internal server error' };
    }
  },
});
