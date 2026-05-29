export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL');
  const businessPortalUrl = env('BUSINESS_PORTAL_URL');
  const adminPortalUrl = env('ADMIN_PORTAL_URL');
  const serverUrl = env('SERVER_URL') || env('PUBLIC_URL');
  const isProduction = env('NODE_ENV') === 'production';
  const connectSrc = ["'self'"];
  const corsOrigins = new Set<string>();

  const addOrigin = (url?: string) => {
    if (!url) return;
    try {
      const origin = new URL(url).origin;
      corsOrigins.add(origin);
      connectSrc.push(origin, origin.replace(/^http/, 'ws'));
    } catch (_) {
      /* ignore invalid URL */
    }
  };

  addOrigin(frontendUrl);
  addOrigin(businessPortalUrl);
  addOrigin(adminPortalUrl);
  if (serverUrl) {
    try {
      const u = new URL(serverUrl);
      connectSrc.push(u.origin, u.origin.replace(/^http/, 'ws'));
    } catch (_) {
      /* ignore invalid URL */
    }
  }

  return [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          'connect-src': connectSrc,
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: corsOrigins.size > 0 ? [...corsOrigins] : true,
      credentials: true,
    },
  },
  'strapi::query',
  'strapi::body',
  'global::sanitize-response-headers',
  // Custom middleware to log OAuth requests (must be early to catch all requests)
  'global::log-oauth-requests',
  // Custom middleware to remove portal parameter from auth requests
  // Must be AFTER strapi::body (to access parsed body) but BEFORE validation
  'global::remove-portal-param',
  // Custom middleware to allow admin tokens to access Content API
  // Must be BEFORE strapi::session to intercept auth before session validation
  'global::admin-token-content-api',
  {
    name: 'strapi::session',
    config: {
      // Configure session to handle secure cookies behind proxy
      // When behind a proxy (like Strapi Cloud), the connection appears as HTTP
      // but the external connection is HTTPS. The proxy: true setting tells koa-session
      // to trust X-Forwarded-Proto headers from the proxy
      key: 'strapi.sid',
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      proxy: true, // Trust proxy headers (X-Forwarded-Proto) in koa-session
    },
  },
  'strapi::favicon',
  'strapi::public',
  // OTP rate limiting middleware
  {
    name: 'global::otp-rate-limit',
    config: {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000, // 15 minutes
    },
  },
];
};
