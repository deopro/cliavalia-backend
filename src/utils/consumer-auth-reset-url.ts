/**
 * Builds the consumer (main app) password-reset link using Strapi's advanced.email_reset_password
 * (same base URL as the plugin template) plus `code=<token>` for /auth/reset-password.
 */
export function buildConsumerPasswordResetLink(
  emailResetPasswordBase: string | undefined | null,
  resetPasswordToken: string,
): string | null {
  const trimmed = String(emailResetPasswordBase ?? '').trim();
  const fromEnv =
    process.env.FRONTEND_URL != null && String(process.env.FRONTEND_URL).trim() !== ''
      ? `${String(process.env.FRONTEND_URL).replace(/\/$/, '')}/auth/reset-password`
      : '';
  const base = trimmed || fromEnv;
  if (!base) {
    return null;
  }
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}code=${encodeURIComponent(resetPasswordToken)}`;
}
