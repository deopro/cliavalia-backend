const DEFAULTS = {
  guestLimitEnabled: true,
  landingEnabled: true,
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
  emailConfirmationTokenExpiry: 1440,
  passwordResetTokenExpiry: 60,
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
};

const BOOLEAN_KEYS = Object.keys(DEFAULTS).filter(
  (k) => typeof DEFAULTS[k] === 'boolean'
);
const NUMBER_KEYS = ['proPriceKz', 'enterprisePriceKz', 'emailConfirmationTokenExpiry', 'passwordResetTokenExpiry'];
const STRING_KEYS = ['bankName', 'bankAccountName', 'bankIBAN', 'bankAccountNumber'];

function getStore(strapi) {
  return strapi.store({ type: 'core', name: 'site-settings' });
}

module.exports = {
  async getSettings(ctx) {
    const store = getStore(strapi);
    const keys = Object.keys(DEFAULTS);

    const values = await Promise.all(
      keys.map((key) => store.get({ key }))
    );

    const result = {};
    keys.forEach((key, i) => {
      const raw = values[i];
      if (raw === null || raw === undefined) {
        result[key] = DEFAULTS[key];
      } else if (typeof DEFAULTS[key] === 'boolean') {
        result[key] = Boolean(raw);
      } else if (typeof DEFAULTS[key] === 'number') {
        result[key] = Number(raw);
      } else {
        result[key] = String(raw);
      }
    });

    ctx.body = result;
  },

  async updateSettings(ctx) {
    const store = getStore(strapi);
    const body = ctx.request.body;

    if (!body || typeof body !== 'object') {
      return ctx.badRequest('Request body must be an object');
    }

    const updates = [];

    for (const [key, value] of Object.entries(body)) {
      if (!(key in DEFAULTS)) continue;

      let sanitized;
      if (BOOLEAN_KEYS.includes(key)) {
        sanitized = Boolean(value);
      } else if (NUMBER_KEYS.includes(key)) {
        sanitized = Math.round(Number(value));
        if (isNaN(sanitized) || sanitized < 0) continue;
        if (key === 'emailConfirmationTokenExpiry' || key === 'passwordResetTokenExpiry') {
          sanitized = Math.max(1, sanitized);
        }
      } else if (STRING_KEYS.includes(key)) {
        sanitized = String(value).slice(0, 500);
      } else {
        continue;
      }

      updates.push(store.set({ key, value: sanitized }));
    }

    await Promise.all(updates);

    // Re-read all settings to return the full updated state
    const keys = Object.keys(DEFAULTS);
    const values = await Promise.all(
      keys.map((key) => store.get({ key }))
    );

    const result = {};
    keys.forEach((key, i) => {
      const raw = values[i];
      if (raw === null || raw === undefined) {
        result[key] = DEFAULTS[key];
      } else if (typeof DEFAULTS[key] === 'boolean') {
        result[key] = Boolean(raw);
      } else if (typeof DEFAULTS[key] === 'number') {
        result[key] = Number(raw);
      } else {
        result[key] = String(raw);
      }
    });

    ctx.body = result;
  },
};
