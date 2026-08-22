# Seki UX Architecture Audit

Status: product-direction audit updated for the implemented Phase 1 navigation
shell; remaining recommendations are not UI implementation specifications.

## Scope and design premise

Seki is a desktop Go studio. Its redesign should use **Quiet Studio** as the
primary language, with a restrained **Deep Board** atmosphere: dark-first,
desktop-native, moderately compact, low-noise, and efficient for repeated use.
This audit preserves local Sabaki board/editor work, OGS online play, post-game
analysis, Library, and all Tsumego browser, Solver, and Creator workflows.

The findings below are based on the current renderer shell and state projection,
not component names alone. `App` mounts `AppSidebar` beside content containing
`AppTabs` and the three-way board layout (`src/components/App.js:397-435`).
`AppSidebar` exposes five destinations plus Settings
(`src/components/AppSidebar.js:9-47`), while `AppTabs` renders only board and
online-game activities (`src/components/AppTabs.js:41-103`). `sabaki` retains
singleton workspace state for compatibility/request routing and normalizes
`activityTabOrder` to board and online-game keys
(`src/modules/sabaki.js:627-689,5111-5133`).

Recommendations distinguish **information architecture** (where a workflow lives
and how users reach it) from **visual treatment** (density, color, spacing).
Quiet Studio styling cannot by itself resolve duplicated navigation, unclear
action priority, or settings ownership.

## 1. Global navigation model

### Current architecture and disposition

| Mechanism                          | Current implementation                                                                                                                                                                                                                                                                                | Disposition            | UX direction                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent global sidebar          | `AppSidebar` renders Home, Online, Analysis, Library, and Tsumego plus a global Settings action (`AppSidebar.js:9-47`); `App` mounts it outside `appcontent` (`App.js:397-411`).                                                                                                                      | **KEEP**               | Preserve stable destination switching separately from open activities.                                                                 |
| Board tabs                         | Each local document owns SGF state, history, engines, and analysis (`boardtabs.js:8-24`; `sabaki.js:478-565`).                                                                                                                                                                                        | **KEEP**               | These are primary document activities. Preserve multi-document and dirty-close behavior.                                               |
| Online-game tabs                   | Live games own a restricted board projection and deliberately clear local engine/analysis state (`onlinegametabs.js:8-19`; `sabaki.js:707-760`).                                                                                                                                                      | **KEEP**               | A live game is a time-sensitive activity, not a page inside the OGS overview. Keep it independently reachable.                         |
| Internal workspace compatibility   | `openWorkspaceTab()` retains singleton OGS, Analysis, Library, and Tsumego state and targeted requests without rendering those entries in `AppTabs` (`sabaki.js:627-689`; `AppTabs.js:41-103`).                                                                                                       | **KEEP INTERNAL**      | Preserve compatibility/request routing without exposing workspace tabs.                                                                |
| `activityTabOrder`                 | Insertion accepts only board and online-game types, and state changes normalize ordering to existing keys of those types (`sabaki.js:571-615,5111-5133`). `AppTabs` filters the order against only those activities (`AppTabs.js:90-103`).                                                            | **KEEP**               | Continue excluding stale, duplicate, and workspace keys from user-facing activity order.                                               |
| `activeWorkspace`                  | Projects Home, board, online game, or workspace state into the shell (`WorkspaceView.js:15-35`).                                                                                                                                                                                                      | **KEEP INTERNAL**      | Treat it as a renderer projection, not a user-visible navigation concept.                                                              |
| Legacy `activeWorkspace` routes    | `online`, `analysis`, and `sgf-explorer` are intercepted and mapped to singleton workspace state; direct render cases remain (`sabaki.js:305-320`; `WorkspaceView.js:19-26`). `tsumego` still has a direct case.                                                                                      | **COMPATIBILITY ONLY** | Preserve request routing while the sidebar becomes the user-facing destination model.                                                  |
| `homeSection` workspace cases      | `HomeView` retains legacy OGS, Analysis, Library, and Tsumego section rendering (`HomeView.js:30-50`), while sidebar activation normally routes through singleton workspace state (`AppSidebar.js:88-93`).                                                                                            | **COMPATIBILITY ONLY** | Keep as transitional projection, not a second Home navigation model.                                                                   |
| Home feature navigation            | `HomeDashboard` now contains resume, New Board, Browse Library, board-size choices, and Tsumego continuation without destination launcher or preview panes (`HomeDashboard.js:31-152`).                                                                                                               | **COMPLETE**           | Keep destination switching in `AppSidebar`; preserve Home's focused start/resume role.                                                 |
| Legacy AppRail                     | `AppSidebar` is mounted as the global shell and no `#apprail` presentation remains in the stylesheet.                                                                                                                                                                                                 | **REMOVED**            | Do not restore a competing navigation rail.                                                                                            |
| Native menu, file drop, shortcuts  | `App` supports file drop, board undo/redo and navigation keys, Escape, and Cmd/Ctrl+Home (`App.js:128-208`); the native menu remains available.                                                                                                                                                       | **KEEP**               | Menus and shortcuts are desktop-native secondary entry points, not competing primary navigation.                                       |
| Contextual cross-workflow launches | Home's Browse Library action routes an internal Library request; Online history, Library, and Analysis results can open board tabs, while Tsumego requests retain Tsumego context (`HomeDashboard.js:37-39`; `LibraryPanel.js:141-162`; `AnalysisPanel.js:65-68`; `TsumegoPanel.js:123-162,318-372`). | **KEEP**               | Preserve both transitions: ordinary SGFs/games become board documents; destination-specific requests retain their specialized context. |

