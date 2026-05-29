export default ({ env }) => ({
  'site-settings': {
    enabled: true,
    resolve: './src/plugins/site-settings',
  },
  i18n: {
    config: {
      locales: ['en', 'pt'],
      defaultLocale: 'pt',
    },
  },
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
      jwt: {
        // Token expiration is code-controlled via JWT_EXPIRES_IN in .env (defaults to 30d).
        // The admin UI field is hidden and the store value is synced on every boot (see src/index.ts).
        expiresIn: env('JWT_EXPIRES_IN', '30d'),
      },
      register: {
        allowedFields: ['firstName', 'lastName', 'profileImage', 'emailLocale'],
      },
      // Configure email confirmation URL from .env (set FRONTEND_URL in .env)
      emailConfirmationUrl: env('FRONTEND_URL'),
      // Alternative configuration for email confirmation
      emailConfirmation: {
        redirectUrl: env('FRONTEND_URL'),
      },
    },
  },
  email: {
    config: {
      // Use Brevo HTTP API instead of SMTP relay for reliable delivery.
      // The provider is loaded from ./providers/brevo-api.js via absolute path.
      provider: require('path').join(process.cwd(), 'providers', 'brevo-api'),
      providerOptions: {
        apiKey: env('BREVO_API_KEY'),
      },
      settings: {
        // Sender display name must be "CliAvalia" (not derived from email/domain)
        defaultFrom: env('DEFAULT_SENDER_EMAIL')
          ? `CliAvalia <${env('DEFAULT_SENDER_EMAIL')}>`
          : 'CliAvalia <notificacoes@cliavalia.com>',
        defaultReplyTo: env('DEFAULT_REPLY_TO', 'notificacoes@cliavalia.com'),
      },
    },
  },
  upload: {
    config: {
      provider: 'cloudinary',
      providerOptions: {
        cloud_name: env('CLOUDINARY_NAME'),
        api_key: env('CLOUDINARY_KEY'),
        api_secret: env('CLOUDINARY_SECRET'),
      },
      /**
       * Strapi's Cloudinary provider already sends resource_type "auto" on upload (see
       * @strapi/provider-upload-cloudinary). For delivery, if PDFs return 401
       * (X-Cld-Error: deny or ACL failure), enable PDF/ZIP delivery in the Cloudinary console
       * (Settings → Security) and ensure CLOUDINARY_* in .env matches the cloud name in URLs.
       * Admin business-claim APIs attach signed URLs for PDFs server-side.
       */
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
});