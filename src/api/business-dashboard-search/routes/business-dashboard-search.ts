export default {
  routes: [
    {
      method: 'GET',
      path: '/business-dashboard/search',
      handler: 'business-dashboard-search.search',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};