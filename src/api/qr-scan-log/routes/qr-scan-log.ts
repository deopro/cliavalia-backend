export default {
  routes: [
    {
      method: "POST",
      path: "/qr/scan",
      handler: "qr-scan-log.scan",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/qr/analytics",
      handler: "qr-scan-log.analytics",
      config: {
        auth: false,
      },
    },
  ],
};
