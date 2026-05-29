/**
 * Admin dashboard controller
 * Handles admin-only operations with explicit admin token verification
 */

import { Context } from 'koa';
import crypto from 'crypto';
import { contentTypes } from '@strapi/utils';
import { invalidateGuestLimitCache } from '../../guest-session/controllers/guest-session';
import { rerunModerationForStoredReview } from '../../review/content-types/review/lifecycles';
import { signBusinessClaimCloudinaryPdfsAsync } from '../../../utils/cloudinary-sign-url';
import type { Core } from '@strapi/strapi';
import {
  applyBusinessCategoriesToData,
  enrichBusinessCategoryFields,
  enrichBusinessListCategoryFields,
  getBusinessCategoriesPopulate,
  getBusinessCategoryRelationKey,
  normalizeBusinessFiltersInput,
  normalizeBusinessPopulateInput,
  parseCategoryIdsFromInput,
  resolveCategoriesAndSector,
} from '../../../utils/business-categories';

const SITE_SETTING_DEFAULTS = {
  maintenanceMode: false,
  turnstileSiteGateEnabled: true,
  guestLimitEnabled: true,
  landingEnabled: true,
  /** When true, anonymous + business JWT users hit /business/coming-soon only; Shaolin admins bypass via admin session. */
  businessPortalComingSoon: false,
  homeTopReviewersEnabled: true,
  googleAuthEnabled: true,
  facebookAuthEnabled: true,
  emailAuthEnabled: true,
  businessEmailAuthEnabled: true,
  proPriceKz: 50000,
  enterprisePriceKz: 0,
  bankName: 'Banco Angolano de Investimentos (BAI)',
  bankAccountName: 'CliAvalia, Lda.',
  bankIBAN: 'AO06 0040 0000 1234 5678 9012 3',
  bankAccountNumber: '1234.5678.9012.3',
  emailSenderName: 'CliAvalia',
  emailSenderEmail: 'notificacoes@cliavalia.com',
  emailConfirmationTokenExpiry: 1440,
  passwordResetTokenExpiry: 60,
  // Plan feature flags — Free tier
  planFree_viewReviews: true,
  planFree_manageProfile: true,
  planFree_replyToReviews: false,
  planFree_dashboard: false,
  planFree_analytics: false,
  planFree_alerts: false,
  planFree_multiLocation: false,
  planFree_locationComparison: false,
  planFree_consolidatedDashboard: false,
  planFree_advancedReports: false,
  planFree_dedicatedSupport: false,
  planFree_guaranteedSLA: false,
  planFree_assistedOnboarding: false,
  // Plan feature flags — Pro tier
  planPro_viewReviews: true,
  planPro_manageProfile: true,
  planPro_replyToReviews: true,
  planPro_dashboard: true,
  planPro_analytics: true,
  planPro_alerts: true,
  planPro_multiLocation: false,
  planPro_locationComparison: false,
  planPro_consolidatedDashboard: false,
  planPro_advancedReports: false,
  planPro_dedicatedSupport: false,
  planPro_guaranteedSLA: false,
  planPro_assistedOnboarding: false,
  // Plan feature flags — Enterprise tier
  planEnterprise_viewReviews: true,
  planEnterprise_manageProfile: true,
  planEnterprise_replyToReviews: true,
  planEnterprise_dashboard: true,
  planEnterprise_analytics: true,
  planEnterprise_alerts: true,
  planEnterprise_multiLocation: true,
  planEnterprise_locationComparison: true,
  planEnterprise_consolidatedDashboard: true,
  planEnterprise_advancedReports: true,
  planEnterprise_dedicatedSupport: true,
  planEnterprise_guaranteedSLA: true,
  planEnterprise_assistedOnboarding: true,
} as const;

type SiteSettingKey = keyof typeof SITE_SETTING_DEFAULTS;

async function readSiteSettings(strapi: any) {
  const store = strapi.store({ type: 'core', name: 'site-settings' });

  const [
    guestLimitEnabled,
    landingEnabled,
    businessPortalComingSoon,
    homeTopReviewersEnabled,
    googleAuthEnabled,
    facebookAuthEnabled,
    emailAuthEnabled,
    businessEmailAuthEnabled,
    proPriceKz,
    enterprisePriceKz,
    bankName,
    bankAccountName,
    bankIBAN,
    bankAccountNumber,
    planFree_viewReviews,
    planFree_manageProfile,
    planFree_replyToReviews,
    planFree_dashboard,
    planFree_analytics,
    planFree_alerts,
    planFree_multiLocation,
    planFree_locationComparison,
    planFree_consolidatedDashboard,
    planFree_advancedReports,
    planFree_dedicatedSupport,
    planFree_guaranteedSLA,
    planFree_assistedOnboarding,
    planPro_viewReviews,
    planPro_manageProfile,
    planPro_replyToReviews,
    planPro_dashboard,
    planPro_analytics,
    planPro_alerts,
    planPro_multiLocation,
    planPro_locationComparison,
    planPro_consolidatedDashboard,
    planPro_advancedReports,
    planPro_dedicatedSupport,
    planPro_guaranteedSLA,
    planPro_assistedOnboarding,
    planEnterprise_viewReviews,
    planEnterprise_manageProfile,
    planEnterprise_replyToReviews,
    planEnterprise_dashboard,
    planEnterprise_analytics,
    planEnterprise_alerts,
    planEnterprise_multiLocation,
    planEnterprise_locationComparison,
    planEnterprise_consolidatedDashboard,
    planEnterprise_advancedReports,
    planEnterprise_dedicatedSupport,
    planEnterprise_guaranteedSLA,
    planEnterprise_assistedOnboarding,
    emailSenderName,
    emailSenderEmail,
    emailConfirmationTokenExpiry,
    passwordResetTokenExpiry,
    maintenanceMode,
    turnstileSiteGateEnabledStored,
    turnstileSiteGateEnabledLegacy,
  ] =
    await Promise.all([
      store.get({ key: 'guestLimitEnabled' }),
      store.get({ key: 'landingEnabled' }),
      store.get({ key: 'businessPortalComingSoon' }),
      store.get({ key: 'homeTopReviewersEnabled' }),
      store.get({ key: 'googleAuthEnabled' }),
      store.get({ key: 'facebookAuthEnabled' }),
      store.get({ key: 'emailAuthEnabled' }),
      store.get({ key: 'businessEmailAuthEnabled' }),
      store.get({ key: 'proPriceKz' }),
      store.get({ key: 'enterprisePriceKz' }),
      store.get({ key: 'bankName' }),
      store.get({ key: 'bankAccountName' }),
      store.get({ key: 'bankIBAN' }),
      store.get({ key: 'bankAccountNumber' }),
      store.get({ key: 'planFree_viewReviews' }),
      store.get({ key: 'planFree_manageProfile' }),
      store.get({ key: 'planFree_replyToReviews' }),
      store.get({ key: 'planFree_dashboard' }),
      store.get({ key: 'planFree_analytics' }),
      store.get({ key: 'planFree_alerts' }),
      store.get({ key: 'planFree_multiLocation' }),
      store.get({ key: 'planFree_locationComparison' }),
      store.get({ key: 'planFree_consolidatedDashboard' }),
      store.get({ key: 'planFree_advancedReports' }),
      store.get({ key: 'planFree_dedicatedSupport' }),
      store.get({ key: 'planFree_guaranteedSLA' }),
      store.get({ key: 'planFree_assistedOnboarding' }),
      store.get({ key: 'planPro_viewReviews' }),
      store.get({ key: 'planPro_manageProfile' }),
      store.get({ key: 'planPro_replyToReviews' }),
      store.get({ key: 'planPro_dashboard' }),
      store.get({ key: 'planPro_analytics' }),
      store.get({ key: 'planPro_alerts' }),
      store.get({ key: 'planPro_multiLocation' }),
      store.get({ key: 'planPro_locationComparison' }),
      store.get({ key: 'planPro_consolidatedDashboard' }),
      store.get({ key: 'planPro_advancedReports' }),
      store.get({ key: 'planPro_dedicatedSupport' }),
      store.get({ key: 'planPro_guaranteedSLA' }),
      store.get({ key: 'planPro_assistedOnboarding' }),
      store.get({ key: 'planEnterprise_viewReviews' }),
      store.get({ key: 'planEnterprise_manageProfile' }),
      store.get({ key: 'planEnterprise_replyToReviews' }),
      store.get({ key: 'planEnterprise_dashboard' }),
      store.get({ key: 'planEnterprise_analytics' }),
      store.get({ key: 'planEnterprise_alerts' }),
      store.get({ key: 'planEnterprise_multiLocation' }),
      store.get({ key: 'planEnterprise_locationComparison' }),
      store.get({ key: 'planEnterprise_consolidatedDashboard' }),
      store.get({ key: 'planEnterprise_advancedReports' }),
      store.get({ key: 'planEnterprise_dedicatedSupport' }),
      store.get({ key: 'planEnterprise_guaranteedSLA' }),
      store.get({ key: 'planEnterprise_assistedOnboarding' }),
      store.get({ key: 'emailSenderName' }),
      store.get({ key: 'emailSenderEmail' }),
      store.get({ key: 'emailConfirmationTokenExpiry' }),
      store.get({ key: 'passwordResetTokenExpiry' }),
      store.get({ key: 'maintenanceMode' }),
      store.get({ key: 'turnstileSiteGateEnabled' }),
      store.get({ key: 'turnstileEnabled' }),
    ]);

  const turnstileSiteGateEnabled =
    turnstileSiteGateEnabledStored !== null && turnstileSiteGateEnabledStored !== undefined
      ? Boolean(turnstileSiteGateEnabledStored)
      : turnstileSiteGateEnabledLegacy !== null && turnstileSiteGateEnabledLegacy !== undefined
        ? Boolean(turnstileSiteGateEnabledLegacy)
        : SITE_SETTING_DEFAULTS.turnstileSiteGateEnabled;

  const b = (val: unknown, key: keyof typeof SITE_SETTING_DEFAULTS) =>
    val === null ? Boolean(SITE_SETTING_DEFAULTS[key]) : Boolean(val);

  return {
    guestLimitEnabled: b(guestLimitEnabled, 'guestLimitEnabled'),
    landingEnabled: b(landingEnabled, 'landingEnabled'),
    businessPortalComingSoon: b(businessPortalComingSoon, 'businessPortalComingSoon'),
    homeTopReviewersEnabled: b(homeTopReviewersEnabled, 'homeTopReviewersEnabled'),
    googleAuthEnabled: b(googleAuthEnabled, 'googleAuthEnabled'),
    facebookAuthEnabled: b(facebookAuthEnabled, 'facebookAuthEnabled'),
    emailAuthEnabled: b(emailAuthEnabled, 'emailAuthEnabled'),
    businessEmailAuthEnabled: b(businessEmailAuthEnabled, 'businessEmailAuthEnabled'),
    proPriceKz:
      proPriceKz === null ? SITE_SETTING_DEFAULTS.proPriceKz : Number(proPriceKz),
    enterprisePriceKz:
      enterprisePriceKz === null ? SITE_SETTING_DEFAULTS.enterprisePriceKz : Number(enterprisePriceKz),
    bankName:
      bankName === null ? SITE_SETTING_DEFAULTS.bankName : String(bankName),
    bankAccountName:
      bankAccountName === null ? SITE_SETTING_DEFAULTS.bankAccountName : String(bankAccountName),
    bankIBAN:
      bankIBAN === null ? SITE_SETTING_DEFAULTS.bankIBAN : String(bankIBAN),
    bankAccountNumber:
      bankAccountNumber === null ? SITE_SETTING_DEFAULTS.bankAccountNumber : String(bankAccountNumber),
    emailSenderName:
      emailSenderName === null ? SITE_SETTING_DEFAULTS.emailSenderName : String(emailSenderName),
    emailSenderEmail:
      emailSenderEmail === null ? SITE_SETTING_DEFAULTS.emailSenderEmail : String(emailSenderEmail),
    // Plan feature flags — Free tier
    planFree_viewReviews: b(planFree_viewReviews, 'planFree_viewReviews'),
    planFree_manageProfile: b(planFree_manageProfile, 'planFree_manageProfile'),
    planFree_replyToReviews: b(planFree_replyToReviews, 'planFree_replyToReviews'),
    planFree_dashboard: b(planFree_dashboard, 'planFree_dashboard'),
    planFree_analytics: b(planFree_analytics, 'planFree_analytics'),
    planFree_alerts: b(planFree_alerts, 'planFree_alerts'),
    planFree_multiLocation: b(planFree_multiLocation, 'planFree_multiLocation'),
    planFree_locationComparison: b(planFree_locationComparison, 'planFree_locationComparison'),
    planFree_consolidatedDashboard: b(planFree_consolidatedDashboard, 'planFree_consolidatedDashboard'),
    planFree_advancedReports: b(planFree_advancedReports, 'planFree_advancedReports'),
    planFree_dedicatedSupport: b(planFree_dedicatedSupport, 'planFree_dedicatedSupport'),
    planFree_guaranteedSLA: b(planFree_guaranteedSLA, 'planFree_guaranteedSLA'),
    planFree_assistedOnboarding: b(planFree_assistedOnboarding, 'planFree_assistedOnboarding'),
    // Plan feature flags — Pro tier
    planPro_viewReviews: b(planPro_viewReviews, 'planPro_viewReviews'),
    planPro_manageProfile: b(planPro_manageProfile, 'planPro_manageProfile'),
    planPro_replyToReviews: b(planPro_replyToReviews, 'planPro_replyToReviews'),
    planPro_dashboard: b(planPro_dashboard, 'planPro_dashboard'),
    planPro_analytics: b(planPro_analytics, 'planPro_analytics'),
    planPro_alerts: b(planPro_alerts, 'planPro_alerts'),
    planPro_multiLocation: b(planPro_multiLocation, 'planPro_multiLocation'),
    planPro_locationComparison: b(planPro_locationComparison, 'planPro_locationComparison'),
    planPro_consolidatedDashboard: b(planPro_consolidatedDashboard, 'planPro_consolidatedDashboard'),
    planPro_advancedReports: b(planPro_advancedReports, 'planPro_advancedReports'),
    planPro_dedicatedSupport: b(planPro_dedicatedSupport, 'planPro_dedicatedSupport'),
    planPro_guaranteedSLA: b(planPro_guaranteedSLA, 'planPro_guaranteedSLA'),
    planPro_assistedOnboarding: b(planPro_assistedOnboarding, 'planPro_assistedOnboarding'),
    // Plan feature flags — Enterprise tier
    planEnterprise_viewReviews: b(planEnterprise_viewReviews, 'planEnterprise_viewReviews'),
    planEnterprise_manageProfile: b(planEnterprise_manageProfile, 'planEnterprise_manageProfile'),
    planEnterprise_replyToReviews: b(planEnterprise_replyToReviews, 'planEnterprise_replyToReviews'),
    planEnterprise_dashboard: b(planEnterprise_dashboard, 'planEnterprise_dashboard'),
    planEnterprise_analytics: b(planEnterprise_analytics, 'planEnterprise_analytics'),
    planEnterprise_alerts: b(planEnterprise_alerts, 'planEnterprise_alerts'),
    planEnterprise_multiLocation: b(planEnterprise_multiLocation, 'planEnterprise_multiLocation'),
    planEnterprise_locationComparison: b(planEnterprise_locationComparison, 'planEnterprise_locationComparison'),
    planEnterprise_consolidatedDashboard: b(planEnterprise_consolidatedDashboard, 'planEnterprise_consolidatedDashboard'),
    planEnterprise_advancedReports: b(planEnterprise_advancedReports, 'planEnterprise_advancedReports'),
    planEnterprise_dedicatedSupport: b(planEnterprise_dedicatedSupport, 'planEnterprise_dedicatedSupport'),
    planEnterprise_guaranteedSLA: b(planEnterprise_guaranteedSLA, 'planEnterprise_guaranteedSLA'),
    planEnterprise_assistedOnboarding: b(planEnterprise_assistedOnboarding, 'planEnterprise_assistedOnboarding'),
    emailConfirmationTokenExpiry:
      emailConfirmationTokenExpiry === null
        ? SITE_SETTING_DEFAULTS.emailConfirmationTokenExpiry
        : Math.max(1, Math.round(Number(emailConfirmationTokenExpiry))),
    passwordResetTokenExpiry:
      passwordResetTokenExpiry === null
        ? SITE_SETTING_DEFAULTS.passwordResetTokenExpiry
        : Math.max(1, Math.round(Number(passwordResetTokenExpiry))),
    maintenanceMode: b(maintenanceMode, 'maintenanceMode'),
    turnstileSiteGateEnabled,
  };
}

