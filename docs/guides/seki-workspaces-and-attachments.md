# Seki Workspace And Board Attachment Model

Seki uses Sabaki's board and SGF editing foundation, but online play and future
study workflows need clearer ownership boundaries than the original global
application object provides. This document defines the current consolidation
target before adding larger OGS, library, or analysis features.

## Core Concepts

- **Workspace**: a navigation surface such as Home, Board, OGS, SGF Explorer, or
  Analysis. Changing workspace must not implicitly close a document, detach a
  game, stop an analysis job, or discard background state.
- **Board document**: the SGF tree currently rendered by the goban. Today this
  is still backed by Sabaki's `gameTrees`, `gameIndex`, `gameCurrents`, and
  `treePosition` state.
- **Board attachment**: the resource currently projected onto the board. This is
  explicit state and is distinct from workspace navigation.
- **Online game state**: live OGS state owned by the online subsystem. The board
  can display a projection of one OGS game, but OGS remains the source of truth.

## Board Attachment

The current model is intentionally small:

```js
boardAttachment = {type: 'local-document', documentId: null}
boardAttachment = {type: 'ogs', gameId: 12345}
```

`onlineGameId` remains as a temporary compatibility field for existing Sabaki UI
guards and tests, but new code should prefer `boardAttachment`. While both
exist, they must stay consistent:

- `boardAttachment.type === 'ogs'` implies `onlineGameId === gameId`.
- `boardAttachment.type === 'local-document'` implies `onlineGameId == null`.

Detaching an OGS game does not unload the projected SGF tree. It changes the
board attachment back to `local-document`, preserving the current review/copy on
the board and restoring local editing behavior.

## Workspace Lifecycle Decisions

- **Home** is an overview/navigation surface. Returning Home does not unload the
  board, disconnect an OGS game, stop analysis, or clear pending work.
- **Board** displays the current board document and its current attachment.
- **OGS** manages account, matchmaking, active games, and future notifications.
  Opening the OGS workspace should not attach or detach a game merely because of
  navigation. Explicit online lifecycle flows, such as an automatch result that
  has connected a game, may attach the matched game and switch to the Board.
- **SGF Explorer** and **Analysis** are placeholder workspaces whose full
  behavior is future work. They should operate on explicit document/job
  identities rather than stealing board state implicitly.

Current compatibility behavior that is preserved for now:

- Opening an SGF, loading SGF content, or creating a new file loads a local
  board document and clears OGS board attachment.
- Loading an active OGS game projects the OGS state into an SGF tree, attaches
  the board to `{type: 'ogs', gameId}`, stops engine play/analysis, and switches
  to the Board workspace.
- Changing workspaces alone does not alter `boardAttachment`.

## OGS Game Lifecycle Decisions

- OGS live state is not owned by the board. OGS socket/session state remains in
  the online subsystem, and the board receives a projection for the attached
  game.
- One OGS game can be attached to the board at a time.
- Future multi-game support should store live games in a collection keyed by
  `gameId`; the board attachment only identifies which one is being displayed.
- Reconnection, duplicate events, out-of-order events, and stale optimistic
  moves should be handled by online/session controllers and pure reconciliation
  code, not by presentation components.
- Finished OGS games may remain visible as local review copies after detach.

## Document Identity Decisions

Seki should distinguish these resource types explicitly as the architecture is
split further:

- local SGF document;
- active OGS game projected onto the board;
- detached local copy of an OGS game;
- library entry;
- analysis result or batch job;
- unsaved modified document.

The next document-store step should give local documents stable IDs and make
Open, Save, Save As, Close, Detach, and Export behavior depend on the active
resource type instead of a single global file field.

## Current Cleanup Status

Implemented:

- Board attachment helpers live in `src/modules/boardattachment.js`.
- `boardAttachment` is the preferred state for board ownership.
- `onlineGameId` remains as a compatibility field and is synchronized through
  `sabaki.setState()`.
- Loading an OGS game attaches it to the board and switches to the Board
  workspace.
- Detaching an OGS game preserves the projected SGF as a local board document.
- OGS rejected moves clear the board's pending optimistic move through the same
  error path used by the OGS workspace.
- OGS rank, error, and automatch option/payload helpers are extracted under
  `src/ogs/` while `src/ogs.js` remains the public client facade.

Partially complete:

- OGS board synchronization has moved into `OgsPanelSyncController`, but
  `OgsPanel` still owns dashboard-level orchestration.
- OGS board submission and pending-move state have a dedicated controller, but
  broader online session state still lives in the OGS client/main-process
  integration.

Remaining cleanup should stay small and testable:

1. Move more OGS dashboard orchestration out of `OgsPanel`.
2. Continue splitting `src/ogs.js` into protocol adaptation, transport/session,
   game state, and IPC contracts.
3. Replace renderer-visible arbitrary objects with validated IPC request,
   response, event, and public-state contracts.
4. Keep `sabaki.js` as a compatibility facade while moving workspace, document,
   online, notification, and analysis responsibilities into focused modules.
