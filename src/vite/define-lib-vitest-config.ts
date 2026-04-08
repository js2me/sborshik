import react from '@vitejs/plugin-react-swc';
import type { UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vitest/config';
import type { ConfigsManager } from '../utils/configs-manager.js';

export const defineLibVitestConfig = (
  configsManager: ConfigsManager,
  config?: Partial<UserConfig>,
) => {
  const orderedAlias = [...configsManager.entries].sort(
    (a, b) => b.importName.length - a.importName.length,
  );

  const definedConfig: UserConfig = {
    plugins: [
      react({
        tsDecorators: true,
      }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      testTimeout: 5000,
      hookTimeout: 10000,
      teardownTimeout: 10000,
      coverage: {
        provider: 'istanbul', // or 'v8'
        include: ['src'],
        exclude: ['src/preset'],
        reporter: ['text', 'text-summary', 'html'],
        reportsDirectory: './coverage',
      },
    },
    resolve: {
      alias: orderedAlias.map((e) => ({
        find: e.importName,
        replacement: e.entryPath,
      })),
    },
  };

  return defineConfig(
    config ? mergeConfig(definedConfig, config) : definedConfig,
  );
};
