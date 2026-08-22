# Seki UX Architecture Audit

Status: product-direction audit; no UI implementation is specified here.

## Scope and design premise

Seki is a desktop Go studio. Its redesign should use **Quiet Studio** as the
primary language, with a restrained **Deep Board** atmosphere: dark-first,
desktop-native, moderately compact, low-noise, and efficient for repeated use.
This audit preserves local Sabaki board/editor work, OGS online play, post-game
analysis, Library, and all Tsumego browser, Solver, and Creator workflows.

The findings below are based on the current renderer shell and state projection,
not component names alone. In particular, `App` renders a permanent tab strip
above a three-way board layout (`src/components/App.js:361-446`),
`WorkspaceView` projects route state into the center
(`src/components/WorkspaceView.js:15-50`), and `sabaki` owns three kinds of
activity plus their shared order (`src/modules/sabaki.js:107-130,571-704`).

Recommendations distinguish **information architecture** (where a workflow lives
and how users reach it) from **visual treatment** (density, color, spacing).
Quiet Studio styling cannot by itself resolve duplicated navigation, unclear
action priority, or settings ownership.

## 1. Global navigation model

### Current architecture and disposition

| Mechanism                          | Current implementation                                                                                                                                                                                                                                                                               | Disposition                    | UX direction                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent Home                    | `AppTabs` always renders Home first; it is not closeable or part of `activityTabOrder` (`AppTabs.js:70-88`). Startup is Home (`sabaki.js:114-115`).                                                                                                                                                  | **KEEP**                       | Keep one stable return point and start/resume surface.                                                                                                        |
| Board tabs                         | Each local document owns SGF state, history, engines, and analysis (`boardtabs.js:8-24`; `sabaki.js:478-565`).                                                                                                                                                                                       | **KEEP**                       | These are primary document activities. Preserve multi-document and dirty-close behavior.                                                                      |
| Online-game tabs                   | Live games own a restricted board projection and deliberately clear local engine/analysis state (`onlinegametabs.js:8-19`; `sabaki.js:707-760`).                                                                                                                                                     | **KEEP**                       | A live game is a time-sensitive activity, not a page inside the OGS overview. Keep it independently reachable.                                                |
| Workspace tabs                     | OGS, Analysis, Library, and Tsumego are singleton closeable tabs created by `openWorkspaceTab()` (`sabaki.js:621-667`).                                                                                                                                                                              | **SIMPLIFY**                   | Keep singleton activities, but communicate that they are tools/workspaces rather than documents. Do not allow accidental duplicate instances.                 |
| `activityTabOrder`                 | Namespaced board, online-game, and workspace keys share one ordering and adjacent-close behavior (`sabaki.js:571-619`; `AppTabs.js:134-152`).                                                                                                                                                        | **KEEP**                       | This is the correct internal basis for one desktop activity strip. Improve overflow and keyboard behavior later, not the data model.                          |
| `activeWorkspace`                  | Projects Home, board, online game, or workspace tab into the shell (`WorkspaceView.js:15-35`).                                                                                                                                                                                                       | **SIMPLIFY**                   | Treat it as an internal projection of the selected activity, not a second user-visible navigation concept.                                                    |
| Legacy `activeWorkspace` routes    | `online`, `analysis`, and `sgf-explorer` are intercepted and mapped to singleton tabs; direct render cases remain (`sabaki.js:305-320`; `WorkspaceView.js:19-26`). `tsumego` still has a direct case.                                                                                                | **DEPRECATE INTERNALLY**       | Route all new calls through `openWorkspaceTab`; retain compatibility adapters until callers/tests are migrated. Old code is not itself a user-facing problem. |
| `homeSection` workspace cases      | `HomeView` can render OGS, Analysis, Library, and Tsumego, but current Home navigation opens tabs (`HomeView.js:19-25,43-64`).                                                                                                                                                                       | **DEPRECATE INTERNALLY**       | Keep only as transitional compatibility. Home should not silently become a second workspace host.                                                             |
| Home feature navigation            | Sticky `HomeNavigation` launches the same singleton Analysis, OGS, Library, and Tsumego activities shown in `AppTabs`; routing is already unified through `openWorkspaceTab()` (`HomeDashboard.js:343-385`; `HomeView.js:19-24`; `style/index.css:276-320`).                                         | **RESTRUCTURE**                | Keep Home-local start/open shortcuts, but reduce their rail-like visual prominence so they are not mistaken for persistent global navigation.                 |
| Hidden AppRail                     | `#apprail` remains styled but is `display: none` (`style/index.css:144-145`).                                                                                                                                                                                                                        | **REMOVE FROM USER-FACING UX** | Do not reintroduce a second global rail. Remove dead presentation code only as a separate safe cleanup after compatibility review.                            |
| Native menu, file drop, shortcuts  | `App` supports file drop, board undo/redo and navigation keys, Escape, and Cmd/Ctrl+Home (`App.js:128-208`); the native menu remains available.                                                                                                                                                      | **KEEP**                       | Menus and shortcuts are desktop-native secondary entry points, not competing primary navigation.                                                              |
| Contextual cross-workflow launches | Home, OGS history, Library, and Analysis results open targeted workspaces or new board tabs (`HomeDashboard.js:41-133`; `LibraryPanel.js:141-162`; `AnalysisPanel.js:65-68`). Tsumego requests instead open a collection/problem inside its singleton workspace (`TsumegoPanel.js:123-162,318-372`). | **KEEP**                       | Preserve both transitions: ordinary SGFs/games become board documents; tools and Tsumego problems retain their specialized singleton workspace context.       |

