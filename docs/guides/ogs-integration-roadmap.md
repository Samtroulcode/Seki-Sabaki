# OGS Integration Roadmap

This document tracks the intended direction for the Seki-Sabaki OGS workspace.
OGS behavior must be verified from official docs or source before
implementation, and automated tests should use fakes instead of real OGS
accounts.

## Product Shape

- **Board workspace**: playing or reviewing a concrete game on the Sabaki board.
- **OGS workspace**: account overview, play entry points, game history, social
  surfaces, and notifications.
- **In-game OGS context panel**: live-game controls beside the board, including
  clock, captures, pass/resign, stone removal, and game chat.

## Priorities

### 1. Active Game Communication

- Make game chat interactive for the currently attached OGS game.
- Keep networking in the main process and expose only narrow validated IPC.
- Start with the main game chat channel; add other OGS channels only after their
  behavior is verified.

### 2. Games And Review

- Add a Games section with active games and recent game history.
- Open historical games as local SGF/review boards, without attaching them as
  live `onlineGameId` sessions.
- Preserve the OGS source URL in SGF metadata where possible.

### 3. Notifications

- Add an internal notification model for OGS events:
  - your turn;
  - game started/ended;
  - chat message received;
  - challenge received/accepted/declined;
  - automatch found.
- Surface notifications in the OGS dashboard and with AppRail badges.
- Avoid noisy notifications when the user is already on the relevant board.
- Native OS notifications can come later behind a user preference.

### 4. Play And Matchmaking

- Replace the current automatch payload mock with real automatch start/cancel
  behavior once the protocol is verified.
- Show clear searching, matched, cancelled, and error states.
- Offer direct transition to the board when a match is found.

### 5. Custom Challenges

- Add custom challenge creation after automatch is stable.
- Add a challenge browser for open custom challenges with filtering and join
  actions.
- Keep challenge options minimal at first, then expand rules/time/handicap/color
  controls.

### 6. Social And Direct Messages

- Add direct message and friend/presence surfaces after the notification model
  is in place.
- Treat chat/direct-message notifications as important dashboard signals.

## Deferred

- Community/group/ladders/tournament surfaces are intentionally deferred until
  the core play, games, chat, notifications, and challenge workflows are stable.

## Current Verified OGS Protocol Notes

- Active game connection uses `game/connect` with `{game_id, chat: true}`.
  Source: OGS Goban protocol docs,
  <https://docs.online-go.com/goban/interfaces/protocol.ClientToServer.html>,
  `game/connect`, verified 2026-07-19.
- Active game chat send uses `game/chat` with
  `{game_id, type, move_number, body}`. Source: OGS Goban protocol docs,
  <https://docs.online-go.com/goban/interfaces/protocol.ClientToServer.html>,
  `game/chat`, verified 2026-07-19.
- Active game chat receive uses `game/:id/chat` events. Source: OGS Goban
  protocol docs,
  <https://docs.online-go.com/goban/interfaces/protocol.ServerToClient.html>,
  `game/:id/chat`, verified 2026-07-19.
- Stone removal uses `game/removed_stones/set` and `game/removed_stones/accept`.
  Source: OGS Goban protocol docs,
  <https://docs.online-go.com/goban/interfaces/protocol.ClientToServer.html>,
  `game/removed_stones/set` and `game/removed_stones/accept`, verified
  2026-07-19.

Keep this section updated as new protocol assumptions are verified.
