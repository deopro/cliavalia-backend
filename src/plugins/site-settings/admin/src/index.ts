export default {
  register(app: any) {
    app.registerPlugin({
      id: 'site-settings',
      name: 'Site Settings',
    });
  },

  bootstrap(app: any) {
    app.addSettingsLink('global', {
      intlLabel: {
        id: 'site-settings.plugin.name',
        defaultMessage: 'Site Settings',
      },
      id: 'site-settings',
      to: 'site-settings',
      Component: async () => {
        const { default: Settings } = await import('./pages/Settings');
        return Settings;
      },
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    const importedTrads = await Promise.all(
      locales.map(() => {
        return {
          data: {
            'site-settings.plugin.name': 'Site Settings',
            'site-settings.page.title': 'Site Settings',
            'site-settings.tab.general': 'General',
            'site-settings.tab.pricing': 'Pricing & Bank',
            'site-settings.tab.plans': 'Plan Features',
            'site-settings.save': 'Save',
            'site-settings.saved': 'Settings saved',
            'site-settings.error': 'Failed to save settings',
          },
          locale: 'en',
        };
      })
    );

    return Promise.resolve(importedTrads);
  },
};