### Target global model

Seki's primary global navigation should be **a persistent Home anchor followed
by one ordered strip of open activities**. The strip contains local board
documents, live online games, and at most one instance of each tool workspace.
It should remain a desktop document/activity model, not become a website-style
section rail.

Home and `AppTabs` have different jobs:

- **AppTabs is global navigation**: it answers “what is open?” and supports
  rapid switching among ongoing work.
- **Home is a start/resume activity**: it answers “what should I begin or
  continue?” It should not mirror every open tab or host full feature screens.
- Home should **not** have its own persistent feature navigation. It may expose
  concise launch shortcuts when a workspace is not already open; activation
  should focus the existing singleton tab.

Users should move between Board / OGS / Analysis / Library / Tsumego by
selecting their open activity tab, by a desktop menu/shortcut, or by a
contextual launch from Home or another workspace. “Board” is not one singleton
destination: each local SGF is a board tab. OGS overview, Analysis manager,
Library, and Tsumego are singleton tool activities. Each active OGS game is its
own online-game tab.

### Activity tabs versus contextual views

Open as an **activity tab** when the task has durable independent context or is
expected to be revisited while other work continues:

- every local board/editor document;
- every active online game;
- OGS overview/matchmaking;
- batch Analysis manager and queue;
- Library browser;
- the Tsumego browser/solver/creator workflow as one retained workspace.

Remain **contextual inside an activity** when the information only makes sense
for the selected object:

- board play/edit/scoring/find/autoplay modes;
- board engines, GTP console, graphs, game tree, and comments;
- live-game clocks, players, chat, pass/resign, and stone removal;
- Analysis job status and results;
- Library folders and current path;
- Tsumego collection, problem, Solver, Creator, and Creator test state;
- Preferences and short configuration dialogs/drawers.

Opening an SGF from OGS history, Library, or Analysis results should continue to
create a board activity. It should not replace the source workspace or turn the
source into a board view.

## 2. Home

**Intended responsibility:** Home is Seki's quiet desktop start/resume surface
for beginning a board and returning to the most relevant ongoing work.

