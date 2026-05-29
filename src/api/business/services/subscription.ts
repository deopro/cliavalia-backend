/**
 * Subscription service — manages trial and Pro plan lifecycle for businesses
 */

import type { EmailLocale } from '../../../utils/email-locale';
import { normalizeEmailLocale } from '../../../utils/email-locale';
import { renderEmailTemplate } from '../../../utils/email-template-renderer';
import { BUSINESS_BRAND_SENDER } from '../../../utils/site-email-sender';

const TRIAL_DAYS = 60;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://empresas.cliavalia.com';

function subscriptionDateLocale(lc: EmailLocale): string {
  return lc === 'en' ? 'en-US' : 'pt-PT';
}

async function getBusiness(documentId: string): Promise<any> {
  return strapi.documents('api::business.business').findOne({
    documentId,
    populate: ['owner'],
  });
}

/**
 * Activate a 60-day Pro trial for a business.
 * No-ops if the business already has an active trial or Pro plan.
 */
export async function activateTrial(documentId: string): Promise<void> {
  const business = await getBusiness(documentId);
  if (!business) return;

  // Only activate trial once per business (free plan that has never trialed)
  if (business.subscriptionPlan !== 'free' || business.trialStartedAt) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await strapi.documents('api::business.business').update({
    documentId,
    data: {
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      trialStartedAt: now,
      trialExpiresAt: expiresAt,
    } as any,
  });

  // Fire email notification
  const owner = business.owner;
  if (owner?.email) {
    await sendTrialActivatedEmail(business, owner, expiresAt);
  }
}

/**
 * Downgrade a business back to the free plan.
 */
export async function downgradeToFree(documentId: string): Promise<void> {
  await strapi.documents('api::business.business').update({
    documentId,
    data: {
      subscriptionPlan: 'free',
      subscriptionStatus: 'expired',
    } as any,
  });
}

/**
 * Upgrade a business to the Pro plan.
 * @param durationDays  Number of days the Pro access is valid (default 365)
 */
export async function upgradeToPro(documentId: string, durationDays = 365): Promise<void> {
  const now = new Date();
  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  await strapi.documents('api::business.business').update({
    documentId,
    data: {
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      subscriptionStartedAt: now,
      subscriptionEndsAt: endsAt,
    } as any,
  });

  const business = await getBusiness(documentId);
  const owner = business?.owner;
  if (owner?.email) {
    await sendProActivatedEmail(business, owner, endsAt);
  }
}

/**
 * Upgrade a business to the Enterprise plan (unlimited duration).
 */
export async function upgradeToEnterprise(documentId: string): Promise<void> {
  const now = new Date();

  await strapi.documents('api::business.business').update({
    documentId,
    data: {
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
      subscriptionStartedAt: now,
      subscriptionEndsAt: null,
    } as any,
  });
}

/**
 * Check all trial businesses and expire those whose trialExpiresAt has passed.
 * Intended to be called by a daily cron job.
 */
export async function checkAndExpireTrials(): Promise<void> {
  const now = new Date();

  const expired = await strapi.db.query('api::business.business').findMany({
    where: {
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      trialExpiresAt: { $lte: now },
    },
    populate: ['owner'],
  });

  for (const business of expired) {
    try {
      await strapi.db.query('api::business.business').update({
        where: { id: business.id },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'expired',
        },
      });

      const owner = business.owner;
      if (owner?.email) {
        await sendTrialExpiredEmail(business, owner);
      }
    } catch (err: unknown) {
      console.error(`[Subscription] Failed to expire trial for business ${business.id}:`, (err as Error)?.message);
    }
  }
}

/**
 * Send a trial-ending-soon warning email to businesses whose trial expires in ≤3 days.
 * Intended to be called by a daily cron job.
 */
export async function sendTrialWarningSoon(): Promise<void> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const soonExpiring = await strapi.db.query('api::business.business').findMany({
    where: {
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      trialExpiresAt: { $gte: now, $lte: threeDaysFromNow },
    },
    populate: ['owner'],
  });

  for (const business of soonExpiring) {
    try {
      const owner = business.owner;
      if (owner?.email) {
        await sendTrialEndingSoonEmail(business, owner, new Date(business.trialExpiresAt));
      }
    } catch (err: unknown) {
      console.error(`[Subscription] Failed to send warning email for business ${business.id}:`, (err as Error)?.message);
    }
  }
}


const SUBSCRIPTION_SENDER_OPTS = { defaultSender: BUSINESS_BRAND_SENDER };

async function sendTrialActivatedEmail(business: any, owner: any, expiresAt: Date): Promise<void> {
  const lc = normalizeEmailLocale(owner?.emailLocale);
  const plansUrl = `${FRONTEND_URL}/business/plans`;
  const dashboardUrl = `${FRONTEND_URL}/business/dashboard`;
  const expiryString = expiresAt.toLocaleDateString(subscriptionDateLocale(lc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const { subject, html, from } = await renderEmailTemplate('subscription-trial-activated', {
    ownerName:
      owner.firstName ||
      owner.username ||
      (lc === 'en' ? 'User' : 'Utilizador'),
    businessName: business.name,
    trialDays: String(TRIAL_DAYS),
    expiryString,
    dashboardUrl,
    plansUrl,
  }, lc, SUBSCRIPTION_SENDER_OPTS);

  await strapi.plugins.email.services.email.send({
    to: owner.email,
    from,
    subject,
    html,
  });
}

async function sendTrialEndingSoonEmail(business: any, owner: any, expiresAt: Date): Promise<void> {
  const lc = normalizeEmailLocale(owner?.emailLocale);
  const plansUrl = `${FRONTEND_URL}/business/plans`;
  const expiryString = expiresAt.toLocaleDateString(subscriptionDateLocale(lc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const { subject, html, from } = await renderEmailTemplate('subscription-trial-ending-soon', {
    ownerName:
      owner.firstName ||
      owner.username ||
      (lc === 'en' ? 'User' : 'Utilizador'),
    businessName: business.name,
    expiryString,
    plansUrl,
  }, lc, SUBSCRIPTION_SENDER_OPTS);

  await strapi.plugins.email.services.email.send({
    to: owner.email,
    from,
    subject,
    html,
  });
}

async function sendTrialExpiredEmail(business: any, owner: any): Promise<void> {
  const lc = normalizeEmailLocale(owner?.emailLocale);
  const plansUrl = `${FRONTEND_URL}/business/plans`;

  const { subject, html, from } = await renderEmailTemplate('subscription-trial-expired', {
    ownerName:
      owner.firstName ||
      owner.username ||
      (lc === 'en' ? 'User' : 'Utilizador'),
    businessName: business.name,
    plansUrl,
  }, lc, SUBSCRIPTION_SENDER_OPTS);

  await strapi.plugins.email.services.email.send({
    to: owner.email,
    from,
    subject,
    html,
  });
}

async function sendProActivatedEmail(business: any, owner: any, endsAt: Date): Promise<void> {
  const lc = normalizeEmailLocale(owner?.emailLocale);
  const dashboardUrl = `${FRONTEND_URL}/business/dashboard`;
  const endString = endsAt.toLocaleDateString(subscriptionDateLocale(lc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const { subject, html, from } = await renderEmailTemplate('subscription-pro-activated', {
    ownerName:
      owner.firstName ||
      owner.username ||
      (lc === 'en' ? 'User' : 'Utilizador'),
    businessName: business.name,
    endString,
    dashboardUrl,
  }, lc, SUBSCRIPTION_SENDER_OPTS);

  await strapi.plugins.email.services.email.send({
    to: owner.email,
    from,
    subject,
    html,
  });
}
