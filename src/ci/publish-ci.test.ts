import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublishedPackagesWithReleaseNotes,
  createGithubApiClient,
  parseGithubRepoFromRemoteUrl,
  parsePublishedPackagesFromChangesetPublishOutput,
} from './publish-ci.js';

describe('publish ci helpers', () => {
  it('parses published packages from changeset output', () => {
    const output = `
🦋  info npm info @scope/a
🦋  info New tag: @scope/a@1.0.0
🦋  info New tag: package-b@2.3.4
`;

    expect(parsePublishedPackagesFromChangesetPublishOutput(output)).toEqual([
      { name: '@scope/a', version: '1.0.0' },
      { name: 'package-b', version: '2.3.4' },
    ]);
  });

  it('parses github owner and repo from origin url', () => {
    expect(parseGithubRepoFromRemoteUrl('git@github.com:foo/bar.git')).toEqual({
      owner: 'foo',
      repo: 'bar',
    });
    expect(
      parseGithubRepoFromRemoteUrl('https://github.com/foo/bar.git'),
    ).toEqual({
      owner: 'foo',
      repo: 'bar',
    });
  });

  it('builds release notes from package CHANGELOG', () => {
    const tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sborshik-ci-'));
    const packageDir = path.join(tempRootDir, 'packages', 'core');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@scope/core',
      }),
    );
    fs.writeFileSync(
      path.join(packageDir, 'CHANGELOG.md'),
      `
## 1.0.0

### [feature]

- first release
`,
    );

    const result = buildPublishedPackagesWithReleaseNotes({
      publishedPackages: [{ name: '@scope/core', version: '1.0.0' }],
      repoUrl: 'https://github.com/foo/bar',
      rootDir: tempRootDir,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.releaseNotes).toContain('### [feature]');
    expect(result[0]?.tagMessage).toContain('[Release] @scope/core@1.0.0');
  });
});

describe('createGithubApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns skipped when GitHub responds with release already_exists (422 JSON)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          message: 'Validation Failed',
          errors: [
            { resource: 'Release', code: 'already_exists', field: 'tag_name' },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const github = createGithubApiClient({ authToken: 'token' });
    const result = await github.createRelease({
      owner: 'o',
      repo: 'r',
      tagName: 'pkg@1.0.0',
      title: 'pkg@1.0.0',
      body: 'notes',
      makeLatest: 'false',
    });

    expect(result).toBe('skipped');
  });

  it('returns created on 201 from create release', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const github = createGithubApiClient({ authToken: 'token' });
    const result = await github.createRelease({
      owner: 'o',
      repo: 'r',
      tagName: 'pkg@1.0.0',
      title: 'pkg@1.0.0',
      body: 'notes',
      makeLatest: 'false',
    });

    expect(result).toBe('created');
  });
});
