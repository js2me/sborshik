import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findSborshikConfigPath,
  loadSborshikConfig,
} from './load-sborshik-config.js';

const createdDirs: string[] = [];

const createTmpDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sborshik-config-test-'));
  createdDirs.push(dir);
  return dir;
};

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('load sborshik config', () => {
  it('finds sborshik.config.ts in project root', () => {
    const rootDir = createTmpDir();
    const configPath = path.resolve(rootDir, 'sborshik.config.ts');
    writeFileSync(configPath, 'export default {}', 'utf8');

    expect(findSborshikConfigPath(rootDir)).toBe(configPath);
  });

  it('loads docs config from sborshik.config.ts', async () => {
    const rootDir = createTmpDir();
    writeFileSync(
      path.resolve(rootDir, 'sborshik.config.ts'),
      `
      export default {
        docs: {
          sourceDir: 'docs',
          outDir: 'docs-dist',
          createdYear: '2024'
        }
      };
      `,
      'utf8',
    );

    const loaded = await loadSborshikConfig(rootDir);

    expect(loaded?.config.docs?.sourceDir).toBe('docs');
    expect(loaded?.config.docs?.outDir).toBe('docs-dist');
    expect(loaded?.config.docs?.createdYear).toBe('2024');
  });
});
