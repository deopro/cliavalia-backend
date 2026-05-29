/**
 * Data management routes for admin dashboard
 * Split from main admin-dashboard routes to avoid Strapi route loading limits
 */

export default {
  routes: [
    // Provinces (data management)
    {
      method: 'GET',
      path: '/admin-dashboard/provinces',
      handler: 'admin-dashboard.getProvinces',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/provinces/:id',
      handler: 'admin-dashboard.getProvince',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/provinces',
      handler: 'admin-dashboard.createProvince',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/provinces/:id',
      handler: 'admin-dashboard.updateProvince',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/provinces/:id',
      handler: 'admin-dashboard.deleteProvince',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Municipalities (data management)
    {
      method: 'GET',
      path: '/admin-dashboard/municipalities',
      handler: 'admin-dashboard.getMunicipalities',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/municipalities/:id',
      handler: 'admin-dashboard.getMunicipality',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/municipalities',
      handler: 'admin-dashboard.createMunicipality',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/municipalities/:id',
      handler: 'admin-dashboard.updateMunicipality',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/municipalities/:id',
      handler: 'admin-dashboard.deleteMunicipality',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Sectors (data management)
    {
      method: 'GET',
      path: '/admin-dashboard/sectors',
      handler: 'admin-dashboard.getSectors',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/sectors/:id',
      handler: 'admin-dashboard.getSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/sectors/:id/publish',
      handler: 'admin-dashboard.publishSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/sectors/:id/unpublish',
      handler: 'admin-dashboard.unpublishSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/sectors',
      handler: 'admin-dashboard.createSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/sectors/:id',
      handler: 'admin-dashboard.updateSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/sectors/:id',
      handler: 'admin-dashboard.deleteSector',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Categories (data management)
    {
      method: 'GET',
      path: '/admin-dashboard/categories',
      handler: 'admin-dashboard.getCategories',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/categories/:id',
      handler: 'admin-dashboard.getCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/categories/:id/publish',
      handler: 'admin-dashboard.publishCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/categories/:id/unpublish',
      handler: 'admin-dashboard.unpublishCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/categories',
      handler: 'admin-dashboard.createCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/categories/:id',
      handler: 'admin-dashboard.updateCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/categories/:id',
      handler: 'admin-dashboard.deleteCategory',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Businesses create/update/delete (GET list/one already in main routes file)
    {
      method: 'POST',
      path: '/admin-dashboard/businesses',
      handler: 'admin-dashboard.createBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/businesses/:id',
      handler: 'admin-dashboard.updateBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/businesses/:id',
      handler: 'admin-dashboard.deleteBusiness',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Locations (data management - full CRUD, renamed from Agencies)
    {
      method: 'GET',
      path: '/admin-dashboard/locations',
      handler: 'admin-dashboard.getAgencies',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/locations/:id',
      handler: 'admin-dashboard.getAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/locations',
      handler: 'admin-dashboard.createAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/locations/:id',
      handler: 'admin-dashboard.updateAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/locations/:id',
      handler: 'admin-dashboard.deleteAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Backward-compatible aliases (old /agencies URLs)
    {
      method: 'GET',
      path: '/admin-dashboard/agencies',
      handler: 'admin-dashboard.getAgencies',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/admin-dashboard/agencies/:id',
      handler: 'admin-dashboard.getAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/agencies',
      handler: 'admin-dashboard.createAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/agencies/:id',
      handler: 'admin-dashboard.updateAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/agencies/:id',
      handler: 'admin-dashboard.deleteAgency',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Reviewer Levels (gamification)
    {
      method: 'GET',
      path: '/admin-dashboard/reviewer-levels',
      handler: 'admin-dashboard.getReviewerLevels',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/admin-dashboard/reviewer-levels',
      handler: 'admin-dashboard.createReviewerLevel',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/admin-dashboard/reviewer-levels/:id',
      handler: 'admin-dashboard.updateReviewerLevel',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-dashboard/reviewer-levels/:id',
      handler: 'admin-dashboard.deleteReviewerLevel',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