| Current element                      | Disposition                                   | Reason and intended role                                                                                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero (“Your Go workspace”)           | **SIMPLIFY**                                  | `HomeDashboard.js:200-209` consumes vertical space without adding task context. Keep restrained product identity or a compact greeting, not a dashboard masthead.                                                                                                                        |
| `HomeNavigation`                     | **REMOVE DUPLICATION**                        | Its five-button sticky rail (`HomeDashboard.js:343-385`) uses the correct singleton routing, but its persistence and visual weight duplicate global wayfinding. Retain “Open SGF” and tool launch capability in a compact launch area, not a second-looking nav system.                  |
| New Board                            | **KEEP ON HOME**                              | It creates a new board tab directly (`HomeDashboard.js:41-45`) and is the clearest first-run/local primary action.                                                                                                                                                                       |
| Board-size choice                    | **SIMPLIFY**                                  | 9/13/19 is a useful quick preset (`HomeDashboard.js:260-279`), but should support rather than compete with New Board. Nonstandard dimensions remain in established board/game setup flows.                                                                                               |
| Library preview                      | **MOVE TO WORKSPACE**                         | Home currently loads up to four user and built-in folders and repeats source browsing (`HomeLibraryPane.js:13-19,107-153`). Replace it with a concise “Open Library” or one recent/resume item; source and folder exploration belong in Library.                                         |
| Online preview / matchmaking         | **MOVE TO WORKSPACE**                         | Home duplicates OGS login plus size, clock, preset, and Find opponent controls (`HomeOnlinePanel.js:55-103,116-240`). Match configuration belongs in OGS. Home may show connection state and one “Play online” launch.                                                                   |
| Recent OGS games                     | **MOVE TO WORKSPACE**                         | The three-game list repeats opening and two analysis actions (`HomeDashboard.js:293-320`; `OgsGameHistory.js:110-253`). History is secondary inside OGS; Home may show at most one meaningful recent/resume link.                                                                        |
| Tsumego card                         | **SIMPLIFY**                                  | The current card correctly selects the first unfinished problem and preserves progress (`HomeTsumegoCard.js:29-32,163-217`), making it a good resume affordance. Reduce collection metadata and secondary browsing chrome; keep “Continue” dominant.                                     |
| Resume current board / Continue game | **KEEP ON HOME**, but correct and consolidate | Resume is core, but the current button always sets `activeWorkspace: 'board'` even when labelled for `onlineGameId` (`HomeDashboard.js:325-336`). The future action must activate the actual selected board or online-game tab and avoid competing with a separate Tsumego continuation. |

The desired Home is therefore not a miniature Library + OGS + Tsumego dashboard.
Its high-value order is: **resume urgent/ongoing activity**, **new board/open
SGF**, then **small workspace launchers**. It should not fetch and render
several dense feature previews merely to prove those features exist.

Moving the current Home Library deep links, quick matchmaking, and recent-game
actions changes their entry points, but not their capabilities: targeted Library
opening, all matchmaking choices, game opening, and both analysis paths must
remain available in their owning workspaces. Existing Home E2E assertions for
those entry points would therefore need intentional replacement, not silent
deletion.

## 3. Common action hierarchy

This hierarchy defines interaction priority, not final colors or CSS.

| Level                          | Use                                                                                                                                                   | Seki examples                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Primary action**             | The one action that advances the user's current task. Normally one per panel or decision state.                                                       | New Board on Home; Find opponent in OGS; Start analysis after selecting an SGF; Save in Creator; Accept dead stones during that OGS phase. |
| **Secondary action**           | A common alternative or supporting action that remains visible but does not compete with the primary.                                                 | Open SGF beside New Board; choose a file before analysis; Test Problem beside Creator save; Browse Tsumego beside Continue.                |
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

There are correctly two OGS contexts:

1. the singleton **OGS workspace** for connection and finding/reopening games
   (`OgsPanel.js:253-390`);
2. a dedicated **live-game activity** with Goban and game context only
   (`OnlineGameView.js:44-84`).

### Desired OGS workspace hierarchy

1. **Connection and active state:** a compact, always legible account/socket
   indicator; if disconnected, login is the primary task.
2. **Play:** when connected, matchmaking and its current searching/matched state
   dominate. `AutomatchForm` already has a coherent size/time/handicap/rank flow
   and a single Find opponent action (`OgsPanelMatchmaking.js:79-229`).
3. **Active online games:** currently active game tabs must be easy to return
   to. The activity strip is the deliberate current representation; matchmaking
   status also uses `MatchmakingToast`. Do not add a second active-games card to
   OGS merely to imitate a web dashboard. Improve tab/toast return affordances
   only if evidence shows they are insufficient.
