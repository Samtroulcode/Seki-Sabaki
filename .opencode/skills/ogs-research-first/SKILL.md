---
name: ogs-research-first
description:
  Use for all Online-Go.com, OGS, online play, WebSocket, OAuth, live game sync,
  and multiplayer changes; preserves existing integration and requires verified
  external assumptions.
license: MIT
compatibility: opencode
metadata:
  domain: ogs-online
---

# OGS Research First

Use this skill before changing Seki's existing OGS integration.

## Inspect Existing Seki Behavior First

- Read the affected implementation, tests, and state flow before proposing a
  design. Start with `src/ogs.js`, `src/ogs/`, `src/modules/ogs*.js`,
  `src/modules/onlinestore.js`, and the relevant OGS UI, then follow actual call
  sites.
- Identify the current transport, IPC, auth, persistence, synchronization,
  reconnect, and error-handling contracts touched by the task.
- Preserve current Seki behavior and protected core functionality unless the
  task explicitly redesigns it. Extend existing boundaries rather than replacing
  them with a greenfield architecture.

## Non-Negotiable Rule

Do not rely on memory for OGS API, WebSocket, OAuth, or protocol details. Before
changing an external assumption, verify it from official OGS documentation,
current Seki behavior, upstream source, or another clearly identified recent
source.

## Evidence Requirements

For each protocol or API assumption changed or relied upon, record:

- Source URL or local file.
- Date accessed if from the web.
- Exact endpoint/event/auth behavior being relied on.
- Confidence level and remaining unknowns.

## Minimal Change-Slice Preference

Modify the smallest existing boundary that can satisfy the task:

- Keep transport and remote protocol details behind existing adapters or add a
  narrow seam where none exists.
- Keep online state and SGF/editor concerns separated according to current Seki
  boundaries.
- Reuse existing UI, state, IPC, reconnect, and persistence flows.
- Do not introduce or change persistent token, cookie, credential, or API-key
  storage without an explicit user-approved security design.

## Architecture Questions To Ask

Use the question tool when a decision blocks a correct change, for example:

- Whether authentication or persistence behavior may change
- Whether a new server-side capability or backend/proxy is allowed
- Which existing online workflow and compatibility guarantees are in scope
- Whether a security-sensitive migration or user reauthentication is acceptable

## Testing Rules

- Automated tests should not require a real OGS account.
- Preserve or add adapter-driven seams so fake transports can drive
  deterministic tests.
- Cover reconnect, stale or duplicate events, auth failure, clock drift, and
  partial synchronization when relevant to live-play changes.
- Apply `electron-online-security` to IPC validation, origin handling, remote
  content, external URLs, and credential storage.
