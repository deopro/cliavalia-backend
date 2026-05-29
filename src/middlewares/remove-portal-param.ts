/**
 * Middleware to remove 'portal' parameter from registration/login requests
 * This prevents Strapi's validation from rejecting the unknown field
 * The portal value is extracted and used by the controller to assign roles
 */

export default (config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    // Only process auth endpoints that use portal parameter
    const isAuthEndpoint = 
      ctx.request.path === '/api/auth/local/register' ||
      ctx.request.path === '/api/auth/local';
    
    if (isAuthEndpoint && ctx.request.method === 'POST' && ctx.request.body) {
      // Extract portal value before removing it
      const portal = ctx.request.body.portal;
      
      // Remove portal from body to prevent validation errors
      if (portal !== undefined) {
        delete ctx.request.body.portal;
        
        // Store portal in ctx.state so controller can access it
        ctx.state.portal = portal;
      }
    }
    
    await next();
  };
};
