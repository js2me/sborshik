import { resolve } from 'node:path';
import type { ConfigsManager } from '../utils/configs-manager.js';

export function getLibEntryAndAliasFromConfigs(configs: ConfigsManager) {
  const __dirname = configs.rootPath;

  const entry = Object.fromEntries(
    Object.entries(configs.pathAliasesFromTsConfig).map(([key, [value]]) => {
      const name = key.split('/').pop()!;
      const entryPath = value.startsWith('./') ? value.slice(2) : value;
      return [name, resolve(__dirname, entryPath)];
    }),
  );

  const hasIndexTsInTsConfigPathAlias =
    !!configs.pathAliasesFromTsConfig[configs.package.name];

  if (configs.hasSourceIndexTs && !hasIndexTsInTsConfigPathAlias) {
    entry.index = configs.sourceIndexTs;
  }

  const alias = Object.fromEntries(
    Object.entries(configs.pathAliasesFromTsConfig).map(([key, [value]]) => {
      const entryPath = value.startsWith('./') ? value.slice(2) : value;
      return [key, resolve(__dirname, entryPath)];
    }),
  );

  return { entry, alias, hasIndexTsInTsConfigPathAlias };
}
