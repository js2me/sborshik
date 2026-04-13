import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  rewritePackagePathsInDistPackageJson,
  rewritePackagePathsInObject,
} from './rewrite-package-paths.js';

const createDistFixture = (packageJson: Record<string, unknown>) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sborshik-rewrite-'));
  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-package',
        version: '1.0.0',
        repository: {
          type: 'git',
          url: 'https://github.com/example/fixture-package',
        },
        ...packageJson,
      },
      null,
      2,
    ),
  );

  return {
    rootDir,
    distDir,
    packageJsonPath: path.join(distDir, 'package.json'),
    readPackageJson: () =>
      JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf8')),
  };
};

describe('rewritePackagePathsInDistPackageJson', () => {
  it('rewrites main/module/types fields for dist package root', () => {
    const fixture = createDistFixture({
      main: './dist/index.cjs',
      module: './dist/index.js',
      types: './src/index.ts',
    });

    fs.writeFileSync(path.join(fixture.distDir, 'index.cjs'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'index.js'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'index.d.ts'), '');

    rewritePackagePathsInDistPackageJson(fixture.packageJsonPath);

    const resultPackageJson = fixture.readPackageJson();
    expect(resultPackageJson.main).toBe('./index.cjs');
    expect(resultPackageJson.module).toBe('./index.js');
    expect(resultPackageJson.types).toBe('./index.d.ts');
  });

  it('rewrites nested exports for root and subpaths', () => {
    const fixture = createDistFixture({
      exports: {
        '.': {
          types: './src/index.ts',
          import: './dist/index.js',
          require: 'dist/index.cjs',
          default: './dist/index.js',
        },
        './react': {
          types: './src/react/index.ts',
          import: './dist/react/index.js',
          require: './dist/react/index.cjs',
          default: './dist/react/index.js',
        },
      },
    });

    fs.writeFileSync(path.join(fixture.distDir, 'index.js'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'index.cjs'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'index.d.ts'), '');
    fs.mkdirSync(path.join(fixture.distDir, 'react'), { recursive: true });
    fs.writeFileSync(path.join(fixture.distDir, 'react/index.js'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'react/index.cjs'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'react/index.d.ts'), '');

    rewritePackagePathsInDistPackageJson(fixture.packageJsonPath);

    const resultPackageJson = fixture.readPackageJson();
    expect(resultPackageJson.exports['.']).toEqual({
      types: './index.d.ts',
      import: './index.js',
      require: './index.cjs',
      default: './index.js',
    });
    expect(resultPackageJson.exports['./react']).toEqual({
      types: './react/index.d.ts',
      import: './react/index.js',
      require: './react/index.cjs',
      default: './react/index.js',
    });
  });

  it('keeps unresolved paths and already-correct entries in mixed case', () => {
    const fixture = createDistFixture({
      main: './index.js',
      module: './dist/module.js',
      types: './src/types.ts',
      exports: {
        '.': {
          import: './index.js',
          types: './src/index.ts',
        },
        './broken': {
          import: './dist/missing.js',
          default: './dist/missing.js',
        },
      },
    });

    fs.writeFileSync(path.join(fixture.distDir, 'index.js'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'types.d.ts'), '');
    fs.writeFileSync(path.join(fixture.distDir, 'index.d.ts'), '');

    rewritePackagePathsInDistPackageJson(fixture.packageJsonPath);

    const resultPackageJson = fixture.readPackageJson();
    expect(resultPackageJson.main).toBe('./index.js');
    expect(resultPackageJson.module).toBe('./dist/module.js');
    expect(resultPackageJson.types).toBe('./types.d.ts');
    expect(resultPackageJson.exports['.']).toEqual({
      import: './index.js',
      types: './index.d.ts',
    });
    expect(resultPackageJson.exports['./broken']).toEqual({
      import: './dist/missing.js',
      default: './dist/missing.js',
    });
  });

  it('rewrites paths in plain object for vite dist preparation', () => {
    const tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sborshik-rewrite-'),
    );
    const distDir = path.join(tempRootDir, 'dist');
    fs.mkdirSync(path.join(distDir, 'react'), { recursive: true });

    fs.writeFileSync(path.join(distDir, 'index.js'), '');
    fs.writeFileSync(path.join(distDir, 'index.cjs'), '');
    fs.writeFileSync(path.join(distDir, 'index.d.ts'), '');
    fs.writeFileSync(path.join(distDir, 'react/index.js'), '');
    fs.writeFileSync(path.join(distDir, 'react/index.d.ts'), '');

    const packageJson: Record<string, unknown> = {
      main: './dist/index.cjs',
      module: 'dist/index.js',
      types: './src/index.ts',
      exports: {
        '.': {
          types: './src/index.ts',
          import: './dist/index.js',
        },
        './react': {
          import: './dist/react/index.js',
          types: './src/react/index.ts',
        },
      },
    };

    rewritePackagePathsInObject(packageJson, distDir);

    expect(packageJson).toEqual({
      main: './index.cjs',
      module: './index.js',
      types: './index.d.ts',
      exports: {
        '.': {
          types: './index.d.ts',
          import: './index.js',
        },
        './react': {
          import: './react/index.js',
          types: './react/index.d.ts',
        },
      },
    });
  });
});
