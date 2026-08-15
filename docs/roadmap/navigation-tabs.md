# Navigation Tabs Product Model

This document defines the target navigation model for Seki as it moves from a
Sabaki-style feature workspace into a clearer application for everyday use.

## Product Decision

Seki should use a permanent Home tab followed by ordinary closeable workspace
and activity tabs. Home is the discovery hub; substantial product areas such as
Library, OGS, and Analysis become tabs when the user opens them.

Target principle:

> Home is permanent. Every other open workspace or activity is an ordinary tab.

Corollary:

> Home stays lightweight; full workspaces live in closeable tabs.

Examples of good tabs:

- `Home`
- `Untitled Board`
- `Lee vs Kim.sgf`
- `OGS #12345`
- `Report: Lee vs Kim`
- `Chat: OGS Game #12345`
- `Community: French Go Club`

Examples of tabs to avoid as the only model:

- `Board`
- `OGS`
- `OGS Overview`
- `Library`
- `Analysis`

These areas are ordinary tabs when opened. They are reused rather than
duplicated in the initial implementation: one OGS, one Library, and one Analysis
tab at a time.

## Why This Is Better

The AppRail makes Seki feel like a stack of features: Board, OGS, Library,
Analysis. A tab model can make Seki feel like a workspace where the user opens,
keeps, switches, and closes games or reports.

The user should think:

- “I have my Home.”
- “I opened this game.”
- “I am reviewing that report.”
- “I am playing this online game.”

not:

- “I moved from the Board feature to the Analysis feature.”

## Navigation Structure

### Home

- Always first.
- Always present.
- Not closeable.
- The safe fallback when no other tabs are open.
- Owns product discovery, quick actions, recent/continue cards, and module
  previews.
- Opens full workspaces in ordinary tabs instead of embedding their complete
  workflows inside Home.

Home can still use lightweight navigation buttons for opening workspaces such
as:

- OGS overview: account, connection, matchmaking, and history;
- Library / SGF Explorer;
- Analysis setup, queue, and results;
- Engines and reusable service status.

Home itself is not closeable. The opened OGS, Library, and Analysis workspaces
are closeable ordinary tabs. Selecting a concrete item from them can still open
an activity tab: choosing an SGF opens a `board` tab, and a live game opens an
`online-game` tab.

### Ordinary Workspace And Activity Tabs

All non-Home tabs are generally closeable and should have human titles. They may
represent a full workspace or a concrete user activity.

Initial activity tab candidates:

- local board tab;
- opened SGF tab;
- online game tab;
- OGS workspace tab;
- Library workspace tab;
- Analysis workspace/report tab.

Later candidates:

- game info/review tab.
- OGS chat tab;
- OGS community/club tab;
- player profile tab;
- study/training tab.

The system should stay activity-based as it grows. A future OGS chat, community,
profile, or study-room tab is a good fit when it represents a clear user task. A
generic permanent `OGS`, `Settings`, or `Analysis` feature tab is a poor fit
unless it is scoped to a concrete activity.

`OGS Overview` is specifically **not** a target app tab. It should become a Home
section. The app tab should appear only when the user opens a concrete online
game, chat, community page, player profile, or another repeatable OGS activity.

## Tab Types

### Home Tab

```text
type: home
title: Home
closeable: false
```

Responsibilities:

- route users into their next activity;
- summarize active work;
- expose Library, Analysis, and OGS status without requiring permanent global
  navigation.

### Local Board Tab

```text
type: board
title: Untitled Board | filename.sgf | Black vs White
closeable: true
dirty: true | false
```

Responsibilities:

- local SGF editing/review;
- classic Sabaki board behavior;
- file save/load state;
- current game tree and position.

Target board tab rules once Phase D true board tabs exist:

- **New Board** always creates a new board tab.
- **Open SGF from Home or Library** opens a new board tab.
- **Open SGF from an active board tab** replaces the contents of that board tab,
  after the normal save/discard/cancel flow if needed.
- **Close board tab** prompts save/discard/cancel when the tab has unsaved work.
- Closing the last board tab leaves Home available.
- Users return to existing work by selecting its tab; Seki should not silently
  reuse another board tab for New Board.

This makes multi-board behavior a core product capability, not a later extra.

#### Games Inside A Board Tab

Sabaki's existing **Manage Games** drawer (`Cmd/Ctrl+Shift+M`) is not an
app-level tab system. It manages the games contained inside the current board
document/SGF collection.

This distinction is essential:

```text
App tabs
├── Home
├── collection.sgf        <- board tab / opened document
└── OGS #12345            <- online-game activity

Inside collection.sgf
├── Game 1
├── Game 2
└── Game 3
```

Therefore:

- opening an SGF from Home or the future Library should open a board activity
  tab once true board tabs exist;
- using **Add Existing Files…** inside Manage Games should add games to the
  current board tab's SGF collection;
- mini-goban previews in Manage Games are document-internal games, not app-level
  open activities;
- Home should summarize open activity tabs, not every game inside the current
  SGF collection by default.

Future UX copy should make this hierarchy clear. Candidate labels:

- `Games in this file`;
- `SGF Collection`;
- `Games in this collection`.

The feature should be preserved for SGF collection compatibility, but its UI
should not compete with app-level tabs.

#### Board-Owned Engines And Analysis

Live engines and live board analysis should belong to the board tab they are
attached to.

Board-owned state should eventually include:

- attached engine syncers;
- selected black/white engine players;
- active analyzer engine;
- current live analysis data;
- analysis tree position;
- engine-vs-engine play state where applicable.

