import assert from 'assert'

import {
  validateTsumegoContent,
  validateTsumegoTree,
} from '../src/modules/tsumegovalidator.js'
import {
  advanceSolution,
  classifyMove,
  resolveMove,
} from '../src/modules/tsumego.js'

const REAL_PROBLEM =
  '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))'
const REAL_PROBLEM_NO_STATEMENT =
  '(;GM[1]SZ[9]PL[B]AB[aa][bb](;B[cc]C[Correct];W[dd]))'
const REAL_PROBLEM_NO_PL =
  '(;GM[1]SZ[9]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))'
const SETUP_ONLY = '(;GM[1]SZ[9]AB[aa][bb]AW[cc]PL[B])'
const MOVES_NO_MARKER = '(;GM[1]SZ[9]PL[B];B[aa];W[bb])'
const GOWRITE_NEGATIVE_BRANCH_PROBLEM = `(;
AP[GOWrite:2.0.07]FF[4]SZ[13]GM[1]FG[259:]GN[ ]C[Problem 13. Black to play.
How can Black capture some white stones?]AW[gd][ge][hf][ec][dd][fg][gf][fd][ee]PB[ ]PM[1]PW[ ]AB[if][fc][ff][hg][gg][he][hd][fe][gc]
(;B[ed]C[Black can capture five stones by playing at 1.])
(;B[ef]C[Wrong Answer
If Black plays 1...];C[...White plays at 2 and his stones are saved.]W[ed]))`

function codes(result) {
  return result.errors.map((error) => error.code)
}

function warningCodes(result) {
  return result.warnings.map((warning) => warning.code)
}

describe('tsumegoValidator', () => {
  describe('validateTsumegoTree', () => {
    it('reports NO_GAME_TREE for a null tree', () => {
      let result = validateTsumegoTree(null)

      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.problem, null)
      assert.deepStrictEqual(codes(result), ['NO_GAME_TREE'])
      assert.strictEqual(
        result.errors[0].message,
        'No SGF game tree was found.',
      )
    })

    it('reports NO_MOVES for a setup-only tree', () => {
      let result = validateTsumegoContent(SETUP_ONLY)

      assert.strictEqual(result.valid, false)
      assert.deepStrictEqual(codes(result), ['NO_MOVES'])
    })

    it('reports NO_PLAYABLE_SOLUTION when moves exist but no problem is detected', () => {
      let result = validateTsumegoContent(MOVES_NO_MARKER)

      assert.strictEqual(result.valid, false)
      assert.deepStrictEqual(codes(result), ['NO_PLAYABLE_SOLUTION'])
    })

    it('accepts a real problem and returns the problem object', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert.strictEqual(result.valid, true)
      assert(result.problem != null)
      assert.strictEqual(result.problem.playerToMove, 'B')
      assert.deepStrictEqual(codes(result), [])
    })

    it('accepts a GoWrite problem that marks only the losing branch', () => {
      let result = validateTsumegoContent(GOWRITE_NEGATIVE_BRANCH_PROBLEM)

      assert.strictEqual(result.valid, true)
      assert(result.problem != null)
      assert.strictEqual(result.problem.playerToMove, 'B')
      assert.strictEqual(result.problem.firstMove.data.B[0], 'ed')
      assert.strictEqual(
        classifyMove(result.gameTree, result.problem, 'ed'),
        'correct',
      )
      assert.strictEqual(
        resolveMove(result.gameTree, result.problem, 'ed').status,
        'correct',
      )
      assert.strictEqual(
        classifyMove(result.gameTree, result.problem, 'ef'),
        'wrong',
      )
      assert.strictEqual(
        resolveMove(result.gameTree, result.problem, 'ef').status,
        'wrong',
      )
      assert.strictEqual(
        advanceSolution(
          result.gameTree,
          result.problem,
          result.problem.firstMove,
        ).solved,
        true,
      )
      assert.deepStrictEqual(codes(result), [])
    })

    it('never declares invalid a problem that analyzeProblem accepts', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.errors.length, 0)
    })

    it('warns NO_PROBLEM_STATEMENT without invalidating a valid problem', () => {
      let result = validateTsumegoContent(REAL_PROBLEM_NO_STATEMENT)

      assert.strictEqual(result.valid, true)
      assert.deepStrictEqual(codes(result), [])
      assert.deepStrictEqual(warningCodes(result), ['NO_PROBLEM_STATEMENT'])
    })

    it('warns PLAYER_TO_MOVE_INFERRED when PL is absent but the problem is playable', () => {
      let result = validateTsumegoContent(REAL_PROBLEM_NO_PL)

      assert.strictEqual(result.valid, true)
      assert.deepStrictEqual(warningCodes(result), ['PLAYER_TO_MOVE_INFERRED'])
    })

    it('does not warn PLAYER_TO_MOVE_INFERRED when PL is set', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert.deepStrictEqual(warningCodes(result), [])
    })

    it('does not warn NO_PROBLEM_STATEMENT when the root has a statement', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert.deepStrictEqual(warningCodes(result), [])
    })

    it('keeps a valid problem valid even when warnings are present', () => {
      let result = validateTsumegoContent(REAL_PROBLEM_NO_STATEMENT)

      assert.strictEqual(result.valid, true)
      assert(result.problem != null)
    })
  })

  describe('validateTsumegoContent', () => {
    it('reports INVALID_SGF for syntactically broken content', () => {
      let result = validateTsumegoContent('(;GM[1]SZ[9]AB[aa')

      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.gameTree, null)
      assert.deepStrictEqual(codes(result), ['INVALID_SGF'])
      assert.strictEqual(
        result.errors[0].message,
        'This file is not a valid SGF.',
      )
    })

    it('reports NO_GAME_TREE for content that parses to zero trees', () => {
      let result = validateTsumegoContent('')

      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.gameTree, null)
      assert.deepStrictEqual(codes(result), ['NO_GAME_TREE'])
    })

    it('returns the parsed game tree for valid content', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert(result.gameTree != null)
      assert.strictEqual(result.gameTree.root.data.SZ[0], '9')
    })

    it('warns MULTIPLE_GAME_TREES and uses the first tree', () => {
      let content = `${REAL_PROBLEM}(;GM[1]SZ[9])`
      let result = validateTsumegoContent(content)

      assert.strictEqual(result.valid, true)
      assert.deepStrictEqual(warningCodes(result), ['MULTIPLE_GAME_TREES'])
      assert.strictEqual(result.gameTree.root.data.C[0], 'Black to play.')
    })

    it('does not warn MULTIPLE_GAME_TREES for a single tree', () => {
      let result = validateTsumegoContent(REAL_PROBLEM)

      assert.deepStrictEqual(warningCodes(result), [])
    })

    it('does not reject a valid problem because of a warning', () => {
      let content = `${REAL_PROBLEM_NO_STATEMENT}(;GM[1]SZ[9])`
      let result = validateTsumegoContent(content)

      assert.strictEqual(result.valid, true)
      assert(result.problem != null)
    })
  })

  describe('SZ tolerance', () => {
    it('accepts a playable problem on a non-9/13/19 board', () => {
      // 5x5 board with a marked solution: the engine understands it, so the
      // validator must not reject it just because SZ is unusual.
      let content = '(;GM[1]SZ[5]PL[B]AB[aa][bb](;B[cc]C[Correct];W[dd]))'
      let result = validateTsumegoContent(content)

      assert.strictEqual(result.valid, true)
      assert(result.problem != null)
    })
  })
})
