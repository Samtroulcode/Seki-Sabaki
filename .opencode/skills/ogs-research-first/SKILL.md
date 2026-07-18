---
name: ogs-research-first
description: Use for all Online-Go.com, OGS, online play, WebSocket, OAuth, live game sync, and multiplayer feature work; forces verified sources before design or code.
license: MIT
compatibility: opencode
metadata:
  domain: ogs-online
---

# OGS Research First

Use this skill before designing or implementing OGS integration.

## Non-Negotiable Rule

Do not rely on memory for OGS API, WebSocket, OAuth, or protocol details. Verify from official OGS documentation, source code, or another clearly identified and recent source before using a claim in design or code.

## Evidence Requirements

For each protocol or API assumption, record:

- Source URL or local file.
- Date accessed if from the web.
- Exact endpoint/event/auth behavior being relied on.
- Confidence level and remaining unknowns.

## Minimal Vertical Slice Preference

Prefer a small first slice:

- Auth or connection boundary.
- A local online state model independent from SGF editing.
- One UI entry point.
- Fake transport or adapter-driven tests.
- No persistent token storage until the design is approved.

## Architecture Questions To Ask

Use the question tool when unclear:

- Which OGS login method is acceptable?
- Should login persist across app restarts?
- What is the first supported workflow: observe, correspondence, live play, review import, or chat?
- Should tests ever hit OGS, or only fakes?
- Is a backend/proxy allowed, or must the Electron app talk directly to OGS?

## Testing Rules

- Automated tests should not require a real OGS account.
- Network code should be adapter-driven so fake transports can drive deterministic tests.
- Reconnect, stale events, auth failure, and clock drift should be explicit test cases once live play is implemented.
