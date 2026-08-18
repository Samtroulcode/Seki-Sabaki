import assert from 'assert'
import sgf from '@sabaki/sgf'

import {
  createDraft,
  findMatchingChild,
  getBoard,
  getNextPlayer,
  hasSolutionMoves,
  hasStones,
  playMove,
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

  describe('getNextPlayer', () => {
    it('returns B at root when PL[B]', () => {
      assert.strictEqual(
        getNextPlayer(createDraft(19), createDraft(19).root.id),
        'B',
      )
    })

    it('returns W at root when PL[W]', () => {
      let tree = setPlayerToMove(createDraft(19), 'W')

      assert.strictEqual(getNextPlayer(tree, tree.root.id), 'W')
    })

    it('alternates after a Black move', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      assert(result != null)

      assert.strictEqual(getNextPlayer(result.tree, result.nodeId), 'W')
    })

    it('alternates back to Black after White', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      assert(result?.created)
      result = playMove(result.tree, result.nodeId, [4, 4])
      assert(result?.created)

      assert.strictEqual(getNextPlayer(result.tree, result.nodeId), 'B')
    })
  })

  describe('playMove', () => {
    it('creates the first move matching PL[B]', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])

      assert(result != null)
      assert.strictEqual(result.created, true)
      assert.strictEqual(result.tree.root.children.length, 1)
      assert.strictEqual(result.tree.root.children[0].data.B[0], 'dd')
    })

    it('creates the first move matching PL[W]', () => {
      let tree = setPlayerToMove(createDraft(19), 'W')
      let result = playMove(tree, tree.root.id, [3, 3])

      assert(result != null)
      assert.strictEqual(result.created, true)
      assert.strictEqual(result.tree.root.children[0].data.W[0], 'dd')
    })

    it('alternates colors correctly', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [3, 3])
      let r2 = playMove(r1.tree, r1.nodeId, [4, 4])

      assert.strictEqual(r2.tree.get(r2.nodeId).data.W[0], 'ee')
    })

    it('rejects an illegal overwrite', () => {
      let tree = createDraft(19)
      tree = setSetupStone(tree, [3, 3], 'B')

      assert.strictEqual(playMove(tree, tree.root.id, [3, 3]), null)
    })

    it('rejects suicide', () => {
      let tree = createDraft(19)
      tree = setSetupStone(tree, [0, 1], 'W')
      tree = setSetupStone(tree, [1, 0], 'W')
      tree = setSetupStone(tree, [1, 1], 'W')

      assert.strictEqual(playMove(tree, tree.root.id, [0, 0]), null)
    })

    it('rejects illegal ko', () => {
      let tree = createDraft(19)
      // Surround a white stone in the center; one liberty remains at (1,0).
      tree = setSetupStone(tree, [1, 1], 'W')
      tree = setSetupStone(tree, [0, 1], 'B')
      tree = setSetupStone(tree, [1, 2], 'B')
      tree = setSetupStone(tree, [2, 1], 'B')

      // Black captures the white stone by playing its last liberty.
      let capture = playMove(tree, tree.root.id, [1, 0])
      assert(capture?.created)

      // White immediately recapturing on (1,1) is illegal ko.
      assert.strictEqual(playMove(capture.tree, capture.nodeId, [1, 1]), null)
    })
  })

  describe('existing child', () => {
    it('does not duplicate an existing move', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [3, 3])
      let r2 = playMove(r1.tree, r1.nodeId, [4, 4])
      let replay = playMove(r2.tree, r1.nodeId, [4, 4])

      assert(replay != null)
      assert.strictEqual(replay.created, false)
      assert.strictEqual(replay.nodeId, r2.nodeId)
      assert.strictEqual(r2.tree.get(r1.nodeId).children.length, 1)
    })
  })

  describe('variations', () => {
    it('creates a sibling variation under the same parent', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])

      let variation = playMove(r3.tree, r1.nodeId, [3, 3])
      assert(variation?.created)

      let parent = variation.tree.get(r1.nodeId)
      assert.strictEqual(parent.children.length, 2)
      assert(parent.children.some((child) => child.data.W?.[0] === 'bb'))
      assert(parent.children.some((child) => child.data.W?.[0] === 'dd'))
      assert(variation.tree.get(r2.nodeId).children.length, 1)
    })
  })

  describe('hasSolutionMoves', () => {
    it('returns false for a draft with only setup stones', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')

      assert.strictEqual(hasSolutionMoves(tree), false)
    })

    it('returns true after a solution move', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])

      assert.strictEqual(hasSolutionMoves(result.tree), true)
    })

    it('detects moves inside variations, not only on the main line', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])

      // Go back to the first move and create a sibling variation.
      let variation = playMove(r3.tree, r1.nodeId, [3, 3])
      assert(variation?.created)

      assert.strictEqual(hasSolutionMoves(variation.tree), true)
    })
  })
})
