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

## Selection Principles

- Match checks to changed behavior and likely regression, not filenames alone.
- Start with the cheapest targeted check that can fail for the suspected defect.
- Expand only when integration boundaries or residual risk justify it.
- Use deterministic fixtures, fake transports, and fake engines instead of live
  services or hardware unless explicitly approved.
- Keep Electron/Playwright out of the edit/fix iteration loop. During
  implementation, prefer targeted Mocha tests, formatting, and bundle checks as
  applicable.
- If Electron/Playwright E2E is warranted by actual behavior risk, run it only
  as final validation after implementation is complete and code review findings
  are resolved.
- Default to at most one Electron/Playwright invocation per task. If that final
  invocation finds a defect, fix it and rerun only the failing or directly
  relevant test; this focused failure rerun is the exception to the default
  invocation budget.
- Use the smallest relevant Playwright project. Add `--no-deps` for targeted
  project verification when the smoke dependency is not itself part of the
  behavior under validation.
- Reserve the full E2E suite for broad cross-feature risk, release validation,
  or an explicit user request.

## Risk-To-Check Mapping

- **Formatting or docs only:** run targeted Prettier or `npm run format-check`
  when formatting may be affected. No application test is required without a
  behavioral or generated-output risk.
- **Pure/domain logic:** run the closest Mocha test or `npm test`. This includes
  SGF parsing/writing, gametree operations, analysis transforms, Go coordinates,
  rules, and other deterministic modules.
- **Engine logic:** prefer unit tests and deterministic fake engines or golden
  transcripts. Consider one final targeted E2E only when process, renderer, or
  gameplay integration changed and lower-level checks cannot cover the risk.
- **Renderer modules, components, or styles:** use formatting, focused unit
  tests, or `npm run bundle` when syntax, imports, or bundling are at risk. Use
  one final targeted Playwright check only when the changed interaction or
  rendered behavior needs a running Electron app; CSS or component location
  alone does not require E2E.
- **Main process, preload, IPC, shell, or networking:** run focused unit checks
  where seams exist and `npm run bundle` when imports/build output are affected.
  Add security review for privileged boundaries. Consider smoke or one final
  targeted E2E only when launch or cross-process behavior must be exercised.
- **Webpack or renderer import graph:** run `npm run bundle`.
- **OGS synchronization or online behavior:** use deterministic adapter/store
  tests without real accounts or live OGS. Consider one final targeted E2E only
  for renderer or Electron integration that cannot be covered below that
  boundary.
- **Dependencies, packaging, native assets, or release scripts:** check the
  relevant scripts and run `npm run bundle` when applicable. Ask before heavy
  build or distribution commands; run them only when packaging risk warrants it.

## Available Project Checks

- `npm test`: Mocha unit suite
- `npm run format-check`: repository formatting
- `npm run bundle`: production renderer bundle
- `npm run test:e2e:smoke`: Electron launch and core rendering
- `npx playwright test --project=<name> --no-deps`: preferred targeted Electron
  behavior when smoke is outside the validation scope
- `npx playwright test --project=<name>`: targeted Electron behavior when its
  configured smoke dependency is relevant
- `npm run test:e2e`: full Electron E2E suite; reserve for broad cross-feature
  risk, release validation, or explicit requests
