export default {
  routes: [
    {
      method: 'GET',
      path: '/email-templates',
      handler: 'email-template.findAll',
      config: { auth: false, middlewares: [] },
    },
    {
      method: 'GET',
      path: '/email-templates/:key/:locale',
      handler: 'email-template.findOne',
      config: { auth: false, middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/email-templates/:key/:locale',
      handler: 'email-template.update',
      config: { auth: false, middlewares: [] },
    },
    {
      method: 'POST',
      path: '/email-templates/:key/:locale/reset',
      handler: 'email-template.reset',
      config: { auth: false, middlewares: [] },
    },
  ],
};
