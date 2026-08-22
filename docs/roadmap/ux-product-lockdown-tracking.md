# UX Product Lockdown Tracking

This file tracks the active state of the UX product lockdown effort. Update it
whenever a phase starts, a decision is made, or a tracked task is completed.

Historical companion roadmap (non-normative):
[`ux-product-lockdown.md`](./ux-product-lockdown.md)

## Current Phase

Superseding Phase 1 — Global Navigation Shell

## Active Goal

Establish the persistent global sidebar for Home, Online, Analysis, Library, and
Tsumego; expose Settings as a global action; and limit the top activity strip to
local board/SGF documents and live online games.

## Working Branch

`ux/product-lockdown`

## Decisions

- The persistent global sidebar destinations are Home, Online, Analysis,
  Library, and Tsumego. Settings is a global action.
- The top activity strip contains only local board/SGF documents and live online
  games.
- Home is a quiet start/resume destination, not a tab, discovery hub, or second
  destination launcher. It prioritizes resume, New Board, and a secondary Browse
  Library action.
- Home does not provide an external Open SGF action; native File/Open remains.
- Online owns OGS connection, matchmaking, history, and account context.
  Analysis, Library, and Tsumego own their complete destination workflows.
- `workspaceTabs` and `openWorkspaceTab()` may remain internal compatibility or
  request-routing mechanisms, but they do not define user-facing tabs.
- Manage Games remains a board-internal SGF collection tool, not an app-level
  tab system. Its UI should be clarified so users understand those mini-gobans
  are games inside the current board document.
- Board tabs are real document activities: New Board creates a new board tab;
  opening an SGF from Library, Analysis results, or Online history creates a new
  board tab; opening an SGF from an active board follows the established
  replacement and save/discard/cancel flow.
- Attached live engines and live board analysis belong to their board tab;
  engine configuration remains global.
- OGS live games should become dedicated online-game tabs, not local board tabs
  with restrictions layered on top.
- Live OGS games use dedicated online-game tabs. OGS chats, communities,
  profiles, and other future features are not tabs without a later explicit
  product decision.
- Seki's first polished product promise remains a Go studio for local play,
  online games, saved games, analysis/review, and Tsumego, with stable global
  wayfinding and focused independent activities.
- The legacy AppRail has been replaced by `AppSidebar`; preserve the locked
  destination model rather than reintroducing a competing rail.
- Reusable modules belong primarily to their owning destination. Home may resume
  specific work but does not summarize every service or destination.
- Analysis polish target is a four-step workflow: setup, queue, results, report.
  The first pass should keep existing analyzer/backend behavior stable and make
  technical KataGo paths, logs, and SGF output controls secondary or advanced.
- Library remains a standalone global destination; any future Board integration
  requires a separate decision.
- Live OGS play should eventually move away from unrestricted local Board
  editing/review behavior.
- README/product identity rewrite is deferred until the UX direction is stable
  enough to document accurately.
- Product/window title checks should use `Seki` as the user-facing app identity.

## Open Decisions

- Choose the first Library root location and whether it is user-configurable in
  the MVP or only later.
- Decide which Analysis pieces can be reused contextually from Library or Board
  without duplicating the Analysis destination.
- Decide how far the first dedicated Online Game activity should go before the
  broader OGS panel polish phase.
- Decide the detailed sidebar grouping and placement of the global Settings
  action without changing the locked destination order.
- Decide startup restoration policy for board/live-game tabs and the selected
  global destination.
- Decide the final user-facing label for Manage Games: `Games in this file`,
  `SGF Collection`, or `Games in this collection`.
- Decide exact close behavior for board-owned engines: stop immediately, prompt,
  or move future long-running work to an analysis queue.

## Global Navigation and Activity Target

Companion spec: [`navigation-tabs.md`](./navigation-tabs.md)

Product rule:

> The sidebar says where I am in Seki. The tabs say what independent work I
> currently have open.

The sidebar persistently exposes Home, Online, Analysis, Library, and Tsumego.
Settings is a global action. The top strip contains board documents and live
online games only; destinations and analysis reports are not activity tabs.

### Staged Navigation Migration

1. Add the persistent destination sidebar and global Settings action.
2. Remove Home and compatibility workspace entries from the user-facing top
   strip without discarding retained destination state.
3. Preserve board and online-game tab state, ordering, dirty-close behavior, and
   live-game safety.
4. Keep `workspaceTabs`, `openWorkspaceTab()`, and `activeWorkspace` only where
   compatibility or request routing still requires them.
5. Add distinct keyboard and focus contracts for the sidebar and activity strip.

### Navigation Risks

- `gameTrees` and `gameIndex` are not app-level tabs; they are games inside the
  active SGF collection.
- The current Manage Games drawer shows mini-gobans for games inside the active
  board document. It should not be treated as a competing list of open app tabs.
- New Board creates a board tab. Library, Analysis, and Online may open SGFs or
  completed games into board tabs. Board File/Open retains its established
  replacement behavior.
- Board tabs own live engines and live board analysis state.
- OGS live games are the only online activity tabs in the current decision.
- Online, Analysis, Library, and Tsumego are persistent destinations, not
  closeable workspace tabs. Home does not carry their previews or entry-point
  cards.
- A visual-only TabBar can mislead users if it appears to support true
  multi-document behavior before the state model does.
- Closing tabs must not lose unsaved SGF work or live OGS state.
- Seki should stay calm and focused, not become an IDE-style docking system.

## Current Interaction Inventory

### Home

