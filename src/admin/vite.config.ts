import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  return mergeConfig(config, {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
      },
      allowedHosts: [
        'localhost',
        '.localhost',
        'thriving-blessing-production-f286.up.railway.app',
        '.up.railway.app',
        'api.cliavalia.com',
        'shaolin.cliavalia.com',
      ],
    },
  });
};
