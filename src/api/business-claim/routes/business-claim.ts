import { factories } from '@strapi/strapi';

// Use Strapi's core router factory for default CRUD routes
export default factories.createCoreRouter('api::business-claim.business-claim', {
  config: {
    find: {
      // Allow authenticated users (including admin tokens via middleware)
      policies: [],
      middlewares: [],
    },
    findOne: {
      policies: [],
      middlewares: [],
    },
    create: {
      auth: false, // Allow unauthenticated users to create claims
      policies: [],
      middlewares: [],
    },
    update: {
      policies: [],
      middlewares: [],
    },
    delete: {
      policies: [],
      middlewares: [],
    },
  },
});



















