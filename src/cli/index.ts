#!/usr/bin/env node

import { cac } from 'cac';
import path from 'path';
import { build as vitepressBuild, createServer as createVitepressServer } from 'vitepress';
import { createGithubArtifactsForPublishedPackages } from '../ci/github-releases.js';
import {
  buildPublishedPackagesWithReleaseNotes,
  createGithubApiClient,
  createGitRunner,
  parseGithubRepoFromRemoteUrl,
  parsePublishedPackagesFromChangesetPublishOutput,
  runChangesetPublish,
} from '../ci/publish-ci.js';
import { getInfoFromChangelog } from '../get-info-from-changelog.js';
import { createDocsRuntimeProject } from '../docs/docs-runtime.js';
import { loadSborshikConfig } from '../docs/load-sborshik-config.js';
import { postBuildScript } from '../post-build-script.js';
import { publishGhRelease } from '../publish-gh-release.js';
import { publishScript } from '../publish-script.js';
import { $ } from '../utils/fs.js';
import { PackageJsonManager } from '../utils/package-json-manager.js';

const cli = cac('sborshik');

const getDocsConfigOrThrow = async (rootDir: string) => {
  const loadedSborshikConfig = await loadSborshikConfig(rootDir);

  if (!loadedSborshikConfig) {
    throw new Error(
      'Не найден sborshik.config.ts в корне проекта. Создай файл с секцией docs.',
    );
  }

  if (!loadedSborshikConfig.config.docs) {
    throw new Error(
      `В конфиге ${path.basename(loadedSborshikConfig.configPath)} отсутствует секция docs.`,
    );
  }

  return loadedSborshikConfig.config.docs;
};

const fillDistAction = ({
  useBuildDirForExportsMap,
}: {
  useBuildDirForExportsMap?: boolean;
}) => {
  postBuildScript({
    buildDir: 'dist',
    rootDir: '.',
    srcDirName: 'src',
    useBuildDirForExportsMap: useBuildDirForExportsMap,
    filesToCopy: ['LICENSE', 'README.md'],
  });

  const pckgJson = new PackageJsonManager(
    path.join(process.cwd(), './dist/package.json'),
  );

  if (pckgJson.data.zshy) {
    delete pckgJson.data.zshy;

    const sourcePckgJson = new PackageJsonManager(
      path.join(process.cwd(), './package.json'),
    );

    delete sourcePckgJson.data.files;
    delete sourcePckgJson.data.exports;
    delete sourcePckgJson.data.main;
    delete sourcePckgJson.data.module;
    delete sourcePckgJson.data.types;
    delete sourcePckgJson.data.bin;

    pckgJson.data.files = ['*'];

    const removeDistFromExport = (
      value: Record<string, any> | string,
    ): string | Record<string, any> => {
      if (typeof value === 'string') {
        return value.replace('./dist/', './');
      } else {
        return Object.fromEntries(
          Object.entries(value).map(([key, value]) => [
            key,
            removeDistFromExport(value),
          ]),
        );
      }
    };

    if (pckgJson.data.main) {
      pckgJson.data.main = removeDistFromExport(pckgJson.data.main);
    }

    if (pckgJson.data.module) {
      pckgJson.data.module = removeDistFromExport(pckgJson.data.module);
    }

    if (pckgJson.data.types) {
      pckgJson.data.types = removeDistFromExport(pckgJson.data.types);
    }

    if (pckgJson.data.bin) {
      pckgJson.data.bin = removeDistFromExport(pckgJson.data.bin);

      if (pckgJson.data.type === 'module') {
        if (pckgJson.data.bin.endsWith('.cjs')) {
          pckgJson.data.bin = `${pckgJson.data.bin.slice(0, -3)}js`;
        }
      } else if (pckgJson.data.bin.endsWith('.js')) {
        pckgJson.data.bin = `${pckgJson.data.bin.slice(0, -2)}cjs`;
      }
    }

    if (pckgJson.data.exports) {
      Object.entries(pckgJson.data.exports).forEach(([key, value]) => {
        pckgJson.data.exports[key] = removeDistFromExport(value as any);
      });
    }

    pckgJson.syncWithFs();
    sourcePckgJson.syncWithFs();
  }
};

cli
  .command('build', 'Build project using "zshy"')
  .option(
    '--fillDist',
    'Fill dist directory (copies package.json, README.md, LICENSE, assets)',
  )
  .option('--useBuildDirForExportsMap', '')
  .option('--useTsc', 'Use just tsc')
  .action(({ fillDist, useTsc, useBuildDirForExportsMap }) => {
    if (useTsc) {
      $('pnpm exec tsc');
    } else {
      $('pnpm exec zshy');
    }

    if (!fillDist) {
      return;
    }

    fillDistAction({ useBuildDirForExportsMap });
  });

