import { resolve } from 'node:path';
import type { PluginContext } from 'rolldown';
import { rollup } from 'rollup';
import dts from 'rollup-plugin-dts';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import type { ConfigsManager } from '../utils/configs-manager.js';
import {
  type PrepareDistDirConfig,
  prepareDistDir,
} from '../utils/prepare-dist-dir.js';

export const defineLibViteConfig = (
  configs: ConfigsManager,
  config?: Partial<UserConfig> &
    Omit<PrepareDistDirConfig, 'configs'> & {
      customPluginBeforeFinish?: (
        pluginContext: PluginContext,
        error?: Error,
      ) => Promise<void>;
      externalDeps?: string[];
    },
) => {
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

  let dtsGenerationComplete: PromiseWithResolvers<void> | undefined;
  let customScriptBeforeFinish: PromiseWithResolvers<void> | undefined;

  const externalDeps = [
    ...configs.externalDeps,
    ...(Array.isArray(config?.build?.rollupOptions?.external)
      ? config.build.rollupOptions.external.filter(
          (it): it is string => typeof it === 'string',
        )
      : []),
    ...(config?.externalDeps || []),
  ];

  const definedConfig = defineConfig({
    resolve: {
      alias,
    },
    build: {
      lib: {
        entry,
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => {
          if (
            hasIndexTsInTsConfigPathAlias &&
            entryName === configs.package.name
          ) {
            return format === 'es' ? `index.js` : `index.cjs`;
          }
          return format === 'es' ? `${entryName}.js` : `${entryName}.cjs`;
        },
      },
      rollupOptions: {
        external: externalDeps,
        output: {
          preserveModules: false,
        },
      },
      minify: false,
      sourcemap: true,
    },
    plugins: [
      {
        name: 'dts-bundle',
        apply: 'build',
        buildStart() {
          dtsGenerationComplete = Promise.withResolvers();
        },
        async closeBundle() {
          console.log('\n📦 Generating bundled .d.ts files...\n');

          for (const [rawName, entryPath] of Object.entries(entry)) {
            let name = rawName;

            if (
              hasIndexTsInTsConfigPathAlias &&
              rawName === configs.package.name
            ) {
              name = 'index';
            }

            try {
              const bundle = await rollup({
                input: entryPath,
                external: (id) => {
                  if (id.includes('node_modules')) {
                    return true;
                  }

                  return externalDeps.some((dep) => id.startsWith(dep));
                },
                plugins: [
                  dts({
                    respectExternal: true,
                    compilerOptions: {
                      paths: configs.pathAliasesFromTsConfig,
                      baseUrl: '.',
                    },
                  }),
                ],
              });

              await bundle.write({
                file: `dist/${name}.d.ts`,
                format: 'es',
              });

              await bundle.close();
              console.log(`✅ ${name}.d.ts`);
            } catch (error) {
              console.error(`❌ Failed to generate ${name}.d.ts:`, error);
            }
          }

          console.log('\n✅ All .d.ts files generated!\n');
          dtsGenerationComplete?.resolve();
        },
      },
      {
        name: 'custom-script-before-finish',
        apply: 'build',
        enforce: 'post',
        buildStart() {
          customScriptBeforeFinish = Promise.withResolvers();
        },
        async closeBundle(error) {
          await dtsGenerationComplete?.promise;

          await config?.customPluginBeforeFinish?.(this, error);

          customScriptBeforeFinish?.resolve();
        },
      },
      {
        name: 'prepare-dist-package',
        apply: 'build',
        enforce: 'post',
        async closeBundle() {
          // Ждём завершения всех предыдущих плагинов
          await dtsGenerationComplete?.promise;
          await customScriptBeforeFinish?.promise;

          await prepareDistDir({
            ...config,
            configs: configs,
          });
        },
      },
    ],
  });

  return defineConfig(
    config ? mergeConfig(definedConfig, config) : definedConfig,
  );
};
