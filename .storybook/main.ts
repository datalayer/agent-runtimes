import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async config => {
    // Add custom plugins
    config.plugins = config.plugins || [];
    config.plugins.push(
      {
        name: 'mock-jupyterlite-assets',
        enforce: 'pre',
        resolveId(id, importer) {
          // Handle imports from @jupyterlite/javascript-kernel-extension that reference missing assets
          if (
            importer &&
            importer.includes('@jupyterlite/javascript-kernel-extension')
          ) {
            // Specifically target the problematic imports
            if (
              id === '../style/icons/logo-32x32.png' ||
              id === '../style/icons/logo-64x64.png' ||
              id.includes('style/icons/') ||
              (id.startsWith('../') &&
                (id.includes('.png') || id.includes('.svg')))
            ) {
              return (
                '\0virtual:jupyterlite-mock-' + id.replace(/[^a-zA-Z0-9]/g, '_')
              );
            }
          }
          return null;
        },
        load(id) {
          if (id.startsWith('\0virtual:jupyterlite-mock-')) {
            // Return a mock data URL for missing assets
            return 'export default "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="';
          }
          return null;
        },
      },
      {
        name: 'raw-css-as-string',
        enforce: 'pre',
        async resolveId(source, importer) {
          if (source.endsWith('.raw.css') && !source.includes('?raw')) {
            // rewrite import to append ?raw query
            const resolved = await this.resolve(source + '?raw', importer, {
              skipSelf: true,
            });
            if (resolved) return resolved.id;
            return null;
          }
          return null;
        },
      },
      {
        name: 'fix-text-query',
        enforce: 'pre',
        async resolveId(source, importer) {
          if (source.includes('?text')) {
            const fixed = source.replace('?text', '?raw');
            const resolved = await this.resolve(fixed, importer, {
              skipSelf: true,
            });
            if (resolved) {
              return resolved.id;
            }
            return fixed;
          }
          return null;
        },
      },
    );

    // Define global variables
    config.define = {
      ...config.define,
      global: 'globalThis',
      __webpack_public_path__: '""',
    };

    // Configure assets to include
    const existingAssetsInclude = Array.isArray(config.assetsInclude)
      ? config.assetsInclude
      : config.assetsInclude
        ? [config.assetsInclude]
        : [];
    config.assetsInclude = [
      ...existingAssetsInclude,
      '**/*.whl',
      '**/*.raw.css',
    ];

    // Configure build options
    config.build = {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        output: {
          ...config.build?.rollupOptions?.output,
          assetFileNames: assetInfo => {
            if (/pypi\//.test(assetInfo.names[0])) {
              return 'pypi/[name][extname]';
            }
            return 'assets/[name][extname]';
          },
        },
      },
    };

    // Configure resolve aliases
    config.resolve = {
      ...config.resolve,
      alias: [
        ...(Array.isArray(config.resolve?.alias) ? config.resolve.alias : []),
        {
          find: /^~(.*)$/,
          replacement: '$1',
        },
        {
          find: 'crypto',
          replacement: 'crypto-browserify',
        },
      ],
    };

    // Configure optimization dependencies
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [...(config.optimizeDeps?.include || []), 'crypto-browserify'],
      exclude: [
        ...(config.optimizeDeps?.exclude || []),
        '@jupyterlite/javascript-kernel-extension',
      ],
      esbuildOptions: {
        ...config.optimizeDeps?.esbuildOptions,
        loader: {
          ...config.optimizeDeps?.esbuildOptions?.loader,
          '.whl': 'text',
        },
      },
    };

    return config;
  },
};
export default config;
