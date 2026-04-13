import { describe, expect, it, vi } from 'vitest';
import {
  buildPackageTagName,
  createGithubArtifactsForPublishedPackages,
  ensureGithubRelease,
  ensureGitTag,
  type GithubClient,
  type GitRunner,
} from './github-releases.js';

const createGitMock = (): GitRunner => ({
  hasLocalTag: vi.fn(),
  hasRemoteTag: vi.fn(),
  createTagAtHead: vi.fn(),
  pushTag: vi.fn(),
});

const createGithubMock = (): GithubClient => ({
  hasReleaseByTag: vi.fn(),
  createRelease: vi.fn(),
});

describe('github releases helpers', () => {
  it('builds package tag name', () => {
    expect(buildPackageTagName('@scope/pkg', '1.2.3')).toBe('@scope/pkg@1.2.3');
  });

  it('skips tag creation when tag already exists locally', () => {
    const git = createGitMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    vi.mocked(git.hasLocalTag).mockReturnValue(true);
    vi.mocked(git.hasRemoteTag).mockReturnValue(true);

    const result = ensureGitTag({
      git,
      tagName: '@scope/pkg@1.2.3',
      logger,
    });

    expect(result).toBe('skipped');
    expect(git.hasRemoteTag).toHaveBeenCalledWith('origin', '@scope/pkg@1.2.3');
    expect(git.createTagAtHead).not.toHaveBeenCalled();
    expect(git.pushTag).not.toHaveBeenCalled();
  });

  it('pushes existing local tag when remote tag is missing', () => {
    const git = createGitMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    vi.mocked(git.hasLocalTag).mockReturnValue(true);
    vi.mocked(git.hasRemoteTag).mockReturnValue(false);

    const result = ensureGitTag({
      git,
      tagName: '@scope/pkg@1.2.3',
      logger,
    });

    expect(result).toBe('created');
    expect(git.createTagAtHead).not.toHaveBeenCalled();
    expect(git.pushTag).toHaveBeenCalledWith('origin', '@scope/pkg@1.2.3');
  });

  it('skips release creation when release already exists', async () => {
    const github = createGithubMock();
    const logger = { info: vi.fn(), warn: vi.fn() };
    vi.mocked(github.hasReleaseByTag).mockResolvedValue(true);

    const result = await ensureGithubRelease({
      github,
      owner: 'owner',
      repo: 'repo',
      tagName: '@scope/pkg@1.2.3',
      releaseNotes: 'notes',
      logger,
    });

    expect(result).toBe('skipped');
    expect(github.createRelease).not.toHaveBeenCalled();
  });

  it('creates releases only for published packages list', async () => {
    const git = createGitMock();
    const github = createGithubMock();
    const logger = { info: vi.fn(), warn: vi.fn() };

    vi.mocked(git.hasLocalTag).mockReturnValue(false);
    vi.mocked(git.hasRemoteTag).mockReturnValue(false);
    vi.mocked(github.hasReleaseByTag).mockResolvedValue(false);

    await createGithubArtifactsForPublishedPackages({
      publishedPackages: [
        {
          name: '@scope/a',
          version: '1.0.0',
          releaseNotes: 'notes-a',
          tagMessage: 'tag-a',
        },
        {
          name: '@scope/b',
          version: '2.0.0',
          releaseNotes: 'notes-b',
          tagMessage: 'tag-b',
        },
      ],
      git,
      github,
      owner: 'owner',
      repo: 'repo',
      logger,
    });

    expect(github.createRelease).toHaveBeenCalledTimes(2);
    expect(github.createRelease).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tagName: '@scope/a@1.0.0',
        body: 'notes-a',
      }),
    );
    expect(github.createRelease).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tagName: '@scope/b@2.0.0',
        body: 'notes-b',
      }),
    );
    expect(git.createTagAtHead).toHaveBeenNthCalledWith(
      1,
      '@scope/a@1.0.0',
      'tag-a',
    );
    expect(git.createTagAtHead).toHaveBeenNthCalledWith(
      2,
      '@scope/b@2.0.0',
      'tag-b',
    );
  });
});
