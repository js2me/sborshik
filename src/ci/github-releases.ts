export interface PublishedPackage {
  name: string;
  version: string;
}

export interface PublishedPackageWithReleaseNotes extends PublishedPackage {
  releaseNotes: string;
  tagMessage: string;
}

export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface GitRunner {
  hasLocalTag: (tagName: string) => boolean;
  hasRemoteTag: (remote: string, tagName: string) => boolean;
  createTagAtHead: (tagName: string, message?: string) => void;
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
    body: string;
    makeLatest: 'false' | 'legacy' | 'true';
  }) => Promise<void>;
}

export const buildPackageTagName = (packageName: string, version: string) =>
  `${packageName}@${version}`;

export const ensureGitTag = ({
  git,
  tagName,
  tagMessage,
  logger = console,
}: {
  git: GitRunner;
  tagName: string;
  tagMessage?: string;
  logger?: LoggerLike;
}) => {
  const localTagExists = git.hasLocalTag(tagName);
  const remoteTagExists = git.hasRemoteTag('origin', tagName);

  if (remoteTagExists) {
    if (localTagExists) {
      logger.info(
        `[github-releases] tag ${tagName}: skipped (already local and on origin)`,
      );
    } else {
      logger.info(
        `[github-releases] tag ${tagName}: skipped (already on origin)`,
      );
    }
    return 'skipped';
  }

  if (!localTagExists) {
    git.createTagAtHead(tagName, tagMessage);
  }

  git.pushTag('origin', tagName);
  logger.info(
    `[github-releases] tag ${tagName}: created${localTagExists ? ' (pushed existing local tag)' : ''}`,
  );
  return 'created';
};

export const ensureGithubRelease = async ({
  github,
  owner,
  repo,
  tagName,
  releaseNotes,
  logger = console,
}: {
  github: GithubClient;
  owner: string;
  repo: string;
  tagName: string;
  releaseNotes: string;
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
    body: releaseNotes,
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
  publishedPackages: PublishedPackageWithReleaseNotes[];
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

    ensureGitTag({
      git,
      tagName,
      tagMessage: publishedPackage.tagMessage,
      logger,
    });
    await ensureGithubRelease({
      github,
      owner,
      repo,
      tagName,
      releaseNotes: publishedPackage.releaseNotes,
      logger,
    });
  }
};
