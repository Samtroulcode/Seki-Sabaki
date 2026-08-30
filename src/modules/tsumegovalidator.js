// Structured validation for Tsumego SGF content.
//
// `analyzeProblem` remains the source of truth for whether a problem is
// playable; this module only adds structured diagnostics around it so the UI
// can explain why a file cannot be used as a Tsumego. The validator never
// declares invalid a problem that `analyzeProblem` accepts, and it never
// invents a more precise reason than the engine gives us (e.g. it does not
// require a "Correct" marker because the engine also supports TE/BM and other
// conventions).

import * as sgfFileFormat from './fileformats/sgf.js'
import {interpretProblem} from './tsumego.js'

const MESSAGES = {
  NO_GAME_TREE: 'No SGF game tree was found.',
  NO_MOVES: 'The SGF does not contain a solution sequence.',
  NO_PLAYABLE_SOLUTION: 'No playable Tsumego solution could be detected.',
  INVALID_SGF: 'This file is not a valid SGF.',
  NO_PROBLEM_STATEMENT: 'This problem has no problem statement.',
  PLAYER_TO_MOVE_INFERRED:
    'The player to move is inferred because PL is not set explicitly.',
  MULTIPLE_GAME_TREES:
    'This SGF contains multiple game trees; only the first one is used.',
}

function diagnostic(code) {
  return {code, message: MESSAGES[code]}
}

function hasMoveNode(tree) {
  for (let node of tree.listNodes()) {
    if (node.data != null && (node.data.B != null || node.data.W != null)) {
      return true
    }
  }
  return false
}

// Validates an already-parsed GameTree. Returns `{valid, problem,
// interpretation, errors, warnings}` where `valid` mirrors `interpretProblem`
// exactly: a problem the engine accepts is never declared invalid.
export function validateTsumegoTree(gameTree, options = {}) {
  let {allowTeFallback = true, allowMainLineFallback = true} = options
  let errors = []
  let warnings = []

  if (gameTree == null) {
    return {
      valid: false,
      problem: null,
      interpretation: {kind: 'unsupported'},
      errors: [diagnostic('NO_GAME_TREE')],
      warnings,
    }
  }

  let interpretation = interpretProblem(gameTree, {
    allowTeFallback,
    allowMainLineFallback,
  })
  let valid = interpretation.kind !== 'unsupported'
  let problem =
    interpretation.kind === 'move-sequence' ? interpretation.problem : null

  if (!valid) {
    let hasMoves = hasMoveNode(gameTree)
    if (!hasMoves) errors.push(diagnostic('NO_MOVES'))
    else errors.push(diagnostic('NO_PLAYABLE_SOLUTION'))
  } else {
    let statement = gameTree.root.data?.C?.[0]
    if (statement == null || String(statement).trim() === '') {
      warnings.push(diagnostic('NO_PROBLEM_STATEMENT'))
    }

    // PL is only meaningful on the position the engine picked as the start.
    // Only warn when a player color was actually inferred without explicit PL.
    // Only move-sequence and point-selection interpretations have a player.
    if (
      interpretation.kind === 'move-sequence' ||
      interpretation.kind === 'point-selection'
    ) {
      let playerToMove = null
      if (interpretation.kind === 'move-sequence') {
        playerToMove = interpretation.problem.playerToMove
      } else if (interpretation.kind === 'point-selection') {
        playerToMove = interpretation.playerToMove
      }
      if (playerToMove != null) {
        let startNodeId =
          interpretation.kind === 'move-sequence'
            ? interpretation.problem.startNodeId
            : interpretation.startNodeId
        let startNode = gameTree.get(startNodeId)
        let pl = startNode?.data?.PL?.[0]
        if (pl !== 'B' && pl !== 'W') {
          warnings.push(diagnostic('PLAYER_TO_MOVE_INFERRED'))
        }
      }
    }
  }

  return {valid, problem, interpretation, errors, warnings}
}

// Parses SGF content with the same parser the Tsumego panel uses and validates
// the first game tree, mirroring the reader's `trees[0]` behavior. Returns
// `{valid, gameTree, problem, interpretation, errors, warnings}`.
export function validateTsumegoContent(content, options = {}) {
  let warnings = []

  let trees
  try {
    trees = sgfFileFormat.parse(content)
  } catch (err) {
    return {
      valid: false,
      gameTree: null,
      problem: null,
      interpretation: {kind: 'unsupported'},
      errors: [diagnostic('INVALID_SGF')],
      warnings,
    }
  }

  if (trees == null || trees.length === 0) {
    return {
      valid: false,
      gameTree: null,
      problem: null,
      interpretation: {kind: 'unsupported'},
      errors: [diagnostic('NO_GAME_TREE')],
      warnings,
    }
  }

  if (trees.length > 1) warnings.push(diagnostic('MULTIPLE_GAME_TREES'))

  let gameTree = trees[0]
  let result = validateTsumegoTree(gameTree, options)
  return {
    valid: result.valid,
    gameTree,
    problem: result.problem,
    interpretation: result.interpretation,
    errors: result.errors,
    warnings: [...warnings, ...result.warnings],
  }
}
