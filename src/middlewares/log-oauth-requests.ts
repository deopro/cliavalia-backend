/**
 * Middleware to log all OAuth-related requests for debugging
 */

export default (config: any, { strapi }: { strapi: any }) => {
  console.log('🔵 [MIDDLEWARE] OAuth request logger middleware loaded');
  strapi?.log?.info('🔵 [MIDDLEWARE] OAuth request logger middleware loaded');

  return async (ctx: any, next: any) => {
    const url = ctx.request.url.split('?')[0]; // Remove query params
    const fullUrl = ctx.request.url;
    
    // Log all OAuth-related requests
    if (url.includes('/connect/') || url.includes('/auth/login')) {
      console.log(`🔵 [OAUTH-LOGGER] ${ctx.request.method} ${fullUrl}`);
      strapi.log?.info(`🔵 [OAUTH-LOGGER] ${ctx.request.method} ${fullUrl}`);
    }

    await next();

    if (
      url.includes('/connect/') &&
      !url.includes('/callback') &&
      ctx.status === 302
    ) {
      const location =
        (ctx.response?.header?.location as string | undefined) ||
        (ctx.response?.headers?.location as string | undefined);
      if (location && location.includes('accounts.google.com')) {
        try {
          const googleUrl = new URL(location);
          const redirectUri = googleUrl.searchParams.get('redirect_uri');
          if (redirectUri) {
            const msg = `Google redirect_uri (add exactly to Google Cloud Console): ${redirectUri}`;
            console.log(`🔵 [OAUTH-LOGGER] ${msg}`);
            strapi.log?.info(`🔵 [OAUTH-LOGGER] ${msg}`);
          }
        } catch {
          /* ignore malformed Location */
        }
      }
    }

    return;
  };
};
