import { existsSync } from 'node:fs';
import path from 'node:path';
import { PackageJsonManager } from './package-json-manager.js';

const KNOWN_SOURCE_EXTENSIONS = ['.tsx', '.ts', '.mts', '.cts'];
const KNOWN_RUNTIME_EXTENSIONS = ['.js', '.cjs', '.mjs'];
const KNOWN_TYPES_EXTENSIONS = ['.d.ts', '.d.cts', '.d.mts'];

const ensureDotSlash = (input: string) => {
  const normalized = input.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return `.${normalized}`;
  }
  return `./${normalized}`;
};

const stripDotSlash = (input: string) => input.replace(/^\.\/+/, '');

const replaceExtension = (input: string, nextExtension: string) => {
  for (const extension of [
    ...KNOWN_TYPES_EXTENSIONS,
    ...KNOWN_RUNTIME_EXTENSIONS,
    ...KNOWN_SOURCE_EXTENSIONS,
  ]) {
    if (input.endsWith(extension)) {
      return `${input.slice(0, -extension.length)}${nextExtension}`;
    }
  }

  return `${input}${nextExtension}`;
};

const isPathLikeValue = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  return (
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('dist/') ||
    normalized.startsWith('./dist/') ||
    normalized.startsWith('src/') ||
    normalized.startsWith('./src/')
  );
};

const tryResolveInsideDist = (distDir: string, relativePath: string) => {
  const normalized = stripDotSlash(relativePath);
  if (!normalized || normalized.startsWith('../')) {
    return null;
  }

  const absolutePath = path.resolve(distDir, normalized);
  if (existsSync(absolutePath)) {
    return ensureDotSlash(normalized);
  }

  return null;
};

const buildCandidates = (input: string) => {
  const normalized = input.replace(/\\/g, '/');
  const withoutDot = stripDotSlash(normalized);
  const candidates = new Set<string>();

  if (withoutDot.startsWith('dist/')) {
    candidates.add(withoutDot.slice('dist/'.length));
  } else {
    candidates.add(withoutDot);
  }

  if (withoutDot.startsWith('src/')) {
    const sourceRelativePath = withoutDot.slice('src/'.length);
    candidates.add(sourceRelativePath);

    for (const extension of KNOWN_TYPES_EXTENSIONS) {
      candidates.add(replaceExtension(sourceRelativePath, extension));
    }
  }

  return Array.from(candidates).filter(Boolean);
};

interface RewriteContext {
  distDir: string;
  warnings: string[];
}

const rewritePathLikeValue = (
  value: string,
  fieldPath: string,
  context: RewriteContext,
) => {
  if (!isPathLikeValue(value)) {
    return value;
  }

  for (const candidate of buildCandidates(value)) {
    const resolved = tryResolveInsideDist(context.distDir, candidate);
    if (resolved) {
      return resolved;
    }
  }

  context.warnings.push(
    `[rewrite-package-paths] Could not safely resolve "${fieldPath}" path "${value}" inside dist. Keeping original value.`,
  );
  return value;
};

const rewriteExportsNode = (
  value: unknown,
  fieldPath: string,
  context: RewriteContext,
): unknown => {
  if (typeof value === 'string') {
    return rewritePathLikeValue(value, fieldPath, context);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      rewriteExportsNode(item, `${fieldPath}[${index}]`, context),
    );
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        rewriteExportsNode(nestedValue, `${fieldPath}.${key}`, context),
      ]),
    );
  }

  return value;
};

export const rewritePackagePathsInObject = (
  packageJson: Record<string, unknown>,
  distDir: string,
) => {
  const context: RewriteContext = {
    distDir,
    warnings: [],
  };

  if (typeof packageJson.main === 'string') {
    packageJson.main = rewritePathLikeValue(
      '' + packageJson.main,
      'main',
      context,
    );
  }

  if (typeof packageJson.module === 'string') {
    packageJson.module = rewritePathLikeValue(
      '' + packageJson.module,
      'module',
      context,
    );
  }

  if (typeof packageJson.types === 'string') {
    packageJson.types = rewritePathLikeValue(
      '' + packageJson.types,
      'types',
      context,
    );
  }

  if (packageJson.exports) {
    packageJson.exports = rewriteExportsNode(
      packageJson.exports,
      'exports',
      context,
    );
  }

  for (const warning of context.warnings) {
    console.warn(warning);
  }
};

export const rewritePackagePathsInDistPackageJson = (
  distPackageJsonPath: string,
) => {
  if (!existsSync(distPackageJsonPath)) {
    console.warn(
      `[rewrite-package-paths] dist package.json not found at ${distPackageJsonPath}. Skipping path rewrite.`,
    );
    return;
  }

  const manager = new PackageJsonManager(distPackageJsonPath);
  rewritePackagePathsInObject(manager.data, path.dirname(distPackageJsonPath));
  manager.syncWithFs();
};
