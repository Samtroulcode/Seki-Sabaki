# UX Product Lockdown Tracking

This file tracks the active state of the UX product lockdown effort. Update it
whenever a phase starts, a decision is made, or a tracked task is completed.

Companion roadmap: [`ux-product-lockdown.md`](./ux-product-lockdown.md)

## Current Phase

Phase 2 — Navigation Tabs Foundation complete; Phase 3 — Library MVP is next

## Active Goal

Prepare the Library MVP after completing Home, local board tabs, board-owned
engine/analysis state, and dedicated OGS online-game activity tabs.

## Working Branch

`ux/product-lockdown`

## Decisions

- Home is the central product hub.
- Target navigation model: Home is permanent and non-closeable; every other
  workspace or activity is an ordinary closeable tab.
- Home remains a lightweight dashboard with quick actions, recent games,
  continuation paths, and service summaries.
- OGS, Library, and Analysis open as full ordinary tabs. Concrete boards, online
  games, and reports remain ordinary activity tabs as well.
- Manage Games remains a board-internal SGF collection tool, not an app-level
  tab system. Its UI should be clarified so users understand those mini-gobans
  are games inside the current board document.
- Target Phase D board tabs should be real activity tabs: New Board creates a
  new board tab; opening SGF from Home/Library creates a new board tab; opening
  SGF from an active board replaces that board tab after save/discard/cancel if
  needed.
- Attached live engines and live board analysis belong to their board tab;
  engine configuration remains global.
- OGS live games should become dedicated online-game tabs, not local board tabs
  with restrictions layered on top.
- OGS Overview should move into Home as an internal section; only concrete OGS
  activities such as live games, chats, communities, profiles, or study rooms
  should become app tabs.
- Future OGS chat/community/profile/study workflows can become tabs when they
  represent concrete user activities.
- Seki's first polished product promise is a Go game hub: play locally, surface
  online game status and continuation paths, find saved games, and
  analyze/review games from one coherent starting point.
- AppRail navigation is transitional. It should not be deepened as the final
  product navigation; replace it only after the staged tab model is safe.
- UI should move toward reusable modules mounted in Home first, then reused in
  Library, Analysis, Board, or OGS surfaces.
- Initial Home dashboard MVP order is: quick actions, continue/resume, Library
  preview, Analysis status, OGS status.
- Home modules should speak in user intents first: play, continue, find,
  analyze, connect. Implementation details such as file paths, logs, engines,
  sockets, and protocol state should be secondary or advanced information.
- Analysis polish target is a four-step workflow: setup, queue, results, report.
  The first pass should keep existing analyzer/backend behavior stable and make
  technical KataGo paths, logs, and SGF output controls secondary or advanced.
- Library should start as a standalone workspace/module before becoming an
  optional Board side panel.
- Live OGS play should eventually move away from unrestricted local Board
  editing/review behavior.
- README/product identity rewrite is deferred until the UX direction is stable
  enough to document accurately.
- Product/window title checks should use `Seki` as the user-facing app identity.

## Open Decisions

- Choose the first Library root location and whether it is user-configurable in
  the MVP or only later.
- Decide which Analysis pieces belong on Home, in the Analysis workspace, and in
  reusable Library/Board modules.
- Decide how far the first dedicated Online Game workspace should go before the
  broader OGS panel polish phase.
- Decide the final ordering and visual grouping of workspace and activity tabs.
- Decide startup restoration policy for tabs: Home only, previous tabs, or later
  user preference.
- Decide the final user-facing label for Manage Games: `Games in this file`,
  `SGF Collection`, or `Games in this collection`.
- Decide exact close behavior for board-owned engines: stop immediately, prompt,
  or move future long-running work to an analysis queue.

## Navigation Tabs Target

Companion spec: [`navigation-tabs.md`](./navigation-tabs.md)

Product rule:

> Home is the permanent hub. Tabs are open activities.

