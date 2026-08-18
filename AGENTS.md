# Seki-Sabaki Agent Rules

Seki is a functional fork of Sabaki. Existing Sabaki behavior is a compatibility
contract unless the user explicitly asks to change it. Preserve existing
functionality unless a task explicitly redesigns it.

## Current Priorities

The current phase is production hardening, not feature growth. No major new
product features should be introduced. Favor cleanup and simplification over new
abstractions. Priorities are:

- Production readiness and regression safety
- Architecture cleanup
- UI/UX redesign preparation
- Accessibility
- Documentation
- Packaging and release quality

## Project Shape

- Electron main process lives in `src/main.js`; preload bridge lives in
  `src/preload.js`.
- Renderer entry is `src/components/App.js`, bundled by `webpack.config.js` into
  `bundle.js`.
- Main app state and most domain operations live in `src/modules/sabaki.js`.
- Go domain modules include `src/modules/gametree.js`,
  `src/modules/analysis.js`, `src/modules/enginesyncer.js`,
  `src/modules/fileformats/*`, and `src/modules/gobantransformer.js`.
- OGS online play is an existing, production-sensitive domain: main-process
  networking and IPC live in `src/ogs.js` and `src/ogs/`; renderer state and
  sync in `src/modules/ogs*.js` and `src/modules/onlinestore.js`; UI in
  `src/components/sidebars/Ogs*.js`, `src/components/OnlineGameView.js`, and
  `src/components/HomeOnlinePanel.js`.
- Post-game analysis lives in `src/sgfanalysis.js` and
  `src/modules/sgfanalysis*.js`; the Library in `src/library.js`,
  `src/modules/library.js`, and `src/components/LibraryPanel.js`.
- Tsumego browser, Solver, and Creator live in `src/components/TsumegoPanel.js`,
  `src/components/TsumegoSolver.js`, `src/components/TsumegoCreator.js`, and
  `src/components/TsumegoSaveDialog.js`, with domain logic in
  `src/modules/tsumego*.js`.
- UI components are Preact class components under `src/components/`; preserve
  existing Preact patterns unless a local file already uses another pattern.
- Tests live in `test/` for Mocha unit tests and `e2e/` for Playwright Electron
  tests.

## Preservation Contract

Maintenance and refactors must preserve the following core functionality:

- Local Sabaki board/editor behavior (SGF editing, GTP engines, analysis)
- OGS online play (auth, matchmaking, live games, reviews)
- Post-game analysis
- Library
- Tsumego browser
- Tsumego Solver
- Tsumego Creator

## Commands

- Install with `npm install` on Node `24` from `.nvmrc`.
- Unit tests: `npm test`.
- Format check: `npm run format-check`.
- Production bundle check: `npm run bundle`.
- E2E smoke: `npm run test:e2e:smoke`.
- Full E2E: `npm run test:e2e`.

## Development Pipeline

- Start every non-trivial task by reading the relevant source, tests, and docs.
  Do not infer architecture from filenames alone.
- Use the `task` tool to delegate focused work to project subagents when the
  task crosses domains: SGF/GTP, Electron security, Preact UI, OGS/online,
  verification, docs, packaging, or review.
- Use the `question` tool for blocking product, security, auth, persistence, or
  API decisions. Ask concise multiple-choice questions when possible.
- Keep changes minimal and localized. Do not add compatibility layers unless
  persisted data, public behavior, or the user requires it.
- Never invent OGS, SGF, GTP, Electron, or package API behavior. Verify from
  local code, docs, dependency docs, or external source material first.
- After implementation, run the smallest verification command that can catch the
  likely regression. Explain any skipped checks.
- Finish substantial work by invoking or simulating a strict review mindset
  before final response.
- For implementation tasks launched by the user, `seki-dev` must delegate
  staging and commit creation to the dedicated `git-committer` subagent after
  verification and review. Primary implementation agents must not run `git add`
  or `git commit` directly.

## Online And OGS Rules

- OGS integration already exists and is substantial. Treat it as
  production-sensitive: preserve existing behavior and verify assumptions
  against the current implementation before changing it.
- Before implementing or changing OGS behavior, verify the protocol/API/auth
  assumptions from official OGS documentation or a clearly identified source.
- Do not store OAuth tokens, session cookies, API keys, or user credentials in
  plain text without an explicit user-approved design.
- Any network feature must consider Electron main/renderer boundaries, IPC
  validation, origin handling, token storage, reconnect behavior, and
  deterministic tests.

## Electron Safety

- Existing windows use `nodeIntegration: true`, `contextIsolation: false`, and
  `sandbox: false`. Treat this as sensitive legacy surface.
- Do not expose new powerful primitives through `window.sabaki` without
  validating arguments in the main process.
- Do not call `shell.openExternal` with unvalidated user-controlled URLs.
- Avoid remote content in renderer windows unless there is a reviewed isolation
  strategy.

## Testing Guidance

- Pure domain logic should get Mocha tests in `test/*Tests.js`.
- UI or integration behavior should get Playwright specs in `e2e/` using
  `e2e/fixtures/electron-app.js` and `e2e/helpers.js`.
- E2E tests should avoid fixed sleeps. Use `page.waitForFunction`, app state via
  `window.__sabaki`, or existing helpers.
- GTP/engine behavior should prefer deterministic fake engines or golden
  transcripts over live engines/GPU.

## Formatting And Style

- Prettier config is in `package.json`: no semicolons, single quotes, no bracket
  spacing, trailing commas.
- Default to ASCII in new files unless editing docs that already require
  non-ASCII names or user-facing copy.
- Keep comments rare and useful; explain non-obvious domain or synchronization
  logic.

## Git Safety

- The working tree may contain user changes. Never revert unrelated changes.
- Commits for completed agentic implementation tasks are created by
  `git-committer` only. Other agents must not create commits directly.
- Do not run destructive git commands such as `git reset --hard`, `git clean`,
  or forced pushes.
