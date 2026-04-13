import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import type { SborshikConfig } from './types.js';

const SBORSHIK_CONFIG_FILES = [
  'sborshik.config.ts',
  'sborshik.config.mts',
  'sborshik.config.js',
  'sborshik.config.mjs',
  'sborshik.config.cts',
  'sborshik.config.cjs',
] as const;

export interface LoadedSborshikConfig {
  configPath: string;
  config: SborshikConfig;
}

export const findSborshikConfigPath = (rootDir: string): string | null => {
  for (const fileName of SBORSHIK_CONFIG_FILES) {
    const fullPath = path.resolve(rootDir, fileName);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
};

export const loadSborshikConfig = async (
  rootDir: string,
): Promise<LoadedSborshikConfig | null> => {
  const configPath = findSborshikConfigPath(rootDir);

  if (!configPath) {
    return null;
  }

  const loadedConfig = await loadConfigFromFile(
    {
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    },
    configPath,
    rootDir,
  );

  return {
    configPath,
    config: (loadedConfig?.config ?? {}) as SborshikConfig,
  };
};
