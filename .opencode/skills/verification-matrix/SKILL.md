---
name: verification-matrix
description:
  Use to choose the smallest reliable verification command for Seki-Sabaki
  changes across unit tests, E2E, format, bundle, and packaging.
license: MIT
compatibility: opencode
metadata:
  domain: verification
---

# Verification Matrix

Use this skill before finalizing implementation or when asked to verify changes.

## Commands

- `npm test`: unit tests and pure domain logic.
- `npm run format-check`: formatting compliance.
- `npm run bundle`: production webpack build and renderer bundling.
- `npm run test:e2e:smoke`: app launch and core Electron rendering; run as final
  validation after code review unless explicitly requested earlier.
- `npm run test:e2e`: full Playwright Electron suite; run as final validation
  after code review unless explicitly requested earlier.
- `npx playwright test --project=<name>`: targeted E2E project after a bundle
  exists; run as final validation after code review unless explicitly requested
  earlier.

## Mapping

- `src/modules/analysis.js`, `gametree.js`, `fileformats/*`,
  `gobantransformer.js`: start with `npm test`.
- `src/modules/enginesyncer.js` or engine lifecycle: `npm test` plus targeted
  E2E if renderer/main integration changes.
- `src/components/**` or `style/**`: use cheap checks first; after code review
  is clean, run `npm run test:e2e:smoke` and add targeted Playwright project for
  changed behavior.
- `src/main.js` or `src/preload.js`: use cheap checks first; add security review
  for IPC/shell/network changes; after review is clean, run
  `npm run test:e2e:smoke`.
- `webpack.config.js` or imports/bundling: `npm run bundle`.
- `package.json`, `package-lock.json`, `ci/*`, packaging config:
  `npm run bundle`; ask before heavy dist commands.
- Docs-only changes: `npm run format-check` if Markdown formatting may be
  affected.

## Reporting

Always report:

- Exact command run.
- Pass/fail status.
- Failure summary if failed.
- Checks intentionally skipped and why.
- Residual risk after verification.
