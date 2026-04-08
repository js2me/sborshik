import react from '@vitejs/plugin-react-swc';
import type { UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vitest/config';
import type { ConfigsManager } from '../utils/configs-manager.js';
import { getLibEntryAndAliasFromConfigs } from './lib-entry-alias-from-configs.js';

export const defineLibVitestConfig = (
  configsManager: ConfigsManager,
  config?: Partial<UserConfig>,
) => {
  const { alias } = getLibEntryAndAliasFromConfigs(configsManager);

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
      alias,
    },
  };

  return defineConfig(
    config ? mergeConfig(definedConfig, config) : definedConfig,
  );
};
