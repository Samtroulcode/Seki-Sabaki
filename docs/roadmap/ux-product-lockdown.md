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

The current implementation still has workspace-like routes, but the product
direction is shifting away from a permanent feature navbar. Home should be the
main hub, and tabs should eventually represent open user activities: boards,
opened SGFs, online games, and analysis reports.

The tab system is also the long-term place for substantial future workflows such
as OGS chat, community/club pages, player profiles, study rooms, and analysis
reports. These should become tabs only when they are concrete activities, not
because every feature needs a permanent tab.

Companion navigation model: [`navigation-tabs.md`](./navigation-tabs.md)

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

Sabaki's existing Manage Games drawer remains a board-internal SGF collection
tool, not a competing app-level tab system. It should eventually be clarified as
“Games in this file” or “SGF Collection”: adding existing files there adds games
to the current board document, while opening from Home/Library should open board
activity tabs once true board tabs exist.

Board tabs should become real multi-document workspaces. New Board creates a new
board tab. Opening an SGF from Home or the future Library creates a new board
tab. Opening an SGF from inside an existing board tab replaces that board tab
after the normal save/discard/cancel flow. Live engines and live board analysis
belong to the board tab they are attached to, while engine configuration remains
global.

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
- `AnalysisReportModule`: shows summary, move distribution, key mistakes, and
  graph/board navigation.
- `AnalysisJobsModule`: shows current job progress and queued jobs.
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
- Treat AppRail as transitional. Do not deepen it into the final product
  navigation; define the tab migration before replacing it.

MVP order and empty states:

1. quick actions;
2. continue/resume, with an empty state that offers new board and open SGF
   actions;
3. Library preview, with an empty state that offers open SGF now and library
   setup/import actions only after Library MVP decisions are settled;
4. Analysis status, with a not-configured state for KataGo/model/config;
5. OGS status, with disconnected and no-current-game states.

### Phase 2 — Navigation Tabs Foundation

- Replace the product decision “feature rail” with “Home plus open activity
  tabs”.
- Start with a top TabBar shell only after the staged tab model is agreed.
- Keep Home permanent and non-closeable.
- Do not present Home, Board, OGS, Library, and Analysis as equal permanent
  tabs; that would only recreate the AppRail horizontally.
- Keep current singleton workspaces internally until board/file state can safely
  become tab-owned.
- Do not advertise true multi-board behavior until closing, dirty state,
  file/save behavior, engines, OGS attachment, and analysis actions are scoped
  to tabs.
- Clarify the existing Manage Games drawer as games inside the current board
  file/collection, not as open app-level board tabs.
- Lock the target board-tab behavior for the true board-tabs phase: New Board
  creates a tab, Home/Library Open SGF creates a tab, and Board Open SGF
  replaces the current board tab with confirmation when needed.
- Treat attached live engines and live board analysis as board-tab-owned state.

### Phase 3 — Library MVP

- Define the app-linked SGF library directory.
- Decide the default root location and expose a later user override.
- List SGF files and folders.
- Support import/copy into the library; do not move user files silently.
- Define duplicate handling before write operations.
- Support open-from-library.
- Extract and display metadata using existing SGF parsing utilities.
- Handle external file edits, missing files, empty folders, and invalid SGFs.
- Add tests for listing, metadata, import, and open actions.

### Phase 4 — Analysis Polish and Reports

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

Analysis polish target:

1. **Setup** should answer whether Seki can analyze the selected game. Keep
   analyzer readiness, source selection, output destination, and Start Analysis
   visible by default; move raw KataGo paths and SGF output controls toward
   advanced settings.
2. **Queue** should answer what is happening now. Emphasize current job,
   friendly status, progress, queued jobs, and cancel actions; hide log paths
   and log tails under technical details.
3. **Results** should answer what has been analyzed. Show game metadata and make
   Read Report the primary action, Open Board the secondary action, and Show in
   Folder a secondary utility.
4. **Report** should answer what the user should learn. The first slice can be a
   metadata-only report using existing analyzed SGF outputs; later slices can
   add summary, key moments, move quality, and graph/board navigation through
   pure extraction helpers.

Reusable module targets:

- `AnalysisSetupModule`
- `AnalysisJobsModule`
- `AnalysisResultsModule`
- `AnalysisReportModule`

Keep the first implementation slices presentational and modular: no new analyzer
protocol assumptions, no new persistence format, no model-management workflow,
and no board behavior changes beyond named analysis actions.

### Phase 5 — OGS Panel Polish

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

### Phase 6 — Dedicated Online Game Workspace

- Separate live OGS gameplay from local Board editing/review.
- Reuse board rendering where appropriate.
- Disable analysis, free navigation, and local variation editing during live
  online play.
- Define post-game save/export flow into the Library.

The target should be a dedicated `online-game` activity tab, not a local board
tab with OGS restrictions layered on top. It can reuse goban rendering, but the
surrounding layout and allowed actions should be designed for live online play:
clocks, players, captures, pass/resign, chat, connection state, scoring, and
post-game export/review.

### Phase 6.5 — OGS Social And Community Tabs

- Keep OGS account/session state global.
- Open substantial chat, community/club, and player-profile workflows as
  concrete tabs when they become more than compact Home/OGS overview modules.
- Do not create permanent feature-category tabs for every OGS surface.

### Phase 7 — KataGo Model Management Optional Post-Lockdown

- Improve analyzer onboarding.
- Consider model download/management inspired by Kaya.
- Decide storage location, download trust model, checksums, and platform limits
  before implementation.

### Phase 8 — Product Identity and Documentation

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

1. Review and implement the staged navigation tab foundation.
2. Implement the smallest read-only Library preview module.
3. Start Analysis setup clarity as the first Analysis polish slice after the
   Home MVP begins.
4. Defer the README rewrite until the UX direction is implemented enough to
   document accurately.

## Non-Goals For This Branch Start

- No full visual redesign in one step.
- No new OGS protocol features before UX/state boundaries are clarified.
- No full docking/layout manager yet.
- No live network-dependent tests.
- No full localization pass until the UX modules stabilize.
