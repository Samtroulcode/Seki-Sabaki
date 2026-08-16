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

## Current Implementation Status

Current OGS work supports a minimal online-play slice:

- OGS login/session state is owned by the main process.
- OGS session persistence stores the OGS JWT and session cookie encrypted with
  Electron `safeStorage` in `ogs-session.json` under `userData`; passwords are
  never stored and OGS credentials are not written to settings.
- `OnlineStore.initialize()` asks the main-process OGS client to restore the
  stored session on app start. If `safeStorage` is unavailable or Electron
  reports the unprotected `basic_text` backend, persistence is disabled and the
  app starts signed out.
- OGS logout clears the stored session token.
- The renderer uses narrow `window.sabaki.ogs` IPC methods for OGS actions.
- The OGS workspace shows account state, active games, automatch controls, and
  placeholder dashboard sections.
- One active OGS game can be attached to the Sabaki board at a time.
- Attached games project into SGF, preserve the OGS source URL, and use
  `boardAttachment` plus temporary `onlineGameId` compatibility state.
- The in-game OGS context panel supports clocks, captures, pass/resign, chat,
  stone removal, rejected-move recovery, game-end detach behavior, and optional
  post-game SGF analysis.
- Automated coverage uses fake OGS state rather than live OGS accounts.

Cleanup still in progress:

- `src/ogs.js` is still a large mixed module.
- `OgsPanel` still contains dashboard orchestration.
- Notifications, historical game review, custom challenges, social surfaces, and
  broader game history remain roadmap items.

## Delivery Roadmap Checklist

This checklist tracks the next three functional delivery lots. Verify each item
before checking it. **Delete this entire section once all three lots are
complete.**

### Lot 1 — Online Game UX And Player Stats

- [x] Complete the first `online-game` tab refactor tranche: clearer player
      cards, opponent avatar and rank, cleaner chat, clocks, game state, and
      network errors.
- [ ] Add a dedicated OGS player statistics card using only verified OGS data
      (profile, rank/rating, available results and history indicators).
- [ ] Cover the online-game and player-statistics workflows with fake OGS state
      and deterministic tests.

### Lot 2 — Private Chat And Challenges

- [ ] Add private chat with friends and other known players using the verified
      OGS private-message protocol.
- [ ] Keep private messages clearly separate from active-game chat, with
      loading, reconnect, error, and unread-message states.
- [ ] Add direct friend challenges with a minimal custom challenge form.
- [ ] Add custom challenge creation and browsing with verified options for
      rules, time control, board size, handicap, color, ranked status, and
      privacy.
- [ ] Cover challenge creation, acceptance, cancellation, and stale/reconnect
      states with fake OGS transports.

### Lot 3 — Community And Collaborative Features

- [ ] Add a community card with verified OGS surfaces such as groups, ladders,
      tournaments, and relevant account activity.
- [ ] Research and document the supported OGS demo-board creation and sharing
      workflow before implementing it.
- [ ] Research and document OGS collaborative-review invitations and permissions
      before implementing them.
- [ ] Verify whether locally generated AI reviews can be published or shared on
      OGS; do not assume that OGS AI reviews and local reviews are
      interchangeable.
- [ ] Reassess privacy, authentication, permissions, and compatibility risks for
      every community or collaborative feature before implementation.

## Priorities

### 1. Active Game Communication

- Keep game chat reliable for the currently attached OGS game.
- Keep networking in the main process and expose only narrow validated IPC.
- Expand from the main game chat channel only after other OGS channels are
  verified.

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

- Real automatch start/cancel is wired to the verified OGS socket protocol.
- Keep clear searching, matched, cancelled, and error states.
- Auto-transition to the board when a match is found and the game connects.

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
- Automatch starts with `automatch/find_match`, cancels with `automatch/cancel`,
  and reports matches with `automatch/start` carrying `{uuid, game_id}`. Source:
  OGS Goban protocol docs,
  <https://docs.online-go.com/goban/interfaces/protocol.ClientToServer.html> and
  <https://docs.online-go.com/goban/interfaces/protocol.ServerToClient.html>,
  verified 2026-07-19.

Keep this section updated as new protocol assumptions are verified.
