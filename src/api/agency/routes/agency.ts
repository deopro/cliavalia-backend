/**
 * agency routes (URL paths use /locations, Strapi content type remains api::agency.agency)
 */

export default {
  routes: [
    // ── Primary routes (new /locations URLs) ──
    {
      method: 'GET',
      path: '/locations/my-submissions',
      handler: 'agency.mySubmissions',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/locations/my-business-locations',
      handler: 'agency.myBusinessAgencies',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/locations/search',
      handler: 'agency.search',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/locations',
      handler: 'agency.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/locations/:id',
      handler: 'agency.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/locations',
      handler: 'agency.find',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/locations/:id',
      handler: 'agency.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    // ── Backward-compatible aliases (old /agencies URLs) ──
    {
      method: 'GET',
      path: '/agencies/my-submissions',
      handler: 'agency.mySubmissions',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/agencies/my-business-agencies',
      handler: 'agency.myBusinessAgencies',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/agencies/search',
      handler: 'agency.search',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/agencies',
      handler: 'agency.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/agencies/:id',
      handler: 'agency.update',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/agencies',
      handler: 'agency.find',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/agencies/:id',
      handler: 'agency.findOne',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
