export default ({ env }) => {
  // Server public URL: must be set via SERVER_URL or PUBLIC_URL in .env (no hardcoded fallback)
  const getServerUrl = () => {
    const url = env('SERVER_URL') || env('PUBLIC_URL') || env('APP_URL') || env('KINSTA_URL');
    if (url) return url;
    if (env('NODE_ENV') === 'production') {
      console.warn('⚠️ SERVER_URL not set in production. Set SERVER_URL (or PUBLIC_URL) in .env to your public URL.');
    }
    return '';
  };

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    app: {
      keys: env.array('APP_KEYS'),
    },
    url: getServerUrl(),
    proxy: true,
    // Enable remote transfer if STRAPI_ENABLE_REMOTE_TRANSFER is not explicitly set to false (defaults to true)
    transfer: {
      remote: {
        enabled: env.bool('STRAPI_ENABLE_REMOTE_TRANSFER', true),
      },
    },
  };
};
