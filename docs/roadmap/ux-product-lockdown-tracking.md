# UX Product Lockdown Tracking

This file tracks the active state of the UX product lockdown effort. Update it
whenever a phase starts, a decision is made, or a tracked task is completed.

Companion roadmap: [`ux-product-lockdown.md`](./ux-product-lockdown.md)

## Current Phase

Phase 0 — Product Lockdown Setup

## Active Goal

Stabilize the product foundation before UX implementation work: confirm Seki's
identity, unblock smoke/E2E tests, and inventory the current user journeys.

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

## Phase Progress

### Phase 0 — Product Lockdown Setup

- [x] Create dedicated UX branch.
- [x] Add UX product lockdown roadmap.
- [x] Add roadmap tracking file.
- [x] Fix smoke title mismatch (`Sabaki` vs `Seki`) or document a different
      product-title decision.
- [x] Inventory current Home, OGS, Analysis, and Board interactions.
- [x] Draft Home dashboard module layout.
- [ ] Draft Analysis panel polish target: setup, queue, results, report.

### Phase 1 — Home Dashboard Redesign

- [ ] Define Home dashboard MVP layout.
- [ ] Add quick actions module/card.
- [ ] Add continue/resume module/card.
- [ ] Add read-only Library preview module/card.
- [ ] Add Analysis status module/card.
- [ ] Add OGS status module/card.
- [ ] Add targeted Home dashboard E2E coverage.

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
- [ ] Create AnalysisSummaryModule target design.
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

2026-08-11 — Interaction inventory and Home dashboard MVP layout drafted.

2026-08-11 — Product title policy set to `Seki`; smoke title test updated.