### Target global model

Seki has two distinct navigation layers:

- A persistent global sidebar contains **Home, Online, Analysis, Library, and
  Tsumego**. **Settings** is a global action, not a destination tab.
- The top activity strip contains only independent local board/SGF documents and
  live online games. These activities may be opened, switched, reordered, and
  closed without changing the destination model.

> The sidebar says where I am in Seki. The tabs say what independent work I
> currently have open.

Home is the quiet start/resume destination. It does not mirror the sidebar or
host full destination screens. Online owns connection, matchmaking, and history;
Analysis owns batch jobs; Library owns browsing; and Tsumego owns browser,
Solver, and Creator state. Selecting a concrete SGF or completed game can open a
board tab, while joining or returning to a live game focuses its online-game
tab.

`workspaceTabs` and `openWorkspaceTab()` may remain internal compatibility and
request-routing mechanisms. Their names do not define user-facing tabs, and new
features must not be documented as tabs merely because routing uses those APIs.

### Activity tabs versus contextual views

Open in the **top activity strip** only when it is independent board-shaped
work:

- a local board/editor document;
- a live online game.

Remain **contextual inside a destination or activity** when the information only
makes sense for that surface:

- board play/edit/scoring/find/autoplay modes;
- board engines, GTP console, graphs, game tree, and comments;
- live-game clocks, players, chat, pass/resign, and stone removal;
- Analysis job status and results;
- Library folders and current path;
- Tsumego collection, problem, Solver, Creator, and Creator test state;
- Preferences and short configuration dialogs/drawers.

Opening an SGF from Online history, Library, or Analysis results should continue
to create a board activity. It should not replace or transform the source
destination.

## 2. Home

**Intended responsibility:** Home is Seki's quiet desktop start/resume surface
for beginning a board and returning to the most relevant ongoing work.

| Current element                      | Disposition         | Reason and intended role                                                                                                                                                                     |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero (“Your Go workspace”)           | **SIMPLIFY LATER**  | The compact identity remains above task content (`HomeDashboard.js:68-72`). It is no longer a large dashboard hero, but can be reduced further if evidence supports it.                      |
| Destination launcher rail            | **REMOVED**         | Home has no duplicate Online, Analysis, Library, or Tsumego navigation; `AppSidebar` owns those destinations (`HomeDashboard.js:64-152`; `AppSidebar.js:9-35`).                              |
| New Board                            | **KEEP ON HOME**    | It creates a new board tab directly (`HomeDashboard.js:31-35,105-113`) and remains the clearest first-run/local primary action.                                                              |
| Board-size choice                    | **KEEP / MONITOR**  | The 9/13/19 quick preset supports New Board without introducing a separate workflow (`HomeDashboard.js:23-29,125-145`).                                                                      |
| Browse Library                       | **KEEP ON HOME**    | The secondary action routes to Library through internal request handling; Home does not browse files itself (`HomeDashboard.js:37-39,114-122`).                                              |
| Library/Online/history previews      | **REMOVED**         | Dense destination previews are absent from `HomeDashboard`; their full capabilities remain in Library and Online.                                                                            |
| Tsumego card                         | **KEEP / SIMPLIFY** | The card remains a focused continuation affordance rather than global navigation (`HomeDashboard.js:147-151`; `HomeTsumegoCard.js`). Reduce metadata only if it distracts from continuation. |
| Resume current board / Continue game | **KEEP ON HOME**    | Resume selects an existing online-game or board tab through the corresponding switch API (`HomeDashboard.js:42-48,73-98`).                                                                   |

The desired Home is therefore not a miniature Library + Online + Tsumego
dashboard. Its high-value order is: **resume urgent/ongoing activity**, **New
Board**, then a secondary **Browse Library** action. Home does not expose an
external “Open SGF” action; native **File > Open** remains available. It should
not repeat the five sidebar destinations or fetch dense feature previews merely
to prove those features exist.

The implementation preserves destination capabilities while removing duplicate
Home entry points. Targeted Library routing, singleton destination reuse,
activity-order normalization, and absence of Home/workspace tabs in the top
strip have dedicated regression coverage
(`e2e/home-panel.spec.js:7-176,309-376`).

## 3. Common action hierarchy

