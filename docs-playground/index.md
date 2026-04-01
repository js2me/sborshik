---
layout: home

hero:
  name: docs-playground
  text: Playground for sborshik VitePress helpers
  tagline: Embedded example showing how to generate documentation with the same library from this repository.
  actions:
    - theme: brand
      text: Get started
      link: /introduction/getting-started
    - theme: alt
      text: Open build config
      link: /guides/vite-config

features:
  - title: Local dogfooding
    details: The playground lives inside this repository and uses the same docs helper APIs that consumers import from sborshik.
  - title: Ready-made docs setup
    details: It reuses defineDocsBuildConfig and defineDocsVitepressConfig to wire VitePress and shared defaults together.
  - title: Theme extension
    details: The example also extends the default VitePress theme and imports the shared library styles.
---

## What this playground shows

- How to initialize `ConfigsManager` for a nested docs app.
- How to build `vite.config.ts` with `defineDocsBuildConfig(...)`.
- How to define `.vitepress/config.mts` with `defineDocsVitepressConfig(...)`.
- How markdown placeholders such as `{packageJson.version}` are replaced during build.

Current playground version: `{packageJson.version}`.
