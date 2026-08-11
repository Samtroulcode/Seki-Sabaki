# Navigation Tabs Product Model

This document defines the target navigation model for Seki as it moves from a
Sabaki-style feature workspace into a clearer application for everyday use.

## Product Decision

Seki should not replace the left AppRail with a simple horizontal list of the
same app sections. Tabs should represent concrete work the user has open, not
just product categories.

Target principle:

> Home is the permanent hub. Tabs are open activities.

Examples of good tabs:

- `Home`
- `Untitled Board`
- `Lee vs Kim.sgf`
- `OGS #12345`
- `Report: Lee vs Kim`

Examples of tabs to avoid as the only model:

- `Board`
- `OGS`
- `Library`
- `Analysis`

Those are product areas, not necessarily user work objects.

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

### Activity Tabs

Activity tabs represent user work. They are generally closeable and should have
human titles.

Initial activity tab candidates:

- local board tab;
- opened SGF tab;
- online game tab;
- analysis/report tab.

Later candidates:

- library tab or library workspace;
- analysis setup tab;
- game info/review tab.

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

Opening a new board should create a new tab instead of silently replacing the
current board once true multi-board state exists.

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

## Open Questions

- Should Library be a closeable tab, a Home module that opens game tabs, or a
  singleton workspace tab?
- Should Analysis setup be a singleton tab, a Home/Library action, or part of
  the Analysis workspace until reports exist?
- When opening an SGF, should Seki always create a new board tab, or reuse the
  active untitled clean board?
- How should tab restoration work at startup: Home only, previous tabs, or a
  later user preference?
- How much true per-tab state is needed before replacing the AppRail visually?

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
- New Board opens or focuses a board activity tab.
- Keep SGF/file state backed by existing Sabaki board state.
- Do not support multiple independent board documents yet unless the state model
  is ready.

### Phase D — True Board Tabs

- Move board document state behind tab-owned state.
- Opening an SGF creates a board tab or reuses a clean untitled tab by explicit
  rule.
- Closing a dirty tab prompts save/discard/cancel.
- Avoid confusing this with `gameTrees` inside a single SGF collection.

### Phase E — Online Game And Report Tabs

- Open OGS games into online-game tabs with restricted live-play behavior.
- Open analysis results into report tabs.
- Home summarizes open tabs and recent work.

## UX Rules

- Home is always recoverable.
- Tabs should be named for user work, not implementation features.
- Closing a tab must never silently lose unsaved work.
- Opening something new should not unexpectedly replace another open activity.
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
