---
name: sabaki-project-context
description: Use for any Seki-Sabaki task to recall project architecture, commands, conventions, and fork compatibility constraints.
license: MIT
compatibility: opencode
metadata:
  project: Seki-Sabaki
---

# Sabaki Project Context

Use this skill at the start of non-trivial tasks in this repo.

## Architecture

- Electron main process: `src/main.js`.
- Preload bridge: `src/preload.js`.
- Renderer entry: `src/components/App.js`.
- Webpack output: `bundle.js` from `webpack.config.js`.
- Central app state and operations: `src/modules/sabaki.js`.
- Go domain modules: `src/modules/gametree.js`, `src/modules/analysis.js`, `src/modules/enginesyncer.js`, `src/modules/fileformats/*`, `src/modules/gobantransformer.js`.
- UI components: Preact class components under `src/components/`.
- Styling: `style/*.css`.

## Compatibility Contract

- This is a fork of Sabaki. Existing Sabaki behavior is a compatibility contract unless the user explicitly asks to change it.
- Prefer minimal, localized changes.
- Do not add compatibility layers unless persisted data, public behavior, or explicit user requirements make them necessary.

## Commands

- `npm test`: Mocha unit tests.
- `npm run format-check`: Prettier check.
- `npm run bundle`: production webpack bundle.
- `npm run test:e2e:smoke`: Playwright Electron smoke tests.
- `npm run test:e2e`: full Playwright Electron suite.

## Testing Conventions

- Pure logic belongs in `test/*Tests.js`.
- UI/integration belongs in `e2e/*.spec.js`.
- Use `e2e/fixtures/electron-app.js` and `e2e/helpers.js`.
- E2E tests should use `page.waitForFunction`, DOM expectations, or `window.__sabaki`; avoid fixed sleeps.

## Style

- Node version is `24` from `.nvmrc`.
- Prettier config: no semicolons, single quotes, no bracket spacing, trailing commas.
- Preserve Preact class component patterns unless a local file already uses another pattern.
