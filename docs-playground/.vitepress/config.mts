import { fileURLToPath } from 'node:url';

import { defineDocsVitepressConfig } from '../../src/vitepress/define-docs-vitepress-config.ts';
import { ConfigsManager } from '../../src/utils/configs-manager.ts';

const configs = ConfigsManager.create(
  fileURLToPath(new URL('../', import.meta.url)),
);

export default defineDocsVitepressConfig(configs, {
  appearance: 'dark',
  createdYear: '2026',
  description:
    'Playground that demonstrates how to build a documentation website with sborshik.',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Introduction', link: '/introduction/overview' },
      { text: 'Guides', link: '/guides/vite-config' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        link: '/introduction/overview',
        items: [
          { text: 'Overview', link: '/introduction/overview' },
          { text: 'Getting started', link: '/introduction/getting-started' },
        ],
      },
      {
        text: 'Guides',
        link: '/guides/vite-config',
        items: [
          { text: 'Build config', link: '/guides/vite-config' },
          { text: 'VitePress config', link: '/guides/vitepress-config' },
          { text: 'Theme customization', link: '/guides/theme-customization' },
        ],
      },
    ],
  },
});
