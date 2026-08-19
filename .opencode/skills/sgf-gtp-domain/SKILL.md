---
name: sgf-gtp-domain
description:
  Use for SGF, GTP, engine analysis, gametree, Go board coordinates, winrate,
  scoreLead, and engine transcript work.
license: MIT
compatibility: opencode
metadata:
  domain: go-engine-analysis
---

# SGF And GTP Domain Rules

Use this skill for any change touching SGF, GTP, engines, game trees, board
coordinates, scoring, winrate, or analysis overlays.

## Sensitive Files

- `src/modules/analysis.js`: parses engine analysis output and builds heatmap
  labels.
- `src/modules/enginesyncer.js`: manages GTP process sync, commands, and
  analysis streaming.
- `src/modules/sabaki.js`: attaches engines, writes SGF properties, controls app
  state.
- `src/modules/gametree.js`: game tree creation and mutation.
- `src/modules/fileformats/*`: SGF, NGF, GIB, UGF parsing and serialization.
- `src/modules/gobantransformer.js`: board transformations and coordinate
  mapping.

## Anti-Hallucination Rules

- Do not invent SGF property semantics.
- Do not invent GTP command output dialects.
- Verify assumptions from local tests, recorded transcripts, `@sabaki/*` package
  behavior, or documented specs.
- Preserve existing perspective conventions. For example, analysis values
  written to SGF may be normalized to Black's perspective; verify the code path
  before changing it.

## Test Strategy

- Parser/domain logic should get Mocha tests.
- Engine behavior should use fake engines under `test/engines/` or golden
  transcripts under `test/resources/engine-transcripts/`.
- Avoid depending on live engines, GPUs, or network services in automated tests.
- Regenerate transcripts only when intentionally updating engine fixtures.

## Review Checklist

- Coordinate transforms are correct for board transformations.
- Pass/resign and invalid move cases are considered.
- Winrate and score lead signs are pinned by tests.
- SGF serialization remains compatible with existing files.
- Engine child processes are detached or cleaned up in failure paths.
