# UX Product Lockdown Roadmap

This roadmap defines the stabilization and UX direction for Seki before adding
large new feature areas. The goal is to turn the current feature set into a
coherent product experience centered on playing, finding, reviewing, and
understanding Go games.

## Product Direction

Seki should be organized around a player's game lifecycle:

1. Play or import a game.
2. Save it into a personal game library.
3. Reopen it easily.
4. Analyze it with clear settings.
5. Read a useful report.
6. Return to online or local play without confusion.

This phase prioritizes polish, clarity, and test coverage over adding new
domains.

## UX Principles

- **Home is the hub.** The Home workspace should become a dashboard for recent
  games, analysis jobs, OGS status, and quick actions.
- **Modules are reusable.** Library, game info, analysis report, OGS account,
  and online-game UI should be designed as reusable panels rather than one-off
  screens.
- **Local board and online play are distinct.** Local SGF editing/review and OGS
  live play should not share unrestricted interaction modes.
- **Infer before asking.** Seki should derive rules, komi, players, dates, game
  source, and analysis status from SGF/OGS data when possible.
- **Prefer simple first slices.** Add reusable foundations without building a
  full docking/layout system immediately.
- **No hidden technical jargon.** Advanced settings may exist, but primary UI
  should describe user intent rather than implementation details.
- **Prepare localization.** New user-visible strings should keep using
  `i18n.context(...)`, avoid hard-to-translate concatenation, and keep labels
  grouped by component/module.

## Core Workspaces

### Home

Home becomes the product dashboard:

- recent library games
- recent analysis jobs/results
- active or recent OGS games
- OGS connection/account status
- KataGo/analyzer status
- quick actions: open SGF, import SGF, analyze, connect to OGS

Home should compose reusable modules that can later appear elsewhere.

### Board

Board remains the local SGF workspace:

- open/edit/review SGF files
- navigate game trees and variations
- view comments, game graph, winrate/score graph
- launch analysis for the current local game

Board can later host optional modules, such as Library or Game Info, but should
not become the primary online live-game surface.

### Library

Library is the user's Seki-linked SGF directory:

- app-managed root folder
- folders and subfolders
- import/copy SGF into the library
- open SGF from the library
- metadata display: players, date, result, rules, komi, source
- analysis status: not analyzed, analyzed, stale/partial if applicable

Implementation should start as a standalone workspace and a reusable module. A
later phase can embed the same module in Home or Board side panels.

### Analysis

The current Analysis panel is transitional. It should be polished into a full
analysis experience, not kept as a technical job launcher:

- clear KataGo/model/config status
- user-friendly analysis options
- understandable job queue and progress states
- analyzed SGF/library result browsing
- clear report entry point after a job completes
- access to analysis reports attached to library games
- graceful empty/error states for missing KataGo, model, config, output folder,
  failed jobs, and no analyzed games

Kaya is a useful reference for report clarity, but Seki should keep its own
visual direction and broader online-play focus.

### OGS

OGS should become a clear online area:

- account/connection status
- current games and invitations
- matchmaking or game entry points
- deterministic reconnect/error states

OGS UI should not rely on local SGF editing metaphors for live play.

### Online Game

Live OGS play should eventually move to a dedicated online-game workspace:

- restricted interaction model
- no engine analysis or local variation editing during live play
- explicit clocks, players, captures, pass/resign, connection state
- SGF export/save after the game

The existing OGS integration can be reused, but the UX and state boundaries need
to be separated from the local Board workspace.

## Reusable Modules

Initial module candidates:

- `LibraryModule`: lists folders/games, supports open/import actions.
- `GameInfoModule`: displays SGF/OGS metadata cleanly.
- `AnalysisSummaryModule`: shows accuracy, move distribution, key mistakes, and
  graph/report entry points.
- `AnalysisJobsModule`: shows analyzer setup, current job progress, queued jobs,
  and recent results.
- `OgsStatusModule`: connection/account/current-game status.
- `QuickActionsModule`: primary app actions for Home.

Modules should have narrow props and avoid direct assumptions about the parent
workspace. They can be mounted in Home first, then reused in Library, Analysis,
or Board as needed.

Minimum module contract:

- receive data through explicit props;
- emit user actions through callbacks or a small store API;
- own their i18n context and user-facing labels;
- avoid directly switching global workspaces unless the action is named for it;
- include unit tests for pure data behavior and E2E coverage when interactions
  are user-visible.

## Roadmap Phases

### Phase 0 — Product Lockdown Setup