This hierarchy defines interaction priority, not final colors or CSS.

| Level                          | Use                                                                                                                                                   | Seki examples                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Primary action**             | The one action that advances the user's current task. Normally one per panel or decision state.                                                       | New Board on Home; Find opponent in OGS; Start analysis after selecting an SGF; Save in Creator; Accept dead stones during that OGS phase. |
| **Secondary action**           | A common alternative or supporting action that remains visible but does not compete with the primary.                                                 | Browse Library beside New Board; choose a file before analysis; Test Problem beside Creator save; Browse Tsumego beside Continue.          |
| **Ghost/subtle action**        | Navigation, refresh, reveal, or low-risk utility that should not dominate.                                                                            | Refresh history/results, Up one folder, Show in folder, Revert unchanged settings, back/previous/next controls.                            |
| **Destructive action**         | Irreversible or session-ending action, visually and spatially separated and confirmed when consequence is substantial.                                | Resign, Disconnect game, delete Creator branch, remove engine, uninstall theme, cancel a running job. “Pass” is not destructive.           |
| **Icon-only action**           | Compact, conventional, repeated utility where space matters; always has tooltip and accessible name, and never carries an ambiguous high-risk action. | Tab close, attach-engine toolbar, familiar graph/editor tools. Avoid icon-only Resign, Save, or Start analysis.                            |
| **Contextual/overflow action** | Less frequent actions tied to one row/card/object, shown through a menu or selected-item inspector without hiding the row's normal open action.       | OGS history's Analyze with OGS / Analyze with Seki; Analysis result Show in folder; Library file utilities added later, if any.            |

Current equal-priority pressure points are concrete:

- An OGS history card is itself “Open”, while “Analyze OGS” and “Analyze Seki”
  are two adjacent buttons on every row (`OgsGameHistory.js:325-430`). Opening
  should be the row's primary action; review variants are contextual actions.
- `AnalysisPanel` places Choose SGF and Start analysis together, then exposes
  four path pickers plus Apply/Revert in the same source card
  (`AnalysisPanel.js:224-279,298-522`). Frequent execution and infrastructure
  setup have equal weight.
- Running jobs present Cancel beside Show log (`AnalysisPanel.js:556-637`). A
  destructive stop and a diagnostic reveal should not share treatment.
- OGS live controls group Pass, Resign, and Accept dead stones together even
  though only one or two are phase-relevant, then place Disconnect immediately
  below (`OgsGameContextPanel.js:293-340`). Phase should determine prominence;
  Resign and Disconnect need destructive separation.
- Creator exposes Save and Test Problem as peer actions
  (`TsumegoCreator.js:521-558`) while Delete Branch is another ordinary button
  (`TsumegoCreator.js:766-779`). Save should lead normal authoring; test is
  secondary; branch deletion is destructive and contextual to the selection.

## 4. Board / editor

The existing board is a mature, protected workflow. `MainView` centers `Goban`
and mounts mode-specific bars without replacing the board
(`MainView.js:129-241`). `App` allocates left and right regions only for board
activities (`App.js:409-425`). This architecture already fits a desktop Go
studio and should be **kept**, not converted into a generic workspace page.

### Keep immediately accessible

- The central Goban, board transformations, coordinates, move display, and
  direct stone/markup interaction (`MainView.js:137-176`). The board must remain
  the dominant visual and interaction target.
- Fast move navigation: keyboard arrows, wheel navigation, slider, and game
  graph (`App.js:154-198,321-336`; `Sidebar.js:152-195`).
- Play/edit/scoring modes and the active mode's bar. The mode changes board
  semantics, so status and exit must remain obvious (`MainView.js:179-240`).
- Comments/annotations and variation tree for review/edit work
  (`Sidebar.js:152-226`).
- Engine attach/start/stop/live-analysis state when engines are in use
  (`LeftSidebar.js:169-199`).
- Save/dirty-document behavior and tab identity; these are desktop document
  invariants, not visual details.
- Multi-game SGF collections remain one board document: `gameTrees` and
  `gameIndex` are document-internal games managed through the existing Manage
  Games drawer/menu, not application tabs
  (`drawers/GameChooserDrawer.js:475-575`; `src/menu.js:105-115`). Preserve
  add/remove/reorder/select behavior and do not conflate it with `boardTabs`.

### Contextual by task

- Edit tools only in edit mode; scoring method/result only in scoring or
  estimator mode; find and autoplay controls only while those modes are active.
- Winrate/score graph only when relevant data exists; `Sidebar` already gates it
  on data (`Sidebar.js:123-150`).
- Engine peer list and GTP console when engines are attached or explicitly
  requested. The console is expert infrastructure, not default board content.
- Full game graph and comments according to review/edit intent; retaining their
  independent visibility and resizable splits supports power users.

### Candidates for later secondary controls

- “Engine vs. engine” and one-shot current-game batch analysis can remain in the
  engine toolbar or an adjacent overflow rather than matching Attach Engine in
  prominence (`LeftSidebar.js:175-198`).
