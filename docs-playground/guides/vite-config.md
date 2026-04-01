# Build config

The playground Vite config is intentionally tiny: it creates a `ConfigsManager` for the nested app directory and passes it into `defineDocsBuildConfig(...)`.

That helper provides:

- a default `base` derived from `package.json`,
- markdown transforms for `{packageJson.*}` placeholders,
- source-link replacement for `/src/...` links,
- UnoCSS setup used by the default theme extensions.

Because this playground lives inside the same repository, the config imports from local source files instead of the published package entrypoints.
