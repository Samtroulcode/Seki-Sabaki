# Seki-Sabaki Agent Rules

Seki is a functional fork of Sabaki and is now the primary compatibility
contract. Preserve current Seki behavior and protected core functionality unless
the task explicitly redesigns it. Where Seki intentionally retains inherited
Sabaki behavior, preserve that compatibility as well.

## Current Priorities

The current phase is production hardening, not feature growth. Favor cleanup,
simplification, accessibility, documentation, and packaging quality over major
features or new abstractions. Optimize for production readiness and regression
safety while preparing for later architecture and UI/UX work.

## Protected Core Functionality

Maintenance and refactors must preserve:

- Local board and editor behavior, including SGF editing, GTP engines, and
  analysis
- OGS online play, including auth, matchmaking, live games, and reviews
- Post-game analysis
- Library
- Tsumego browser, Solver, and Creator

## Durable Invariants

- Inspect relevant implementation, tests, and documentation before changing
  behavior; do not infer architecture or APIs from filenames or memory.
- Keep changes minimal and localized. Add compatibility layers only when
  persisted data, public behavior, or explicit requirements justify them.
- Never invent OGS, SGF, GTP, Electron, or dependency APIs. Verify uncertain
  behavior from local code, official documentation, or dependency source.
- Do not weaken security, credential handling, deterministic test seams, or
  Electron privilege boundaries to simplify an implementation.
- Protect pre-existing user changes. Never revert unrelated work or use
  destructive Git commands.
- OpenCode must never push. Completed agentic implementation commits are created
  only by `git-committer`; other agents must not stage or commit directly.

## Sensitive Domain Triggers

- **OGS and online:** Existing integration is production-sensitive. Inspect and
  preserve the current implementation first, then load `ogs-research-first` and
  `electron-online-security` before changing protocol, auth, networking, IPC, or
  live synchronization. Never store credentials, tokens, cookies, or API keys in
  plaintext without an explicit user-approved design.
- **Electron security:** Existing windows use `nodeIntegration: true`,
  `contextIsolation: false`, and `sandbox: false`. Treat this as sensitive
  legacy surface. Validate privileged IPC arguments in the main process,
  validate user-controlled external URLs, and require a reviewed isolation
  strategy for remote content.
- **SGF, GTP, engines, and Go rules:** Load `sgf-gtp-domain`; verify coordinate,
  rules, transcript, and engine assumptions against local code or authoritative
  sources.
- **Verification:** Load `verification-matrix` and choose checks according to
  the actual regression risk. Use deterministic fakes or fixtures instead of
  live accounts, services, engines, or GPUs unless explicitly approved.
- **Packaging and dependencies:** Review Node/Electron compatibility,
  cross-platform behavior, native assets, and release impact before changing
  packaging or dependency configuration.