4. **Completed game history:** a compact review/reopen list below play. Opening
   creates a board tab; OGS/Seki analysis choices are contextual.
5. **Account context:** rank/statistics and friends are secondary reference
   information, not the organizing frame.

What should dominate is **get connected, find a game, return to a live game**.
The current hero says “manage your account” and devotes a full side column to
Account, Player Statistics, and Friends (`OgsPanel.js:259-300,359-387`), which
pulls the workspace toward a web account dashboard. Keep all information, but
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
- **Batch/post-game SGF analysis** is the singleton Analysis manager. It starts
  jobs, tracks queue/status, and reopens outputs as board tabs
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
  visible switch; source is supplied by a targeted request, often from the Home
  preview (`LibraryPanel.js:19-31`; `HomeLibraryPane.js:107-150`). Add one
  stable source selector inside Library. Do not require users to return Home to
  switch.
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

The implemented workflow is one coherent singleton activity:

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
| Matchmaking size/time/handicap/rank choices                                         | **OGS-SPECIFIC**                          | OGS workspace; remembered values are OGS defaults.                                                                    |
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
- `AppTabs` and Home navigation are labelled; activity controls have accessible
  names and close labels (`AppTabs.js:70-86,154-269`;
  `HomeDashboard.js:343-385`).
- Grouped size/time controls use `aria-pressed`; Tsumego sources use tab roles
  (`HomeDashboard.js:260-279`; `HomeOnlinePanel.js:165-223`;
  `TsumegoPanel.js:525-548`).
- OGS status is an `aria-live` region and Analysis errors use `role="alert"`
  (`OgsGameContextPanel.js:205-220`; `AnalysisPanel.js:170`).
- OGS history's custom clickable cards implement Enter/Space behavior
  (`OgsGameHistory.js:177-190,338-351`). Prefer native buttons/links where
  layout allows, but preserve equivalent keyboard activation.

### UX-level issues and concrete priorities

**Keyboard navigation and focus order**

- The global activity strip is a labelled nav of ordinary buttons, but has no
  tab-list arrow-key model, tab cycling, reordering, or close shortcut
  (`AppTabs.js`). Add a desktop-consistent keyboard contract before adding more
  tab chrome; preserve normal Tab access as a fallback.
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
- App tab type is partly encoded through title/meta; online tabs say “Online
  game,” while workspace tabs only show names (`AppTabs.js:197-257`). Use
  restrained, non-color-only type cues and preserve full accessible labels.

**Target sizes and hover dependence**

- Global buttons default to compact padding, tab close buttons are 1.7rem wide,
  and many history actions use very small padding (`style/app.css:187-201`;
  `style/index.css:102-109,777-788`). Compact desktop UI is appropriate, but
  frequent and dangerous targets need reliable hit areas.
- Do not make actions available only on hover. Current inspected workflows keep
  actions in the DOM; retain that. If OGS row actions move to overflow, the menu
  trigger must remain keyboard- and focus-visible rather than hover-only.

**Click cost and information density**

- Home currently asks users to scan/focus through local setup, Library folders,
  complete online matchmaking, history actions, Tsumego, and resume. Removing
  duplicated feature previews reduces both tab stops and cognitive load.
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
  management make long engine/theme configuration tiring. A later settings
  surface may grow, but it should not become an activity tab without a stronger
  workflow reason.
- Resign, disconnect, cancel analysis, delete branch, remove engine, and
  uninstall theme need consistent destructive hierarchy and consequence text.

**Long-session ergonomics**

- Preserve resizable, persisted board sidebars (`App.js:339-357`;
  `Sidebar.js:47-71`) and the horizontally scrollable activity strip
  (`style/index.css:71-88`). Add discoverable overflow and active-tab visibility
  rather than replacing tabs with a dashboard.
- Keep quiet backgrounds, stable layouts, compact rows, and limited animation.
  Avoid large heroes, repeated cards, and shifting controls in the board,
  live-game, Solver, queue, and Library surfaces.

## 11. Final target architecture

