import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: [
      // 'ar',
      // 'fr',
      // 'cs',
      // 'de',
      // 'dk',
      // 'es',
      // 'he',
      // 'id',
      // 'it',
      // 'ja',
      // 'ko',
      // 'ms',
      // 'nl',
      // 'no',
      // 'pl',
      // 'pt-BR',
      // 'pt',
      // 'ru',
      // 'sk',
      // 'sv',
      // 'th',
      // 'tr',
      // 'uk',
      // 'vi',
      // 'zh-Hans',
      // 'zh',
    ],
  },
  bootstrap(app: StrapiApp) {
    // Suppress deprecation warnings from Strapi core plugins
    // These warnings are from Strapi's own plugins (Content Manager, Media Library, etc.)
    // and will be fixed in future Strapi updates. They don't affect functionality.
    if (typeof window !== 'undefined') {
      // Hide the JWT token expiration field — expiration is managed via JWT_EXPIRES_IN in .env.
      // The store is synced from env on every server boot; the UI field would be misleading.
      const jwtFieldStyle = document.createElement('style');
      jwtFieldStyle.textContent = `
        div:has(> label[for="jwt_token"]),
        div:has(> label[for="jwtToken"]) { display: none !important; }
      `;
      document.head.appendChild(jwtFieldStyle);

      const originalWarn = console.warn;
      const originalError = console.error;

      console.warn = (...args: any[]) => {
        const message = args[0]?.toString() || '';
        
        // Suppress specific Strapi deprecation warnings
        if (
          message.includes('[deprecated]') &&
          (message.includes('addMenuLink()') ||
           message.includes('addSettingsLink()') ||
           message.includes('was called with an async Component'))
        ) {
          // Suppress these warnings silently
          return;
        }
        
        // Allow all other warnings through
        originalWarn.apply(console, args);
      };

      console.error = (...args: any[]) => {
        const message = args[0]?.toString() || '';
        
        // Suppress specific Strapi deprecation warnings
        if (
          message.includes('[deprecated]') &&
          (message.includes('addMenuLink()') ||
           message.includes('addSettingsLink()') ||
           message.includes('was called with an async Component') ||
           message.includes('the `to` property of your settings link is an absolute path'))
        ) {
          // Suppress these warnings silently
          return;
        }
        
        // Allow all other errors through
        originalError.apply(console, args);
      };
    }
  },
};