- Rare display toggles (siblings, move colorization, number variants) belong in
  the View menu or a contextual board display popover, while their persisted
  defaults stay global.
- Raw GTP logging and transcript infrastructure belongs behind engine controls
  or Preferences; the active console itself must remain available.

No fundamental relocation of Goban, mode bars, or sidebars is justified by the
implementation. The concrete issues are density, action grouping, and
keyboard-accessible resizing—not the three-region model.

## 5. OGS

There are correctly two online contexts:

1. the persistent **Online destination** for connection and finding/reopening
   games (`OgsPanel.js:253-390`);
2. a dedicated **live-game tab** with Goban and game context only
   (`OnlineGameView.js:44-84`).

### Desired Online destination hierarchy

1. **Connection and active state:** a compact, always legible account/socket
   indicator; if disconnected, login is the primary task.
2. **Play:** when connected, matchmaking and its current searching/matched state
   dominate. `AutomatchForm` already has a coherent size/time/handicap/rank flow
   and a single Find opponent action (`OgsPanelMatchmaking.js:79-229`).
3. **Active online games:** currently active game tabs must be easy to return
   to. The top activity strip is their deliberate representation; matchmaking
   status also uses `MatchmakingToast`. Do not add a second active-games card to
   Online merely to imitate a web dashboard. Improve tab/toast return
   affordances only if evidence shows they are insufficient.
4. **Completed game history:** a compact review/reopen list below play. Opening
   creates a board tab; OGS/Seki analysis choices are contextual.
5. **Account context:** rank/statistics and friends are secondary reference
   information, not the organizing frame.

What should dominate is **get connected, find a game, return to a live game**.
The current hero says “manage your account” and devotes a full side column to
Account, Player Statistics, and Friends (`OgsPanel.js:259-300,359-387`), which
pulls the destination toward a web account dashboard. Keep all information, but
collapse/profile-group it below or beside the play workflow with lower priority.

Permanently visible actions should be Login when signed out; Find opponent or
Cancel search when signed in/searching; and return-to-active-game when one
exists. Connection status remains visible. Match parameters remain visible while
configuring a search.

Contextual actions should include Logout/Disconnect account, refresh profile,
refresh friends/history, pagination, per-history Analyze OGS / Analyze Seki, and
Show/open ancillary details. Friends and statistics should not compete with
matchmaking.

In a live game, board, player identities, clocks, turn, connection state, and
the current phase action dominate. Chat is available but secondary. Static
metadata such as board size, handicap, komi, rules, ranked state, and move count
can be compact or disclosed (`OgsGameContextPanel.js:250-280`). Pass remains
available during play; Accept dead stones becomes primary only during removal;
Resign and Disconnect remain visible but separated as consequential actions.
When a game finishes, preserve the explicit **Open Review Board** transition:
`showOgsGameEndInfo()` offers it and `openOgsGameReviewBoard()` creates a local
board tab at the end position (`sabaki.js:1798-1871`). Full post-game review
then belongs to the ordinary board/editor, not the restricted live-game surface.

## 6. Analysis

Seki currently has two related but distinct workflows that should stay distinct:

- **Live/local board analysis** belongs to its board tab: engine state is part
  of `boardTabStateKeys`, overlays are rendered on Goban, and graphs are in the
  right sidebar (`boardtabs.js:17-23`; `MainView.js:143-150`;
  `Sidebar.js:138-150`).
- **Batch/post-game SGF analysis** belongs to the Analysis destination. It
  starts jobs, tracks queue/status, and reopens outputs as board tabs
  (`AnalysisPanel.js:108-201,525-711`).

### Information hierarchy

**Frequent workflow actions**

1. select/preserve the SGF source (including the current board launch);
2. review or adjust current per-run options;
3. Start analysis;
4. monitor the current job;
5. open the analyzed game.

These should occupy the primary path. `startCurrentGameSgfAnalysis()` already
opens/focuses Analysis after submitting a board SGF (`sabaki.js:2034-2063`), so
the source transition is architecturally sound.

**Per-analysis options**

- infer rules and komi from the SGF;
- fallback rules/komi when absent;
- max visits and variations per move;
- comment language/detail;
- annotation style and variation threshold.

Keep these available near “New analysis,” with common controls visible and
advanced SGF output in disclosure. The existing `<details>` for advanced output
is already the right pattern (`AnalysisPanel.js:456-494`). Their values may be
remembered, but their meaning is analysis-specific, not a general app choice.

**Engine/infrastructure configuration**

- KataGo executable;
- neural-network model;
- KataGo config;
- output directory;
- analyzer availability/status.