Home is the permanent hub, while full OGS, Library, and Analysis workflows open
in ordinary closeable tabs. A specific OGS game still opens its own online-game
activity tab.

This means Seki should not simply move the existing AppRail entries into a top
tab bar. Tabs should eventually represent user work objects, for example:

- Home;
- Untitled Board;
- opened SGF file or named game;
- OGS game;
- analysis report.

### Staged Navigation Migration

1. Keep the current `activeWorkspace` implementation stable while the tab model
   is documented.
2. Introduce a top TabBar shell only as a transitional UI if it still maps to
   singleton workspaces internally.
3. Add Home plus one board activity tab before attempting true multi-board
   behavior.
4. Move board document state behind tab-owned state only when save/dirty state,
   file paths, engines, OGS attachment, analysis actions, menus, and sidebars
   can safely follow the active tab.
5. Add online-game and report tabs after their state boundaries are clearer.

### Navigation Risks

- `gameTrees` and `gameIndex` are not app-level tabs; they are games inside the
  active SGF collection.
- The current Manage Games drawer shows mini-gobans for games inside the active
  board document. It should not be treated as a competing list of open app tabs.
- In the target true board-tabs model, New Board should always create a board
  tab. Home/Library Open SGF should create a board tab. Board Open SGF should
  replace the current board tab.
- Board tabs own live engines and live board analysis state.
- OGS live games, future OGS chats, communities, profiles, study rooms, and
  reports are valid future tab types when scoped to concrete activities.
- OGS overview, Library, and Analysis are ordinary workspace tabs; Home only
  carries their compact summaries and entry points.
- A visual-only TabBar can mislead users if it appears to support true
  multi-document behavior before the state model does.
- Closing tabs must not lose unsaved SGF work or live OGS state.
- Seki should stay calm and focused, not become an IDE-style docking system.

## Current Interaction Inventory

### Home

- Current Home is a navigation page with cards for Board, OGS, SGF Explorer, and
  Analysis Manager, plus New Game and Open SGF actions. It also previews recent
  OGS games and exposes the OGS history entry point.
- It shows local board/online game continuation state, attached engine count,
  OGS account status, recent OGS games, and matchmaking status.
- Main UX gap: Library state and analysis jobs/results are not yet surfaced as
  complete product modules, and some empty/error states still need polish.

### Board

- Board remains the strongest and most complete workspace: local SGF
  view/edit/review, game-tree navigation, comments, scoring, engine/GTP tools,
  graph panels, drawers, file load/save, and analysis overlays.
- OGS live games now open in a dedicated online-game activity tab instead of a
  local board tab. Board remains focused on local SGF work, engines, and live
  analysis.
- Main UX gap: online-game tabs are intentionally minimal and still reuse the
  SGF projection/board renderer internally; the surrounding live-play UX needs
  later polish.

### Analysis

- Analysis currently supports SGF batch analysis setup, KataGo/model/config
  paths, output folder, queue/current job state, logs, analyzed file browsing,
  and opening analyzed games.
- Board also has separate live engine analysis controls and graph/heatmap
  display.
- Main UX gap: the user sees technical setup and logs before the app explains
  the simpler intent: analyze this game, see progress, open a readable report,
  and return to review.

### OGS

- OGS currently supports login/logout, account/socket status, automatch, recent
  game history, opening a live game in a dedicated online-game tab, pass/resign,
  stone-removal confirmation, chat, and disconnect.
- The former `Active games` card was removed from the panel: it duplicated the
  history presentation and was removed from the dashboard. The underlying OGS
  active-game state remains available to live-game synchronization and turn
  resolution.
- Several dashboard sections are placeholders: Social, Community, Settings, and
  parts of Play/Games.
- Main UX gap: OGS is useful but still feels like an integration panel rather
  than a polished online area. Reconnect/error/session states and the minimal
  online-game workspace need clearer UX polish.
