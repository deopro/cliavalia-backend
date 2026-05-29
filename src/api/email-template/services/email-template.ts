import { DEFAULT_TEMPLATES } from './email-template-defaults';

export default () => ({
  /**
   * Returns all templates from the DB, merged with defaults so that
   * templates not yet seeded appear with their default values.
   */
  async findAll() {
    const records = await (strapi as any).db
      .query('api::email-template.email-template')
      .findMany({ orderBy: [{ key: 'asc' }, { locale: 'asc' }] });

    // Build a map of existing DB records by key+locale
    const dbMap = new Map<string, any>();
    for (const r of records) {
      dbMap.set(`${r.key}::${r.locale}`, r);
    }

    // Merge with defaults so unsaved templates still appear in the list
    const merged = DEFAULT_TEMPLATES.map((def) => {
      const existing = dbMap.get(`${def.key}::${def.locale}`);
      return existing
        ? { ...existing, availableVariables: def.availableVariables, description: existing.description || def.description }
        : {
            id: null,
            key: def.key,
            locale: def.locale,
            subject: def.subject,
            htmlBody: def.htmlBody,
            description: def.description,
            availableVariables: def.availableVariables,
            isActive: true,
            isDefault: true,
          };
    });

    return merged;
  },

  /**
   * Returns a single template by key + locale.
   * Falls back to the hardcoded default if not in DB.
   */
  async findOne(key: string, locale: 'pt' | 'en') {
    const record = await (strapi as any).db
      .query('api::email-template.email-template')
      .findOne({ where: { key, locale } });

    if (record) {
      const def = DEFAULT_TEMPLATES.find((t) => t.key === key && t.locale === locale);
      return {
        ...record,
        availableVariables: def?.availableVariables ?? record.availableVariables,
      };
    }

    const def = DEFAULT_TEMPLATES.find((t) => t.key === key && t.locale === locale);
    if (!def) return null;

    return {
      id: null,
      key: def.key,
      locale: def.locale,
      subject: def.subject,
      htmlBody: def.htmlBody,
      description: def.description,
      availableVariables: def.availableVariables,
      isActive: true,
      isDefault: true,
    };
  },

  /**
   * Creates or updates a template record.
   */
  async upsert(
    key: string,
    locale: 'pt' | 'en',
    data: {
      subject?: string;
      htmlBody?: string;
      description?: string;
      isActive?: boolean;
      senderName?: string | null;
      senderEmail?: string | null;
    },
  ) {
    const existing = await (strapi as any).db
      .query('api::email-template.email-template')
      .findOne({ where: { key, locale } });

    if (existing) {
      return (strapi as any).db
        .query('api::email-template.email-template')
        .update({ where: { id: existing.id }, data });
    }

    return (strapi as any).db
      .query('api::email-template.email-template')
      .create({ data: { key, locale, ...data } });
  },

  /**
   * Resets a template to its hardcoded default by deleting the DB record.
   */
  async resetToDefault(key: string, locale: 'pt' | 'en') {
    const existing = await (strapi as any).db
      .query('api::email-template.email-template')
      .findOne({ where: { key, locale } });

    if (existing) {
      await (strapi as any).db
        .query('api::email-template.email-template')
        .delete({ where: { id: existing.id } });
    }

    const def = DEFAULT_TEMPLATES.find((t) => t.key === key && t.locale === locale);
    if (!def) return null;

    return {
      id: null,
      key: def.key,
      locale: def.locale,
      subject: def.subject,
      htmlBody: def.htmlBody,
      description: def.description,
      availableVariables: def.availableVariables,
      isActive: true,
      isDefault: true,
    };
  },
});