These do **not** belong expanded in the main Analysis execution path. They are
infrequent prerequisites and currently occupy most of `ConfigSummary`
(`AnalysisPanel.js:298-369`). Move them conceptually behind an Analysis Settings
secondary surface—either an Analysis category in Preferences for installation
defaults or a settings panel launched from Analysis. Keep missing-config status
and a clear “Configure Analysis” action in the main screen. Preserve every path
field, validation state, Apply/Revert behavior, and bundled-tool status.

**Queue/status**

Keep current job name, progress, move/visit state, and failures immediately
visible. Log path/tail and Show log are diagnostic disclosure. Cancel is
destructive and tied to a specific current/queued job, not a peer of Show log.
Recent completed jobs may be compact history.

**Results/history**

Analyzed games should be a durable, dense list with Open as its primary row
action; Open creates a board tab, as today (`AnalysisPanel.js:65-68,660-711`).
Show in folder is contextual. Do not merge result review into the manager: full
post-game interaction belongs in the board/editor.

The current three-column dashboard (`AnalysisPanel.js:172-200`) should therefore
be **restructured**, not removed: execution + current status first, queue and
results next, infrastructure settings behind a secondary surface.

## 7. Library

The current implementation is a genuine filesystem-style browser, not a fake
content dashboard. It supports configured user storage, read-only built-in
content, folder traversal, SGF previews, and opening into a new board tab
(`LibraryPanel.js:38-169,201-350`). Keep that model, but **restructure its
source and path navigation**.

- **Built-in versus My Library:** both sources exist, but `LibraryPanel` has no
  visible switch; source is supplied by an internal targeted request
  (`LibraryPanel.js:19-45`). Add one stable source selector inside Library; Home
  no longer supplies destination previews.
- **Folder navigation:** keep direct folder cards and Up behavior. Replace the
  plain `currentPath` text with a navigable breadcrumb/current-location model;
  retain a clear parent action for keyboard users.
- **SGF previews:** keep mini boards for visual recognition, but do not make
  every entry a large gallery tile at all densities. The current auto-fill
  10–13rem grid (`style/index.css:908-945`) is sparse for large libraries. Offer
  a moderately compact browser/list default or density choice later without
  removing previews.
- **Folder configuration:** “Choose folder” is correct for unconfigured My
  Library (`LibraryPanel.js:214-242`). Once configured, Change folder is an
  infrequent Library-specific setting and should remain available but subtle,
  not compete with browsing (`LibraryPanel.js:247-283`).
- **Opening files:** keep single activation opening a new board tab and keep
  Library in place. Preserve represented filenames and current `gotoEnd`
  behavior unless separately redesigned.
- **Scale:** retain the 256-entry warning (`LibraryPanel.js:290-295`) while any
  future density work considers search/filtering separately; this audit does not
  introduce a new feature.

## 8. Tsumego

The implemented workflow is one coherent Tsumego destination:

```text
Browser → Collection folder → Problem → Solver
       └──────────────────────────────→ Creator → Test Solver
```

`TsumegoPanel` owns browser/problem/creator modes
(`TsumegoPanel.js:29-56,472-498`), Solver keeps isolated solving state
(`TsumegoSolver.js:31-97`), and Creator keeps an isolated SGF draft
(`TsumegoCreator.js:56-114`). Keep that boundary; neither Solver nor Creator
should become ordinary board tabs because their interaction contracts differ.

### Browser and collections

- Keep Built-in / My Library switching in the workspace. It already has tab
  semantics (`TsumegoPanel.js:525-548`), unlike Library's missing source switch.
- Keep collection metadata, but subordinate source/license prose to title,
  progress, and problem list (`TsumegoPanel.js:583-618`).
- Keep solved state and folder totals; they directly support continuation
  (`TsumegoPanel.js:176-199,642-676`). Avoid repeating progress in too many
  labels within the same collection.
- Keep back/parent navigation and add breadcrumb clarity rather than creating
  more route levels. The current display path is text while Back only moves one
  folder (`TsumegoPanel.js:572-618`).
- Keep Create Problem, but make it a secondary workspace action. Browsing or
  continuing practice is the normal primary task; creation is a distinct expert
  path (`TsumegoPanel.js:501-523`).

### Solver

Solver should be a concentration surface: Goban first, player-to-move and
minimal feedback second, navigation quiet and stable. The current layout already
isolates board plus sidebar and reveals the solution graph only after success
(`TsumegoSolver.js:252-369`). Keep previous/next and Collection navigation, but
avoid giving all four bottom actions equal prominence. Next is primary after a
solve; Retry is contextual; Collection/Previous are subtle navigation.

Incorrect moves enter exploration rather than immediately ending interaction
(`TsumegoSolver.js:157-205`); preserve this behavior and make phase/feedback
accessible without adding visual noise.

### Creator

Keep Setup → Solution as internal modes, with Goban, tool toolbar, solution
tree, validation, Save, Test, and overwrite/dirty confirmation
(`TsumegoCreator.js:318-423,443-568,571-782`). This is a specialized editor, not
a reason to redesign the main Sabaki board. Clarify hierarchy among mode,
selected tool, selected node, validation, Save, Test, and Delete Branch. Saving
to My Library and returning the browser to that folder is the correct ownership
model (`TsumegoPanel.js:412-422`).

