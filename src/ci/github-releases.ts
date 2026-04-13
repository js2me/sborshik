export interface PublishedPackage {
  name: string;
  version: string;
}

export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface GitRunner {
  hasLocalTag: (tagName: string) => boolean;
  hasRemoteTag: (remote: string, tagName: string) => boolean;
  createTagAtHead: (tagName: string) => void;
  pushTag: (remote: string, tagName: string) => void;
}

export interface GithubClient {
  hasReleaseByTag: (params: {
    owner: string;
    repo: string;
    tagName: string;
  }) => Promise<boolean>;
  createRelease: (params: {
    owner: string;
    repo: string;
    tagName: string;
    title: string;
    generateReleaseNotes: boolean;
    makeLatest: 'false' | 'legacy' | 'true';
  }) => Promise<void>;
}

export const buildPackageTagName = (packageName: string, version: string) =>
  `${packageName}@${version}`;

export const ensureGitTag = ({
  git,
  tagName,
  logger = console,
}: {
  git: GitRunner;
  tagName: string;
  logger?: LoggerLike;
}) => {
  const localTagExists = git.hasLocalTag(tagName);

  if (localTagExists) {
    logger.info(`[github-releases] tag ${tagName}: skipped (already local)`);
    return 'skipped';
  }

  const remoteTagExists = git.hasRemoteTag('origin', tagName);

  if (remoteTagExists) {
    logger.info(
      `[github-releases] tag ${tagName}: skipped (already on origin)`,
    );
    return 'skipped';
  }

  git.createTagAtHead(tagName);
  git.pushTag('origin', tagName);
  logger.info(`[github-releases] tag ${tagName}: created`);
  return 'created';
};

export const ensureGithubRelease = async ({
  github,
  owner,
  repo,
  tagName,
  logger = console,
}: {
  github: GithubClient;
  owner: string;
  repo: string;
  tagName: string;
  logger?: LoggerLike;
}) => {
  const releaseExists = await github.hasReleaseByTag({
    owner,
    repo,
    tagName,
  });

  if (releaseExists) {
    logger.info(
      `[github-releases] release ${tagName}: skipped (already exists)`,
    );
    return 'skipped';
  }

  await github.createRelease({
    owner,
    repo,
    tagName,
    title: tagName,
    generateReleaseNotes: true,
    makeLatest: 'false',
  });

  logger.info(`[github-releases] release ${tagName}: created`);
  return 'created';
};

export const createGithubArtifactsForPublishedPackages = async ({
  publishedPackages,
  git,
  github,
  owner,
  repo,
  logger = console,
}: {
  publishedPackages: PublishedPackage[];
  git: GitRunner;
  github: GithubClient;
  owner: string;
  repo: string;
  logger?: LoggerLike;
}) => {
  for (const publishedPackage of publishedPackages) {
    const tagName = buildPackageTagName(
      publishedPackage.name,
      publishedPackage.version,
    );

    ensureGitTag({ git, tagName, logger });
    await ensureGithubRelease({
      github,
      owner,
      repo,
      tagName,
      logger,
    });
  }
};
