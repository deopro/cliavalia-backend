/**
 * review router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::review.review', {
  config: {
    // Create review - auth handled manually in controller (bypasses admin panel permission config)
    create: {
      auth: false,
      policies: [],
      middlewares: [],
    },
    // Find all reviews - public access (controlled by Strapi admin permissions)
    find: {
      policies: [],
      middlewares: [],
    },
    // Find one review - public access (controlled by Strapi admin permissions)
    findOne: {
      policies: [],
      middlewares: [],
    },
    // Update review - requires authentication and ownership check (handled in controller)
    update: {
      policies: [],
      middlewares: [],
    },
    // Delete review - requires authentication and ownership check (handled in controller)
    delete: {
      policies: [],
      middlewares: [],
    },
  },
});

