# Getting started

Use the root package scripts to run the playground:

```bash
pnpm run docs:playground:dev
pnpm run docs:playground:build
pnpm run docs:playground:preview
```

The docs source lives in `docs-playground/`, while the reusable helper functions are imported from the library source in `src/`.

## Consumer shape

The published package is intended to be consumed like this:

```ts
import { defineDocsBuildConfig } from 'sborshik/vitepress';
import { ConfigsManager } from 'sborshik/utils/configs-manager';

const configs = ConfigsManager.create('../');

export default defineDocsBuildConfig(configs);
```

Inside this repository, the playground uses direct relative imports to the local source files so it works without publishing the package first.
