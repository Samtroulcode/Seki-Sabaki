# UX Product Lockdown Tracking

This file tracks the active state of the UX product lockdown effort. Update it
whenever a phase starts, a decision is made, or a tracked task is completed.

Companion roadmap: [`ux-product-lockdown.md`](./ux-product-lockdown.md)

## Current Phase

Phase 1 — Home Dashboard Redesign

## Active Goal

Turn Home into the first coherent product hub slice: define the MVP layout,
implement quick actions and continue/resume modules, add an honest read-only
Library preview, and cover the new dashboard behavior with targeted E2E tests.

## Working Branch

`ux/product-lockdown`

## Decisions

- Home is the central product hub.
- Seki's first polished product promise is a Go game hub: play locally, surface
  online game status and continuation paths, find saved games, and
  analyze/review games from one coherent starting point.
- AppRail navigation stays for now.
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
- Decide the temporary OGS/live-game UX boundaries before the dedicated Online
  Game workspace exists.

## Current Interaction Inventory

### Home

- Current Home is a navigation page with cards for Board, OGS, SGF Explorer, and
  Analysis Manager, plus New Game and Open SGF actions.
- It shows minimal status: local board/online game id, no online game/current
  online game id, attached engine count, and SGF Explorer as coming soon.
- Main UX gap: it does not yet behave like the product hub described in the
  roadmap. It does not show recent games, library state, analysis jobs/results,
  OGS account state, or clear empty states.

### Board

- Board remains the strongest and most complete workspace: local SGF
  view/edit/review, game-tree navigation, comments, scoring, engine/GTP tools,
  graph panels, drawers, file load/save, and analysis overlays.
- When an OGS game is attached, the board renders an online-game projection and
  the left sidebar switches to an OGS game context panel.
- Main UX gap: local review/edit metaphors and live online play still share the
  same board workspace. Some online restrictions exist, but the product boundary
  is not obvious enough for a non-Sabaki user.

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

- OGS currently supports login/logout, account/socket status, automatch, active
  games, current online-game summary, opening a game on the board, pass/resign,
  stone-removal confirmation, chat, and disconnect.
- Several dashboard sections are placeholders: Social, Community, Settings, and
  parts of Play/Games.
- Main UX gap: OGS is useful but still feels like an integration panel rather
  than a polished online area. Reconnect/error/session states and the temporary
  Board-based live-game boundary need clearer UX rules.

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

### 3. Library Preview Module

Purpose: make the future Library visible without pretending it is complete.

- MVP before Library implementation: explain that the library is not configured
  yet and offer Open SGF as the safe action.
- Once Library MVP starts: show selected root/folder state and a small read-only
  list of recent or discovered SGFs.

Minimum empty state: “No library folder selected yet.” Avoid silently moving or
copying user files.

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
- Keep live OGS play safe by making online-vs-local mode obvious until a
  dedicated Online Game workspace exists.
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
- [x] Add read-only Library preview module/card.
- [x] Add Analysis status module/card.
- [x] Add OGS status module/card.
- [x] Add targeted Home dashboard E2E coverage.

### Phase 2 — Library MVP

- [ ] Decide default library root.
- [ ] Add library listing logic.
- [ ] Add folder and SGF metadata display.
- [ ] Add import/copy behavior without silently moving user files.
- [ ] Add duplicate handling.
- [ ] Add open-from-library behavior.
- [ ] Cover empty, missing, invalid, and externally edited file states.

### Phase 3 — Analysis Polish and Reports

- [ ] Split setup, queue, results, and report responsibilities.
- [ ] Create AnalysisJobsModule target design.
- [ ] Create AnalysisReportModule target design.
- [ ] Define report data source for the first implementation pass.
- [ ] Add targeted tests for the polished Analysis UX.

### Phase 4 — OGS Panel Polish

- [ ] Inventory current OGS panel states and user actions.
- [ ] Redesign account/connection/current-game states.
- [ ] Clarify reconnect/error states.
- [ ] Add deterministic fake-transport tests for visible state changes.

### Phase 5 — Dedicated Online Game Workspace

- [ ] Define online game state boundaries separate from local SGF editing.
- [ ] Identify Board rendering pieces to reuse.
- [ ] Define disabled/isolated actions during live play.
- [ ] Define post-game save/export flow into Library.

### Phase 6 — KataGo Model Management Optional Post-Lockdown

- [ ] Decide if this remains post-lockdown.
- [ ] Draft download/storage/trust model before any implementation.

### Phase 7 — Product Identity and Documentation

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

2026-08-11 — Home dashboard MVP implemented with quick actions, continue, status
cards, and targeted E2E coverage.

2026-08-11 — Phase 0 completed; Phase 1 Home Dashboard Redesign started.

2026-08-11 — Analysis setup/queue/results/report polish target drafted.

2026-08-11 — Interaction inventory and Home dashboard MVP layout drafted.

2026-08-11 — Product title policy set to `Seki`; smoke title test updated.
