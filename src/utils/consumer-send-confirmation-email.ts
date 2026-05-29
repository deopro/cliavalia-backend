import crypto from 'crypto';
import { getLocalizedEmailText, resolveEmailLocale } from './email-locale';
import { renderEmailTemplate } from './email-template-renderer';
import { getRequestAcceptLanguage } from './request-email-locale-context';

/**
 * Consumer confirmation email using Shaolin templates (see email-template-renderer).
 * Used by users-permissions `user` service and reapplied from bootstrap when Strapi rebinds services.
 */
export async function consumerSendConfirmationEmail(
  strapiInstance: any,
  user: any,
  _options: any = {},
) {
  let resolvedUser = await strapiInstance
    .query('plugin::users-permissions.user')
    .findOne({
      where: { id: user.id || user },
      populate: { role: true },
    });

  if (!resolvedUser && typeof user === 'number') {
    resolvedUser = await strapiInstance
      .query('plugin::users-permissions.user')
      .findOne({
        where: { id: user },
        populate: { role: true },
      });
  }

  const effectiveUser = resolvedUser || user;
  const roleType = effectiveUser?.role?.type || user?.role?.type || '';
  const isBusinessUser = roleType === 'business-user';
  const backendUrl =
    process.env.PUBLIC_URL ||
    process.env.SERVER_URL ||
    strapiInstance.config.get('server.url');

  let confirmationToken =
    effectiveUser?.confirmationToken || user.confirmationToken;

  if (!confirmationToken && effectiveUser?.id && !isBusinessUser) {
    confirmationToken = crypto.randomBytes(20).toString('hex');
    try {
      await strapiInstance.plugin('users-permissions').service('user').edit(effectiveUser.id, {
        confirmationToken,
      });
    } catch (genErr: any) {
      strapiInstance.log?.error(
        `Failed to persist confirmation token for ${effectiveUser?.email}: ${genErr?.message}`,
      );
      return;
    }
  }

  if (!confirmationToken) {
    strapiInstance.log?.warn(
      'No confirmation token found for user:',
      effectiveUser?.email || user?.email || 'unknown',
    );
  }

  if (effectiveUser?.id && confirmationToken) {
    try {
      await strapiInstance.db.query('plugin::users-permissions.user').update({
        where: { id: effectiveUser.id },
        data: { confirmationTokenSentAt: new Date() },
      });
    } catch (stampErr: any) {
      strapiInstance.log?.warn(`Failed to stamp confirmationTokenSentAt: ${stampErr?.message}`);
    }
  }

  if (isBusinessUser) {
    strapiInstance.log?.info(
      `Skipping consumer confirmation email for business user: ${effectiveUser?.email || 'unknown'} (handled elsewhere)`,
    );
    return;
  }

  if (!confirmationToken || !effectiveUser?.email) {
    strapiInstance.log?.warn(
      'Cannot send consumer confirmation email: missing token or email',
      effectiveUser?.email,
    );
    return;
  }

  const confirmationUrl = `${backendUrl}/api/auth/email-confirmation?confirmation=${confirmationToken}`;
  const locale = resolveEmailLocale(
    getRequestAcceptLanguage(),
    effectiveUser.emailLocale,
    effectiveUser,
  );
  const firstName =
    effectiveUser.firstName ||
    getLocalizedEmailText(locale, { pt: 'Utilizador', en: 'User' });

  try {
    const { subject, html, from } = await renderEmailTemplate(
      'consumer-email-confirmation',
      { firstName, confirmationUrl },
      locale,
    );
    await strapiInstance.plugin('email').service('email').send({
      to: effectiveUser.email,
      from,
      subject,
      html,
    });
  } catch (emailErr: any) {
    strapiInstance.log?.error(
      `Failed to send confirmation email to ${effectiveUser?.email}: ${emailErr?.message}. ` +
        `User was created successfully. They can request a new confirmation email.`,
    );
  }
}