## 9. Preferences and settings ownership

Preferences is currently a fixed-height bottom drawer with General, Themes, and
Engines tabs (`PreferencesDrawer.js:810-920`; `style/index.css:2847-2853`). It
is opened from the native menu/shortcut and engine flows. The drawer can remain
a desktop secondary surface, but its categories mix global app defaults, board
behavior, presentation, and engine infrastructure.

The following table assigns conceptual ownership; it does not require moving
anything in this task.

| Current setting/category                                                            | Classification                            | Future owner                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Hardware acceleration; update check; language                                       | **GLOBAL PREFERENCE**                     | Application / General. Restart requirements remain explicit.                                                          |
| Sound enable                                                                        | **GLOBAL PREFERENCE**                     | Application / General.                                                                                                |
| Jump to end after loading; always show result                                       | **BOARD-SPECIFIC**                        | Board defaults in Preferences; per-document behavior should not be implied unless it is actually persisted per board. |
| Fuzzy/animated stone placement                                                      | **BOARD-SPECIFIC**                        | Board appearance/interaction defaults.                                                                                |
| Variation Replay Mode                                                               | **BOARD-SPECIFIC**                        | Board navigation defaults.                                                                                            |
| Game Tree Style; invert winrate graph                                               | **BOARD-SPECIFIC**                        | Board review/analysis display defaults.                                                                               |
| Automatic move titles                                                               | **BOARD-SPECIFIC**                        | Board comments/review default.                                                                                        |
| Ko, suicide, remove-node, remove-other-variations warnings                          | **BOARD-SPECIFIC**                        | Board/editor safety defaults.                                                                                         |
| Click last played stone to remove                                                   | **BOARD-SPECIFIC**                        | Board/editor interaction default.                                                                                     |
| Offer reload when file changed externally                                           | **GLOBAL PREFERENCE**                     | Files / General; it governs application file watching, not one workspace.                                             |
| Current theme; install/uninstall theme                                              | **GLOBAL PREFERENCE**                     | Appearance.                                                                                                           |
| Custom black/white stone, board, and background images                              | **GLOBAL PREFERENCE**                     | Appearance / Board theme assets. They apply globally even though rendered on Gobans.                                  |
| Engine list: name, executable, arguments, startup commands                          | **GLOBAL PREFERENCE**                     | Engines. These are reusable installations; attaching one remains contextual to a board.                               |
| GTP console logging enable/path                                                     | **GLOBAL PREFERENCE**                     | Engines / Diagnostics. The active console stays in the board workspace.                                               |
| Attach/detach engine, engine-vs-engine, selected console peer                       | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Current board's left sidebar (`LeftSidebar.js`).                                                                      |
| Board mode, selected edit tool, scoring method, dead stones                         | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Current board; these are task state, not preferences.                                                                 |
| Show coordinates, move numbers, siblings, graphs, comments, sidebars                | **BOARD-SPECIFIC**                        | Immediate toggles stay in board View/context; persisted defaults may live under Board preferences.                    |
| KataGo executable, model, config, analyzer status                                   | **ANALYSIS-SPECIFIC**                     | Analysis Settings secondary surface; show only readiness in the main Analysis workflow.                               |
| Analysis output directory                                                           | **ANALYSIS-SPECIFIC**                     | Analysis Settings; retain a convenient reveal/change action in Analysis.                                              |
| Max visits, variations, SGF rules/komi fallback, language, comment/annotation style | **ANALYSIS-SPECIFIC**                     | Per-analysis options with remembered defaults; advanced output remains disclosed.                                     |
| Current SGF input, queue, current job, log, analyzed results                        | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Analysis manager.                                                                                                     |
| OGS credentials/session and socket state                                            | **OGS-SPECIFIC**                          | OGS connection flow; never generic Preferences.                                                                       |
| Matchmaking size/time/handicap/rank choices                                         | **OGS-SPECIFIC**                          | Online destination; remembered values are OGS defaults.                                                               |
| Live clocks, chat, pass/resign/dead-stone actions                                   | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Live online-game activity.                                                                                            |
| Library root folder                                                                 | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Library setup/settings because the path defines that workspace's content.                                             |
| Tsumego source, collection, progress, Creator save path                             | **CONTEXTUAL / SHOULD STAY IN WORKSPACE** | Tsumego and Library workflows.                                                                                        |

Preferences navigation itself should eventually use proper tabs and focus
management; its current clickable `<li>`/anchor structure is not a robust tab
model (`PreferencesDrawer.js:871-901`). Avoid turning Preferences into a fourth
global navigation system.

## 10. Accessibility and desktop ergonomics

### Existing strengths to preserve

- Global inputs/buttons/selects/textareas have visible `:focus-visible`
  treatment (`style/app.css:187-230`).