// Helper to verify admin token
async function verifyAdminToken(ctx: Context, strapi: any): Promise<any | null> {
  // Get admin JWT secret for signature verification
  const adminJwtSecret = strapi.config.get('admin.auth.secret');
  const authHeader = ctx.request.header.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return null;
  }

  try {
    // Try using admin auth service first (Strapi v5)
    const adminAuthService = strapi.admin?.services?.auth;
    if (adminAuthService && typeof adminAuthService.verify === 'function') {
      try {
        console.log('[ADMIN-DASHBOARD] Attempting to use adminAuthService.verify()');
        const adminUser = await adminAuthService.verify(token);
        console.log('[ADMIN-DASHBOARD] adminAuthService.verify() returned:', adminUser ? `User ID: ${adminUser.id || adminUser.userId || 'unknown'}` : 'null');
        
        if (adminUser) {
          const userId = adminUser.id || adminUser.userId;
          if (userId) {
            // Verify admin user still exists and is active
            const adminUserService = strapi.admin?.services?.user;
            if (adminUserService) {
              const fullAdminUser = await adminUserService.findOne(userId);
              if (fullAdminUser && fullAdminUser.id && !fullAdminUser.blocked) {
                console.log('[ADMIN-DASHBOARD] Admin user verified successfully via auth service');
                return fullAdminUser;
              }
            }
            return adminUser;
          }
        }
      } catch (verifyError: any) {
        console.log('[ADMIN-DASHBOARD] Auth service verify failed:', verifyError.message || verifyError);
        if (verifyError.stack) {
          console.log('[ADMIN-DASHBOARD] Auth service verify error stack:', verifyError.stack);
        }
        // Fall through to alternative verification
      }
    } else {
      console.log('[ADMIN-DASHBOARD] adminAuthService.verify() not available, using alternative method');
    }

    // Alternative: Use token service to decode and verify manually
    const adminTokenService = strapi.admin?.services?.token;
    if (adminTokenService) {
      let decoded: any;
      
      // Try to decode the token
      if (typeof adminTokenService.decode === 'function') {
        try {
          decoded = await adminTokenService.decode(token);
        } catch {
          decoded = adminTokenService.decode(token);
        }
      } else {
        // Manual decode as fallback (without signature verification)
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
            decoded = JSON.parse(payload);
          } catch (parseError) {
            console.error('[ADMIN-DASHBOARD] Failed to decode token');
            return null;
          }
        } else {
          return null;
        }
      }

      // Log the decoded payload for debugging
      console.log('[ADMIN-DASHBOARD] Decoded token payload:', JSON.stringify(decoded, null, 2));
      
      // Admin tokens in Strapi v5 might use 'id', 'sub', or have nested structure
      const userId = decoded.id || decoded.sub || decoded.user?.id || decoded.userId;
      
      if (!decoded || !userId) {
        console.log('[ADMIN-DASHBOARD] Token decode returned no user ID. Available fields:', Object.keys(decoded || {}));
        return null;
      }

      // Check token expiration manually if exp is present
      if (decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
          console.log('[ADMIN-DASHBOARD] Token has expired');
          return null;
        }
      }

      // Verify JWT signature if we have the secret
      if (adminJwtSecret) {
        try {
          // Try to use jsonwebtoken if available
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const jwt = require('jsonwebtoken');
          
          if (jwt && jwt.verify) {
            try {
              jwt.verify(token, adminJwtSecret);
            } catch (jwtError: any) {
              console.log('[ADMIN-DASHBOARD] JWT signature verification failed:', jwtError.message);
              return null;
            }
          }
        } catch (error: any) {
          // jsonwebtoken not available or require failed
          // Log but continue without signature verification as fallback
          console.warn('[ADMIN-DASHBOARD] Could not verify JWT signature:', error.message || 'jsonwebtoken not available');
        }
      }

      // Verify admin user exists and is active
      const adminUserService = strapi.admin?.services?.user;
      if (!adminUserService) {
        console.error('[ADMIN-DASHBOARD] Admin user service not available');
        return null;
      }

      const adminUser = await adminUserService.findOne(userId);
      if (!adminUser || !adminUser.id || adminUser.blocked) {
        console.log('[ADMIN-DASHBOARD] Admin user not found or blocked');
        return null;
      }

      return adminUser;
    }

    console.error('[ADMIN-DASHBOARD] No admin token service available');
    return null;
  } catch (error: any) {
    // Log the error for debugging
    console.error('[ADMIN-DASHBOARD] Token verification error:', error.message || error);
    if (error.stack) {
      console.error('[ADMIN-DASHBOARD] Error stack:', error.stack);
    }
    return null;
  }
}

// Parse pagination params
// Supports both flat bracket keys (querystring) and nested objects (qs-parsed by strapi::query)
function parsePagination(query: any) {
  const nested = query?.pagination;
  const page = parseInt(query['pagination[page]'] ?? nested?.page ?? query.page ?? '1', 10);
  const pageSize = parseInt(query['pagination[pageSize]'] ?? nested?.pageSize ?? query.pageSize ?? '25', 10);
  return { page, pageSize, start: (page - 1) * pageSize, limit: pageSize };
}

// Parse sort parameter - converts "createdAt:desc" to { createdAt: 'desc' } format for Strapi v5
function parseSort(query: any, defaultSort: string = 'createdAt:desc'): Record<string, 'asc' | 'desc'> {
  let sortParam = query['sort[0]'] || query.sort || defaultSort;
  
  // Handle array format (e.g., sort[0]=createdAt:desc becomes ["createdAt:desc"])
  if (Array.isArray(sortParam)) {
    sortParam = sortParam[0] || defaultSort;
  }
  
  // URL decode the parameter if it's a string (in case : is encoded as %3A)
  if (typeof sortParam === 'string') {
    try {
      sortParam = decodeURIComponent(sortParam);
    } catch (e) {
      // If decoding fails, use as-is
    }
  }
  
  console.log('[ADMIN-DASHBOARD] parseSort input:', sortParam, 'type:', typeof sortParam);
  
  // If it's already an object (but not array - we handled that above), return it
  if (typeof sortParam === 'object' && sortParam !== null && !Array.isArray(sortParam)) {
    console.log('[ADMIN-DASHBOARD] parseSort: already object:', sortParam);
    return sortParam as Record<string, 'asc' | 'desc'>;
  }
  
  // Parse "field:order" format
  if (typeof sortParam === 'string' && sortParam.includes(':')) {
    const [field, order] = sortParam.split(':');
    const result: Record<string, 'asc' | 'desc'> = { [field]: order.toLowerCase() as 'asc' | 'desc' };
    console.log('[ADMIN-DASHBOARD] parseSort result:', result);
    return result;
  }
  
  // Default to descending
  if (typeof sortParam === 'string') {
    const result: Record<string, 'asc' | 'desc'> = { [sortParam]: 'desc' };
    console.log('[ADMIN-DASHBOARD] parseSort result (default order):', result);
    return result;
  }
  
  console.log('[ADMIN-DASHBOARD] parseSort: using default { createdAt: desc }');
  return { createdAt: 'desc' };
}

// Get default populate for content type
function getDefaultPopulateForContentType(
  strapi: Core.Strapi,
  contentType: string,
): Record<string, boolean> | undefined {
  const categoryKey = getBusinessCategoryRelationKey(strapi);
  const relationsByType: Record<string, Record<string, boolean>> = {
    'business-claim': {
      // Only populate actual relations that exist in the schema
      licenseFile: true,
      officialLetter: true,
      idCopy: true,
      reviewedBy: true,
    },
    'reviewer-verification': {
      user: true,
      selfie: true,
      identityDocument: true,
      reviewedBy: true,
    },
    'business': {
      owner: true,
      [categoryKey]: true,
      sector: true,
      provinces: true,
    },
    'review': {
      business: true,
      users_permissions_user: true,
    },
    'user': {
      role: true,
    },
    'province': {
      municipalities: true,
    },
    'municipality': {
      province: true,
    },
    'sector': {
      categories: true,
    },
    'category': {
      sector: true,
    },
    'agency': {
      business: true,
      province: true,
      municipality: true,
    },
  };
  
  return relationsByType[contentType];
}

// Parse populate parameter for Strapi v5 document service
// For wildcard populate, we return specific relations per content type
function parsePopulateForContentType(
  query: any,
  contentType: string,
  strapi: Core.Strapi,
): any {
  const populateValue = query.populate;
  
  // If no populate specified, use defaults for the content type
  if (!populateValue) {
    const defaults = getDefaultPopulateForContentType(strapi, contentType);
    return contentType === 'business'
      ? normalizeBusinessPopulateInput(strapi, defaults)
      : defaults;
  }
  
  // For wildcard populate, use defaults
  if (populateValue === '*' || populateValue === 'true' || populateValue === true) {
    const defaults = getDefaultPopulateForContentType(strapi, contentType);
    return contentType === 'business'
      ? normalizeBusinessPopulateInput(strapi, defaults)
      : defaults;
  }
  
  if (typeof populateValue === 'string') {
    // Single relation name - convert to object format
    const single = { [populateValue]: true };
    return contentType === 'business'
      ? normalizeBusinessPopulateInput(strapi, single)
      : single;
  }
  
  if (Array.isArray(populateValue)) {
    // Convert array to object format
    const result: Record<string, boolean> = {};
    populateValue.forEach((rel: string) => {
      result[rel] = true;
    });
    return contentType === 'business'
      ? normalizeBusinessPopulateInput(strapi, result)
      : result;
  }
  
  // Already an object
  const result = populateValue;
  return contentType === 'business'
    ? normalizeBusinessPopulateInput(strapi, result)
    : result;
}