- Matchmaking status is now shown by a global in-app toaster, including when the
  user switches workspace or opens another tab. A newly opened online-game tab
  receives focus automatically.
- Direction update: OGS Overview should be a Home section, not an app-level tab.
  Opening a specific online game should create an online-game activity tab.

## Home Dashboard MVP Layout Draft

The first redesigned Home should be small, modular, and intent-based. It should
not require the user to understand Sabaki internals.

### 1. Quick Actions Module

Purpose: answer “What can I do now?”

- New board / local game.
- Open SGF.
- Open or configure Library once the Library MVP exists.
- Analyze a game, routed to the Analysis workspace for now.
- Connect to OGS or open OGS depending on account state.

Minimum empty state: none; quick actions are always visible.

### 2. Continue Module

Purpose: answer “Where was I?”

- Resume current local board.
- Continue current OGS game when one is attached.
- Later: recent local file or recently opened library game.

Minimum empty state: “No active game yet” with New Board and Open SGF actions.

### 3. Recently Opened Games Module

Purpose: answer “What local games did I work on recently?” without duplicating
the full Library explorer on the Home dashboard.

- Show a small bounded list of recently opened local SGFs.
- Open a selected SGF in a new Board tab.
- Keep the full Library explorer in the Home Library section, reached through a
  clear `Open Library` action.

Minimum empty state: “No recently opened games.” Avoid scanning or silently
copying files from a Library root on the Home dashboard.

### 4. Analysis Status Module

Purpose: answer “Can Seki analyze my games?” and “Is something running?”

- Show setup state: ready, not configured, needs settings, or error.
- Show current job/queue summary when applicable.
- Show recent analyzed games/results later.
- Keep technical paths/logs in the Analysis workspace or advanced/debug areas,
  not in the Home card.

Minimum empty state: “Analysis is not configured yet” with an action to open
Analysis setup.

### 5. OGS Status Module

Purpose: answer “Am I connected and do I have online games?”

- Logged out: invite user to connect.
- Logged in: show username/rank and connection state.
- Active/current game: show one clear continue action.
- Error/reconnect later: show deterministic visible states without requiring
  live-network tests.

Minimum empty state: “Not connected to OGS” with Open OGS / Sign in action.

## Product Frictions To Remove Gradually

- Replace feature names with user intents where possible.
- Rename or reframe SGF Explorer as Library before it becomes a real workspace.
- Separate “analyze this game” from low-level KataGo configuration in the main
  UX flow.
- Keep live OGS play safe by continuing to separate online-game tabs from local
  board editing and analysis affordances.
- Centralize workspace/card metadata so AppRail and Home do not drift.
- Avoid placeholder-heavy surfaces on the main path; prefer honest empty states
  with one clear next action.

## Analysis Panel Polish Target

The Analysis workspace should become a guided review workflow, not a technical
KataGo launcher. The existing store and backend behavior should remain stable at
first; the first polish pass is mostly presentation, copy, hierarchy, and module
boundaries.

### 1. Setup

Purpose: answer “Can Seki analyze this game?”

- Default view should show analyzer readiness, the selected game/source, output
  destination summary, and a clear Start Analysis action.
- Blocked states should explain the user-facing reason: no SGF selected, setup
  incomplete, unapplied settings, or another operation running.
- Raw KataGo executable/model/config paths, max visits, variation counts,
  language/comment settings, and SGF output details should remain available but
  move toward advanced settings.
- Reusable target: `AnalysisSetupModule` for full Analysis setup, compact Home
  readiness, Board “Analyze current game”, and future Library “Analyze this
  game”.

### 2. Queue

Purpose: answer “What is happening now?”

- Default view should emphasize current job title, friendly status, progress,
  move progress when known, queue count, and cancel controls.
- Logs, raw log path, raw process status, visits, and show-log actions should be
  technical details hidden by default.
