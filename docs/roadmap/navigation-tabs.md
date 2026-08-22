# Phase 1 Navigation Model

Status: normative. This decision supersedes the earlier model in which every
substantial workspace became a top activity tab.

## Product decision

Seki uses two navigation layers:

1. A persistent global sidebar contains **Home, Online, Analysis, Library, and
   Tsumego**.
2. The top activity strip contains only independently open **local board/SGF
   documents** and **live online games**.

**Settings** is a global action. It is not a destination tab or an activity tab.

> The sidebar says where I am in Seki. The tabs say what independent work I
> currently have open.

This separation gives stable wayfinding to protected product areas without
turning every feature, result, profile, chat, or future workflow into a tab.

## Global sidebar

The sidebar is persistent and owns destination switching:

- **Home:** start or resume work;
- **Online:** OGS connection, matchmaking, active-game return, history, and
  account context;
- **Analysis:** post-game SGF analysis setup, queue, status, and results;
- **Library:** built-in and user SGF browsing;
- **Tsumego:** browser, collections, Solver, Creator, and Creator test flow.

These destinations retain their state as appropriate, but they are not closeable
top tabs. Selecting a destination changes where the user is in Seki; it does not
create another unit of independent work.

Settings remains globally reachable as a secondary action. Native menus and
shortcuts remain valid desktop entry points.

## Top activity tabs

Only these user-facing tab types belong in the top strip.

### Local board / SGF document

```text
type: board
title: Untitled Board | filename.sgf | Black vs White
closeable: true
dirty: true | false
```

Responsibilities:

- local play, SGF editing, and review;
- file save/load and dirty-close state;
- document-owned game trees, engines, and live board analysis;
- ordinary Sabaki board behavior.

Rules:

- **New Board** creates a new board tab.
- Opening an SGF from Library, Analysis results, Online history, or another
  non-board destination creates a board tab.
- Opening an SGF from an active board follows the established replacement and
  save/discard/cancel flow.
- Closing a dirty board tab must not silently lose work.
- Closing the last board tab leaves the global destinations available.

### Live online game

```text
type: online-game
title: OGS #12345 | Opponent name
closeable: true
onlineGameId: 12345
```

Responsibilities:

- restricted live-play interaction;
- Goban, players, clocks, captures, connection state, and chat;
- pass, resign, scoring, and phase-specific actions;
- post-game save/export and opening a local review board.

A live-game tab is not a local editor with OGS state attached. Local SGF
editing, engines, and free variation editing remain unavailable during live
play. Full post-game review opens a board tab.

## Home responsibility

Home is a quiet start/resume destination, not a discovery dashboard or a second
navigation rail. It should prioritize:

1. resuming the most relevant open board or live game;
2. creating a New Board;
3. a secondary **Browse Library** action.

Home does not repeat launchers for Online, Analysis, Library, and Tsumego; the
sidebar already provides them. It does not expose an external **Open SGF**
action. Native **File > Open** remains available, and Library is the in-app
browsing path. Focused continuation cards may resume specific work without
recreating global navigation.

## Destination-to-activity transitions

- Library files, Analysis results, and completed Online games open board tabs.
- Matchmaking and active-game return open or focus live-game tabs.
- Opening a tab does not replace or transform its source destination.
- Tsumego Solver and Creator remain inside Tsumego because their interaction
  contracts differ from the general board editor.
- Analysis setup, queues, logs, and report summaries remain in Analysis; opening
  a result for board review creates a board tab.

Do not document a future feature as a tab merely because it is substantial or
can retain state. It becomes a top tab only if a later explicit product decision
classifies it as an independent board document or live online game.

## Internal compatibility

Current architecture may continue to use `workspaceTabs`, `openWorkspaceTab()`,
`activeWorkspace`, and namespaced activity ordering for state projection or
request routing. These are implementation details, not the user-facing tab
taxonomy.

Migration must preserve existing callers and tests until destination routing is
ready. New UI copy, accessibility semantics, and product documentation must not
describe Online, Analysis, Library, or Tsumego as closeable tabs.

## Games inside a board document

Sabaki's **Manage Games** drawer (`Cmd/Ctrl+Shift+M`) manages games contained in
the current SGF collection. Those games are not application tabs.

```text
Top activity tabs
├── collection.sgf        <- one board document
└── OGS #12345            <- one live online game

Inside collection.sgf
├── Game 1
├── Game 2
└── Game 3
```

Adding existing files through Manage Games adds games to the current collection;
it does not open independent board tabs. Preserve this distinction for SGF
collection compatibility.

## Phase 1 implementation direction

1. Introduce the persistent destination sidebar and global Settings action.
2. Limit user-facing top tabs to board documents and live online games.
3. Keep compatibility routing behind destination activation until callers can
   migrate safely.
4. Remove Home's duplicated destination navigation and dense destination
   previews; use Browse Library instead of external Open SGF.
5. Preserve native keyboard access and visible focus in Phase 1; add the
   complete arrow-key/focus contract later without conflating sidebar and tab
   semantics.

## UX invariants

- Global destinations are always recoverable.
- Tabs use human document or game titles, not feature-category labels.
- Opening new independent work does not unexpectedly replace another tab.
- Closing a tab never silently loses unsaved work or an active game.
- The tab strip stays small and calm; Seki does not become an IDE.
- Local board/editor, OGS online play, post-game analysis, Library, and all
  Tsumego workflows remain protected.

## Compatibility risks

- Some current rendering and menu paths still project destinations through tab-
  named state.
- `gameTrees` and `gameIndex` are games inside one SGF collection, not top tabs.
- Dirty/save state, engines, analysis, sidebars, and menu actions can assume an
  active board document.
- Visual removal of workspace tabs must not discard retained destination state
  or break contextual requests that currently call `openWorkspaceTab()`.

Implement and verify the migration in small slices; do not equate a visual
sidebar change with permission to rewrite protected workspace behavior.