- `AppSidebar` exposes labelled destination navigation, selected-page state, and
  Settings expansion state (`AppSidebar.js:20-85`). `AppTabs` labels the open
  activities and gives board/live-game controls accessible names and close
  labels (`AppTabs.js:55-86,106-180`).
- Grouped board-size controls use `aria-pressed`; Tsumego sources use tab roles
  (`HomeDashboard.js:125-145`; `TsumegoPanel.js:525-548`).
- OGS status is an `aria-live` region and Analysis errors use `role="alert"`
  (`OgsGameContextPanel.js:205-220`; `AnalysisPanel.js:170`).
- OGS history's custom clickable cards implement Enter/Space behavior
  (`OgsGameHistory.js:177-190,338-351`). Prefer native buttons/links where
  layout allows, but preserve equivalent keyboard activation.

### UX-level issues and concrete priorities

**Keyboard navigation and focus order**

- `AppSidebar` and `AppTabs` now separate destinations from activities, but both
  still rely on ordinary button Tab order rather than complete sidebar/tab-list
  arrow-key, reordering, and close-shortcut contracts. Preserve normal Tab
  access while those distinct models are designed and tested.
- Goban and `GameGraph` are primarily pointer surfaces; `SplitContainer` exposes
  a mouse-only `<div>` resizer (`SplitContainer.js:7-43,78-93`). Board
  interaction accessibility needs a scoped design, while splitter keyboard
  resizing and reset can be addressed independently.
- Drawers provide no dialog semantics, initial focus, focus trap/return, or
  labelled relationship (`drawers/Drawer.js:27-39`). Preferences therefore
  depends on DOM order and Escape rather than a complete modal contract.
- Tsumego Solver feedback is a plain paragraph (`TsumegoSolver.js:305-310`);
  correct/incorrect/solved changes should be announced without stealing focus.

**Labels and discoverability**

- Keep text for consequential or workflow-leading actions. Existing engine
  toolbar icon-only controls have tooltips (`LeftSidebar.js:175-198`), but
  tooltip-only discovery is weak for new users; mode/context should supply a
  nearby label or status when ambiguity remains.
- Library/Tsumego folder cards have names, but plain path strings are not
  navigable. Breadcrumbs should expose hierarchy and reduce repeated Back/Up
  clicks.
- Board and online-game type is partly encoded through title/meta; online tabs
  explicitly say “Online game” (`AppTabs.js:106-180`). Keep restrained,
  non-color-only cues and full accessible labels for both types.

**Target sizes and hover dependence**

- Global buttons default to compact padding, tab close buttons are 1.7rem wide,
  and many history actions use very small padding (`style/app.css:187-201`;
  `style/index.css:102-109,777-788`). Compact desktop UI is appropriate, but
  frequent and dangerous targets need reliable hit areas.
- Do not make actions available only on hover. Current inspected workflows keep
  actions in the DOM; retain that. If OGS row actions move to overflow, the menu
  trigger must remain keyboard- and focus-visible rather than hover-only.

**Click cost and information density**

- Home now limits focus order to resume when available, local board setup,
  Browse Library, and Tsumego continuation (`HomeDashboard.js:64-152`). Preserve
  that reduction in tab stops and cognitive load.
- Library's large preview grid is low-density for long sessions; Analysis's
  expanded infrastructure form is high-density in the wrong place. Density
  should follow task frequency rather than one universal card layout.
- OGS account statistics/friends and static live-game metadata should not push
  play/clock actions below the fold on ordinary desktop windows.

**Modal/drawer dependence and destructive actions**

- Keep short confirmations for dirty Creator drafts, branch deletion, overwrite,
  theme uninstall, and board dirty-close. Use consistent Seki dialogs rather
  than expanding reliance on `window.confirm` in Creator
  (`TsumegoCreator.js:116-127,186-202,346-405`).
- Preferences can remain secondary, but the fixed 400px drawer and missing focus
  management make long engine/theme configuration tiring. A later Settings
  surface may grow as a global action, not as an activity tab.
- Resign, disconnect, cancel analysis, delete branch, remove engine, and
  uninstall theme need consistent destructive hierarchy and consequence text.

**Long-session ergonomics**

- Preserve resizable, persisted board sidebars (`App.js:339-357`;
  `Sidebar.js:47-71`) and horizontal overflow for open board/live-game tabs
  (`style/index.css:71-88`). Keep the active tab visible without turning
  destinations into overflow activities.
- Keep quiet backgrounds, stable layouts, compact rows, and limited animation.
  Avoid large heroes, repeated cards, and shifting controls in the board,
  live-game, Solver, queue, and Library surfaces.

## 11. Final target architecture

