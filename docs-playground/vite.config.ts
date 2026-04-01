import { fileURLToPath } from 'node:url';

import { defineDocsBuildConfig } from '../src/vitepress/define-docs-build-config.ts';
import { ConfigsManager } from '../src/utils/configs-manager.ts';

const configs = ConfigsManager.create(fileURLToPath(new URL('./', import.meta.url)));

export default defineDocsBuildConfig(configs);
