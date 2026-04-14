import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path, { resolve } from 'node:path';
import ts from 'typescript';

interface EntryItem {
  /**
   * mobx-tanstack-query
   */
  importName: string;
  /**
   * index
   */
  relativeName: string;
  /**
   * ./src/index.ts
   */
  entryPath: string;
}

const require = createRequire(import.meta.url);

export class ConfigsManager {
  rootPath: string;
  tsconfigPath: string;
  packagePath: string;
  sourceCodeRelativeDir: string;
  sourceCodeFullDir: string;

  package!: Record<string, any>;
  tsconfig!: Record<string, any>;

  private cache = new Map<string, any>();

  private constructor(
    rootPath?: string,
    opts?: { tsconfigName?: string; sourceCodeDir?: string },
  ) {
    this.rootPath = rootPath ?? process.cwd();
    this.sourceCodeRelativeDir = opts?.sourceCodeDir ?? './src';
    this.sourceCodeFullDir = resolve(this.rootPath, this.sourceCodeRelativeDir);
    this.tsconfigPath = resolve(
      this.rootPath,
      `./${opts?.tsconfigName ?? 'tsconfig'}.json`,
    );
    this.packagePath = resolve(this.rootPath, `./package.json`);
    this.refreshConfigs();
  }

  get ghRepoData() {
    // git://github.com/js2me/mobx-route
    const [user, packageName] =
      this.package.repository?.url?.split('github.com/')?.[1]?.split?.('/') ??
      [];

    if (!user) {
      return {
        user: '',
        packageName: this.package.name,
      };
    }

    return {
      user,
      packageName,
    };
  }

  get repositoryUrl() {
    return `https://github.com/${this.ghRepoData.user}/${this.ghRepoData.packageName}`;
  }

  get entries(): EntryItem[] {
    const aliases = this.pathAliasesFromTsConfig;
    if (!Object.keys(aliases).length) {
      return [
        {
          importName: this.package.name,
          relativeName: 'index',
          entryPath: `${this.sourceCodeRelativeDir}/index.ts`,
        },
      ];
    }

    return Object.entries(aliases).map(
      ([importName, paths]): EntryItem => {
        const entryPath = (paths as string[])?.[0];
        const entryName = entryPath
          .replace('/index.ts', '')
          .replace('.tsx', '')
          .replace('.ts', '')
          .replace('./src/', '');

        return {
          importName,
          relativeName: entryName === './src' ? 'index' : entryName,
          entryPath: resolve(this.rootPath, entryPath),
        };
      },
    );
  }

  refreshConfigs() {
    try {
      this.package = this.readJson(this.packagePath);
    } catch (_) {
      this.package = null as any;
    }
    try {
      this.tsconfig = this.readJson(this.tsconfigPath);
    } catch (_) {
      this.tsconfig = null as any;
    }
  }

  syncConfigs() {
    if (this.tsconfig) {
      writeFileSync(this.tsconfigPath, JSON.stringify(this.tsconfig, null, 2));
    }

    if (this.package) {
      writeFileSync(this.packagePath, JSON.stringify(this.package, null, 2));
    }
  }

  readJson(path: string) {
    const filePath = resolve(this.rootPath, path);
    const fileText = readFileSync(filePath, 'utf8');

    try {
      return JSON.parse(fileText);
    } catch (_) {
      const { config, error } = ts.parseConfigFileTextToJson(filePath, fileText);

      if (error) {
        throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
      }

      return config;
    }
  }

  get externalDeps(): string[] {
    if (this.cache.has('external-deps')) {
      return this.cache.get('external-deps')!;
    }

    function collectAllDependencies(
      pkgPath: string,
      collected = new Set<string>(),
    ): Set<string> {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

        const allDeps = {
          ...pkg.dependencies,
          ...pkg.peerDependencies,
        };

        if (pkg.main) {
          collected.add(pkg.name);
        }

        Object.keys(pkg.exports || {}).forEach((exportKey) => {
          const exportPath = exportKey.startsWith('./')
            ? exportKey.slice(2)
            : exportKey;

          if (exportPath === '.') {
            collected.add(pkg.name);
          } else {
            collected.add(`${pkg.name}/${exportPath}`);
          }
        });

        for (const depName of Object.keys(allDeps)) {
          // Пропускаем уже собранные
          if (collected.has(depName)) continue;

          collected.add(depName);

          // Ищем package.json зависимости
          const depPkgPath = path.join('node_modules', depName, 'package.json');

          if (existsSync(depPkgPath)) {
            // Рекурсивно собираем зависимости этой зависимости
            collectAllDependencies(depPkgPath, collected);
          }
        }

        return collected;
      } catch (_) {
        return collected;
      }
    }

    // Собираем все external зависимости
    const allExternalDeps = collectAllDependencies('./package.json');

    const result = [
      ...allExternalDeps,
      ...Object.keys(this.tsconfig?.compilerOptions?.paths || {}),
    ];

    this.cache.set('external-deps', result);

