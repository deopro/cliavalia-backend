export default {
  routes: [
    {
      method: 'POST',
      path: '/custom-upload',
      handler: 'custom-upload.upload',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
