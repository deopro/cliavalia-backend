import { DEFAULT_TEMPLATES } from '../api/email-template/services/email-template-defaults';
import { EmailLocale, normalizeEmailLocale } from './email-locale';
import { getSiteEmailSender } from './site-email-sender';

function renderPlaceholders(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = variables[key.trim()];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function buildFrom(
  record: { senderName?: string | null; senderEmail?: string | null } | null,
  base: { name: string; email: string },
): string {
  const name =
    record?.senderName != null && String(record.senderName).trim() !== ''
      ? String(record.senderName).trim()
      : base.name;
  const email =
    record?.senderEmail != null && String(record.senderEmail).trim() !== ''
      ? String(record.senderEmail).trim()
      : base.email;
  return `${name} <${email}>`;
}

function pickDefaultTemplate(
  key: string,
  normalizedLocale: EmailLocale,
):
  | (typeof DEFAULT_TEMPLATES)[number]
  | undefined {
  let def = DEFAULT_TEMPLATES.find((t) => t.key === key && t.locale === normalizedLocale);
  if (!def && normalizedLocale !== 'pt') {
    def = DEFAULT_TEMPLATES.find((t) => t.key === key && t.locale === 'pt');
  }
  return def;
}

export type RenderEmailTemplateOptions = {
  /** When set, used instead of site-wide Shaolin default before applying per-template overrides */
  defaultSender?: { name: string; email: string };
};

/**
 * Renders an email template by key + locale.
 * Lookup order (same for all keys, including consumer confirmation / forgot-password):
 * - DB (`api::email-template.email-template`, active) → DB (pt fallback) → `DEFAULT_TEMPLATES` → throw
 *
 * Shaolin email-templates edits are stored in DB and are used for transactional sends.
 *
 * The `year` variable is automatically injected unless overridden in `variables`.
 *
 * `from` is always a "Display Name <address>" string merged from: optional defaultSender
 * (e.g. business brand), then site settings, then per-template senderName/senderEmail in DB.
 */
export async function renderEmailTemplate(
  key: string,
  variables: Record<string, string | number>,
  locale: string | null | undefined = 'pt',
  options?: RenderEmailTemplateOptions,
): Promise<{ subject: string; html: string; from: string }> {
  const normalizedLocale: EmailLocale = normalizeEmailLocale(locale);
  const vars: Record<string, string | number> = {
    year: new Date().getFullYear(),
    ...variables,
  };

  const strapiRef = (global as any).strapi;
  const baseSender =
    options?.defaultSender ?? (await getSiteEmailSender(strapiRef));

  if (strapiRef) {
    try {
      let record = await strapiRef.db
        .query('api::email-template.email-template')
        .findOne({ where: { key, locale: normalizedLocale, isActive: true } });

      if (!record && normalizedLocale !== 'pt') {
        record = await strapiRef.db
          .query('api::email-template.email-template')
          .findOne({ where: { key, locale: 'pt', isActive: true } });
      }

      if (record) {
        return {
          subject: renderPlaceholders(record.subject, vars),
          html: renderPlaceholders(record.htmlBody, vars),
          from: buildFrom(record, baseSender),
        };
      }
    } catch (err: any) {
      strapiRef.log?.warn(
        `[EMAIL-RENDERER] DB lookup failed for ${key}/${normalizedLocale}, using default: ${err.message}`,
      );
    }
  }

  // Fallback to hardcoded defaults
  let def = pickDefaultTemplate(key, normalizedLocale);

  if (!def) {
    const msg = `No email template found for key: ${key}`;
    (global as any).strapi?.log?.error(`[EMAIL-RENDERER] ${msg}`);
    throw new Error(msg);
  }

  return {
    subject: renderPlaceholders(def.subject, vars),
    html: renderPlaceholders(def.htmlBody, vars),
    from: buildFrom(null, baseSender),
  };
}
