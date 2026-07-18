---
name: electron-online-security
description: Use for Electron IPC, preload, BrowserWindow, shell, networking, OAuth, token storage, OGS, and remote-content security decisions.
license: MIT
compatibility: opencode
metadata:
  domain: electron-security
---

# Electron Online Security

Use this skill when work touches Electron boundaries, networking, auth, or online features.

## Current Risk Baseline

- `src/main.js` creates BrowserWindows with `nodeIntegration: true`, `contextIsolation: false`, and `sandbox: false`.
- `src/preload.js` exposes `window.sabaki` to the renderer.
- This is legacy Sabaki surface; new online features must not expand it casually.

## Design Rules

- Validate renderer-provided arguments in main-process IPC handlers.
- Do not expose powerful primitives through `window.sabaki` without validation and a minimal API shape.
- Do not call `shell.openExternal` with unvalidated user-controlled URLs.
- Avoid remote content in renderer windows unless there is a reviewed isolation strategy.
- Do not store OAuth tokens, cookies, API keys, or credentials in plain text without explicit user-approved design.
- Prefer main-process ownership of auth/network operations, with narrow validated IPC between renderer and main.

## Online Feature Checklist

- Authentication flow and token storage are designed before implementation.
- Origin and URL validation are explicit.
- Reconnect behavior and failure states are deterministic.
- Tests use fake transports or local fixtures instead of live network calls.
- Privacy-sensitive data is not written to logs or settings by accident.
- Security reviewer has checked IPC, preload API, and storage behavior.

## Blocking Questions

Use the question tool before implementation when any of these are undecided:

- OAuth vs session-cookie auth.
- Persistent vs session-only login.
- Keychain/secure storage strategy.
- Remote content rendering strategy.
- Whether online features may contact real OGS in tests.