```text
Seki
├── Home (persistent start/resume anchor)
├── Board activities (0..n local SGF documents)
│   ├── Goban + active mode bar
│   ├── Contextual engines / GTP
│   └── Contextual graph / comments / analysis
├── Online game activities (0..n live OGS games)
│   ├── Goban
│   └── Clocks / players / phase actions / chat
├── OGS workspace (singleton)
│   ├── Connection + matchmaking
│   ├── Return to live games via activity tabs / toast
│   └── History + account/friends/statistics
├── Analysis workspace (singleton)
│   ├── New job + per-analysis options
│   ├── Queue / status
│   └── Results + secondary Analysis Settings
├── Library workspace (singleton)
│   ├── Built-in
│   └── My Library
└── Tsumego workspace (singleton)
    ├── Browser / Collection
    ├── Solver
    └── Creator / Test Solver

Global secondary surfaces
├── Native menus and shortcuts
├── Preferences (Application / Appearance / Board / Engines / Analysis)
└── Existing focused drawers and confirmations
```

### Top-level contracts

| Area                     | Purpose                                                 | Primary user action                                               | Secondary actions                                                          | Must not live there                                                                                               |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Home**                 | Start or resume work.                                   | Resume the most relevant activity, or New Board when none exists. | Open SGF; launch OGS, Analysis, Library, Tsumego.                          | Full matchmaking, game history, folder browser, Analysis configuration, account dashboard.                        |
| **Board activity**       | Play, edit, review, and analyze one local SGF document. | Interact with Goban/current mode.                                 | Navigate tree; comments; engines; scoring; save/export.                    | Global OGS account/history, batch queue management, Library browsing, Tsumego progress.                           |
| **Online-game activity** | Play one live OGS game safely and with focus.           | Play a move or perform the current phase action.                  | Pass, chat, inspect game context; open a local review board when finished. | Local editing/engine controls during live play, account statistics, completed-game history, batch Analysis setup. |
| **OGS workspace**        | Connect and enter/return to online play.                | Login or Find opponent/return to active game.                     | History/review, friends, profile/statistics, logout.                       | Embedded live boards, local SGF editing, KataGo infrastructure fields.                                            |
| **Analysis workspace**   | Run and manage post-game SGF analysis.                  | Start a configured analysis or open a finished result.            | Queue control, per-run options, logs, Analysis Settings.                   | Full board review/editor, OGS account management, general engine attachment.                                      |
| **Library workspace**    | Browse built-in and user SGFs and open documents.       | Open a folder or SGF.                                             | Switch source, navigate path, configure user root.                         | Editing SGFs in place, Tsumego solving/creation, account or analysis configuration.                               |
| **Tsumego workspace**    | Browse, solve, track, and create Go problems.           | Continue/open a problem; Save while creating.                     | Source/collection navigation, previous/next, Create, Test.                 | General SGF editor controls, OGS play, batch-analysis queue.                                                      |

## 12. Prioritized redesign plan

1. **Lock the navigation contract.** Document Home + ordered activities as the
   only global model; route all new navigation through board/online/workspace
   tab APIs. Inventory legacy `activeWorkspace`/`homeSection` callers before
   deprecating internals. This prevents each screen redesign from inventing a
   new navigation pattern.
2. **Define shared action and accessibility primitives.** Establish primary,
   secondary, subtle, destructive, icon-only, overflow, focus, and keyboard
   behavior. Apply contracts to tabs, buttons, menus, dialogs, and splitters
   before screen-specific visual polish.
3. **Reduce Home to start/resume.** Fix activity-aware resume, retain New Board
   and Open SGF, keep a compact Tsumego continuation, and replace duplicated
   Library/OGS previews and sticky Home navigation with quiet launchers.
   Preserve every underlying Library, matchmaking, history, and analysis
   capability in its owning workspace, and intentionally update tests for
   changed entry-point contracts. This depends on stage 1's destination rules.
4. **Rebalance OGS and live-game hierarchy.** Make connection and matchmaking
   dominant in OGS, and make return-to-live-game affordances clear through the
   existing activity tabs/toast rather than an OGS dashboard card. Demote
   account dashboard material, make history actions contextual, and separate
   destructive live-game actions. Preserve all online protocols and dedicated
   online-game tabs.
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
