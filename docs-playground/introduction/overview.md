# Overview

`docs-playground` is a small embedded documentation site that exists to dogfood the VitePress helpers from this repository.

It is useful for validating that:

- the helper configs can be imported from another app shape,
- shared styles from `src/vitepress/styles.css` still work,
- package metadata is read through `ConfigsManager`,
- markdown transforms work during VitePress build.

This page is intentionally simple, but the surrounding configuration mirrors how a real project would consume the library.
