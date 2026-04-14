import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigsManager } from './configs-manager.js';

const createdDirs: string[] = [];

function createTmpDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'configs-manager-test-'));
  createdDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createManager(rootDir: string) {
  writeJson(resolve(rootDir, 'package.json'), {
    name: 'test-package',
    version: '1.0.0',
  });
  return ConfigsManager.create(rootDir);
}

afterEach(async () => {
  await Promise.all(
    createdDirs
      .splice(0)
      .map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe('ConfigsManager.pathAliasesFromTsConfig', () => {
  it('loads aliases from solution-style references tsconfig', () => {
    const rootDir = createTmpDir();

    writeJson(resolve(rootDir, 'tsconfig.json'), {
      files: [],
      references: [{ path: './packages/check' }, { path: './packages/test' }],
    });

    writeJson(resolve(rootDir, 'packages/check/tsconfig.json'), {
      compilerOptions: {
        paths: {
          '@shared/*': ['./src/shared/*'],
          '@check/*': ['./src/check/*'],
        },
      },
    });

    writeJson(resolve(rootDir, 'packages/test/tsconfig.json'), {
      compilerOptions: {
        paths: {
          '@shared/*': ['./src/test-shared/*'],
          '@test/*': ['./src/test/*'],
        },
      },
    });

    const manager = createManager(rootDir);
    const aliases = manager.pathAliasesFromTsConfig;

    expect(resolve(rootDir, aliases['@check/*'][0])).toBe(
      resolve(rootDir, 'packages/check/src/check/*'),
    );
    expect(resolve(rootDir, aliases['@test/*'][0])).toBe(
      resolve(rootDir, 'packages/test/src/test/*'),
    );
    // First referenced tsconfig wins on conflicts.
    expect(resolve(rootDir, aliases['@shared/*'][0])).toBe(
      resolve(rootDir, 'packages/check/src/shared/*'),
    );
  });

  it('returns empty aliases when compilerOptions and references are missing', () => {
    const rootDir = createTmpDir();
    writeJson(resolve(rootDir, 'tsconfig.json'), {
      files: [],
    });

    const manager = createManager(rootDir);
    expect(manager.pathAliasesFromTsConfig).toEqual({});
  });

  it('merges extends aliases with child override', () => {
    const rootDir = createTmpDir();

    writeJson(resolve(rootDir, 'tsconfig.base.json'), {
      compilerOptions: {
        paths: {
          '@base/*': ['./base/*'],
          '@shared/*': ['./base-shared/*'],
        },
      },
    });

    writeJson(resolve(rootDir, 'tsconfig.json'), {
      extends: './tsconfig.base.json',
      compilerOptions: {
        paths: {
          '@child/*': ['./child/*'],
          '@shared/*': ['./child-shared/*'],
        },
      },
    });

    const manager = createManager(rootDir);
    const aliases = manager.pathAliasesFromTsConfig;

    expect(resolve(rootDir, aliases['@base/*'][0])).toBe(
      resolve(rootDir, 'base/*'),
    );
    expect(resolve(rootDir, aliases['@child/*'][0])).toBe(
      resolve(rootDir, 'child/*'),
    );
    expect(resolve(rootDir, aliases['@shared/*'][0])).toBe(
      resolve(rootDir, 'child-shared/*'),
    );
  });

  it('skips missing references with warning and without throw', () => {
    const rootDir = createTmpDir();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    writeJson(resolve(rootDir, 'tsconfig.json'), {
      references: [
        { path: './missing-tsconfig' },
        { path: './valid/tsconfig.json' },
      ],
    });
    writeJson(resolve(rootDir, 'valid/tsconfig.json'), {
      compilerOptions: {
        paths: {
          '@valid/*': ['./src/*'],
        },
      },
    });

    const manager = createManager(rootDir);

    expect(() => manager.pathAliasesFromTsConfig).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(Object.keys(manager.pathAliasesFromTsConfig)).toContain('@valid/*');

    warnSpy.mockRestore();
  });

  it('handles extends cycle without infinite recursion', () => {
    const rootDir = createTmpDir();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    writeJson(resolve(rootDir, 'tsconfig.json'), {
      extends: './tsconfig.a.json',
    });
    writeJson(resolve(rootDir, 'tsconfig.a.json'), {
      extends: './tsconfig.json',
    });

    const manager = createManager(rootDir);

    expect(() => manager.pathAliasesFromTsConfig).not.toThrow();
    expect(manager.pathAliasesFromTsConfig).toEqual({});
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
