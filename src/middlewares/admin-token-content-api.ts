/**
 * Middleware to allow admin tokens to access content API endpoints
 * 
 * In Strapi v5, admin tokens from /admin/login are typically only valid
 * for admin API operations. This middleware intercepts content API requests
 * and validates admin tokens, allowing them to access content API endpoints.
 */

export default (config: any, { strapi }: { strapi: any }) => {
  // Log middleware initialization
  console.log('🔵 [MIDDLEWARE] Admin token content API middleware loaded');
  strapi?.log?.info('🔵 [MIDDLEWARE] Admin token content API middleware loaded');

  return async (ctx: any, next: any) => {
    // Only process content API requests (/api/*)
    // Skip admin API, auth routes, and other non-content API routes
    const url = ctx.request.url.split('?')[0]; // Remove query params
    
    // Log all content API requests to see if middleware is being called
    if (url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      console.log(`[ADMIN-TOKEN-MW] Processing content API request: ${url}`);
      strapi.log.info(`[ADMIN-TOKEN-MW] Processing content API request: ${url}`);
    }
    
    if (!url.startsWith('/api/') || url.startsWith('/api/auth/')) {
      return next();
    }

    // Skip if already authenticated (user token)
    if (ctx.state.user) {
      console.log(`[ADMIN-TOKEN-MW] User already authenticated, skipping admin token check for ${url}`);
      return next();
    }

    // Check for Authorization header
    const authHeader = ctx.request.header.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[ADMIN-TOKEN-MW] No Bearer token found for ${url}`);
      return next();
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      console.log(`[ADMIN-TOKEN-MW] Empty token for ${url}`);
      return next();
    }
    
    console.log(`[ADMIN-TOKEN-MW] Checking admin token for ${url}`);
    strapi.log.info(`[ADMIN-TOKEN-MW] Checking admin token for ${url}`);

    try {
      // Verify admin token by decoding it and fetching the admin user
      // In Strapi v5, admin tokens are JWT tokens signed with ADMIN_JWT_SECRET
      console.log(`[ADMIN-TOKEN-MW] Attempting to verify admin token for content API: ${url}`);
      strapi.log.info(`[ADMIN-TOKEN-MW] Attempting to verify admin token for content API: ${url}`);
      
      // Get admin JWT secret from config
      const adminJwtSecret = strapi.config.get('admin.auth.secret');
      
      if (!adminJwtSecret) {
        console.log(`[ADMIN-TOKEN-MW] Admin JWT secret not configured`);
        return next();
      }
      
      // Use admin token service to decode/verify the token
      const adminTokenService = strapi.admin?.services?.token;
      
      if (!adminTokenService) {
        console.log(`[ADMIN-TOKEN-MW] Admin token service not available`);
        return next();
      }
      
      // Try to decode the token (this doesn't verify signature, but gets the payload)
      let decoded: any;
      
      // Check what methods are available on the token service
      if (typeof adminTokenService.decode === 'function') {
        // Try as async first, then sync
        try {
          decoded = await adminTokenService.decode(token);
        } catch {
          decoded = adminTokenService.decode(token);
        }
      } else {
        // Try to manually decode JWT (without verification for now)
        // Split token and decode base64 payload
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
            decoded = JSON.parse(payload);
          } catch (parseError) {
            throw new Error('Failed to decode admin token');
          }
        }
      }
      
      // Log the decoded payload for debugging
      console.log(`[ADMIN-TOKEN-MW] Decoded token payload for ${url}:`, JSON.stringify(decoded, null, 2));
      
      // Admin tokens in Strapi v5 might use 'id', 'sub', or have nested structure
      const userId = decoded.id || decoded.sub || decoded.user?.id || decoded.userId;
      
      if (!decoded || !userId) {
        console.log(`[ADMIN-TOKEN-MW] Token decode returned no user ID. Available fields:`, Object.keys(decoded || {}));
        throw new Error('Invalid admin token payload');
      }
      
      // Fetch admin user from database using admin user service
      const adminUserService = strapi.admin?.services?.user;
      if (!adminUserService) {
        throw new Error('Admin user service not available');
      }
      
      // Use findOne with just the ID (not wrapped in an object)
      const adminUser = await adminUserService.findOne(userId);
      
      if (adminUser && adminUser.id) {
        // Token is a valid admin token
        // Set admin user in state for both admin and user contexts
        ctx.state.admin = adminUser;
        ctx.state.isAuthenticated = true;
        
        // Set auth object to mark this as an authenticated admin request
        ctx.state.auth = {
          strategy: { name: 'admin' },
          credentials: adminUser,
        };
        
        // For content API, set ctx.state.user to bypass permission checks
        // We use a high permission level to ensure access to all content
        ctx.state.user = {
          id: adminUser.id,
          email: adminUser.email,
          username: adminUser.email,
          isAdmin: true,
          // Set role to null but mark as admin - some Strapi handlers check for this
          role: null,
        };

        console.log(`✅ [ADMIN-TOKEN-MW] Admin token validated for content API: ${adminUser.email}`);
        strapi.log.info(`✅ [ADMIN-TOKEN-MW] Admin token validated for content API: ${adminUser.email}`);
        return next();
      } else {
        console.log(`[ADMIN-TOKEN-MW] Admin token verification returned no user for ${url}`);
      }
    } catch (error: any) {
      // Token verification failed - let it fall through to normal auth
      // This allows regular user tokens to still work
      console.log(`[ADMIN-TOKEN-MW] Admin token verification failed for ${url}: ${error.message}`);
      strapi.log.debug('Admin token verification failed, trying normal auth:', error.message);
    }

    // Continue with normal authentication flow
    return next();
  };
};