    return result;
  }

  /**
   * @ -> .tsconfig.compilerOptions.paths
   */
  get pathAliasesFromTsConfig(): Record<string, string[]> {
    const tsconfigPath = resolve(this.tsconfigPath);
    const aliases = this.resolveTsConfigAliases(tsconfigPath, new Set());
    return aliases;
  }

  private resolveTsConfigAliases(
    tsconfigPath: string,
    visiting: Set<string>,
    resolvedCache = new Map<string, Record<string, string[]>>(),
  ): Record<string, string[]> {
    if (resolvedCache.has(tsconfigPath)) {
      return resolvedCache.get(tsconfigPath)!;
    }

    if (visiting.has(tsconfigPath)) {
      this.warn(
        `Detected tsconfig cycle while resolving aliases: ${tsconfigPath}. Skipping this branch.`,
      );
      return {};
    }

    visiting.add(tsconfigPath);
    const tsconfig = this.readTsConfigFileSafe(tsconfigPath);

    if (!tsconfig) {
      visiting.delete(tsconfigPath);
      resolvedCache.set(tsconfigPath, {});
      return {};
    }

    const tsconfigDir = path.dirname(tsconfigPath);
    const extendsPath = this.resolveExtendsPath(
      tsconfigDir,
      tsconfig.extends as string | undefined,
    );
    const aliasesFromExtends = extendsPath
      ? this.resolveTsConfigAliases(extendsPath, visiting, resolvedCache)
      : {};

    const ownAliases = this.normalizePathsFromTsConfig(
      tsconfig.compilerOptions?.paths,
      tsconfigDir,
    );
    const hasOwnAliases = Object.keys(ownAliases).length > 0;

    // Child config overrides parent config for extends chain.
    let mergedAliases: Record<string, string[]> = {
      ...aliasesFromExtends,
      ...ownAliases,
    };

    // For references, we read deterministically in declared order and keep first value on collisions.
    if (!hasOwnAliases && Array.isArray(tsconfig.references)) {
      const aliasesFromReferences: Record<string, string[]> = {};

      for (const reference of tsconfig.references) {
        const referencedPathValue =
          typeof reference?.path === 'string' ? reference.path : '';
        if (!referencedPathValue) {
          continue;
        }

        const referencedPath = this.resolveReferencePath(
          tsconfigDir,
          referencedPathValue,
        );
        if (!referencedPath) {
          this.warn(
            `Referenced tsconfig not found: "${referencedPathValue}" from ${tsconfigPath}. Skipping.`,
          );
          continue;
        }

        const refAliases = this.resolveTsConfigAliases(
          referencedPath,
          visiting,
          resolvedCache,
        );

        for (const [alias, aliasPaths] of Object.entries(refAliases)) {
          if (!(alias in aliasesFromReferences)) {
            aliasesFromReferences[alias] = aliasPaths;
          }
        }
      }

      mergedAliases = {
        ...aliasesFromReferences,
        ...mergedAliases,
      };
    }

    visiting.delete(tsconfigPath);
    resolvedCache.set(tsconfigPath, mergedAliases);
    return mergedAliases;
  }

  private readTsConfigFileSafe(tsconfigPath: string) {
    if (!existsSync(tsconfigPath)) {
      this.warn(`Tsconfig file does not exist: ${tsconfigPath}`);
      return null;
    }

    try {
      const source = readFileSync(tsconfigPath, 'utf8');
      const { config, error } = ts.parseConfigFileTextToJson(tsconfigPath, source);

      if (error || !config) {
        this.warn(
          `Failed to parse tsconfig: ${tsconfigPath}. ${
            error
              ? ts.flattenDiagnosticMessageText(error.messageText, '\n')
              : 'Unknown parse error'
          }`,
        );
        return null;
      }

      return config as Record<string, any>;
    } catch (error) {
      this.warn(`Failed to read tsconfig: ${tsconfigPath}`, error);
      return null;
    }
  }

  private normalizePathsFromTsConfig(
    pathsConfig: unknown,
    configDir: string,
  ): Record<string, string[]> {
    if (!pathsConfig || typeof pathsConfig !== 'object') {
      return {};
    }

    const normalizedAliases: Record<string, string[]> = {};

    for (const [alias, rawPaths] of Object.entries(pathsConfig)) {
      if (!Array.isArray(rawPaths)) {
        continue;
      }

      const values = rawPaths
        .filter((value): value is string => typeof value === 'string')
        .map((value) => this.toRootRelativePath(resolve(configDir, value)))
        .filter(Boolean);

      if (values.length) {
        normalizedAliases[alias] = values;
      }
    }

    return normalizedAliases;
  }

  private resolveExtendsPath(
    tsconfigDir: string,
    extendsValue?: string,
  ): string | null {
    if (!extendsValue) {
      return null;
    }

    const relativeCandidate = this.resolveConfigPathFromValue(
      tsconfigDir,
      extendsValue,
    );
    if (relativeCandidate) {
      return relativeCandidate;
    }

    try {
      return require.resolve(extendsValue, { paths: [tsconfigDir] });
    } catch (_) {
      this.warn(
        `Cannot resolve tsconfig "extends": "${extendsValue}" from ${tsconfigDir}. Skipping.`,
      );
      return null;
    }
  }

  private resolveReferencePath(
    tsconfigDir: string,
    referencePath: string,
  ): string | null {
    return this.resolveConfigPathFromValue(tsconfigDir, referencePath);
  }

  private resolveConfigPathFromValue(
    baseDir: string,
    value: string,
  ): string | null {
    const absoluteValue = resolve(baseDir, value);
    const candidates = [
      absoluteValue,
      `${absoluteValue}.json`,
      resolve(absoluteValue, 'tsconfig.json'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }

    return null;
  }

  private toRootRelativePath(absolutePath: string): string {
    const relativePath = path.relative(this.rootPath, absolutePath);

    if (!relativePath || relativePath === '.') {
      return './';
    }

    if (relativePath.startsWith('.')) {
      return relativePath;
    }

    return `./${relativePath}`;
  }

  private warn(message: string, error?: unknown) {
    if (error) {
      console.warn(`[sborshik] ${message}`, error);
      return;
    }
    console.warn(`[sborshik] ${message}`);
  }

  static create(rootPath?: string, opts?: { tsconfigName?: string }) {
    return new ConfigsManager(rootPath, opts);
  }

  get sourceIndexTs() {
    return resolve(this.rootPath, './src/index.ts');
  }

  get hasSourceIndexTs() {
    return existsSync(this.sourceIndexTs);
  }
}