cli
  .command('fill-dist')
  .option('--useBuildDirForExportsMap', '')
  .action(({ useBuildDirForExportsMap }) => {
    fillDistAction({ useBuildDirForExportsMap });
  });

cli
  .command('docs build', 'Build docs from sborshik.config.ts')
  .option('--root <root>', 'Project root')
  .action(async (options) => {
    const rootDir = path.resolve(process.cwd(), options.root || '.');
    const docsConfig = await getDocsConfigOrThrow(rootDir);
    const runtime = createDocsRuntimeProject({
      rootDir,
      docsConfig,
    });

    try {
      await vitepressBuild(runtime.runtimeRoot);
    } finally {
      runtime.cleanup();
    }
  });

cli
  .command('docs dev', 'Start docs dev server from sborshik.config.ts')
  .option('--root <root>', 'Project root')
  .option('--port <port>', 'Port for VitePress dev server')
  .option('--host <host>', 'Host for VitePress dev server')
  .action(async (options) => {
    const rootDir = path.resolve(process.cwd(), options.root || '.');
    const docsConfig = await getDocsConfigOrThrow(rootDir);
    const runtime = createDocsRuntimeProject({
      rootDir,
      docsConfig,
    });

    const server = await createVitepressServer(runtime.runtimeRoot, {
      ...(options.port ? { port: Number(options.port) } : {}),
      ...(options.host ? { host: options.host } : {}),
    });

    const gracefulExit = async (code: number) => {
      await server.close();
      runtime.cleanup();
      process.exit(code);
    };

    process.on('SIGINT', () => {
      void gracefulExit(0);
    });

    process.on('SIGTERM', () => {
      void gracefulExit(0);
    });

    try {
      await server.listen();
      server.printUrls();
      server.bindCLIShortcuts({ print: true });
    } catch (error) {
      await gracefulExit(1);
      throw error;
    }
  });

cli
  .command('ci', 'Publish monorepo packages via Changesets')
  .option(
    '--github-releases',
    'Create Git tags and GitHub Releases for published packages',
  )
  .option('--create-github-releases', 'Alias for --github-releases')
  .action(async (options) => {
    const publishOutput = runChangesetPublish();
    const publishedPackages =
      parsePublishedPackagesFromChangesetPublishOutput(publishOutput);

    const shouldCreateGithubReleases =
      options.githubReleases || options.createGithubReleases;

    if (!shouldCreateGithubReleases) {
      return;
    }

    if (publishedPackages.length === 0) {
      console.info(
        '[github-releases] skip: no packages were published in this run',
      );
      return;
    }

    if (!process.env.GITHUB_TOKEN) {
      console.warn(
        '[github-releases] skip: GITHUB_TOKEN is required for --github-releases',
      );
      return;
    }

    const remoteUrl = createGitRunner().getRemoteUrl('origin');
    const githubRepoData = parseGithubRepoFromRemoteUrl(remoteUrl);

    if (!githubRepoData) {
      throw new Error(
        `Не удалось определить owner/repo из origin remote: ${remoteUrl}`,
      );
    }

    const repoUrl = `https://github.com/${githubRepoData.owner}/${githubRepoData.repo}`;
    const publishedPackagesWithReleaseNotes =
      buildPublishedPackagesWithReleaseNotes({
        publishedPackages,
        repoUrl,
      });

    await createGithubArtifactsForPublishedPackages({
      git: createGitRunner(),
      github: createGithubApiClient({
        authToken: process.env.GITHUB_TOKEN,
      }),
      owner: githubRepoData.owner,
      repo: githubRepoData.repo,
      publishedPackages: publishedPackagesWithReleaseNotes,
    });
  });

cli
  .command('publish')
  .option('--useDistDir', 'Make publish from dist directory')
  .option(
    '--cleanupCommand <cleanupCommand>',
    'Name of the Cleanup command (pnpm run <cleanupCommand>)',
  )
  .action((options) => {
    if (!process.env.CI) {
      $('pnpm changeset version');
    }

    const pckgJson = new PackageJsonManager(
      path.join(process.cwd(), './package.json'),
    );

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
      stayInCurrentDir: 'useDistDir' in options ? false : true,
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
  });

cli.help();

cli.parse();
