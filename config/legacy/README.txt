Legacy config snapshots kept out of the repository root.

- .eslintrc.json is the pre-flat-config ESLint setup. The active config is
  eslint.config.mjs at the repository root.
- postcss.config.mjs duplicates the active CommonJS PostCSS config. The active
  config is postcss.config.js at the repository root.

Keep root-level config files in place unless the owning tool can be pointed to a
new path in package scripts, CI, Docker, and deployment workflows.
