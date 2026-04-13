import type { DefaultTheme, UserConfig } from 'vitepress';

export interface DocsThemePalette {
  brand1?: string;
  brand2?: string;
  brand3?: string;
  brandSoft?: string;
  darkBrand1?: string;
  darkBrand2?: string;
  darkBrand3?: string;
  darkBrandSoft?: string;
}

export interface SborshikDocsConfig {
  sourceDir?: string;
  outDir?: string;
  base?: string;
  appearance?: UserConfig<DefaultTheme.Config>['appearance'];
  createdYear?: string;
  description?: string;
  theme?: {
    palette?: DocsThemePalette;
  };
  head?: UserConfig<DefaultTheme.Config>['head'];
  themeConfig?: DefaultTheme.Config;
}

export interface SborshikConfig {
  docs?: SborshikDocsConfig;
}
