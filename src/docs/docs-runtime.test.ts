import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocsRuntimeProject } from './docs-runtime.js';

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const createFixtureRoot = async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'sborshik-docs-runtime-'));
  createdDirs.push(rootDir);

  mkdirSync(path.resolve(rootDir, 'docs'), { recursive: true });
  writeFileSync(path.resolve(rootDir, 'docs/index.md'), '# Hello docs', 'utf8');
  writeFileSync(
    path.resolve(rootDir, 'package.json'),
    JSON.stringify(
      {
        name: 'demo-package',
        author: 'js2me',
        license: 'MIT',
      },
      null,
      2,
    ),
    'utf8',
  );

  return rootDir;
};

describe('docs runtime', () => {
  it('creates runtime vitepress config from sborshik docs config', async () => {
    const rootDir = await createFixtureRoot();

    const runtime = createDocsRuntimeProject({
      rootDir,
      docsConfig: {
        sourceDir: 'docs',
        outDir: 'docs-dist',
        createdYear: '2026',
        theme: {
          palette: {
            brand1: '#111111',
            darkBrand1: '#222222',
          },
        },
        themeConfig: {
          nav: [{ text: 'Home', link: '/' }],
        },
      },
    });

    const runtimeConfigPath = path.resolve(
      runtime.runtimeRoot,
      '.vitepress/config.mts',
    );
    const runtimeConfigText = readFileSync(runtimeConfigPath, 'utf8');

    expect(runtimeConfigText).toContain('"srcDir"');
    expect(runtimeConfigText).toContain('"outDir"');
    expect(runtimeConfigText).toContain('--vp-c-brand-1: #111111;');

    runtime.cleanup();
    expect(existsSync(runtime.runtimeRoot)).toBe(false);
  });
});