Global state should keep engine configuration, preferences, paths, and reusable
analysis settings. A running engine attached to a board should follow that board
tab and should be stopped or detached when the tab is closed, unless a later
explicit background-analysis design says otherwise.

### Online Game Tab

```text
type: online-game
title: OGS #12345 | Opponent name
closeable: true
onlineGameId: 12345
```

Responsibilities:

- live OGS play state;
- restricted online-game interaction model;
- clocks, pass/resign, connection state;
- post-game save/export path.

This should eventually replace the current “OGS game attached to local Board” UX
as the primary live-play surface.

An online-game tab is not just a local board tab with OGS state attached. It
should have a dedicated live-play layout:

- board in the center;
- clocks, players, captures, and connection state;
- pass/resign/scoring/chat actions;
- restricted interaction model;
- no local SGF editing, engine analysis, or free variation editing by default.

After a game finishes, the online-game tab can offer save/export/open-review
actions that create or update a local board tab.

### Analysis Report Tab

```text
type: analysis-report
title: Report: filename.sgf
closeable: true
sourcePath: /path/to/file.sgf
```

Responsibilities:

- readable review summary;
- key moments;
- move quality;
- jump/open board actions.

The report tab should not expose raw engine logs by default.

### OGS Chat / Community Tabs

```text
type: ogs-chat | ogs-community | ogs-profile
title: Chat: game #12345 | Community: club name | Player: username
closeable: true
```

Responsibilities:

- keep OGS social/community surfaces out of Home and board tabs when they become
  substantial workflows;
- let users keep a conversation, club/community page, or player profile open
  while continuing local review or online play;
- reuse OGS account/session state without mixing it with live game board state.

These are future tabs, not Phase 2 requirements. The rule is that they must be
concrete user activities, not permanent feature-category tabs.

## Open Questions

- Should Library be a closeable tab, a Home module that opens game tabs, or a
  singleton workspace tab?
- Should Analysis setup be a singleton tab, a Home/Library action, or part of
  the Analysis workspace until reports exist?
- What final label should replace or clarify `Manage Games` so users understand
  it means games inside the current board file/collection?
- How should tab restoration work at startup: Home only, previous tabs, or a
  later user preference?
- Which board-owned engine processes should be stopped immediately on tab close,
  and which future long-running analysis jobs should move into global queue
  state instead?

## Gradual Implementation Plan

### Phase A — Navigation Spec And Prototype Boundary

- Keep current `activeWorkspace` implementation stable.
- Document the target tab model.
- Do not remove AppRail until a safe migration path is known.
- Introduce no true multi-board state yet.

### Phase B — Top TabBar Shell Without Pretending To Be True Tabs

- Replace the visible AppRail only when the shell can avoid looking like a
  horizontal copy of the old feature rail.
- Do not present `Home`, `Board`, `OGS`, `Library`, and `Analysis` as equal
  permanent tabs.
- The transitional shell should show `Home` plus the current open activity, for
  example `Untitled Board`, while product areas remain launched from Home until
  they produce concrete activities.
- If singleton routes still exist internally, keep that as an implementation
  detail and avoid user-facing tab labels that imply true multi-document
  support.
- Preserve keyboard Home navigation and existing board behavior.

### Phase C — Home + One Board Activity Tab

- Introduce a minimal tab state model with Home plus one active board tab.
- New Board may still focus/reset the single board activity in this transitional
  phase; the locked target remains “New Board creates a new board tab” once
  Phase D true board tabs exist.
- Keep SGF/file state backed by existing Sabaki board state.
- Do not support multiple independent board documents yet unless the state model
  is ready.

### Phase D — True Board Tabs

- Move board document state behind tab-owned state.
- New Board always creates a board tab.
- Opening an SGF from Home/Library creates a board tab.
- Opening an SGF from inside a board tab replaces that board tab after the
  normal save/discard/cancel flow.
- Closing a dirty tab prompts save/discard/cancel.
- Avoid confusing this with `gameTrees` inside a single SGF collection.
- Rename or clarify Manage Games so adding existing files to the drawer is not
  confused with opening new app-level board tabs.
- Move board-owned engines and live analysis state with the board tab.

### Phase E — Online Game And Report Tabs

- Open OGS games into online-game tabs with restricted live-play behavior.
- Open analysis results into report tabs.
- Home summarizes open tabs and recent work.

### Phase F — OGS Social And Community Tabs

- Open substantial OGS chat, community/club, and player-profile workflows as
  concrete activity tabs.
- Keep OGS account/session state global while keeping each social/community
  tab's visible workflow state local to that tab.
- Avoid turning these into permanent feature-category tabs.

## UX Rules

- Home is always recoverable.
- Tabs should be named for user work, not implementation features.
- Closing a tab must never silently lose unsaved work.
- Opening something new should not unexpectedly replace another open activity.
- In the true board-tabs model, New Board always means a new board tab.
- In the true board-tabs model, Open SGF from Home/Library means a new board
  tab; Open SGF from a board means replacing that board tab with confirmation as
  needed.
- Technical tools can exist, but tabs should use human labels.
- The tab system should stay small and calm; Seki should not become an IDE.

## Compatibility Risks

- Current Sabaki state assumes one active board document in many places.
- `gameTrees` and `gameIndex` represent games inside the active SGF collection,
  not app-level tabs.
- File dirty/save state, engines, analysis, OGS attachment, sidebars, and menu
  actions may currently assume a singleton board.
- A visual-only TabBar is easier but may mislead users if it looks like true
  multi-document tabs before the state model supports that behavior.

The implementation should therefore be deliberately staged and tested after each
navigation slice.
