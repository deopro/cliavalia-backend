/**
 * business router
 */

import { factories } from '@strapi/strapi';

// Core router for standard CRUD operations.
// Exclude 'update' - Strapi v5 core uses documentId; we use a custom PUT route that accepts numeric id.
const coreRouter = factories.createCoreRouter('api::business.business', {
  except: ['update'],
  config: {
    find: { middlewares: [] },
    findOne: { middlewares: [] },
    create: { middlewares: [] },
    delete: { middlewares: [] },
  },
});

// Custom claim route (PUT /businesses/:id is in 01-business-update.ts)
const customRoutes = [
  {
    method: 'GET',
    path: '/businesses/my-submissions',
    handler: 'business.mySubmissions',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'GET',
    path: '/businesses/similar',
    handler: 'business.findSimilar',
    config: {
      auth: false,
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/businesses/:id/claim',
    handler: 'business.claim',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  // Gallery routes moved to 02-gallery.ts (requires full handler UIDs for Strapi v5 permission registration)
];

export default {
  get routes() {
    const coreRoutes = typeof coreRouter.routes === 'function'
      ? coreRouter.routes()
      : coreRouter.routes;

    return [...customRoutes, ...coreRoutes];
  },
};
