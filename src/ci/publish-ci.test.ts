import { describe, expect, it } from 'vitest';
import {
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
});