- Completed/failed recent jobs should point users toward Results or a concise
  failure reason instead of foregrounding logs.
- Reusable target: `AnalysisJobsModule` for full queue management in Analysis,
  compact running/queued status on Home, and future Library/Board badges.

### 3. Results

Purpose: answer “What has been analyzed and what should I open?”

- Default result cards should show game title/file, players, date/result/board
  size, analysis availability, and clear primary/secondary actions.
- Primary action target: Read Report.
- Secondary action target: Open Board.
- Show in folder remains useful but should be secondary rather than the main
  user path.
- Reusable target: `AnalysisResultsModule` for full results in Analysis, recent
  analysis preview on Home, and analysis status/action rows in Library.

### 4. Report

Purpose: answer “What should I learn from this game?”

- There is no dedicated report view yet. The first report slice can be
  metadata-only plus Open Board, Show in Folder, and Back to Results actions.
- Later report sections should use existing analyzed SGF output before adding
  new formats: summary, key moments, move quality, and graph/board navigation.
- Raw SGF properties, full engine variation lists, generated comments, logs, and
  transcripts should stay out of the default report.
- Reusable target: `AnalysisReportModule` plus pure `analysisreport.js` helpers
  later for extracting summary/key-move data from analyzed SGFs.

### Suggested Analysis Implementation Slices

1. Setup clarity only: reword the current source card, add readiness summary,
   and move raw KataGo paths into advanced settings without changing store
   behavior.
2. Queue readability: improve hierarchy and hide logs under technical details.
3. Results actions: rename Open to Open Board and add a Report entry point.
4. Minimal report panel: selected analyzed game state, metadata-only report,
   Back/Open Board/Show Folder actions.
5. Report extraction: pure helper and unit tests for summary/key moments from
   existing analyzed SGF data.

## Phase Progress

### Phase 0 — Product Lockdown Setup

- [x] Create dedicated UX branch.
- [x] Add UX product lockdown roadmap.
- [x] Add roadmap tracking file.
- [x] Fix smoke title mismatch (`Sabaki` vs `Seki`) or document a different
      product-title decision.
- [x] Inventory current Home, OGS, Analysis, and Board interactions.
- [x] Draft Home dashboard module layout.
- [x] Draft Analysis panel polish target: setup, queue, results, report.

### Phase 1 — Home Dashboard Redesign

- [x] Define Home dashboard MVP layout.
- [x] Add quick actions module/card.
- [x] Add continue/resume module/card.
- [x] Keep Library as a Home section entry point until the Library MVP exists.
- [x] Add Analysis status module/card.
- [x] Add OGS status module/card.
- [x] Add a bounded recently opened local SGF module to Home.
- [x] Add targeted Home dashboard E2E coverage.

### Phase 2 — Navigation Tabs Foundation

- [x] Review staged navigation tab spec.
- [x] Define the first TabBar shell UX without recreating AppRail horizontally.
- [x] Keep Home permanent and non-closeable.
- [x] Define how New Board and Open SGF behave in the target tab model.
- [x] Define attached live engines and live analysis as board-tab-owned state.
- [x] Define OGS live games as future dedicated online-game tabs.
- [x] Define future OGS chat/community/profile tabs as concrete activity tabs.
- [x] Add targeted navigation E2E coverage.
- [x] Add first local board-tabs slice with active-state projection.
- [x] Make Home New Board and Home Open SGF create local board tabs.
- [x] Keep File menu Open SGF replacement-oriented for the active board tab.
- [x] Move attached live engines and live board analysis fully into board-tab
      state.
- [x] Add dedicated online-game tabs for OGS live play.
- [x] Keep Home permanent while making OGS, Library, and Analysis ordinary
      closeable workspace tabs.

### Phase 3 — Library MVP

