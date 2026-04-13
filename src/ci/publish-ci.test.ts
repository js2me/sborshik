import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPublishedPackagesWithReleaseNotes,
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
