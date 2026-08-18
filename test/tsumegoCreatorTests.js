import assert from 'assert'
import sgf from '@sabaki/sgf'

import {
  createDraft,
  getBoard,
  hasStones,
  serialize,
  setBoardSize,
  setComment,
  setPlayerToMove,
  setSetupStone,
} from '../src/modules/tsumegocreator.js'

describe('tsumegoCreator', () => {
  describe('createDraft', () => {
    it('creates a 19x19 draft with GM, SZ and PL on the root', () => {
      let tree = createDraft(19)

      assert.strictEqual(tree.root.data.GM[0], '1')
      assert.strictEqual(tree.root.data.SZ[0], '19')
      assert.strictEqual(tree.root.data.PL[0], 'B')
      assert.strictEqual(tree.root.children.length, 0)
    })

    it('defaults to 19 when no size is given', () => {
      let tree = createDraft()

      assert.strictEqual(tree.root.data.SZ[0], '19')
    })

    it('falls back to 19 for unsupported sizes', () => {
      let tree = createDraft(7)

      assert.strictEqual(tree.root.data.SZ[0], '19')
    })

    it('supports 9x9 and 13x13', () => {
      assert.strictEqual(createDraft(9).root.data.SZ[0], '9')
      assert.strictEqual(createDraft(13).root.data.SZ[0], '13')
    })
  })

  describe('setBoardSize', () => {
    it('updates SZ', () => {
      let tree = setBoardSize(createDraft(19), 9)

      assert.strictEqual(tree.root.data.SZ[0], '9')
    })

    it('clears all setup stones when resizing', () => {
      let tree = createDraft(19)
      tree = setSetupStone(tree, [3, 3], 'B')
      tree = setSetupStone(tree, [4, 4], 'W')
      tree = setBoardSize(tree, 13)

      assert.strictEqual(tree.root.data.AB, undefined)
      assert.strictEqual(tree.root.data.AW, undefined)
      assert.strictEqual(tree.root.data.SZ[0], '13')
    })

    it('ignores unsupported sizes', () => {
      let tree = setBoardSize(createDraft(19), 25)

      assert.strictEqual(tree.root.data.SZ[0], '19')
    })
  })

  describe('setSetupStone', () => {
    it('adds a black stone with AB', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')

      assert.deepStrictEqual(tree.root.data.AB, ['dd'])
      assert.strictEqual(tree.root.data.AW, undefined)
    })

    it('adds a white stone with AW', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'W')

      assert.deepStrictEqual(tree.root.data.AW, ['dd'])
      assert.strictEqual(tree.root.data.AB, undefined)
    })

    it('replaces a black stone by a white stone on the same vertex', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [3, 3], 'W')

      assert.deepStrictEqual(tree.root.data.AW, ['dd'])
      assert.strictEqual(tree.root.data.AB, undefined)
    })

    it('replaces a white stone by a black stone on the same vertex', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'W')
      tree = setSetupStone(tree, [3, 3], 'B')

      assert.deepStrictEqual(tree.root.data.AB, ['dd'])
      assert.strictEqual(tree.root.data.AW, undefined)
    })

    it('erases a stone', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [3, 3], null)

      assert.strictEqual(tree.root.data.AB, undefined)
      assert.strictEqual(tree.root.data.AW, undefined)
    })

    it('keeps other stones when erasing one', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [4, 4], 'B')
      tree = setSetupStone(tree, [3, 3], null)

      assert.deepStrictEqual(tree.root.data.AB, ['ee'])
    })

    it('does not duplicate a stone', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [3, 3], 'B')

      assert.deepStrictEqual(tree.root.data.AB, ['dd'])
    })

    it('ignores invalid vertices', () => {
      let tree = setSetupStone(createDraft(19), [-1, -1], 'B')

      assert.strictEqual(tree.root.data.AB, undefined)
    })
  })

  describe('setPlayerToMove', () => {
    it('sets PL[B]', () => {
      let tree = setPlayerToMove(createDraft(19), 'B')

      assert.strictEqual(tree.root.data.PL[0], 'B')
    })

    it('sets PL[W]', () => {
      let tree = setPlayerToMove(createDraft(19), 'W')

      assert.strictEqual(tree.root.data.PL[0], 'W')
    })

    it('ignores invalid colors', () => {
      let tree = setPlayerToMove(createDraft(19), 'X')

      assert.strictEqual(tree.root.data.PL[0], 'B')
    })
  })

  describe('setComment', () => {
    it('sets C on the root', () => {
      let tree = setComment(createDraft(19), 'Black to play and live.')

      assert.strictEqual(tree.root.data.C[0], 'Black to play and live.')
    })

    it('removes C when the comment is empty', () => {
      let tree = setComment(createDraft(19), 'Black to play.')
      tree = setComment(tree, '')

      assert.strictEqual(tree.root.data.C, undefined)
    })

    it('removes C when given null', () => {
      let tree = setComment(createDraft(19), 'Black to play.')
      tree = setComment(tree, null)

      assert.strictEqual(tree.root.data.C, undefined)
    })
  })

  describe('no moves during setup', () => {
    it('does not create B or W move properties', () => {
      let tree = createDraft(19)
      tree = setSetupStone(tree, [3, 3], 'B')
      tree = setSetupStone(tree, [4, 4], 'W')
      tree = setPlayerToMove(tree, 'W')
      tree = setComment(tree, 'Comment')

      assert.strictEqual(tree.root.data.B, undefined)
      assert.strictEqual(tree.root.data.W, undefined)
      assert.strictEqual(tree.root.children.length, 0)
    })

    it('serializes setup stones on the root, not as moves', () => {
      let tree = createDraft(19)
      tree = setSetupStone(tree, [0, 0], 'B')
      tree = setSetupStone(tree, [1, 1], 'W')
      let output = serialize(tree)

      assert(output.includes('AB[aa]'))
      assert(output.includes('AW[bb]'))
      assert(!output.includes(';B['))
      assert(!output.includes(';W['))
    })
  })

  describe('getBoard', () => {
    it('returns a board matching the draft size', () => {
      let tree = createDraft(13)
      let board = getBoard(tree)

      assert.strictEqual(board.width, 13)
      assert.strictEqual(board.height, 13)
    })

    it('reflects setup stones', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      let board = getBoard(tree)

      assert.strictEqual(board.get([3, 3]), 1)
    })
  })

  describe('hasStones', () => {
    it('returns false for an empty draft', () => {
      assert.strictEqual(hasStones(createDraft(19)), false)
    })

    it('returns true after adding a stone', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')

      assert.strictEqual(hasStones(tree), true)
    })

    it('returns false after erasing the last stone', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [3, 3], null)

      assert.strictEqual(hasStones(tree), false)
    })
  })
})
