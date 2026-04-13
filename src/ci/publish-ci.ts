import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getInfoFromChangelog } from '../get-info-from-changelog.js';
import type {
  GithubClient,
  GitRunner,
  PublishedPackage,
  PublishedPackageWithReleaseNotes,
} from './github-releases.js';

const runCommand = ({
  command,
  args,
  throwOnError = true,
}: {
  command: string;
  args: string[];
  throwOnError?: boolean;
}) => {
  const result = cp.spawnSync(command, args, {
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  if (result.status !== 0 && throwOnError) {
    throw new Error(
      `${command} ${args.join(' ')} failed with code ${result.status}: ${result.stderr}`,
    );
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

export const runChangesetPublish = () => {
  const result = runCommand({
    command: 'pnpm',
    args: ['changeset', 'publish'],
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  return output;
};

const TAG_LINE_PREFIX = 'New tag:';

const splitTagName = (tagName: string): null | PublishedPackage => {
  const lastAtIndex = tagName.lastIndexOf('@');

  if (lastAtIndex <= 0 || lastAtIndex >= tagName.length - 1) {
    return null;
  }

  return {
    name: tagName.slice(0, lastAtIndex),
    version: tagName.slice(lastAtIndex + 1),
  };
};

export const parsePublishedPackagesFromChangesetPublishOutput = (
  output: string,
): PublishedPackage[] => {
  const found = new Map<string, PublishedPackage>();

  for (const line of output.split('\n')) {
    const trimmedLine = line.trim();

    const tagMarkerIndex = trimmedLine.indexOf(TAG_LINE_PREFIX);

    if (tagMarkerIndex === -1) {
      continue;
    }

    const tagName = trimmedLine
      .slice(tagMarkerIndex + TAG_LINE_PREFIX.length)
      .trim();

    const parsed = splitTagName(tagName);

    if (!parsed) {
      continue;
    }

    found.set(tagName, parsed);
  }

  return [...found.values()];
};

const IGNORED_PACKAGE_SCAN_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
]);

const findPackageJsonPathByName = ({
  rootDir,
  packageName,
}: {
  rootDir: string;
  packageName: string;
}): null | string => {
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();

    if (!currentDir) {
      continue;
    }

    const entries = fs.readdirSync(currentDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.name === 'package.json' && entry.isFile()) {
        const packageJsonPath = path.join(currentDir, entry.name);
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        ) as { name?: string };

        if (packageJson.name === packageName) {
          return packageJsonPath;
        }
      }

      if (entry.isDirectory() && !IGNORED_PACKAGE_SCAN_DIRS.has(entry.name)) {
        queue.push(path.join(currentDir, entry.name));
      }
    }
  }

  return null;
};

export const buildPublishedPackagesWithReleaseNotes = ({
  publishedPackages,
  repoUrl,
  rootDir = process.cwd(),
}: {
  publishedPackages: PublishedPackage[];
  repoUrl: string;
  rootDir?: string;
}): PublishedPackageWithReleaseNotes[] =>
  publishedPackages.map((publishedPackage) => {
    const packageJsonPath = findPackageJsonPathByName({
      rootDir,
      packageName: publishedPackage.name,
    });

    if (!packageJsonPath) {
      throw new Error(
        `Не найден package.json для опубликованного пакета ${publishedPackage.name}`,
      );
    }

    const changelogPath = path.join(
      path.dirname(packageJsonPath),
      'CHANGELOG.md',
    );

    if (!fs.existsSync(changelogPath)) {
      throw new Error(
        `Не найден CHANGELOG.md для пакета ${publishedPackage.name} по пути ${changelogPath}`,
      );
    }

    const { whatChangesText } = getInfoFromChangelog(
      publishedPackage.version,
      changelogPath,
      repoUrl,
    );

    if (!whatChangesText.trim()) {
      throw new Error(
        `В CHANGELOG.md не найдены изменения для версии ${publishedPackage.version} пакета ${publishedPackage.name}`,
      );
    }

    const tagName = `${publishedPackage.name}@${publishedPackage.version}`;

    return {
      ...publishedPackage,
      releaseNotes: whatChangesText,
      tagMessage: `[Release] ${tagName}\n\n${whatChangesText}`,
    };
  });

const normalizeRepository = (repository: string) => {
  if (repository.endsWith('.git')) {
    return repository.slice(0, -4);
  }

  return repository;
};

export const parseGithubRepoFromRemoteUrl = (
  remoteUrl: string,
): null | { owner: string; repo: string } => {
  const normalized = normalizeRepository(remoteUrl.trim());

  let match = normalized.match(/^git@github\.com:([^/]+)\/(.+)$/);

  if (!match) {
    match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/(.+)$/);
  }

  if (!match) {
    match = normalized.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+)$/);
  }

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
};

export const createGitRunner = (): GitRunner & {
  getRemoteUrl: (remote: string) => string;
} => ({
  getRemoteUrl: (remote) => {
    const { stdout } = runCommand({
      command: 'git',
      args: ['remote', 'get-url', remote],
    });
    return stdout.trim();
  },
  hasLocalTag: (tagName) => {
    const result = runCommand({
      command: 'git',
      args: ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`],
      throwOnError: false,
    });
    return result.status === 0;
  },
  hasRemoteTag: (remote, tagName) => {
    const result = runCommand({
      command: 'git',
      args: ['ls-remote', '--tags', remote, `refs/tags/${tagName}`],
    });
    return Boolean(result.stdout.trim());
  },
  createTagAtHead: (tagName, message) => {
    if (message?.trim()) {
      runCommand({
        command: 'git',
        args: ['tag', '-a', tagName, '-m', message],
      });
      return;
    }

    runCommand({
      command: 'git',
      args: ['tag', tagName],
    });
  },
  pushTag: (remote, tagName) => {
    runCommand({
      command: 'git',
      args: ['push', remote, `refs/tags/${tagName}`],
    });
  },
});

const ensureGithubResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
};

export const createGithubApiClient = ({
  authToken,
}: {
  authToken: string;
}): GithubClient => {
  const request = async (url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${authToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    });

  return {
    hasReleaseByTag: async ({ owner, repo, tagName }) => {
      const response = await request(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tagName)}`,
      );

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `GitHub API request failed (${response.status}) while checking release ${tagName}: ${body}`,
        );
      }

      return true;
    },
    createRelease: async ({
      owner,
      repo,
      tagName,
      title,
      body,
      makeLatest,
    }) => {
      const response = await request(
        `https://api.github.com/repos/${owner}/${repo}/releases`,
        {
          method: 'POST',
          body: JSON.stringify({
            tag_name: tagName,
            name: title,
            body,
            generate_release_notes: false,
            make_latest: makeLatest,
          }),
        },
      );

      if (response.status === 422) {
        const body = await response.text();

        if (body.includes('already_exists')) {
          return;
        }

        throw new Error(
          `GitHub API validation error while creating release ${tagName}: ${body}`,
        );
      }

      await ensureGithubResponse(response);
    },
  };
};