- Create the dedicated UX branch.
- Keep this roadmap as the working contract.
- Fix known test blockers that undermine confidence, starting with the smoke
  title mismatch (`Sabaki` vs `Seki`).
- Decide and document whether the product/window title is intentionally `Seki`
  everywhere.
- Do not add broad new product features during this phase.

### Phase 1 — Home Dashboard Redesign

- Redesign Home as a modular dashboard.
- Add quick actions and status cards.
- Add a first read-only Library preview module.
- Add a first analysis/OGS status module.
- Keep AppRail navigation; refine labels and active states only if needed.

MVP order and empty states:

1. quick actions;
2. continue/resume, with an empty state that offers new board and open SGF
   actions;
3. Library preview, with an empty state that offers open SGF now and library
   setup/import actions only after Library MVP decisions are settled;
4. Analysis status, with a not-configured state for KataGo/model/config;
5. OGS status, with disconnected and no-current-game states.

### Phase 2 — Library MVP

- Define the app-linked SGF library directory.
- Decide the default root location and expose a later user override.
- List SGF files and folders.
- Support import/copy into the library; do not move user files silently.
- Define duplicate handling before write operations.
- Support open-from-library.
- Extract and display metadata using existing SGF parsing utilities.
- Handle external file edits, missing files, empty folders, and invalid SGFs.
- Add tests for listing, metadata, import, and open actions.

### Phase 3 — Analysis Polish and Reports

- Create a reusable Game Info panel.
- Redesign the current Analysis panel into clearer setup, queue, result, and
  report areas.
- Create a readable Analysis Report panel with accuracy, move distribution, key
  mistakes, and graph/report navigation.
- Use existing SGF analysis properties and generated summaries first.
- Later, consider structured report metadata instead of relying only on SGF
  comments.

The first polish pass should decide which parts of Analysis belong on Home,
which belong in the Analysis workspace, and which should be reusable from
Library or Board.

### Phase 4 — OGS Panel Polish

- Redesign OGS account/connection state.
- Clarify current games, actions, and failures.
- Add deterministic tests with fake transports only.
- Avoid adding new OGS protocol assumptions without verified sources.

The temporary Board-based online behavior can stay while this is designed, but
the target Online Game workspace must explicitly isolate or disable:

- engine analysis;
- local variation editing;
- free game-tree navigation that affects live play;
- SGF-editing actions that are not valid OGS game actions.

### Phase 5 — Dedicated Online Game Workspace

- Separate live OGS gameplay from local Board editing/review.
- Reuse board rendering where appropriate.
- Disable analysis, free navigation, and local variation editing during live
  online play.
- Define post-game save/export flow into the Library.

### Phase 6 — KataGo Model Management Optional Post-Lockdown

- Improve analyzer onboarding.
- Consider model download/management inspired by Kaya.
- Decide storage location, download trust model, checksums, and platform limits
  before implementation.

### Phase 7 — Product Identity and Documentation

- Rewrite the README around Seki's own product direction: online play, library,
  analysis, and game review.
- Clearly separate Seki's identity from upstream Sabaki while preserving fork
  history, credits, license obligations, and compatibility notes.
- Update screenshots and feature descriptions after the UX modules stabilize.
- Align contributor docs with the new architecture: Home modules, Library,
  Analysis, OGS, and Online Game workspace.
- Keep migration/compatibility language explicit for users who know Sabaki.

## Localization Notes

Seki currently reuses Sabaki's i18n pattern but not a full translation workflow.
For this UX phase:

- all new UI text should use `i18n.context(...)`;
- avoid building sentences by concatenating fragments;
- keep module text local to the module's i18n context;
- prefer stable labels that can be translated later;
- defer full translation coverage until the UX structure stabilizes.

A dedicated localization workflow or skill can be added once the module layout
is stable.

## Immediate Next Tasks

Completed setup tasks are tracked in
[`ux-product-lockdown-tracking.md`](./ux-product-lockdown-tracking.md). The next
active tasks are:

1. Draft the Analysis panel polish target: setup, queue, results, report.
2. Define the Home dashboard MVP layout from the tracked draft.
3. Implement quick actions and continue/resume Home modules.
4. Implement the smallest read-only Library preview module.
5. Add targeted E2E coverage for the new Home dashboard behavior.
6. Defer the README rewrite until the UX direction is implemented enough to
   document accurately.

## Non-Goals For This Branch Start

- No full visual redesign in one step.
- No new OGS protocol features before UX/state boundaries are clarified.
- No full docking/layout manager yet.
- No live network-dependent tests.
- No full localization pass until the UX modules stabilize.
