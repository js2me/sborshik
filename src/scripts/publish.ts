#!/usr/bin/env node

import path from 'node:path';
import { cac } from 'cac';
import { getInfoFromChangelog } from '../get-info-from-changelog.js';
import { publishGhRelease } from '../publish-gh-release.js';
import { publishScript } from '../publish-script.js';
import { $ } from '../utils/index.js';
import { PackageJsonManager } from '../utils/package-json-manager.js';
import { rewritePackagePathsInDistPackageJson } from '../utils/rewrite-package-paths.js';

if (!process.env.CI) {
  $('pnpm changeset version');
}

const pckgJson = new PackageJsonManager(
  path.join(process.cwd(), './package.json'),
);

const options = cac().parse().options;
const useDistDir = 'useDistDir' in options;
const shouldRewritePackagePaths =
  useDistDir && 'rewritePackagePaths' in options;

if (shouldRewritePackagePaths) {
  rewritePackagePathsInDistPackageJson(
    path.resolve(process.cwd(), './dist/package.json'),
  );
}

const publishOutput = publishScript({
  gitTagFormat: '<tag>',
  nextVersion: pckgJson.data.version,
  packageManager: 'pnpm',
  commitAllCurrentChanges: true,
  createTag: true,
  safe: true,
  onAlreadyPublishedThisVersion: () => {
    console.warn(`${pckgJson.data.version} already published`);
  },
  cleanupCommand: `pnpm ${options.cleanupCommand ?? 'clean'}`,
  targetPackageJson: pckgJson,
  mainBranch: options.branch ?? 'master',
  stayInCurrentDir: useDistDir ? false : true,
});

if (process.env.CI) {
  if (publishOutput?.publishedGitTag) {
    const { whatChangesText } = getInfoFromChangelog(
      pckgJson.data.version,
      path.resolve(pckgJson.locationDir, './CHANGELOG.md'),
      pckgJson.repositoryUrl,
    );

    publishGhRelease({
      authToken: process.env.GITHUB_TOKEN!,
      body: whatChangesText,
      owner: pckgJson.ghRepoData.user,
      repo: pckgJson.ghRepoData.packageName,
      version: pckgJson.data.version,
    })
      .then((r) => {
        console.info('published new gh release', r);
      })
      .catch((err) => {
        console.error('failed to publish new gh release', err);
        process.exit(1);
      });
  }
}