- Target Home is a start/resume destination with New Board and a secondary
  Browse Library action. Native File/Open remains available.
- Home may continue a specific board, live online game, or Tsumego problem when
  useful; it does not mirror the sidebar or summarize destination status.
- Main migration gap: remove destination cards, previews, and the external Open
  SGF action without weakening the owning destinations.

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
- Direction update: OGS overview workflows belong to the Online destination.
  Opening a specific online game creates or focuses an online-game activity tab.

## Home Target

Home should be small, calm, and oriented around immediate continuation:

1. Resume the most relevant open board or live online game.
2. Create a New Board.
3. Browse Library as a secondary content action.
4. Continue a specific Tsumego problem when meaningful progress exists.

Home does not repeat sidebar destinations, connection state, matchmaking,
Analysis readiness or queue status, Library browsing, or OGS history. Empty Home
states should lead with New Board and Browse Library. Native File/Open remains
the desktop path for opening an external SGF.

## Product Frictions To Remove Gradually

- Replace feature names with user intents where possible.
- Rename or reframe SGF Explorer as Library before it becomes a real workspace.
- Separate “analyze this game” from low-level KataGo configuration in the main
  UX flow.
- Keep live OGS play safe by continuing to separate online-game tabs from local
  board editing and analysis affordances.
- Centralize destination metadata for the persistent sidebar; Home should not
  maintain a second copy.
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
- Reusable target: `AnalysisSetupModule` for full Analysis setup and contextual
  Board “Analyze current game” or Library “Analyze this game” actions.

### 2. Queue

Purpose: answer “What is happening now?”

- Default view should emphasize current job title, friendly status, progress,
  move progress when known, queue count, and cancel controls.
- Logs, raw log path, raw process status, visits, and show-log actions should be
  technical details hidden by default.
- Completed/failed recent jobs should point users toward Results or a concise
  failure reason instead of foregrounding logs.
- Reusable target: `AnalysisJobsModule` for full queue management in Analysis;
  any future Library/Board status requires an explicit contextual need.

### 3. Results

Purpose: answer “What has been analyzed and what should I open?”

- Default result cards should show game title/file, players, date/result/board
  size, analysis availability, and clear primary/secondary actions.
- Primary action target: Read Report.
- Secondary action target: Open Board.
- Show in folder remains useful but should be secondary rather than the main
  user path.
- Reusable target: `AnalysisResultsModule` for full results in Analysis and
  contextual analysis status/actions in Library where justified.

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

## Active Phase Progress

### Superseding Phase 1 — Global Navigation Shell

- [x] Lock the persistent sidebar destinations and board/live-game-only top tab
      taxonomy in the navigation specifications.
- [x] Implement persistent `AppSidebar` destinations for Home, Online, Analysis,
      Library, and Tsumego.
- [x] Add Settings as a global sidebar action.
- [x] Limit `AppTabs` to board and online-game activities while preserving
      internal workspace request routing.
- [x] Remove Home and compatibility workspace entries from the user-facing top
      strip while preserving internal request routing.
- [x] Normalize `activityTabOrder` to existing board and online-game keys,
      removing stale, duplicate, and workspace entries.
- [x] Reduce Home to start/resume, New Board, and Browse Library; retain native
      File/Open.
- [ ] Define and verify distinct sidebar and activity-tab keyboard behavior.
- [x] Add regression coverage for persistent destinations, board/live-only tabs,
      singleton workspace compatibility, order normalization, Home actions, and
      targeted Library routing.
- [x] Run final implementation verification: 850 unit tests, production bundle,
      formatting, OGS 19/19, and combined Home/Board/Tsumego 54/54 passed.

## Historical Completion Record — Non-Normative

The records below describe shipped or completed work from the superseded
roadmap. They do not define current navigation or Home behavior.

- Product-lockdown setup, interaction inventory, and initial UX drafts were
  completed.
- The prior Home dashboard, including its cards and targeted E2E coverage, was
  implemented. Its destination previews and launchers are superseded.
- Multi-board state, dirty/save behavior, board-owned engines and live analysis,
  and targeted navigation coverage were completed.
- Dedicated restricted online-game tabs were completed and remain part of the
  current top activity model.
- Library root selection, bounded browsing, folder navigation, and opening SGFs
  into board tabs were completed.
- OGS history, global matchmaking status, and automatic focus of newly opened
  live-game tabs were completed.

## Verification Notes

- Use the smallest targeted checks per change.
- Keep `npm run test:e2e:smoke` reliable before depending on larger E2E runs.
- Avoid live OGS/network requirements in automated tests.

## Historical Update Log — Non-Normative

2026-08-22 — Navigation model superseded: Phase 1 now targets a persistent
global destination sidebar and a top strip limited to board documents and live
online games. Home is a destination and no longer owns destination previews.

2026-08-15 — Library browser slice added: configured roots now show bounded
folder/SGF entries, support folder navigation, and open SGFs in Board tabs.

2026-08-15 — OGS panel checkpoint: the misleading `Active games` card was
removed, matchmaking status became global, and newly opened online-game tabs
received focus.

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

2026-08-11 — The superseded Phase 2 tab-shell work started.

2026-08-11 — The now-superseded Home dashboard MVP and targeted E2E coverage
were implemented.

2026-08-11 — Phase 0 completed; Phase 1 Home Dashboard Redesign started.

2026-08-11 — Analysis setup/queue/results/report polish target drafted.

2026-08-11 — Interaction inventory and Home dashboard MVP layout drafted.

2026-08-11 — Product title policy set to `Seki`; smoke title test updated.
