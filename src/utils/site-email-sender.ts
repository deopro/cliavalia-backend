/**
 * Site-wide default transactional sender (Shaolin → Email templates → global settings).
 * Falls back to CliAvalia / notificacoes@cliavalia.com when store is unavailable.
 */
const FALLBACK = { name: 'CliAvalia', email: 'notificacoes@cliavalia.com' } as const;

/** Branded sender for business-facing templates when no per-template override exists */
export const BUSINESS_BRAND_SENDER = {
  name: 'CliAvalia Empresas',
  email: 'comercial@cliavalia.com',
} as const;

export async function getSiteEmailSender(strapi: any): Promise<{ name: string; email: string }> {
  try {
    const store = strapi?.store?.({ type: 'core', name: 'site-settings' });
    if (!store) return { ...FALLBACK };
    const [n, e] = await Promise.all([
      store.get({ key: 'emailSenderName' }),
      store.get({ key: 'emailSenderEmail' }),
    ]);
    return {
      name: (n != null && String(n).trim()) ? String(n).trim() : FALLBACK.name,
      email: (e != null && String(e).trim()) ? String(e).trim() : FALLBACK.email,
    };
  } catch {
    return { ...FALLBACK };
  }
}
