/**
 * Custom gallery routes for businesses.
 * Separate file with full handler UIDs for proper Strapi v5 permission registration.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/businesses/:id/gallery',
      handler: 'api::business.business.addGalleryImages',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/businesses/:id/gallery/remove',
      handler: 'api::business.business.removeGalleryImage',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/businesses/:id/gallery/reorder',
      handler: 'api::business.business.reorderGallery',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
