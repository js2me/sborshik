import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DefaultTheme, UserConfig } from 'vitepress';
import type { SborshikDocsConfig } from './types.js';

interface PackageJsonData {
  name: string;
  author?: string;
  description?: string;
  license?: string;
}

const toSafeCssVarValue = (value: string | undefined) => {
  return value?.replace(/"/g, '\\"');
};

const renderThemePaletteStyle = (palette: SborshikDocsConfig['theme']) => {
  if (!palette?.palette) {
    return null;
  }

  const p = palette.palette;

  const rootVars = [
    p.brand1 && `--vp-c-brand-1: ${toSafeCssVarValue(p.brand1)};`,
    p.brand2 && `--vp-c-brand-2: ${toSafeCssVarValue(p.brand2)};`,
    p.brand3 && `--vp-c-brand-3: ${toSafeCssVarValue(p.brand3)};`,
    p.brandSoft && `--vp-c-brand-soft: ${toSafeCssVarValue(p.brandSoft)};`,
  ]
    .filter(Boolean)
    .join('\n  ');

  const darkVars = [
    p.darkBrand1 && `--vp-c-brand-1: ${toSafeCssVarValue(p.darkBrand1)};`,
    p.darkBrand2 && `--vp-c-brand-2: ${toSafeCssVarValue(p.darkBrand2)};`,
    p.darkBrand3 && `--vp-c-brand-3: ${toSafeCssVarValue(p.darkBrand3)};`,
    p.darkBrandSoft &&
      `--vp-c-brand-soft: ${toSafeCssVarValue(p.darkBrandSoft)};`,
  ]
    .filter(Boolean)
    .join('\n  ');

  const blocks = [
    rootVars && `:root {\n  ${rootVars}\n}`,
    darkVars && `html.dark {\n  ${darkVars}\n}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return blocks || null;
};

const buildDocsVitepressConfig = ({
  rootDir,
  packageJson,
  docsConfig,
}: {
  rootDir: string;
  packageJson: PackageJsonData;
  docsConfig: SborshikDocsConfig;
}): UserConfig<DefaultTheme.Config> => {
  const packageName = packageJson.name;
  const packageAuthor = packageJson.author || 'unknown';
  const currentYear = new Date().getFullYear();
  const createdYear = docsConfig.createdYear ?? `${currentYear}`;
  const sourceDir = path.resolve(rootDir, docsConfig.sourceDir || 'docs');
  const outDir = path.resolve(rootDir, docsConfig.outDir || 'docs-dist');
  const base = docsConfig.base ?? `/${packageName}/`;
  const socialLinks = [
    {
      icon: 'github',
      link: `https://github.com/${packageAuthor}/${packageName}`,
    },
    ...(docsConfig.themeConfig?.socialLinks || []),
  ];

  const paletteStyle = renderThemePaletteStyle(docsConfig.theme);

  return {
    srcDir: sourceDir,
    outDir,
    base,
    appearance: docsConfig.appearance ?? 'dark',
    title: packageName.replace(/-/g, ' '),
    description:
      docsConfig.description ||
      packageJson.description ||
      `${packageName} documentation website`,
    cleanUrls: true,
    lastUpdated: true,
    metaChunk: true,
    head: [
      ['link', { rel: 'icon', href: `${base}logo.png` }],
      ...(paletteStyle
        ? [
            ['style', {}, paletteStyle] as [
              string,
              Record<string, string>,
              string,
            ],
          ]
        : []),
      ...(docsConfig.head || []),
    ],
    themeConfig: {
      logo: '/logo.png',
      search: {
        provider: 'local',
      },
      outline: {
        level: [1, 3],
      },
      ...docsConfig.themeConfig,
      footer: {
        message: packageJson.license
          ? `Released under the ${packageJson.license} License.`
          : 'No license',
        copyright: `Copyright © ${createdYear}-PRESENT ${packageAuthor}`,
        ...docsConfig.themeConfig?.footer,
      },
      socialLinks,
    },
  };
};

const createRuntimeConfigFileContent = (
  vitepressConfig: UserConfig<DefaultTheme.Config>,
) => {
  return `import { defineConfig } from 'vitepress';

export default defineConfig(${JSON.stringify(vitepressConfig, null, 2)});
`;
};

export const createDocsRuntimeProject = ({
  rootDir,
  docsConfig,
}: {
  rootDir: string;
  docsConfig: SborshikDocsConfig;
}) => {
  const packageJson = JSON.parse(
    readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'),
  ) as PackageJsonData;

  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'sborshik-docs-'));
  const vitepressDir = path.resolve(runtimeRoot, '.vitepress');
  mkdirSync(vitepressDir, { recursive: true });

  const vitepressConfig = buildDocsVitepressConfig({
    rootDir,
    packageJson,
    docsConfig,
  });

  writeFileSync(
    path.resolve(vitepressDir, 'config.mts'),
    createRuntimeConfigFileContent(vitepressConfig),
    'utf8',
  );

  return {
    runtimeRoot,
    cleanup() {
      rmSync(runtimeRoot, { recursive: true, force: true });
    },
  };
};
