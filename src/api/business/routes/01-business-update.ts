/**
 * Custom PUT route for business update.
 * Loads before business.ts (01- prefix) so it matches first.
 * Strapi v5 core expects documentId; this route accepts numeric id.
 */
export default {
  routes: [
    {
      method: 'PUT',
      path: '/businesses/:id',
      handler: 'api::business.business.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
