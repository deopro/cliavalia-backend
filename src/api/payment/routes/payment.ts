/**
 * Payment API routes — manual bank transfer payment flow
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/create',
      handler: 'payment.create',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/payments/my',
      handler: 'payment.my',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/payments/list',
      handler: 'payment.list',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/payments/approve',
      handler: 'payment.approve',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/payments/reject',
      handler: 'payment.reject',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