- [x] Define a user-selected Library root with explicit setup warning.
- [x] Add bounded Library listing logic for folders and SGF/RSGF files.
- [ ] Add folder and SGF metadata display.
- [ ] Add import/copy behavior without silently moving user files.
- [ ] Add duplicate handling.
- [x] Add open-from-library behavior into Board tabs.
- [ ] Cover empty, missing, invalid, and externally edited file states.

### Phase 4 — Analysis Polish and Reports

- [ ] Split setup, queue, results, and report responsibilities.
- [ ] Create AnalysisJobsModule target design.
- [ ] Create AnalysisReportModule target design.
- [ ] Define report data source for the first implementation pass.
- [ ] Add targeted tests for the polished Analysis UX.

### Phase 5 — OGS Panel Polish

- [x] Inventory current OGS panel states and user actions.
- [x] Add recent OGS history cards with review and analysis actions.
- [x] Remove the misleading `Active games` presentation while retaining the
      backend state needed by live-game synchronization.
- [x] Make matchmaking status global across workspaces and tabs.
- [x] Focus the dedicated online-game tab when a match opens.
- [ ] Redesign account/connection/current-game states.
- [ ] Clarify reconnect/error states.
- [ ] Add deterministic fake-transport tests for visible state changes.

### Phase 6 — Dedicated Online Game Workspace

- [x] Define online game state boundaries separate from local SGF editing.
- [x] Identify Board rendering pieces to reuse.
- [x] Define disabled/isolated actions during live play.
- [ ] Define post-game save/export flow into Library.

### Phase 7 — KataGo Model Management Optional Post-Lockdown

- [ ] Decide if this remains post-lockdown.
- [ ] Draft download/storage/trust model before any implementation.

### Phase 8 — Product Identity and Documentation

- [ ] Rewrite README around Seki's product identity.
- [ ] Preserve Sabaki fork history, credits, license obligations, and
      compatibility notes.
- [ ] Update screenshots and feature descriptions after UX stabilization.
- [ ] Align contributor docs with new Home/Library/Analysis/OGS architecture.

## Verification Notes

- Use the smallest targeted checks per change.
- Keep `npm run test:e2e:smoke` reliable before depending on larger E2E runs.
- Avoid live OGS/network requirements in automated tests.

## Last Updated

2026-08-15 — Navigation model revised: Home is the only permanent tab; OGS,
Library, and Analysis now open as ordinary closeable workspace tabs. Library
setup and optional OGS connection states are being built within that model.

2026-08-15 — Library browser slice added: configured roots now show bounded
folder/SGF entries, support folder navigation, and open SGFs in Board tabs.

2026-08-15 — OGS panel checkpoint: recent history is available on Home, the
misleading `Active games` card was removed, matchmaking status is global across
workspaces, and newly opened online-game tabs receive focus. Phase 2 remains
complete; Library MVP is still the next major roadmap phase.

2026-08-14 — Finished OGS games keep their online-game tab open; the result
dialog now offers opening a separate local review board instead of starting
local analysis directly.

2026-08-14 — OGS live games now open in dedicated online-game tabs with a
restricted live-play workspace instead of board tabs; board analysis and engine
UI are not mounted in online-game tabs.

2026-08-14 — Attached engines, selected engine-player state, and live board
analysis state moved into board-tab snapshots; closing a board tab stops its
owned engines immediately.

2026-08-11 — First local board-tabs slice added with active-state projection,
Home-created board tabs, and targeted unit/E2E coverage.

2026-08-11 — Phase 2 started; AppRail replaced by Home anchor plus current
activity TabBar shell.

2026-08-11 — Home dashboard MVP implemented with quick actions, continue, status
cards, and targeted E2E coverage.

2026-08-11 — Phase 0 completed; Phase 1 Home Dashboard Redesign started.

2026-08-11 — Analysis setup/queue/results/report polish target drafted.

2026-08-11 — Interaction inventory and Home dashboard MVP layout drafted.

2026-08-11 — Product title policy set to `Seki`; smoke title test updated.
