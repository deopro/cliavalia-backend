import type { Core } from '@strapi/strapi';
import { consumerSendConfirmationEmail } from './consumer-send-confirmation-email';
import {
  CLIAVA_CONSUMER_AUTH_EMAIL_PATCH,
  createConsumerForgotPasswordController,
  createExtendedSendEmailConfirmationHandler,
} from '../extensions/users-permissions/controllers/auth';

/**
 * Strapi's default `user.sendConfirmationEmail`, `auth.forgotPassword`, and optionally
 * `auth.sendEmailConfirmation` use plugin-store email templates ("Confirmação de Registo", etc.).
 * Extensions sometimes apply before the plugin finalizes controllers/services; this reapplies our
 * handlers idempotently (marked with CLIAVA_CONSUMER_AUTH_EMAIL_PATCH).
 */
export function applyConsumerAuthEmailPatches(strapi: Core.Strapi): void {
  try {
    const up = strapi.plugin('users-permissions');
    if (!up) return;

    const userSvc = up.service('user') as any;
    if (userSvc && typeof userSvc === 'object') {
      userSvc.sendConfirmationEmail = async (u: any, opts?: any) =>
        consumerSendConfirmationEmail(strapi, u, opts);
    }

    const authCtl = up.controllers?.auth as any;
    if (!authCtl) return;

    if (!(authCtl.forgotPassword as any)?.[CLIAVA_CONSUMER_AUTH_EMAIL_PATCH]) {
      authCtl.forgotPassword = createConsumerForgotPasswordController(strapi);
    }

    const currentSend = authCtl.sendEmailConfirmation;
    if (
      typeof currentSend === 'function' &&
      !(currentSend as any)[CLIAVA_CONSUMER_AUTH_EMAIL_PATCH]
    ) {
      authCtl.sendEmailConfirmation = createExtendedSendEmailConfirmationHandler(strapi, currentSend);
    }
  } catch (e: any) {
    strapi.log?.warn(`[consumer-auth-email-patches] ${e?.message ?? e}`);
  }
}

/** Run immediately and on several milestones so late plugin binds cannot restore Strapi defaults. */
export function scheduleConsumerAuthEmailPatches(strapi: Core.Strapi): void {
  const run = () => applyConsumerAuthEmailPatches(strapi);
  run();
  setImmediate(run);
  strapi.server?.httpServer?.once?.('listening', run);
  for (const ms of [50, 200, 1000, 3000]) {
    setTimeout(run, ms);
  }
}
