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
- AppRail navigation stays for now.
- UI should move toward reusable modules mounted in Home first, then reused in
  Library, Analysis, Board, or OGS surfaces.
- Library should start as a standalone workspace/module before becoming an
  optional Board side panel.
- Live OGS play should eventually move away from unrestricted local Board
  editing/review behavior.
- README/product identity rewrite is deferred until the UX direction is stable
  enough to document accurately.

## Open Decisions

- Confirm product/window title policy: should all user-facing title checks
  expect `Seki` rather than `Sabaki`?
- Choose the first Library root location and whether it is user-configurable in
  the MVP or only later.
- Decide the initial Home dashboard card order and minimum empty states.
- Decide which Analysis pieces belong on Home, in the Analysis workspace, and in
  reusable Library/Board modules.
- Decide the temporary OGS/live-game UX boundaries before the dedicated Online
  Game workspace exists.

## Phase Progress

### Phase 0 — Product Lockdown Setup

- [x] Create dedicated UX branch.
- [x] Add UX product lockdown roadmap.
- [x] Add roadmap tracking file.
- [ ] Fix smoke title mismatch (`Sabaki` vs `Seki`) or document a different
      product-title decision.
- [ ] Inventory current Home, OGS, Analysis, and Board interactions.
- [ ] Draft Home dashboard module layout.
- [ ] Draft Analysis panel polish target: setup, queue, results, report.

### Phase 1 — Home Dashboard Redesign

- [ ] Define Home dashboard MVP layout.
- [ ] Add quick actions module/card.
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

2026-08-11 — Initial tracking file created.
