/**
 * review-draft router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::review-draft.review-draft', {
  config: {
    create: {
      policies: [],
      middlewares: [],
    },
    find: {
      policies: [],
      middlewares: [],
    },
    findOne: {
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
