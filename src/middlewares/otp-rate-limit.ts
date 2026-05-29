/**
 * OTP Rate Limiting Middleware
 * Limits OTP requests to 3 per phone number per 15 minutes
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed systems
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

export default (config: { maxRequests?: number; windowMs?: number }, { strapi }: { strapi: any }) => {
  const maxRequests = config?.maxRequests || 3;
  const windowMs = config?.windowMs || 15 * 60 * 1000; // 15 minutes default

  return async (ctx: any, next: any) => {
    // Only apply to send-otp endpoint
    if (!ctx.request.url?.includes('/otp-auth/send-otp')) {
      return next();
    }

    // Extract phone number from request body
    const phoneNumber = ctx.request.body?.phoneNumber;
    
    if (!phoneNumber) {
      // If no phone number, let the controller handle the validation error
      return next();
    }

    const now = Date.now();
    const entry = rateLimitStore.get(phoneNumber);

    // Check if entry exists and is still valid
    if (entry && entry.resetAt > now) {
      // Entry exists and window hasn't expired
      if (entry.count >= maxRequests) {
        // Rate limit exceeded
        const remainingTime = Math.ceil((entry.resetAt - now) / 1000 / 60); // minutes
        strapi.log.warn('OTP rate limit exceeded:', {
          phoneNumber,
          count: entry.count,
          remainingMinutes: remainingTime,
        });
        
        ctx.status = 429; // Too Many Requests
        ctx.body = {
          error: {
            status: 429,
            message: `Too many OTP requests. Please try again in ${remainingTime} minute(s).`,
            data: {
              phoneNumber,
              retryAfter: Math.ceil((entry.resetAt - now) / 1000), // seconds
            },
          },
        };
        return;
      }

      // Increment count
      entry.count++;
      rateLimitStore.set(phoneNumber, entry);
    } else {
      // No entry or expired - create new entry
      rateLimitStore.set(phoneNumber, {
        count: 1,
        resetAt: now + windowMs,
      });
    }

    // Continue to next middleware/controller
    return next();
  };
};