```text
Seki
├── Global sidebar
│   ├── Home (start/resume)
│   ├── Online (connection, matchmaking, history)
│   ├── Analysis (jobs, queue, results)
│   ├── Library (Built-in and My Library)
│   ├── Tsumego (Browser, Solver, Creator)
│   └── Settings (global action)
├── Top activity tabs
│   ├── Board documents (0..n local SGFs)
│   │   └── Goban + contextual modes, engines, graph, and comments
│   └── Online games (0..n live OGS games)
│       └── Goban + clocks, players, phase actions, and chat
└── Secondary surfaces
    ├── Native menus and shortcuts
    └── Existing focused drawers and confirmations
```

### Top-level contracts

| Area                     | Purpose                                                 | Primary user action                                               | Secondary actions                                                          | Must not live there                                                                                               |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Home**                 | Start or resume work.                                   | Resume the most relevant activity, or New Board when none exists. | Browse Library; native File/Open remains available.                        | Repeated destination launchers, full matchmaking, game history, folder browser, Analysis configuration.           |
| **Board activity**       | Play, edit, review, and analyze one local SGF document. | Interact with Goban/current mode.                                 | Navigate tree; comments; engines; scoring; save/export.                    | Global OGS account/history, batch queue management, Library browsing, Tsumego progress.                           |
| **Online-game activity** | Play one live OGS game safely and with focus.           | Play a move or perform the current phase action.                  | Pass, chat, inspect game context; open a local review board when finished. | Local editing/engine controls during live play, account statistics, completed-game history, batch Analysis setup. |
| **Online destination**   | Connect and enter/return to online play.                | Login or Find opponent/return to active game.                     | History/review, friends, profile/statistics, logout.                       | Embedded live boards, local SGF editing, KataGo infrastructure fields.                                            |
| **Analysis destination** | Run and manage post-game SGF analysis.                  | Start a configured analysis or open a finished result.            | Queue control, per-run options, logs, Analysis Settings.                   | Full board review/editor, OGS account management, general engine attachment.                                      |
| **Library destination**  | Browse built-in and user SGFs and open documents.       | Open a folder or SGF.                                             | Switch source, navigate path, configure user root.                         | Editing SGFs in place, Tsumego solving/creation, account or analysis configuration.                               |
| **Tsumego destination**  | Browse, solve, track, and create Go problems.           | Continue/open a problem; Save while creating.                     | Source/collection navigation, previous/next, Create, Test.                 | General SGF editor controls, OGS play, batch-analysis queue.                                                      |

## 12. Prioritized redesign plan

1. **Lock the navigation contract.** Implement the persistent Home / Online /
   Analysis / Library / Tsumego sidebar, global Settings action, and a top strip
   limited to board documents and live online games. Inventory legacy
   `workspaceTabs`, `openWorkspaceTab()`, `activeWorkspace`, and `homeSection`
   callers before changing compatibility routing.
2. **Define shared action and accessibility primitives.** Establish primary,
   secondary, subtle, destructive, icon-only, overflow, focus, and keyboard
   behavior. Apply contracts to tabs, buttons, menus, dialogs, and splitters
   before screen-specific visual polish.
3. **Reduce Home to start/resume.** Fix activity-aware resume, retain New Board,
   use Browse Library instead of an external Open SGF action, keep a compact
   Tsumego continuation, and remove duplicated destination navigation and dense
   Library/Online previews. Native File/Open remains available. Preserve every
   underlying Library, matchmaking, history, and analysis capability in its
   owning destination, and intentionally update tests for changed entry-point
   contracts. This depends on stage 1's destination rules.
4. **Rebalance Online and live-game hierarchy.** Make connection and matchmaking
   dominant in Online, and make return-to-live-game affordances clear through
   the top tabs/toast rather than an Online dashboard card. Demote account
   dashboard material, make history actions contextual, and separate destructive
   live-game actions. Preserve all online protocols and dedicated online-game
   tabs.
5. **Restructure Analysis around execution and status.** Separate per-run
   options from KataGo infrastructure, retain queue/results, and define an
   Analysis Settings secondary surface. Do this before redesigning Preferences
   because it establishes settings ownership.
6. **Unify content browsing patterns.** Give Library an in-workspace Built-in /
   My Library switch and shared breadcrumb/density behavior; align Tsumego
   collection navigation and progress without merging the two workflows.
7. **Polish protected focused workspaces.** Conservatively refine board action
   grouping and keyboard-resizable sidebars, then Solver concentration and
   Creator action/destructive hierarchy. This comes last because these mature
   workflows depend on the shared primitives but should not be destabilized by
   early architecture work.
8. **Reorganize Preferences after ownership is proven.** Regroup global, board,
   engine, and Analysis settings; add proper dialog/tab focus behavior; retain
   contextual controls in their workspaces. Remove obsolete presentation code
   only after compatibility callers and tests no longer depend on it.

Each stage is independently shippable and must preserve current product
capabilities, data, and protected workflows. Approved IA stages may deliberately
change an entry point or presentation and must update its interaction contract
and tests explicitly. None requires a renderer rewrite, a new product feature,
or replacement of the existing tab/state projection architecture.
