# Seki-Sabaki Vision & Integration Plan

This document captures the high-level direction for future Seki-Sabaki work. It
is not a strict specification. It is a shared reference for design choices in
future implementation sessions.

## Guiding Intent

Seki-Sabaki is an aggressive fork of Sabaki, but not a rewrite.

The goal is to evolve Sabaki into a more complete, modern Go workspace while
preserving what already works well:

- keep Sabaki's strong SGF viewer/editor foundation;
- avoid rewriting core systems without a clear reason;
- improve navigation, online play, local SGF management, and analysis workflows;
- make the app feel more coherent as features grow;
- stay ambitious, but reasonable.

In short:

> Build a broader Go workspace on top of Sabaki, not a new app that merely
> resembles Sabaki.

## Current Sabaki Model

Sabaki is currently centered around the goban.

The normal flow is:

1. open the app;
2. see an empty board or loaded SGF;
3. edit, review, analyze, or save the current game.

Internally, Sabaki can already manage several games through `gameTrees` and
`gameIndex`. The existing **Manage Games** drawer is a collection manager for
multiple games inside the currently loaded SGF/collection. It is not a general
file browser, tab system, or online game manager.

This distinction is important:

- `gameTrees` = games currently loaded into the active SGF document;
- local SGF library = files on disk, possibly many directories and many files;
- OGS active games = live online state, sockets, clocks, pending moves, phases;
- analysis queue = long-running tasks and generated analysis metadata.

These domains should not be forced into one data model.

## Proposed Product Direction

Seki-Sabaki should gradually move from a pure board-first application toward a
workspace model:

```text
Home / Dashboard
├── New Board
├── Open SGF
├── SGF Library
├── OGS Games
└── Analysis
```

The goban remains central, but it becomes one workspace among several, not the
only entry point into the app.

## Home / Dashboard

A future Home view should provide a natural starting point for broader use:

- create a new empty board;
- open an SGF file;
- browse the local SGF library;
- view current OGS games;
- launch or monitor analysis jobs;
- access recent files or recent games.

There should be a persistent, easy-to-reach **Home** action from anywhere in the
app. Returning Home should not necessarily destroy the current board state.

For compatibility and user preference, startup behavior should remain
configurable:

- start on Home;
- start on an empty board, like classic Sabaki;
- later, maybe restore recent/last workspace.

## Board Workspace

The existing Sabaki board behavior should remain the foundation:

- SGF editing;
- game tree navigation;
- engines and analysis display;
- scoring tools;
- file save/load behavior;
- existing keyboard workflows.

The board workspace should continue to support the current Sabaki-style flow:

```text
New Board → edit/review/play locally → save SGF
```

The goal is not to make classic Sabaki usage worse in order to add new views.

## Local SGF Library

A local SGF library would let users choose a directory and browse SGF files with
preview boards and metadata.

This should be separate from `gameTrees`.

Recommended model:

```text
Library index
├── file path
├── game index within file
├── players
├── date
├── result
├── board size
├── move count
├── modified time
├── analysis metadata, later
└── preview position
```

Important constraints:

- do not load an entire large library into `gameTrees`;
- do not make Save rewrite a whole folder or library;
- parse lazily and cache metadata;
- handle broken SGFs gracefully;
- support subdirectories carefully;
- keep file operations explicit and safe.

The existing Game Chooser UI is a good visual inspiration: grid, mini-gobans,
filtering, sorting. But the underlying data model should be different.

## OGS Games

OGS live games should also remain separate from `gameTrees`.

An OGS game has live state that an SGF collection does not have:

- OGS game id;
- socket connection state;
- server phase;
- clocks;
- current player;
- pending optimistic move;
- reconnect/error handling;
- chat and scoring later.

The app can still use the main board to view/play one selected OGS game at a
time. When an OGS game is disconnected or finished, it should detach from OGS
and remain as a normal editable SGF on the board.

A future OGS overview could reuse the same visual language as the Game Chooser:

- active games as cards;
- mini-goban previews;
- opponent names;
- phase/status;
- whose turn it is;
- clock summary;
- click to open on the board.

But it should not pretend that live OGS games are simply local SGF entries.

## Analysis Workflow

Future analysis integration should connect naturally with the local library.

Possible direction:

- analyze one SGF;
- analyze a directory;
- maintain an analysis queue;
- show analyzed/unanalysed status in the library;
- filter games by analysis status or important mistakes;
- open a game directly at key review points.

This should be integrated as a workflow, not only as a command hidden in a menu.

## Shared UI Components

The existing `GameChooserDrawer` should not become a universal manager.

Instead, its useful display pieces can eventually be extracted into shared
components, for example:

```text
GameGrid
GameCard
MiniGamePreview
```

These could then be reused by:

- current Manage Games drawer;
- SGF Library view;
- OGS Games view;
- analysis result views.

This keeps a coherent visual style without mixing unrelated state models.

## Architecture Direction

A future architecture could introduce a top-level workspace concept:

```text
activeWorkspace: 'home' | 'board' | 'library' | 'ogs' | 'analysis'
```

The exact name and implementation can change, but the concept is useful:

- Home is the navigation hub;
- Board is the classic Sabaki workspace;
- Library is for local SGF browsing;
- OGS is for online game overview;
- Analysis is for queues/results.

This should be introduced gradually. Avoid large rewrites unless a smaller step
would clearly create worse long-term complexity.

## Suggested Implementation Order

1. Add a minimal Home/Dashboard view without changing classic Sabaki behavior.
2. Add a persistent Home button/action.
3. Surface OGS active games on Home using existing OGS state.
4. Extract reusable game-card/grid UI from the Game Chooser where helpful.
5. Add a read-only SGF Library prototype for one configured directory.
6. Add caching/lazy parsing for larger libraries.
7. Integrate analysis results into the library once analysis tooling is ready.

Each step should be small enough to test and review.

## Non-Goals For Now

- Do not rewrite Sabaki from scratch.
- Do not replace `gameTrees` with a universal data model.
- Do not turn the current Manage Games drawer into a file browser.
- Do not add true multi-board live editing until the simpler one-board workflow
  is solid.
- Do not make OGS, library files, and loaded SGF collections share state unless
  there is a clear boundary and migration plan.

## Design Principle

When adding new capabilities, prefer this rule:

> Reuse Sabaki's proven board and SGF systems, but keep new domains separated
> until they deliberately enter the board workspace.

Examples:

- opening a library game loads it into the board workspace;
- selecting an OGS game attaches that game to the board workspace;
- finishing or disconnecting an OGS game leaves a normal SGF on the board;
- analysis results can guide navigation, but should not corrupt SGF editing.

This keeps the app understandable while allowing Seki-Sabaki to become more
ambitious than upstream Sabaki.