// Parse filters from query
// Supports both flat bracket keys (querystring) and nested objects (qs-parsed by strapi::query)
function parseFilters(query: any): any {
  // If strapi::query middleware already parsed filters into a nested object, use it directly
  if (query.filters && typeof query.filters === 'object' && !Array.isArray(query.filters)) {
    console.log('[ADMIN-DASHBOARD] Parsed filters (nested/qs):', JSON.stringify(query.filters, null, 2));
    return query.filters;
  }

  // Fallback: parse flat bracket-notation keys (e.g. filters[field][$eq])
  const filters: any = {};
  const andConditions: any[] = [];
  const orConditions: any[] = [];
  const simpleFilters: any = {};
  
  Object.keys(query).forEach(key => {
    // Handle filters[$and][0][field][$eq] format
    const andFilterMatch = key.match(/^filters\[\$and\]\[(\d+)\]\[(\w+)\]\[\$(\w+)\]$/);
    if (andFilterMatch) {
      const [, , field, operator] = andFilterMatch;
      andConditions.push({ [field]: { [`$${operator}`]: query[key] } });
      return;
    }
    
    // Handle filters[$or][0][field][$eq] format
    const orFilterMatch = key.match(/^filters\[\$or\]\[(\d+)\]\[(\w+)\]\[\$(\w+)\]$/);
    if (orFilterMatch) {
      const [, , field, operator] = orFilterMatch;
      orConditions.push({ [field]: { [`$${operator}`]: query[key] } });
      return;
    }
    
    // Handle filters[field][$eq] format (simple filter)
    // Updated regex to handle camelCase field names like claimStatus
    const simpleMatch = key.match(/^filters\[([\w]+)\]\[\$(\w+)\]$/);
    if (simpleMatch) {
      const [, field, operator] = simpleMatch;
      simpleFilters[field] = { [`$${operator}`]: query[key] };
      return;
    }
  });
  
  // Combine filters properly:
  // - Simple filters (like claimStatus) should be combined with $or filters using $and
  // - If we have both simple filters and $or filters, wrap them in $and
  if (Object.keys(simpleFilters).length > 0 && orConditions.length > 0) {
    // Add simple filters as individual $and conditions
    Object.keys(simpleFilters).forEach(field => {
      andConditions.push({ [field]: simpleFilters[field] });
    });
    // Add $or as a single $and condition
    andConditions.push({ $or: orConditions });
    filters['$and'] = andConditions;
  } else if (Object.keys(simpleFilters).length > 0) {
    // Only simple filters - use them directly
    Object.assign(filters, simpleFilters);
    // Also add any existing $and conditions
    if (andConditions.length > 0) {
      filters['$and'] = andConditions;
    }
  } else if (orConditions.length > 0) {
    // Only $or filters
    filters['$or'] = orConditions;
    // Also add any existing $and conditions
    if (andConditions.length > 0) {
      filters['$and'] = andConditions;
    }
  } else if (andConditions.length > 0) {
    // Only $and conditions
    filters['$and'] = andConditions;
  }
  
  console.log('[ADMIN-DASHBOARD] Parsed filters:', JSON.stringify(filters, null, 2));
  console.log('[ADMIN-DASHBOARD] Simple filters:', JSON.stringify(simpleFilters, null, 2));
  console.log('[ADMIN-DASHBOARD] OR conditions:', JSON.stringify(orConditions, null, 2));
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/** Adds isPublished (live on public API) for draft-and-publish content types; list/findMany returns draft rows. */
async function attachIsPublishedToResults(strapi: any, uid: string, results: any[]) {
  if (!Array.isArray(results) || results.length === 0) return results;
  const model = strapi.getModel(uid);
  if (!model || !contentTypes.hasDraftAndPublish(model)) {
    return results.map((r) => ({ ...r, isPublished: true }));
  }
  const documentIds = [...new Set(results.map((r) => r.documentId).filter(Boolean))] as string[];
  if (!documentIds.length) return results.map((r) => ({ ...r, isPublished: false }));
  const publishedRows = await strapi.db.query(uid).findMany({
    where: { documentId: { $in: documentIds }, publishedAt: { $ne: null } },
    select: ['documentId'],
  });
  const pubSet = new Set((publishedRows as { documentId: string }[]).map((p) => p.documentId));
  return results.map((r) => ({ ...r, isPublished: Boolean(r.documentId && pubSet.has(r.documentId)) }));
}

export default {
  // Business Claims
  async getBusinessClaims(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    let filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'business-claim', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Ensure claimStatus filter is always applied if provided in query
    // This is a safeguard to ensure the filter is never lost
    const claimStatusFromQuery =
      (ctx.query as any)?.filters?.claimStatus?.['$eq'] ??
      ctx.query['filters[claimStatus][$eq]'] as string | undefined;
    if (claimStatusFromQuery && ['pending', 'approved', 'rejected'].includes(claimStatusFromQuery)) {
      // If filters already exist, ensure claimStatus is included
      if (filters) {
        // Check if claimStatus is already in filters
        const hasClaimStatus = filters.claimStatus || 
          (filters.$and && filters.$and.some((cond: any) => cond.claimStatus));
        
        if (!hasClaimStatus) {
          // Add claimStatus to filters
          if (filters.$and) {
            filters.$and.push({ claimStatus: { $eq: claimStatusFromQuery } });
          } else if (filters.$or) {
            // If we have $or but no $and, create $and with claimStatus and $or
            // Preserve any other top-level filters
            const newFilters: any = {
              $and: [
                { claimStatus: { $eq: claimStatusFromQuery } },
                { $or: filters.$or }
              ]
            };
            // Copy any other top-level properties
            Object.keys(filters).forEach(key => {
              if (key !== '$or' && key !== '$and') {
                newFilters[key] = filters[key];
              }
            });
            filters = newFilters;
          } else {
            // Simple case - add claimStatus directly
            filters.claimStatus = { $eq: claimStatusFromQuery };
          }
        }
      } else {
        // No filters exist, create simple claimStatus filter
        filters = { claimStatus: { $eq: claimStatusFromQuery } };
      }
    }

    console.log('[ADMIN-DASHBOARD] getBusinessClaims - Query:', JSON.stringify(ctx.query));
    console.log('[ADMIN-DASHBOARD] getBusinessClaims - Sort:', JSON.stringify(sort));
    console.log('[ADMIN-DASHBOARD] getBusinessClaims - Final Filters:', JSON.stringify(filters, null, 2));

    try {
      // Build query options - only include properties that are defined
      const findManyOptions: any = {
        limit,
        start: start,
      };
      
      if (filters) {
        findManyOptions.filters = filters;
      }
      
      if (populate) {
        findManyOptions.populate = populate;
      }
      
      if (sort) {
        findManyOptions.orderBy = sort as any;
      }
      
      const countOptions: any = {};
      if (filters) {
        countOptions.filters = filters;
      }
      
      const [results, total] = await Promise.all([
        strapi.documents('api::business-claim.business-claim').findMany(findManyOptions),
        strapi.documents('api::business-claim.business-claim').count(countOptions),
      ]);

      ctx.body = {
        data: await Promise.all(
          results.map((r) =>
            signBusinessClaimCloudinaryPdfsAsync(strapi, r as Record<string, unknown>),
          ),
        ),
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            total,
          },
        },
      };
    } catch (error: any) {
      console.error('[ADMIN-DASHBOARD] getBusinessClaims error:', error.message);
      console.error('[ADMIN-DASHBOARD] getBusinessClaims stack:', error.stack);
      throw error;
    }
  },

  async getBusinessClaim(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'business-claim', strapi);

    const result = await strapi.documents('api::business-claim.business-claim').findOne({
      documentId: id,
      populate,
    });

    if (!result) {
      return ctx.notFound('Business claim not found');
    }

    ctx.body = {
      data: await signBusinessClaimCloudinaryPdfsAsync(strapi, result as Record<string, unknown>),
    };
  },

  async updateBusinessClaim(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const data = ctx.request.body;
    const updateData = data.data || data;

    // Get the current claim to check status change
    const currentClaim = await strapi.documents('api::business-claim.business-claim').findOne({
      documentId: id,
    });

    if (!currentClaim) {
      return ctx.notFound('Business claim not found');
    }

    const previousStatus = currentClaim.claimStatus;
    const newStatus = updateData.claimStatus;

    // Prepare update data
    const claimUpdateData: any = { ...updateData };

    // If rejecting, ensure rejectionReason is included
    if (newStatus === 'rejected' && updateData.rejectionReason) {
      claimUpdateData.rejectionReason = updateData.rejectionReason.trim();
    }

    // Update the claim
    const result = await strapi.documents('api::business-claim.business-claim').update({
      documentId: id,
      data: claimUpdateData,
    });

    if (!result) {
      return ctx.notFound('Business claim not found');
    }

    // Note: Email notifications are handled by the lifecycle hook (afterUpdate)
    // This prevents duplicate processing and ensures the update is fully committed first
    if (newStatus && newStatus !== previousStatus) {
      strapi.log.info(`[ADMIN-DASHBOARD] Status changed from '${previousStatus}' to '${newStatus}' for claim ${id}. Lifecycle hook will handle email notifications.`);
    }

    const populate = getDefaultPopulateForContentType(strapi, 'business-claim');
    const fullClaim = await strapi.documents('api::business-claim.business-claim').findOne({
      documentId: id,
      populate,
    });

    if (!fullClaim) {
      return ctx.notFound('Business claim not found');
    }

    const signedClaim = await signBusinessClaimCloudinaryPdfsAsync(strapi, fullClaim as Record<string, unknown>);

    ctx.body = { data: signedClaim };
  },

  // Users (users-permissions plugin)
  async getUsers(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);

    const [results, total] = await Promise.all([
      strapi.db.query('plugin::users-permissions.user').findMany({
        where: filters,
        populate: ['role'],
        limit,
        offset: start,
        orderBy: { createdAt: 'desc' },
      }),
      strapi.db.query('plugin::users-permissions.user').count({ where: filters }),
    ]);

    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getUser(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;

    const result = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: ['role'],
    });

    if (!result) {
      return ctx.notFound('User not found');
    }

    ctx.body = { data: result };
  },

  async updateUser(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const data = ctx.request.body;

    const result = await strapi.db.query('plugin::users-permissions.user').update({
      where: { id },
      data: data.data || data,
    });

    if (!result) {
      return ctx.notFound('User not found');
    }

    ctx.body = { data: result };
  },

  // Businesses
  async getBusinesses(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    let filters = parseFilters(ctx.query);
    if (filters) {
      filters = normalizeBusinessFiltersInput(strapi, filters);
    }
    const populate = parsePopulateForContentType(ctx.query, 'business', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Build query options - only include properties that are defined
    const findManyOptions: any = {
      limit,
      start: start,
    };
    
    if (filters) {
      findManyOptions.filters = filters;
    }
    
    if (populate) {
      findManyOptions.populate = populate;
    }
    
    if (sort) {
      findManyOptions.orderBy = sort as any;
    }
    
    const countOptions: any = {};
    if (filters) {
      countOptions.filters = filters;
    }

    const [results, total] = await Promise.all([
      strapi.documents('api::business.business').findMany(findManyOptions),
      strapi.documents('api::business.business').count(countOptions),
    ]);

    ctx.body = {
      data: enrichBusinessListCategoryFields(results as Record<string, unknown>[]),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'business', strapi);

    const result = await strapi.documents('api::business.business').findOne({
      documentId: id,
      populate,
    });

    if (!result) {
      return ctx.notFound('Business not found');
    }

    ctx.body = { data: enrichBusinessCategoryFields(result as Record<string, unknown>) };
  },

  // Reviews
  async getReviews(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'review', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Build query options - only include properties that are defined
    const findManyOptions: any = {
      limit,
      start: start,
    };
    
    if (filters) {
      findManyOptions.filters = filters;
    }
    
    if (populate) {
      findManyOptions.populate = populate;
    }
    
    if (sort) {
      findManyOptions.orderBy = sort as any;
    }
    
    const countOptions: any = {};
    if (filters) {
      countOptions.filters = filters;
    }

    const [results, total] = await Promise.all([
      strapi.documents('api::review.review').findMany(findManyOptions),
      strapi.documents('api::review.review').count(countOptions),
    ]);

    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getReview(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'review', strapi);

    const result = await strapi.documents('api::review.review').findOne({
      documentId: id,
      populate,
    });

    if (!result) {
      return ctx.notFound('Review not found');
    }

    ctx.body = { data: result };
  },

  async updateReview(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const data = ctx.request.body;

    const result = await strapi.documents('api::review.review').update({
      documentId: id,
      data: data.data || data,
    });

    if (!result) {
      return ctx.notFound('Review not found');
    }

    ctx.body = { data: result };
  },

  async deleteReview(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;

    const result = await strapi.documents('api::review.review').delete({
      documentId: id,
    });

    if (!result) {
      return ctx.notFound('Review not found');
    }

    ctx.body = { data: result };
  },

  async rerunReviewModeration(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;

    const currentReview = await strapi.documents('api::review.review').findOne({
      documentId: id,
      fields: [
        'documentId',
        'reviewText',
        'audioTranscription',
        'originalLocale',
        'awaitingEntityApproval',
      ],
      populate: {
        experiencePhotos: true,
      },
    });

    if (!currentReview) {
      return ctx.notFound('Review not found');
    }

    const storedReview = currentReview as any;

    const moderationData = await rerunModerationForStoredReview({
      reviewText: storedReview.reviewText,
      audioTranscription: storedReview.audioTranscription,
      experiencePhotos: storedReview.experiencePhotos,
      originalLocale: storedReview.originalLocale,
      awaitingEntityApproval: storedReview.awaitingEntityApproval,
    });

    const result = await strapi.documents('api::review.review').update({
      documentId: id,
      data: moderationData,
    });

    if (!result) {
      return ctx.notFound('Review not found');
    }

    ctx.body = { data: result };
  },

  // Appeals
  async getAppeals(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'review', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Build base filter to only get reviews with appeals
    const baseFilters: any = {
      appeal_submitted: true,
    };

    // Merge with additional filters
    const finalFilters = filters ? { $and: [baseFilters, filters] } : baseFilters;

    const findManyOptions: any = {
      limit,
      start: start,
      filters: finalFilters,
    };

    if (populate) {
      findManyOptions.populate = populate;
    } else {
      findManyOptions.populate = {
        users_permissions_user: {
          fields: ['id', 'username', 'email', 'emailLocale'],
        },
        business: {
          fields: ['id', 'name', 'slug'],
        },
      };
    }

    if (sort) {
      findManyOptions.orderBy = sort as any;
    }

    const countOptions: any = {
      filters: finalFilters,
    };

    try {
      const [results, total] = await Promise.all([
        strapi.documents('api::review.review').findMany(findManyOptions),
        strapi.documents('api::review.review').count(countOptions),
      ]);

      ctx.body = {
        data: results,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            total,
          },
        },
      };
    } catch (error: any) {
      console.error('[ADMIN-DASHBOARD] getAppeals error:', error.message);
      throw error;
    }
  },

  async getAppeal(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'review', strapi);

    const result = await strapi.documents('api::review.review').findOne({
      documentId: id,
      populate: populate || {
        users_permissions_user: {
          fields: ['id', 'username', 'email', 'emailLocale'],
        },
        business: {
          fields: ['id', 'name', 'slug'],
        },
      },
    });

    if (!result) {
      return ctx.notFound('Appeal not found');
    }

    if (!result.appeal_submitted) {
      return ctx.badRequest('This review does not have an appeal');
    }

    ctx.body = { data: result };
  },

  async updateAppeal(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const data = ctx.request.body;
    const updateData = data.data || data;

    // Get the current review/appeal
    const currentReview = await strapi.documents('api::review.review').findOne({
      documentId: id,
      populate: {
        users_permissions_user: {
          fields: ['id', 'username', 'email', 'emailLocale'],
        },
        business: {
          fields: ['id', 'name', 'slug'],
        },
      },
    });

    if (!currentReview) {
      return ctx.notFound('Appeal not found');
    }

    if (!currentReview.appeal_submitted) {
      return ctx.badRequest('This review does not have an appeal');
    }

    const previousAppealStatus = currentReview.appeal_status;
    const newAppealStatus = updateData.appeal_status;

    // Validate appeal status
    if (newAppealStatus && !['Approved', 'Rejected', 'Pending', 'Em Análise'].includes(newAppealStatus)) {
      return ctx.badRequest('Invalid appeal status. Must be Approved, Rejected, Pending, or Em Análise');
    }

    // Prepare update data
    const reviewUpdateData: any = {
      appeal_status: newAppealStatus || previousAppealStatus,
    };

    // Only set appeal_reviewed_at for final decisions, not for "Em Análise"
    if (newAppealStatus !== 'Em Análise') {
      reviewUpdateData.appeal_reviewed_at = new Date().toISOString();
    }

    // Handle approval
    if (newAppealStatus === 'Approved') {
      reviewUpdateData.moderation_status = 'Aprovada';
      reviewUpdateData.is_published = true;
      reviewUpdateData.appeal_reason = null; // Clear rejection reason if any
    }

    // Handle rejection
    if (newAppealStatus === 'Rejected') {
      if (!updateData.appeal_reason || updateData.appeal_reason.trim().length === 0) {
        return ctx.badRequest('Rejection reason is required when rejecting an appeal');
      }
      reviewUpdateData.appeal_reason = updateData.appeal_reason.trim();
    }

    // Update the review/appeal
    const result = await strapi.documents('api::review.review').update({
      documentId: id,
      data: reviewUpdateData,
    });

    if (!result) {
      return ctx.notFound('Appeal not found');
    }

    // Send email notifications on status change
    if (newAppealStatus && newAppealStatus !== previousAppealStatus) {
      const reviewService = strapi.service('api::review.review');
      const user = currentReview.users_permissions_user;
      const business = currentReview.business;

      if (reviewService && user && user.email) {
        try {
          if (newAppealStatus === 'Approved') {
            await reviewService.sendAppealApprovalEmail(
              user.email,
              currentReview.title || 'N/A',
              business?.name || 'N/A',
              user.emailLocale,
            );
            strapi.log.info(`[ADMIN-DASHBOARD] Appeal ${id} approved - email sent to ${user.email}`);
          } else if (newAppealStatus === 'Rejected') {
            await reviewService.sendAppealRejectionEmail(
              user.email,
              currentReview.title || 'N/A',
              business?.name || 'N/A',
              updateData.appeal_reason || '',
              user.emailLocale,
            );
            strapi.log.info(`[ADMIN-DASHBOARD] Appeal ${id} rejected - email sent to ${user.email}`);
          }
        } catch (emailError: any) {
          console.error(`[ADMIN-DASHBOARD] Error sending appeal email:`, emailError);
          strapi.log.error(`[ADMIN-DASHBOARD] Error sending appeal email for ${id}:`, emailError);
          // Don't fail the update if email fails
        }
      }
    }

    ctx.body = { data: result };
  },

  // Reviewer Verifications
  async getReviewerVerifications(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    let filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'reviewer-verification', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    const statusFromQuery =
      (ctx.query as any)?.filters?.status?.['$eq'] ??
      ctx.query['filters[status][$eq]'] as string | undefined;
    if (statusFromQuery && ['pending', 'approved', 'rejected'].includes(statusFromQuery)) {
      if (filters) {
        const hasStatus = filters.status || (filters.$and && filters.$and.some((cond: any) => cond.status));
        if (!hasStatus) {
          if (filters.$and) {
            filters.$and.push({ status: { $eq: statusFromQuery } });
          } else if (filters.$or) {
            filters = { $and: [{ status: { $eq: statusFromQuery } }, { $or: filters.$or }] };
          } else {
            filters.status = { $eq: statusFromQuery };
          }
        }
      } else {
        filters = { status: { $eq: statusFromQuery } };
      }
    }

    try {
      const findManyOptions: any = { limit, start: start };
      if (filters) findManyOptions.filters = filters;
      if (populate) findManyOptions.populate = populate;
      if (sort) findManyOptions.orderBy = sort as any;
      const countOptions: any = filters ? { filters } : {};

      const [results, total] = await Promise.all([
        strapi.documents('api::reviewer-verification.reviewer-verification').findMany(findManyOptions),
        strapi.documents('api::reviewer-verification.reviewer-verification').count(countOptions),
      ]);

      ctx.body = {
        data: results,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            total,
          },
        },
      };
    } catch (error: any) {
      console.error('[ADMIN-DASHBOARD] getReviewerVerifications error:', error.message);
      throw error;
    }
  },

  async getReviewerVerification(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'reviewer-verification', strapi);

    const result = await strapi.documents('api::reviewer-verification.reviewer-verification').findOne({
      documentId: id,
      populate,
    });

    if (!result) {
      return ctx.notFound('Reviewer verification not found');
    }

    ctx.body = { data: result };
  },

  async updateReviewerVerification(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const data = ctx.request.body;
    const updateData = data.data || data;

    const currentVerification = await strapi.documents('api::reviewer-verification.reviewer-verification').findOne({
      documentId: id,
    });

    if (!currentVerification) {
      return ctx.notFound('Reviewer verification not found');
    }

    const previousStatus = currentVerification.status;
    const newStatus = updateData.status;

    // Ensure reviewer-verification status is updated (e.g. to "approved"); lifecycle sets user.verified when status becomes "approved"
    const verificationUpdateData: any = { ...updateData };
    if (newStatus === 'rejected' && updateData.rejectionReason) {
      verificationUpdateData.rejectionReason = updateData.rejectionReason.trim();
    }
    if (newStatus && newStatus !== previousStatus) {
      if (newStatus === 'pending') {
        verificationUpdateData.reviewedAt = null;
        verificationUpdateData.rejectionReason = null;
      } else {
        verificationUpdateData.reviewedAt = new Date().toISOString();
      }
    }

    const result = await strapi.documents('api::reviewer-verification.reviewer-verification').update({
      documentId: id,
      data: verificationUpdateData,
    });

    if (!result) {
      return ctx.notFound('Reviewer verification not found');
    }

    if (newStatus && newStatus !== previousStatus) {
      strapi.log.info(`[ADMIN-DASHBOARD] Reviewer verification ${id} status changed from '${previousStatus}' to '${newStatus}'. Lifecycle will handle email and user.verified.`);
    }

    ctx.body = { data: result };
  },

  // Review Reports (consumer reports of reviews)
  async getReviewReports(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { page = 1, pageSize = 25, start = 0, limit = 25 } = parsePagination(ctx.query);
    const statusFilter =
      (ctx.query as any)?.filters?.status?.['$eq'] ??
      ctx.query['filters[status][$eq]'] as string | undefined;
    const sort = parseSort(ctx.query, 'createdAt:desc');

    const where: any = {};
    if (statusFilter && ['pending', 'analysing', 'approved', 'rejected'].includes(statusFilter)) {
      where.status = statusFilter;
    }

    try {
      const [results, total] = await Promise.all([
        strapi.db.query('api::review-report.review-report').findMany({
          where,
          orderBy: sort,
          limit,
          offset: start,
          populate: {
            review: {
              populate: { business: { fields: ['id', 'name', 'slug'] } },
            },
            reporter: {
              fields: ['id', 'username', 'email'],
            },
          },
        }),
        strapi.db.query('api::review-report.review-report').count({ where }),
      ]);

      ctx.body = {
        data: results,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil((total || 0) / pageSize),
            total: total || 0,
          },
        },
      };
    } catch (error: any) {
      strapi.log.error('[ADMIN-DASHBOARD] getReviewReports error:', error?.message);
      throw error;
    }
  },

  async getReviewReport(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const reportId = parseInt(String(id), 10);
    if (Number.isNaN(reportId)) {
      return ctx.badRequest('Invalid report id');
    }

    const result = await strapi.db.query('api::review-report.review-report').findOne({
      where: { id: reportId },
      populate: {
        review: {
          populate: { business: { fields: ['id', 'name', 'slug'] } },
        },
        reporter: {
          fields: ['id', 'username', 'email'],
        },
      },
    });

    if (!result) {
      return ctx.notFound('Report not found');
    }

    ctx.body = { data: result };
  },

  async updateReviewReport(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) {
      return ctx.unauthorized('Invalid or missing admin token');
    }

    const { id } = ctx.params;
    const reportId = parseInt(String(id), 10);
    if (Number.isNaN(reportId)) {
      return ctx.badRequest('Invalid report id');
    }

    const body = ctx.request.body?.data || ctx.request.body || {};
    const { status: newStatus, rejectionReason } = body;

    if (!newStatus || !['approved', 'rejected', 'pending', 'analysing'].includes(newStatus)) {
      return ctx.badRequest('Invalid status. Must be approved, rejected, pending (revert), or analysing');
    }
    if (newStatus === 'rejected' && (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim())) {
      return ctx.badRequest('Rejection reason is required when rejecting');
    }

    const currentReport = await strapi.db.query('api::review-report.review-report').findOne({
      where: { id: reportId },
      populate: {
        review: {
          populate: {
            business: {
              fields: ['id', 'name', 'slug'],
              populate: { owner: { fields: ['id', 'email', 'firstName'] } },
            },
            users_permissions_user: { fields: ['id', 'email', 'firstName'] },
          },
        },
        reporter: {
          fields: ['id', 'username', 'email'],
        },
      },
    });

    if (!currentReport) {
      return ctx.notFound('Report not found');
    }

    // Analysing: set status to analysing (only from pending, no reviewedAt)
    if (newStatus === 'analysing') {
      if (currentReport.status !== 'pending') {
        return ctx.badRequest('Can only set to analysing from pending status');
      }
      const updatedReport = await strapi.db.query('api::review-report.review-report').update({
        where: { id: reportId },
        data: { status: 'analysing' },
      });
      if (!updatedReport) {
        return ctx.notFound('Report not found');
      }
      // Notify reporter by email that their report is being reviewed
      const reporterEmail = (currentReport.reporter as any)?.email;
      if (reporterEmail) {
        try {
          const review = currentReport.review as any;
          const businessName = review?.business?.name || 'N/A';
          const reviewTitle = review?.title || 'N/A';
          const frontendUrl = process.env.FRONTEND_URL || '';
          await strapi.plugins.email.services.email.send({
            to: reporterEmail,
            subject: 'O seu reporte está a ser analisado - CliAvalia',
            text: `O seu reporte da avaliação "${reviewTitle}" sobre ${businessName} está a ser analisado pela nossa equipa.\n\nVer os meus reports: ${frontendUrl}/user/my-reports`,
            html: `<h2>Reporte em análise</h2><p>O seu reporte da avaliação "<strong>${reviewTitle}</strong>" sobre <strong>${businessName}</strong> está a ser analisado pela nossa equipa.</p><p><a href="${frontendUrl}/user/my-reports">Ver os meus reports</a></p>`,
          });
        } catch (emailErr: any) {
          strapi.log.error('[ADMIN-DASHBOARD] Error sending analysing email:', emailErr?.message);
        }
      }
      ctx.body = { data: updatedReport };
      return;
    }

    // Revert: set status back to pending (from approved, rejected, or analysing)
    if (newStatus === 'pending') {
      if (currentReport.status === 'pending') {
        return ctx.badRequest('Report is already pending');
      }
      const updateData: any = {
        status: 'pending',
        reviewedAt: null,
        rejectionReason: null,
      };
      const updatedReport = await strapi.db.query('api::review-report.review-report').update({
        where: { id: reportId },
        data: updateData,
      });
      if (!updatedReport) {
        return ctx.notFound('Report not found');
      }
      // If reverting an approved report, restore the review to public visibility
      if (currentReport.status === 'approved') {
        const review = currentReport.review as any;
        if (review?.id) {
          await strapi.db.query('api::review.review').update({
            where: { id: review.id },
            data: {
              is_published: true,
              moderation_status: null,
              reportStatus: null,
            },
          });
        }
      }
      // If reverting a rejected report, restore reportStatus to pending so bells stay active
      if (currentReport.status === 'rejected') {
        const review = currentReport.review as any;
        if (review?.id) {
          await strapi.db.query('api::review.review').update({
            where: { id: review.id },
            data: { reportStatus: 'pending' },
          });
        }
      }
      ctx.body = { data: updatedReport };
      return;
    }

    // Approve or reject: only when currently pending or analysing
    if (currentReport.status !== 'pending' && currentReport.status !== 'analysing') {
      return ctx.badRequest('Report has already been reviewed. Revert it first to change the decision.');
    }

    const updateData: any = {
      status: newStatus,
      reviewedAt: new Date().toISOString(),
    };
    if (newStatus === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason.trim();
    }

    const updatedReport = await strapi.db.query('api::review-report.review-report').update({
      where: { id: reportId },
      data: updateData,
    });

    if (!updatedReport) {
      return ctx.notFound('Report not found');
    }

    const reporter = currentReport.reporter as any;
    const reporterEmail = reporter?.email;
    const review = currentReport.review as any;
    const businessName = review?.business?.name || 'N/A';
    const reviewTitle = review?.title || 'N/A';
    const frontendUrl = process.env.FRONTEND_URL || '';
    const myReportsUrl = `${frontendUrl}/user/my-reports`;
    const flaggedUrl = `${frontendUrl}/business/dashboard/reviews/flagged`;
    const businessOwnerEmail = review?.business?.owner?.email;
    const reviewAuthorEmail = review?.users_permissions_user?.email;

    if (reporterEmail) {
      try {
        if (newStatus === 'approved') {
          const updateResult = await strapi.db.query('api::review.review').update({
            where: { id: review.id },
            data: {
              moderation_status: 'Sinalizada',
              reportStatus: 'resolved',
              is_published: false,
            },
          });
          await strapi.plugins.email.services.email.send({
            to: reporterEmail,
            subject: 'O seu reporte foi aprovado - CliAvalia',
            text: `O seu reporte da avaliação "${reviewTitle}" sobre ${businessName} foi aprovado. A avaliação foi ocultada da plataforma.\n\nVer os meus reportes: ${myReportsUrl}`,
            html: `
            <h2>Report aprovado</h2>
            <p>O seu reporte da avaliação "<strong>${reviewTitle}</strong>" sobre <strong>${businessName}</strong> foi aprovado. A avaliação foi ocultada da plataforma.</p>
            <p><a href="${myReportsUrl}">Ver os meus reports</a></p>
            `,
          });
          strapi.log.info(`[ADMIN-DASHBOARD] Report ${reportId} approved - email sent to ${reporterEmail}`);
        } else {
          // rejected: clear reportStatus so the bells reset
          await strapi.db.query('api::review.review').update({
            where: { id: review.id },
            data: { reportStatus: null },
          });
          await strapi.plugins.email.services.email.send({
            to: reporterEmail,
            subject: 'Atualização sobre o seu reporte - CliAvalia',
            text: `O seu reporte da avaliação "${reviewTitle}" sobre ${businessName} não foi aprovado.\n\nRazão: ${(rejectionReason || '').trim()}\n\nVer os meus reports: ${myReportsUrl}`,
            html: `
            <h2>Report não aprovado</h2>
            <p>O seu reporte da avaliação "<strong>${reviewTitle}</strong>" sobre <strong>${businessName}</strong> não foi aprovado.</p>
            <p><strong>Razão:</strong> ${(rejectionReason || '').trim().replace(/\n/g, '<br>')}</p>
            <p><a href="${myReportsUrl}">Ver os meus reports</a></p>
            `,
          });
          strapi.log.info(`[ADMIN-DASHBOARD] Report ${reportId} rejected - email sent to ${reporterEmail}`);
        }
      } catch (emailErr: any) {
        strapi.log.error('[ADMIN-DASHBOARD] Error sending report outcome email:', emailErr?.message);
      }
    }

    // Email to business owner
    if (businessOwnerEmail) {
      try {
        if (newStatus === 'approved') {
          await strapi.plugins.email.services.email.send({
            to: businessOwnerEmail,
            subject: `Avaliação ocultada após reporte - ${businessName}`,
            text: `Uma avaliação sobre ${businessName} foi ocultada da plataforma na sequência de um reporte de utilizador validado pela equipa CliAvalia.\n\nVer avaliações reportadas: ${flaggedUrl}`,
            html: `<h2>Avaliação ocultada</h2><p>Uma avaliação sobre <strong>${businessName}</strong> foi ocultada da plataforma na sequência de um reporte de utilizador validado pela equipa CliAvalia.</p><p><a href="${flaggedUrl}">Ver avaliações reportadas</a></p>`,
          });
        } else {
          // rejected
          await strapi.plugins.email.services.email.send({
            to: businessOwnerEmail,
            subject: `Reporte de avaliação rejeitado - ${businessName}`,
            text: `Um reporte submetido contra uma avaliação de ${businessName} foi analisado e rejeitado. A avaliação permanece publicada.\n\nVer avaliações reportadas: ${flaggedUrl}`,
            html: `<h2>Reporte rejeitado</h2><p>Um reporte submetido contra uma avaliação de <strong>${businessName}</strong> foi analisado e rejeitado. A avaliação permanece publicada.</p><p><a href="${flaggedUrl}">Ver avaliações reportadas</a></p>`,
          });
        }
      } catch (emailErr: any) {
        strapi.log.error('[ADMIN-DASHBOARD] Error sending business owner outcome email:', emailErr?.message);
      }
    }

    // Email to review author (only on approved — their review gets hidden)
    if (reviewAuthorEmail && newStatus === 'approved') {
      try {
        await strapi.plugins.email.services.email.send({
          to: reviewAuthorEmail,
          subject: 'A tua avaliação foi ocultada - CliAvalia',
          text: `A tua avaliação sobre ${businessName} foi ocultada da plataforma na sequência de um reporte de utilizador que foi validado pela equipa CliAvalia.\n\nSe discordas desta decisão, podes submeter um recurso a partir das tuas avaliações: ${frontendUrl}/user/my-reviews`,
          html: `<h2>A tua avaliação foi ocultada</h2><p>A tua avaliação sobre <strong>${businessName}</strong> foi ocultada da plataforma na sequência de um reporte de utilizador que foi validado pela equipa CliAvalia.</p><p>Se discordas desta decisão, podes submeter um recurso.</p><p><a href="${frontendUrl}/user/my-reviews">Ver as minhas avaliações</a></p>`,
        });
      } catch (emailErr: any) {
        strapi.log.error('[ADMIN-DASHBOARD] Error sending review author approved email:', emailErr?.message);
      }
    }

    ctx.body = { data: updatedReport };
  },

  // ─── Pending Businesses ───────────────────────────────────────────────────

  async getPendingBusinesses(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    let filters = parseFilters(ctx.query);
    if (filters) {
      filters = normalizeBusinessFiltersInput(strapi, filters);
    }
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Ensure approvalStatus filter is handled
    const statusFromQuery =
      (ctx.query as any)?.filters?.approvalStatus?.['$eq'] ??
      ctx.query['filters[approvalStatus][$eq]'] as string | undefined;
    if (statusFromQuery && ['pending', 'approved', 'rejected'].includes(statusFromQuery)) {
      if (!filters) {
        filters = { approvalStatus: { $eq: statusFromQuery } };
      } else if (!filters.approvalStatus) {
        filters.approvalStatus = { $eq: statusFromQuery };
      }
    }

    const categoryPopulate = getBusinessCategoriesPopulate(strapi);
    const findManyOptions: any = {
      limit,
      start: start,
      populate: {
        submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] },
        sector: { fields: ['id', 'name'] },
        ...categoryPopulate,
        officialLetter: { fields: ['id', 'name', 'url', 'mime'] },
        idCopy: { fields: ['id', 'name', 'url', 'mime'] },
      },
    };
    if (filters) findManyOptions.filters = filters;
    if (sort) findManyOptions.orderBy = sort as any;
    const countOptions: any = filters ? { filters } : {};

    try {
      const [results, total] = await Promise.all([
        strapi.documents('api::business.business').findMany(findManyOptions),
        strapi.documents('api::business.business').count(countOptions),
      ]);
      ctx.body = {
        data: enrichBusinessListCategoryFields(results as Record<string, unknown>[]),
        meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
      };
    } catch (error: any) {
      console.error('[ADMIN-DASHBOARD] getPendingBusinesses error:', error.message);
      throw error;
    }
  },

  async getPendingBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const categoryPopulate = getBusinessCategoriesPopulate(strapi);
    const result = await strapi.documents('api::business.business').findOne({
      documentId: id,
      populate: {
        submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] },
        sector: true,
        ...categoryPopulate,
        provinces: true,
        municipalities: true,
        officialLetter: { fields: ['id', 'name', 'url', 'mime'] },
        idCopy: { fields: ['id', 'name', 'url', 'mime'] },
      },
    });
    if (!result) return ctx.notFound('Business not found');
    ctx.body = { data: enrichBusinessCategoryFields(result as Record<string, unknown>) };
  },

  async approvePendingBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    const business = await strapi.documents('api::business.business').findOne({
      documentId: id,
      populate: { submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] }, reviews: { fields: ['documentId', 'id', 'awaitingEntityApproval', 'is_published', 'title', 'reviewText', 'rating'], populate: { users_permissions_user: { fields: ['id', 'email', 'username', 'firstName', 'lastName'] } } } },
    });
    if (!business) return ctx.notFound('Business not found');

    await strapi.documents('api::business.business').update({
      documentId: id,
      data: { approvalStatus: 'approved', publishedAt: new Date() } as any,
    });

    // Publish all awaiting reviews for this business
    const pendingReviews = (business.reviews || []).filter((r: any) => r.awaitingEntityApproval === true);
    for (const review of pendingReviews) {
      await strapi.documents('api::review.review').update({
        documentId: review.documentId,
        data: { is_published: true, awaitingEntityApproval: false, moderation_status: 'Aprovada' } as any,
      });
    }

    // Send emails
    const businessService = strapi.service('api::business.business') as any;
    const submitter = business.submittedBy as any;

    if (businessService?.sendBusinessApprovedEmail && submitter?.email) {
      try {
        await businessService.sendBusinessApprovedEmail(business, submitter, pendingReviews);
      } catch (e) { strapi.log.error('[ADMIN-DASHBOARD] approvePendingBusiness email error:', e); }
    }

    // Automatically send email confirmation to business owner if not yet confirmed
    if (submitter?.id && submitter?.email) {
      try {
        const owner = await strapi.db
          .query('plugin::users-permissions.user')
          .findOne({ where: { id: submitter.id } });

        if (owner && !owner.confirmed) {
          const confirmationToken = crypto.randomBytes(20).toString('hex');
          await strapi.db.query('plugin::users-permissions.user').update({
            where: { id: submitter.id },
            data: { confirmationToken },
          });

          const backendUrl =
            process.env.PUBLIC_URL ||
            process.env.SERVER_URL ||
            strapi.config.get('server.url');
          const confirmationUrl = `${backendUrl}/api/auth/email-confirmation?confirmation=${confirmationToken}`;
          const firstName = owner.firstName || 'Utilizador';

          // Use the business-auth email service for the branded confirmation email
          const businessEmailService = strapi.service('api::business-auth.business-email') as any;
          if (businessEmailService?.sendBusinessConfirmationEmail) {
            await businessEmailService.sendBusinessConfirmationEmail(owner, confirmationUrl, firstName, owner.emailLocale);
          } else {
            // Fallback: inline send with the same branding
            const brandColor = '#2563eb';
            const emailHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Confirme o seu Email - CliAvalia Empresas</title></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;text-align:center;"><table role="presentation" style="width:600px;max-width:100%;margin:0 auto;background:#F7FFFF;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.08);border-collapse:collapse;"><tr><td style="padding:28px 20px 24px;background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:12px 12px 0 0;text-align:center;"><img src="https://res.cloudinary.com/dyisx0d3l/image/upload/v1757859687/CliAvalia/cliavalia-logo_white_woav8i.png" style="max-width:180px;" alt="CliAvalia Empresas"></td></tr><tr><td style="padding:40px 40px 30px;line-height:1.7;font-size:15px;"><h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Confirme o seu Email</h2><p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Ol\u00e1 ${firstName},</p><p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">A sua empresa foi aprovada! Para aceder ao <strong>Portal Empresarial</strong>, por favor confirme o seu endere\u00e7o de email clicando no bot\u00e3o abaixo.</p><div style="text-align:center;margin:32px 0;"><a href="${confirmationUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,${brandColor},#1e40af);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirmar Email</a></div><p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Se o bot\u00e3o n\u00e3o funcionar, copie e cole este link: ${confirmationUrl}</p></td></tr><tr><td style="padding:24px 40px;text-align:center;background:#f1f5f9;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;"><p style="margin:0;color:#6b7280;font-size:14px;">Precisa de ajuda? <a href="mailto:comercial@cliavalia.com" style="color:${brandColor};text-decoration:none;">comercial@cliavalia.com</a></p></td></tr></table></td></tr></table></body></html>`;
            await strapi.plugins.email.services.email.send({
              to: owner.email,
              from: 'CliAvalia Empresas <comercial@cliavalia.com>',
              subject: 'Confirme o seu Email \u2013 CliAvalia Empresas',
              text: `Ol\u00e1 ${firstName},\n\nA sua empresa foi aprovada! Para aceder ao Portal Empresarial, confirme o seu email:\n\n${confirmationUrl}\n\nPrecisa de ajuda? comercial@cliavalia.com`,
              html: emailHtml,
            });
          }

          strapi.log.info(`[ADMIN-DASHBOARD] Email confirmation sent to business owner: ${owner.email}`);
        }
      } catch (confirmErr: any) {
        strapi.log.error('[ADMIN-DASHBOARD] Failed to send email confirmation after approval:', confirmErr?.message);
      }
    }

    // Send review notification emails to business owner for each published review
    const reviewService = strapi.service('api::review.review') as any;
    if (reviewService?.sendNewReviewEmailToBusiness) {
      for (const review of pendingReviews) {
        try {
          const reviewer = (review as any).users_permissions_user;
          const reviewerName = reviewer?.firstName && reviewer?.lastName
            ? `${reviewer.firstName} ${reviewer.lastName}`.trim()
            : reviewer?.username || null;
          const ownerEmail = submitter?.email;
          if (ownerEmail) {
            await reviewService.sendNewReviewEmailToBusiness(
              ownerEmail,
              business.name || 'O seu negócio',
              (review as any).title || 'Sem título',
              (review as any).reviewText || '',
              (review as any).rating ?? 0,
              reviewerName,
              review.documentId ?? (review as any).id,
              submitter?.emailLocale,
            );
          }
        } catch (e) { strapi.log.error(`[ADMIN-DASHBOARD] Review email error for review ${review.documentId}:`, e); }
      }
    }

    strapi.log.info(`[ADMIN-DASHBOARD] Business "${business.name}" (${id}) approved. ${pendingReviews.length} review(s) published.`);
    ctx.body = { data: { approvalStatus: 'approved', publishedReviews: pendingReviews.length } };
  },

  async rejectPendingBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim() : '';

    if (!rejectionReason) {
      return ctx.badRequest('rejectionReason is required when rejecting a business.');
    }

    const business = await strapi.documents('api::business.business').findOne({
      documentId: id,
      populate: { submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] } },
    });
    if (!business) return ctx.notFound('Business not found');

    await strapi.documents('api::business.business').update({
      documentId: id,
      data: { approvalStatus: 'rejected', rejectionReason } as any,
    });

    const businessService = strapi.service('api::business.business') as any;
    const submitter = business.submittedBy as any;
    if (businessService?.sendBusinessRejectedEmail && submitter?.email) {
      try {
        await businessService.sendBusinessRejectedEmail(business, submitter, rejectionReason);
      } catch (e) { strapi.log.error('[ADMIN-DASHBOARD] rejectPendingBusiness email error:', e); }
    }

    strapi.log.info(`[ADMIN-DASHBOARD] Business "${business.name}" (${id}) rejected.`);
    ctx.body = { data: { approvalStatus: 'rejected' } };
  },

  // ─── Pending Locations (Strapi content type: api::agency.agency) ────────

  async getPendingAgencies(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    let filters = parseFilters(ctx.query);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    // Extract approvalStatus from either nested (qs-parsed) or flat query format
    const statusFromQuery =
      (ctx.query as any)?.filters?.approvalStatus?.['$eq'] ??
      ctx.query['filters[approvalStatus][$eq]'] as string | undefined;
    if (statusFromQuery && ['pending', 'approved', 'rejected'].includes(statusFromQuery)) {
      if (!filters) {
        filters = { approvalStatus: { $eq: statusFromQuery } };
      } else if (!filters.approvalStatus) {
        filters.approvalStatus = { $eq: statusFromQuery };
      }
    }

    const findManyOptions: any = { limit, start, populate: { business: { fields: ['id', 'name', 'slug'] }, municipality: { fields: ['id', 'name'] }, province: { fields: ['id', 'name'] }, submittedBy: { fields: ['id', 'username', 'email'] } } };
    if (filters) findManyOptions.filters = filters;
    if (sort) findManyOptions.orderBy = sort as any;
    const countOptions: any = filters ? { filters } : {};

    try {
      const [results, total] = await Promise.all([
        strapi.documents('api::agency.agency').findMany(findManyOptions),
        strapi.documents('api::agency.agency').count(countOptions),
      ]);
      ctx.body = { data: results, meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } } };
    } catch (error: any) {
      console.error('[ADMIN-DASHBOARD] getPendingAgencies error:', error.message);
      throw error;
    }
  },

  async getPendingAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const result = await strapi.documents('api::agency.agency').findOne({
      documentId: id,
      populate: { business: true, municipality: true, province: true, submittedBy: { fields: ['id', 'username', 'email'] } },
    });
    if (!result) return ctx.notFound('Agency not found');
    ctx.body = { data: result };
  },

  async approvePendingAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    const agency = await strapi.documents('api::agency.agency').findOne({
      documentId: id,
      populate: { business: { fields: ['id', 'name', 'slug'] }, municipality: { fields: ['id', 'name'] }, submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] }, reviews: { fields: ['documentId', 'id', 'awaitingEntityApproval', 'is_published', 'title', 'reviewText', 'rating'], populate: { users_permissions_user: { fields: ['id', 'email', 'username', 'firstName', 'lastName'] }, business: { fields: ['id', 'name'], populate: { owner: { fields: ['id', 'email', 'emailLocale'] } } } } } },
    });
    if (!agency) return ctx.notFound('Agency not found');

    await strapi.documents('api::agency.agency').update({
      documentId: id,
      data: { approvalStatus: 'approved' } as any,
    });

    // Publish all awaiting reviews linked to this agency
    const pendingReviews = (agency.reviews || []).filter((r: any) => r.awaitingEntityApproval === true);
    for (const review of pendingReviews) {
      await strapi.documents('api::review.review').update({
        documentId: review.documentId,
        data: { is_published: true, awaitingEntityApproval: false, moderation_status: 'Aprovada' } as any,
      });
    }

    const agencyService = strapi.service('api::agency.agency') as any;
    const submitter = agency.submittedBy as any;
    if (agencyService?.sendAgencyApprovedEmail && submitter?.email) {
      try {
        await agencyService.sendAgencyApprovedEmail(agency, submitter);
      } catch (e) { strapi.log.error('[ADMIN-DASHBOARD] approvePendingAgency email error:', e); }
    }

    // Send review notification emails to business owners for each published review
    const reviewService = strapi.service('api::review.review') as any;
    if (reviewService?.sendNewReviewEmailToBusiness) {
      for (const review of pendingReviews) {
        try {
          const reviewer = (review as any).users_permissions_user;
          const reviewerName = reviewer?.firstName && reviewer?.lastName
            ? `${reviewer.firstName} ${reviewer.lastName}`.trim()
            : reviewer?.username || null;
          const biz = (review as any).business;
          const ownerEmail = biz?.owner?.email;
          if (ownerEmail) {
            await reviewService.sendNewReviewEmailToBusiness(
              ownerEmail,
              biz.name || 'O seu negócio',
              (review as any).title || 'Sem título',
              (review as any).reviewText || '',
              (review as any).rating ?? 0,
              reviewerName,
              review.documentId ?? (review as any).id,
              biz?.owner?.emailLocale,
            );
          }
        } catch (e) { strapi.log.error(`[ADMIN-DASHBOARD] Review email error for review ${review.documentId}:`, e); }
      }
    }

    strapi.log.info(`[ADMIN-DASHBOARD] Agency "${agency.name}" (${id}) approved. ${pendingReviews.length} review(s) published.`);
    ctx.body = { data: { approvalStatus: 'approved', publishedReviews: pendingReviews.length } };
  },

  async rejectPendingAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim() : '';

    if (!rejectionReason) {
      return ctx.badRequest('rejectionReason is required when rejecting an agency.');
    }

    const agency = await strapi.documents('api::agency.agency').findOne({
      documentId: id,
      populate: { business: { fields: ['id', 'name'] }, submittedBy: { fields: ['id', 'username', 'email'] } },
    });
    if (!agency) return ctx.notFound('Agency not found');

    await strapi.documents('api::agency.agency').update({
      documentId: id,
      data: { approvalStatus: 'rejected', rejectionReason } as any,
    });

    const agencyService = strapi.service('api::agency.agency') as any;
    const submitter = agency.submittedBy as any;
    if (agencyService?.sendAgencyRejectedEmail && submitter?.email) {
      try {
        await agencyService.sendAgencyRejectedEmail(agency, submitter, rejectionReason);
      } catch (e) { strapi.log.error('[ADMIN-DASHBOARD] rejectPendingAgency email error:', e); }
    }

    strapi.log.info(`[ADMIN-DASHBOARD] Agency "${agency.name}" (${id}) rejected.`);
    ctx.body = { data: { approvalStatus: 'rejected' } };
  },

  // Provinces (data management)
  async getProvinces(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'province', strapi);
    const sort = parseSort(ctx.query, 'name:asc');

    const findManyOptions: any = { limit, start: start };
    if (filters) findManyOptions.filters = filters;
    if (populate) findManyOptions.populate = populate;
    if (sort) findManyOptions.orderBy = sort;

    const countOptions: any = {};
    if (filters) countOptions.filters = filters;

    const [results, total] = await Promise.all([
      strapi.documents('api::province.province').findMany(findManyOptions),
      strapi.documents('api::province.province').count(countOptions),
    ]);

    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getProvince(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'province', strapi);

    let result = await strapi.documents('api::province.province').findOne({
      documentId: id,
      populate,
    });
    if (!result && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::province.province').findMany({
        filters: { id: Number(id) },
        populate,
        limit: 1,
      });
      result = byId[0] || null;
    }
    if (!result) return ctx.notFound('Province not found');
    ctx.body = { data: result };
  },

  async createProvince(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');

    const result = await strapi.documents('api::province.province').create({
      data: { name: String(data.name).trim() },
    });
    ctx.body = { data: result };
  },

  async updateProvince(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    const existing = await strapi.documents('api::province.province').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::province.province').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      if (byId[0]) {
        const result = await strapi.documents('api::province.province').update({
          documentId: byId[0].documentId,
          data: { name: data.name != null ? String(data.name).trim() : undefined } as any,
        });
        return (ctx.body = { data: result });
      }
    }
    if (!existing) return ctx.notFound('Province not found');

    const result = await strapi.documents('api::province.province').update({
      documentId: id,
      data: { name: data.name != null ? String(data.name).trim() : undefined } as any,
    });
    ctx.body = { data: result };
  },

  async deleteProvince(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::province.province').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::province.province').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Province not found');

    await strapi.documents('api::province.province').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  // Municipalities (data management)
  async getMunicipalities(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'municipality', strapi);
    const sort = parseSort(ctx.query, 'name:asc');

    const findManyOptions: any = { limit, start: start };
    if (filters) findManyOptions.filters = filters;
    if (populate) findManyOptions.populate = populate;
    if (sort) findManyOptions.orderBy = sort;

    const countOptions: any = {};
    if (filters) countOptions.filters = filters;

    const [results, total] = await Promise.all([
      strapi.documents('api::municipality.municipality').findMany(findManyOptions),
      strapi.documents('api::municipality.municipality').count(countOptions),
    ]);

    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getMunicipality(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'municipality', strapi);

    let result = await strapi.documents('api::municipality.municipality').findOne({
      documentId: id,
      populate,
    });
    if (!result && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::municipality.municipality').findMany({
        filters: { id: Number(id) },
        populate,
        limit: 1,
      });
      result = byId[0] || null;
    }
    if (!result) return ctx.notFound('Municipality not found');
    ctx.body = { data: result };
  },

  async createMunicipality(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');
    const provinceId = data.province ?? data.provinceId;
    if (provinceId == null) return ctx.badRequest('province (or provinceId) is required');

    const result = await strapi.documents('api::municipality.municipality').create({
      data: {
        name: String(data.name).trim(),
        province: provinceId,
      },
    });
    ctx.body = { data: result };
  },

  async updateMunicipality(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    let existing = await strapi.documents('api::municipality.municipality').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::municipality.municipality').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      existing = byId[0] || null;
    }
    if (!existing) return ctx.notFound('Municipality not found');

    const updateData: any = {};
    if (data.name != null) updateData.name = String(data.name).trim();
    if (data.province != null || data.provinceId != null) updateData.province = data.province ?? data.provinceId;

    const result = await strapi.documents('api::municipality.municipality').update({
      documentId: existing.documentId ?? id,
      data: updateData,
    });
    ctx.body = { data: result };
  },

  async deleteMunicipality(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::municipality.municipality').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::municipality.municipality').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Municipality not found');

    await strapi.documents('api::municipality.municipality').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  // Sectors (data management)
  async getSectors(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'sector', strapi);
    const sort = parseSort(ctx.query, 'sortOrder:asc');

    const findManyOptions: any = { limit, start: start };
    if (filters) findManyOptions.filters = filters;
    if (populate) findManyOptions.populate = populate;
    if (sort) findManyOptions.orderBy = sort;

    const countOptions: any = {};
    if (filters) countOptions.filters = filters;

    const [results, total] = await Promise.all([
      strapi.documents('api::sector.sector').findMany(findManyOptions),
      strapi.documents('api::sector.sector').count(countOptions),
    ]);

    const data = await attachIsPublishedToResults(strapi, 'api::sector.sector', results);

    ctx.body = {
      data,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'sector', strapi);

    let result = await strapi.documents('api::sector.sector').findOne({
      documentId: id,
      populate,
    });
    if (!result && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::sector.sector').findMany({
        filters: { id: Number(id) },
        populate,
        limit: 1,
      });
      result = byId[0] || null;
    }
    if (!result) return ctx.notFound('Sector not found');
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::sector.sector', [result]);
    ctx.body = { data: withPub ?? result };
  },

  async createSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');

    const createData: any = { name: String(data.name).trim() };
    if (data.sortOrder != null) createData.sortOrder = Number(data.sortOrder);
    if (data.image != null) createData.image = String(data.image).trim();
    if (data.slug != null) createData.slug = String(data.slug).trim();
    if (data.hasAgencyFlow !== undefined) createData.hasAgencyFlow = Boolean(data.hasAgencyFlow);
    if (data.agencyFlowLabels !== undefined) createData.agencyFlowLabels = data.agencyFlowLabels ?? null;

    const result = await strapi.documents('api::sector.sector').create({
      data: createData,
      status: 'published',
    });
    ctx.body = { data: result };
  },

  async updateSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    let existing = await strapi.documents('api::sector.sector').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::sector.sector').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      existing = byId[0] || null;
    }
    if (!existing) return ctx.notFound('Sector not found');

    const updateData: any = {};
    if (data.name != null) updateData.name = String(data.name).trim();
    if (data.sortOrder != null) updateData.sortOrder = Number(data.sortOrder);
    if (data.image !== undefined) updateData.image = data.image ? String(data.image).trim() : null;
    if (data.slug !== undefined) updateData.slug = data.slug ? String(data.slug).trim() : null;
    if (data.hasAgencyFlow !== undefined) updateData.hasAgencyFlow = Boolean(data.hasAgencyFlow);
    if (data.agencyFlowLabels !== undefined) updateData.agencyFlowLabels = data.agencyFlowLabels ?? null;

    const result = await strapi.documents('api::sector.sector').update({
      documentId: existing.documentId ?? id,
      data: updateData,
    });
    ctx.body = { data: result };
  },

  async deleteSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::sector.sector').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::sector.sector').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Sector not found');

    await strapi.documents('api::sector.sector').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  async publishSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    let doc = await strapi.documents('api::sector.sector').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::sector.sector').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Sector not found');

    const documentId = doc.documentId ?? id;
    await (strapi.documents('api::sector.sector') as any).publish({ documentId });
    const refreshed = await strapi.documents('api::sector.sector').findOne({ documentId });
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::sector.sector', refreshed ? [refreshed] : []);
    ctx.body = { data: withPub ?? refreshed };
  },

  async unpublishSector(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    let doc = await strapi.documents('api::sector.sector').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::sector.sector').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Sector not found');

    const documentId = doc.documentId ?? id;
    await (strapi.documents('api::sector.sector') as any).unpublish({ documentId });
    const refreshed = await strapi.documents('api::sector.sector').findOne({ documentId });
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::sector.sector', refreshed ? [refreshed] : []);
    ctx.body = { data: withPub ?? refreshed };
  },

  // Categories (data management)
  async getCategories(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'category', strapi);
    const sort = parseSort(ctx.query, 'name:asc');

    const findManyOptions: any = { limit, start: start };
    if (filters) findManyOptions.filters = filters;
    if (populate) findManyOptions.populate = populate;
    if (sort) findManyOptions.orderBy = sort;

    const countOptions: any = {};
    if (filters) countOptions.filters = filters;

    const [results, total] = await Promise.all([
      strapi.documents('api::category.category').findMany(findManyOptions),
      strapi.documents('api::category.category').count(countOptions),
    ]);

    const data = await attachIsPublishedToResults(strapi, 'api::category.category', results);

    ctx.body = {
      data,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'category', strapi);

    let result = await strapi.documents('api::category.category').findOne({
      documentId: id,
      populate,
    });
    if (!result && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::category.category').findMany({
        filters: { id: Number(id) },
        populate,
        limit: 1,
      });
      result = byId[0] || null;
    }
    if (!result) return ctx.notFound('Category not found');
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::category.category', [result]);
    ctx.body = { data: withPub ?? result };
  },

  async createCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');
    const sectorId = data.sector ?? data.sectorId;
    if (sectorId == null) return ctx.badRequest('sector (or sectorId) is required');

    const createData: any = {
      name: String(data.name).trim(),
      sector: sectorId,
    };
    if (data.slug != null) createData.slug = String(data.slug).trim();
    if (data.hasAgencyFlow !== undefined) createData.hasAgencyFlow = Boolean(data.hasAgencyFlow);
    if (data.agencyFlowLabels !== undefined) createData.agencyFlowLabels = data.agencyFlowLabels ?? null;

    const result = await strapi.documents('api::category.category').create({
      data: createData,
      status: 'published',
    });
    ctx.body = { data: result };
  },

  async updateCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    let existing = await strapi.documents('api::category.category').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::category.category').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      existing = byId[0] || null;
    }
    if (!existing) return ctx.notFound('Category not found');

    const updateData: any = {};
    if (data.name != null) updateData.name = String(data.name).trim();
    if (data.sector != null || data.sectorId != null) updateData.sector = data.sector ?? data.sectorId;
    if (data.slug !== undefined) updateData.slug = data.slug ? String(data.slug).trim() : null;
    if (data.hasAgencyFlow !== undefined) updateData.hasAgencyFlow = Boolean(data.hasAgencyFlow);
    if (data.agencyFlowLabels !== undefined) updateData.agencyFlowLabels = data.agencyFlowLabels ?? null;

    const result = await strapi.documents('api::category.category').update({
      documentId: existing.documentId ?? id,
      data: updateData,
    });
    ctx.body = { data: result };
  },

  async deleteCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::category.category').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::category.category').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Category not found');

    await strapi.documents('api::category.category').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  async publishCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    let doc = await strapi.documents('api::category.category').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::category.category').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Category not found');

    const documentId = doc.documentId ?? id;
    await strapi.documents('api::category.category').publish({ documentId });
    const refreshed = await strapi.documents('api::category.category').findOne({
      documentId,
      populate: { sector: true },
    });
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::category.category', refreshed ? [refreshed] : []);
    ctx.body = { data: withPub ?? refreshed };
  },

  async unpublishCategory(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    let doc = await strapi.documents('api::category.category').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::category.category').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Category not found');

    const documentId = doc.documentId ?? id;
    await strapi.documents('api::category.category').unpublish({ documentId });
    const refreshed = await strapi.documents('api::category.category').findOne({
      documentId,
      populate: { sector: true },
    });
    const [withPub] = await attachIsPublishedToResults(strapi, 'api::category.category', refreshed ? [refreshed] : []);
    ctx.body = { data: withPub ?? refreshed };
  },

  // Businesses create/update/delete
  async createBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');

    const createData: any = {
      name: String(data.name).trim(),
      approvalStatus: data.approvalStatus ?? 'pending',
    };
    if (data.address != null) createData.address = String(data.address);
    if (data.sector != null || data.sectorId != null) createData.sector = data.sector ?? data.sectorId;
    const createCategoryIds = parseCategoryIdsFromInput(data as Record<string, unknown>);
    if (createCategoryIds.length > 0) {
      const resolved = await resolveCategoriesAndSector(strapi, createCategoryIds, {
        required: true,
      });
      applyBusinessCategoriesToData(strapi, createData, resolved.categoryIds);
      if (resolved.sectorId != null) createData.sector = resolved.sectorId;
    }
    if (data.website != null) createData.website = String(data.website);
    if (data.phone != null) createData.phone = String(data.phone);
    if (data.description != null) createData.description = data.description;
    if (data.companySize != null) createData.companySize = String(data.companySize);
    if (data.acronym != null) createData.acronym = String(data.acronym);
    if (data.logoUrl != null) createData.logoUrl = String(data.logoUrl);
    // Generate slug from name if not provided
    const rawSlug = data.slug ?? data.name;
    createData.slug = String(rawSlug)
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'business';

    const result = await strapi.documents('api::business.business').create({
      data: createData,
      populate: { sector: true, ...getBusinessCategoriesPopulate(strapi) },
    });
    ctx.body = { data: enrichBusinessCategoryFields(result as Record<string, unknown>) };
  },

  async updateBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    let existing = await strapi.documents('api::business.business').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::business.business').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      existing = byId[0] || null;
    }
    if (!existing) return ctx.notFound('Business not found');

    const updateData: any = {};
    const allowed = [
      'name',
      'address',
      'website',
      'phone',
      'description',
      'companySize',
      'acronym',
      'slug',
      'sector',
      'categories',
      'approvalStatus',
      'verified',
      'logoUrl',
    ];
    allowed.forEach((key) => {
      if (data[key] !== undefined) updateData[key] = data[key];
    });
    // Allow admins to reset the one-time business name change quota (0 or 1 only)
    if (data.nameUpdateCount !== undefined) {
      const n = Number(data.nameUpdateCount);
      if (!Number.isInteger(n) || n < 0 || n > 1) {
        return ctx.badRequest('nameUpdateCount must be 0 or 1');
      }
      updateData.nameUpdateCount = n;
    }
    if (data.sectorId !== undefined) updateData.sector = data.sectorId;

    const hasCategoryInput =
      data.category !== undefined ||
      data.categoryId !== undefined ||
      data.categories !== undefined ||
      data.categoryIds !== undefined;
    if (hasCategoryInput) {
      const categoryIds = parseCategoryIdsFromInput(data as Record<string, unknown>);
      if (categoryIds.length > 0) {
        const resolved = await resolveCategoriesAndSector(strapi, categoryIds, {
          required: true,
        });
        applyBusinessCategoriesToData(strapi, updateData, resolved.categoryIds);
        if (resolved.sectorId != null) updateData.sector = resolved.sectorId;
      } else {
        applyBusinessCategoriesToData(strapi, updateData, []);
      }
    }

    const result = await strapi.documents('api::business.business').update({
      documentId: existing.documentId ?? id,
      data: updateData,
      populate: { sector: true, ...getBusinessCategoriesPopulate(strapi) },
    });
    ctx.body = { data: enrichBusinessCategoryFields(result as Record<string, unknown>) };
  },

  async deleteBusiness(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::business.business').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::business.business').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Business not found');

    await strapi.documents('api::business.business').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  // Locations (data management - full CRUD, Strapi content type: api::agency.agency)
  async getAgencies(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { page, pageSize, start, limit } = parsePagination(ctx.query);
    const filters = parseFilters(ctx.query);
    const populate = parsePopulateForContentType(ctx.query, 'agency', strapi);
    const sort = parseSort(ctx.query, 'createdAt:desc');

    const findManyOptions: any = { limit, start: start };
    if (filters) findManyOptions.filters = filters;
    if (populate) findManyOptions.populate = populate;
    if (sort) findManyOptions.orderBy = sort;

    const countOptions: any = {};
    if (filters) countOptions.filters = filters;

    const [results, total] = await Promise.all([
      strapi.documents('api::agency.agency').findMany(findManyOptions),
      strapi.documents('api::agency.agency').count(countOptions),
    ]);

    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  async getAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const populate = parsePopulateForContentType(ctx.query, 'agency', strapi);

    let result = await strapi.documents('api::agency.agency').findOne({
      documentId: id,
      populate,
    });
    if (!result && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::agency.agency').findMany({
        filters: { id: Number(id) },
        populate,
        limit: 1,
      });
      result = byId[0] || null;
    }
    if (!result) return ctx.notFound('Agency not found');
    ctx.body = { data: result };
  },

  async createAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');
    const businessId = data.business ?? data.businessId;
    if (businessId == null) return ctx.badRequest('business (or businessId) is required');

    const createData: any = {
      name: String(data.name).trim(),
      business: businessId,
      approvalStatus: data.approvalStatus ?? 'pending',
    };
    if (data.address != null) createData.address = String(data.address);
    if (data.phone != null) createData.phone = String(data.phone);
    if (data.province != null || data.provinceId != null) createData.province = data.province ?? data.provinceId;
    if (data.municipality != null || data.municipalityId != null) createData.municipality = data.municipality ?? data.municipalityId;

    const result = await strapi.documents('api::agency.agency').create({
      data: createData,
    });
    ctx.body = { data: result };
  },

  async updateAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    let existing = await strapi.documents('api::agency.agency').findOne({ documentId: id });
    if (!existing && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::agency.agency').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      existing = byId[0] || null;
    }
    if (!existing) return ctx.notFound('Agency not found');

    const updateData: any = {};
    if (data.name != null) updateData.name = String(data.name).trim();
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.business != null || data.businessId != null) updateData.business = data.business ?? data.businessId;
    if (data.province !== undefined) updateData.province = data.province;
    if (data.municipality !== undefined) updateData.municipality = data.municipality;
    if (data.approvalStatus != null) updateData.approvalStatus = data.approvalStatus;

    const result = await strapi.documents('api::agency.agency').update({
      documentId: existing.documentId ?? id,
      data: updateData,
    });
    ctx.body = { data: result };
  },

  async deleteAgency(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    let doc = await strapi.documents('api::agency.agency').findOne({ documentId: id });
    if (!doc && /^\d+$/.test(String(id))) {
      const byId = await strapi.documents('api::agency.agency').findMany({
        filters: { id: Number(id) },
        limit: 1,
      });
      doc = byId[0] || null;
    }
    if (!doc) return ctx.notFound('Agency not found');

    await strapi.documents('api::agency.agency').delete({
      documentId: doc.documentId ?? id,
    });
    ctx.body = { data: { id: doc.id, documentId: doc.documentId } };
  },

  // ---- Site Settings ----

  async getSettings(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    ctx.body = {
      data: await readSiteSettings(strapi),
    };
  },

  async getPublicSettings(ctx: Context) {
    const settings = await readSiteSettings(strapi);

    ctx.body = {
      data: {
        landingEnabled: settings.landingEnabled,
        businessPortalComingSoon: settings.businessPortalComingSoon,
        homeTopReviewersEnabled: settings.homeTopReviewersEnabled,
        googleAuthEnabled: settings.googleAuthEnabled,
        facebookAuthEnabled: settings.facebookAuthEnabled,
        emailAuthEnabled: settings.emailAuthEnabled,
        businessEmailAuthEnabled: settings.businessEmailAuthEnabled,
        proPriceKz: settings.proPriceKz,
        enterprisePriceKz: settings.enterprisePriceKz,
        bankName: settings.bankName,
        bankAccountName: settings.bankAccountName,
        bankIBAN: settings.bankIBAN,
        bankAccountNumber: settings.bankAccountNumber,
        planFree_viewReviews: settings.planFree_viewReviews,
        planFree_manageProfile: settings.planFree_manageProfile,
        planFree_replyToReviews: settings.planFree_replyToReviews,
        planFree_dashboard: settings.planFree_dashboard,
        planFree_analytics: settings.planFree_analytics,
        planFree_alerts: settings.planFree_alerts,
        planFree_multiLocation: settings.planFree_multiLocation,
        planFree_locationComparison: settings.planFree_locationComparison,
        planFree_consolidatedDashboard: settings.planFree_consolidatedDashboard,
        planFree_advancedReports: settings.planFree_advancedReports,
        planFree_dedicatedSupport: settings.planFree_dedicatedSupport,
        planFree_guaranteedSLA: settings.planFree_guaranteedSLA,
        planFree_assistedOnboarding: settings.planFree_assistedOnboarding,
        planPro_viewReviews: settings.planPro_viewReviews,
        planPro_manageProfile: settings.planPro_manageProfile,
        planPro_replyToReviews: settings.planPro_replyToReviews,
        planPro_dashboard: settings.planPro_dashboard,
        planPro_analytics: settings.planPro_analytics,
        planPro_alerts: settings.planPro_alerts,
        planPro_multiLocation: settings.planPro_multiLocation,
        planPro_locationComparison: settings.planPro_locationComparison,
        planPro_consolidatedDashboard: settings.planPro_consolidatedDashboard,
        planPro_advancedReports: settings.planPro_advancedReports,
        planPro_dedicatedSupport: settings.planPro_dedicatedSupport,
        planPro_guaranteedSLA: settings.planPro_guaranteedSLA,
        planPro_assistedOnboarding: settings.planPro_assistedOnboarding,
        planEnterprise_viewReviews: settings.planEnterprise_viewReviews,
        planEnterprise_manageProfile: settings.planEnterprise_manageProfile,
        planEnterprise_replyToReviews: settings.planEnterprise_replyToReviews,
        planEnterprise_dashboard: settings.planEnterprise_dashboard,
        planEnterprise_analytics: settings.planEnterprise_analytics,
        planEnterprise_alerts: settings.planEnterprise_alerts,
        planEnterprise_multiLocation: settings.planEnterprise_multiLocation,
        planEnterprise_locationComparison: settings.planEnterprise_locationComparison,
        planEnterprise_consolidatedDashboard: settings.planEnterprise_consolidatedDashboard,
        planEnterprise_advancedReports: settings.planEnterprise_advancedReports,
        planEnterprise_dedicatedSupport: settings.planEnterprise_dedicatedSupport,
        planEnterprise_guaranteedSLA: settings.planEnterprise_guaranteedSLA,
        planEnterprise_assistedOnboarding: settings.planEnterprise_assistedOnboarding,
        maintenanceMode: settings.maintenanceMode,
        turnstileSiteGateEnabled: settings.turnstileSiteGateEnabled,
      },
    };
  },

  async updateSettings(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const raw = ctx.request.body as any;
    const body = raw?.data ?? raw;

    const booleanKeys: SiteSettingKey[] = [
      'maintenanceMode',
      'turnstileSiteGateEnabled',
      'guestLimitEnabled',
      'landingEnabled',
      'businessPortalComingSoon',
      'homeTopReviewersEnabled',
      'googleAuthEnabled',
      'facebookAuthEnabled',
      'emailAuthEnabled',
      'businessEmailAuthEnabled',
      'planFree_viewReviews',
      'planFree_manageProfile',
      'planFree_replyToReviews',
      'planFree_dashboard',
      'planFree_analytics',
      'planFree_alerts',
      'planFree_multiLocation',
      'planFree_locationComparison',
      'planFree_consolidatedDashboard',
      'planFree_advancedReports',
      'planFree_dedicatedSupport',
      'planFree_guaranteedSLA',
      'planFree_assistedOnboarding',
      'planPro_viewReviews',
      'planPro_manageProfile',
      'planPro_replyToReviews',
      'planPro_dashboard',
      'planPro_analytics',
      'planPro_alerts',
      'planPro_multiLocation',
      'planPro_locationComparison',
      'planPro_consolidatedDashboard',
      'planPro_advancedReports',
      'planPro_dedicatedSupport',
      'planPro_guaranteedSLA',
      'planPro_assistedOnboarding',
      'planEnterprise_viewReviews',
      'planEnterprise_manageProfile',
      'planEnterprise_replyToReviews',
      'planEnterprise_dashboard',
      'planEnterprise_analytics',
      'planEnterprise_alerts',
      'planEnterprise_multiLocation',
      'planEnterprise_locationComparison',
      'planEnterprise_consolidatedDashboard',
      'planEnterprise_advancedReports',
      'planEnterprise_dedicatedSupport',
      'planEnterprise_guaranteedSLA',
      'planEnterprise_assistedOnboarding',
    ];

    const numberKeys: SiteSettingKey[] = [
      'proPriceKz',
      'enterprisePriceKz',
      'emailConfirmationTokenExpiry',
      'passwordResetTokenExpiry',
    ];

    const stringKeys: SiteSettingKey[] = [
      'bankName',
      'bankAccountName',
      'bankIBAN',
      'bankAccountNumber',
      'emailSenderName',
      'emailSenderEmail',
    ];

    const allowedKeys: SiteSettingKey[] = [...booleanKeys, ...numberKeys, ...stringKeys];

    const providedKeys = allowedKeys.filter((key) => body?.[key] !== undefined);

    if (providedKeys.length === 0) {
      return ctx.badRequest(
        'At least one valid setting is required: ' + allowedKeys.join(', '),
      );
    }

    for (const key of providedKeys) {
      if (booleanKeys.includes(key) && typeof body[key] !== 'boolean') {
        return ctx.badRequest(`${key} must be a boolean`);
      }
      if (numberKeys.includes(key)) {
        if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0) {
          return ctx.badRequest(`${key} must be a non-negative number`);
        }
        if (
          (key === 'emailConfirmationTokenExpiry' || key === 'passwordResetTokenExpiry') &&
          body[key] < 1
        ) {
          return ctx.badRequest(`${key} must be at least 1`);
        }
      }
      if (stringKeys.includes(key)) {
        if (typeof body[key] !== 'string' || body[key].length > 200) {
          return ctx.badRequest(`${key} must be a string (max 200 characters)`);
        }
      }
    }

    const store = strapi.store({ type: 'core', name: 'site-settings' });

    await Promise.all(
      providedKeys.map((key) => store.set({ key, value: body[key] })),
    );

    if (providedKeys.includes('guestLimitEnabled')) {
      invalidateGuestLimitCache();
    }

    ctx.body = { data: await readSiteSettings(strapi) };
  },

  // ─── Reviewer Levels (gamification) ───────────────────────────────────────

  async getReviewerLevels(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const results = await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .findMany({ orderBy: { sort_order: 'asc' } });

    ctx.body = { data: results };
  },

  async createReviewerLevel(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const data = (ctx.request.body as any)?.data ?? ctx.request.body;
    if (!data?.name) return ctx.badRequest('name is required');
    if (data.min_reviews == null || Number.isNaN(Number(data.min_reviews))) {
      return ctx.badRequest('min_reviews is required and must be a number');
    }

    const createData: any = {
      name: String(data.name).trim(),
      min_reviews: Number(data.min_reviews),
    };
    if (data.name_en != null) createData.name_en = String(data.name_en).trim() || null;
    if (data.icon != null) createData.icon = String(data.icon).trim();
    if (data.color != null) createData.color = String(data.color).trim();
    if (data.sort_order != null) createData.sort_order = Number(data.sort_order);
    if (data.is_legend != null) createData.is_legend = Boolean(data.is_legend);
    if (data.badge_label !== undefined) createData.badge_label = data.badge_label ? String(data.badge_label).trim() : null;
    if (data.badge_label_en !== undefined) createData.badge_label_en = data.badge_label_en ? String(data.badge_label_en).trim() : null;

    const result = await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .create({ data: createData });

    ctx.status = 201;
    ctx.body = { data: result };
  },

  async updateReviewerLevel(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;
    const data = (ctx.request.body as any)?.data ?? ctx.request.body;

    const existing = await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .findOne({ where: { id: Number(id) } });
    if (!existing) return ctx.notFound('Reviewer level not found');

    const updateData: any = {};
    if (data.name != null) updateData.name = String(data.name).trim();
    if (data.name_en !== undefined) updateData.name_en = data.name_en ? String(data.name_en).trim() : null;
    if (data.min_reviews != null) updateData.min_reviews = Number(data.min_reviews);
    if (data.icon !== undefined) updateData.icon = data.icon ? String(data.icon).trim() : null;
    if (data.color !== undefined) updateData.color = data.color ? String(data.color).trim() : null;
    if (data.sort_order != null) updateData.sort_order = Number(data.sort_order);
    if (data.is_legend !== undefined) updateData.is_legend = Boolean(data.is_legend);
    if (data.badge_label !== undefined) updateData.badge_label = data.badge_label ? String(data.badge_label).trim() : null;
    if (data.badge_label_en !== undefined) updateData.badge_label_en = data.badge_label_en ? String(data.badge_label_en).trim() : null;

    const result = await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .update({ where: { id: Number(id) }, data: updateData });

    ctx.body = { data: result };
  },

  async deleteReviewerLevel(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const { id } = ctx.params;

    const existing = await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .findOne({ where: { id: Number(id) } });
    if (!existing) return ctx.notFound('Reviewer level not found');

    await strapi.db
      .query('api::reviewer-level.reviewer-level')
      .delete({ where: { id: Number(id) } });

    ctx.body = { data: { id: existing.id } };
  },

  async approveBulkPendingBusinesses(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const body = ctx.request.body?.data || ctx.request.body || {};
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds : [];

    if (!documentIds.length) {
      return ctx.badRequest('documentIds array is required and must not be empty.');
    }

    if (documentIds.length > 50) {
      return ctx.badRequest('Cannot approve more than 50 businesses at once.');
    }

    const results = {
      successCount: 0,
      errors: [] as Array<{ documentId: string; error: string }>,
    };

    for (const id of documentIds) {
      try {
        const business = await strapi.documents('api::business.business').findOne({
          documentId: id,
          populate: { submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] }, reviews: { fields: ['documentId', 'id', 'awaitingEntityApproval', 'is_published', 'title', 'reviewText', 'rating'], populate: { users_permissions_user: { fields: ['id', 'email', 'username', 'firstName', 'lastName'] } } } },
        });

        if (!business) {
          results.errors.push({ documentId: id, error: 'Business not found' });
          continue;
        }

        await strapi.documents('api::business.business').update({
          documentId: id,
          data: { approvalStatus: 'approved', publishedAt: new Date() } as any,
        });

        // Publish all awaiting reviews for this business
        const pendingReviews = (business.reviews || []).filter((r: any) => r.awaitingEntityApproval === true);
        for (const review of pendingReviews) {
          await strapi.documents('api::review.review').update({
            documentId: review.documentId,
            data: { is_published: true, awaitingEntityApproval: false, moderation_status: 'Aprovada' } as any,
          });
        }

        // Send emails
        const businessService = strapi.service('api::business.business') as any;
        const submitter = business.submittedBy as any;

        if (businessService?.sendBusinessApprovedEmail && submitter?.email) {
          try {
            await businessService.sendBusinessApprovedEmail(business, submitter, pendingReviews);
          } catch (e) { strapi.log.error(`[ADMIN-DASHBOARD] approveBulkPendingBusinesses email error for ${id}:`, e); }
        }

        // Automatically send email confirmation to business owner if not yet confirmed
        if (submitter?.id && submitter?.email) {
          try {
            const owner = await strapi.db
              .query('plugin::users-permissions.user')
              .findOne({ where: { id: submitter.id } });

            if (owner && !owner.confirmed) {
              const confirmationToken = crypto.randomBytes(20).toString('hex');
              await strapi.db.query('plugin::users-permissions.user').update({
                where: { id: submitter.id },
                data: { confirmationToken },
              });

              const backendUrl =
                process.env.PUBLIC_URL ||
                process.env.SERVER_URL ||
                strapi.config.get('server.url');
              const confirmationUrl = `${backendUrl}/api/auth/email-confirmation?confirmation=${confirmationToken}`;
              const firstName = owner.firstName || 'Utilizador';

              const businessEmailService = strapi.service('api::business-auth.business-email') as any;
              if (businessEmailService?.sendBusinessConfirmationEmail) {
                await businessEmailService.sendBusinessConfirmationEmail(owner, confirmationUrl, firstName, owner.emailLocale);
              } else {
                const brandColor = '#2563eb';
                const emailHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Confirme o seu Email - CliAvalia Empresas</title></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;text-align:center;"><table role="presentation" style="width:600px;max-width:100%;margin:0 auto;background:#F7FFFF;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.08);border-collapse:collapse;"><tr><td style="padding:28px 20px 24px;background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:12px 12px 0 0;text-align:center;"><img src="https://res.cloudinary.com/dyisx0d3l/image/upload/v1757859687/CliAvalia/cliavalia-logo_white_woav8i.png" style="max-width:180px;" alt="CliAvalia Empresas"></td></tr><tr><td style="padding:40px 40px 30px;line-height:1.7;font-size:15px;"><h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Confirme o seu Email</h2><p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Olá ${firstName},</p><p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">A sua empresa foi aprovada! Para aceder ao <strong>Portal Empresarial</strong>, por favor confirme o seu endereço de email clicando no botão abaixo.</p><div style="text-align:center;margin:32px 0;"><a href="${confirmationUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,${brandColor},#1e40af);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirmar Email</a></div><p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Se o botão não funcionar, copie e cole este link: ${confirmationUrl}</p></td></tr><tr><td style="padding:24px 40px;text-align:center;background:#f1f5f9;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;"><p style="margin:0;color:#6b7280;font-size:14px;">Precisa de ajuda? <a href="mailto:comercial@cliavalia.com" style="color:${brandColor};text-decoration:none;">comercial@cliavalia.com</a></p></td></tr></table></td></tr></table></body></html>`;
                await strapi.plugins.email.services.email.send({
                  to: owner.email,
                  from: 'CliAvalia Empresas <comercial@cliavalia.com>',
                  subject: 'Confirme o seu Email – CliAvalia Empresas',
                  text: `Olá ${firstName},\n\nA sua empresa foi aprovada! Para aceder ao Portal Empresarial, confirme o seu email:\n\n${confirmationUrl}\n\nPrecisa de ajuda? comercial@cliavalia.com`,
                  html: emailHtml,
                });
              }

              strapi.log.info(`[ADMIN-DASHBOARD] Email confirmation sent to business owner: ${owner.email}`);
            }
          } catch (confirmErr: any) {
            strapi.log.error('[ADMIN-DASHBOARD] Failed to send email confirmation during bulk approval:', confirmErr?.message);
          }
        }

        // Send review notification emails to business owner for each published review
        const reviewService = strapi.service('api::review.review') as any;
        if (reviewService?.sendNewReviewEmailToBusiness) {
          for (const review of pendingReviews) {
            try {
              const reviewer = (review as any).users_permissions_user;
              const reviewerName = reviewer?.firstName && reviewer?.lastName
                ? `${reviewer.firstName} ${reviewer.lastName}`.trim()
                : reviewer?.username || null;
              const ownerEmail = submitter?.email;
              if (ownerEmail) {
                await reviewService.sendNewReviewEmailToBusiness(
                  ownerEmail,
                  business.name || 'O seu negócio',
                  (review as any).title || 'Sem título',
                  (review as any).reviewText || '',
                  (review as any).rating ?? 0,
                  reviewerName,
                  review.documentId ?? (review as any).id,
                  submitter?.emailLocale,
                );
              }
            } catch (e) { strapi.log.error(`[ADMIN-DASHBOARD] Review email error in bulk approval for review ${review.documentId}:`, e); }
          }
        }

        results.successCount++;
        strapi.log.info(`[ADMIN-DASHBOARD] Business "${business.name}" (${id}) approved in bulk. ${pendingReviews.length} review(s) published.`);
      } catch (error: any) {
        results.errors.push({ documentId: id, error: error?.message || 'Unknown error during approval' });
        strapi.log.error(`[ADMIN-DASHBOARD] Error approving business ${id} in bulk:`, error);
      }
    }

    ctx.body = { data: results };
  },

  async rejectBulkPendingBusinesses(ctx: Context) {
    const admin = await verifyAdminToken(ctx, strapi);
    if (!admin) return ctx.unauthorized('Invalid or missing admin token');

    const body = ctx.request.body?.data || ctx.request.body || {};
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds : [];
    const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim() : '';

    if (!documentIds.length) {
      return ctx.badRequest('documentIds array is required and must not be empty.');
    }

    if (documentIds.length > 50) {
      return ctx.badRequest('Cannot reject more than 50 businesses at once.');
    }

    const results = {
      successCount: 0,
      errors: [] as Array<{ documentId: string; error: string }>,
    };

    for (const id of documentIds) {
      try {
        const business = await strapi.documents('api::business.business').findOne({
          documentId: id,
          populate: { submittedBy: { fields: ['id', 'username', 'email', 'emailLocale'] } },
        });

        if (!business) {
          results.errors.push({ documentId: id, error: 'Business not found' });
          continue;
        }

        await strapi.documents('api::business.business').update({
          documentId: id,
          data: { approvalStatus: 'rejected', rejectionReason } as any,
        });

        const businessService = strapi.service('api::business.business') as any;
        const submitter = business.submittedBy as any;
        if (businessService?.sendBusinessRejectedEmail && submitter?.email) {
          try {
            await businessService.sendBusinessRejectedEmail(business, submitter, rejectionReason);
          } catch (e) { strapi.log.error(`[ADMIN-DASHBOARD] rejectBulkPendingBusinesses email error for ${id}:`, e); }
        }

        results.successCount++;
        strapi.log.info(`[ADMIN-DASHBOARD] Business "${business.name}" (${id}) rejected in bulk.`);
      } catch (error: any) {
        results.errors.push({ documentId: id, error: error?.message || 'Unknown error during rejection' });
        strapi.log.error(`[ADMIN-DASHBOARD] Error rejecting business ${id} in bulk:`, error);
      }
    }

    ctx.body = { data: results };
  },
};

