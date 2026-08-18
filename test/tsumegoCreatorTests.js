import assert from 'assert'
import sgf from '@sabaki/sgf'

import {advanceSolution, resolveMove} from '../src/modules/tsumego.js'
import {
  createDraft,
  deleteBranch,
  findMatchingChild,
  getBoard,
  getNextPlayer,
  getNodeComment,
  getNodeResult,
  hasSolutionMoves,
  hasStones,
  playMove,
  serialize,
  setBoardSize,
  setComment,
  setNodeComment,
  setNodeResult,
  setPlayerToMove,
  setSetupStone,
  validateProblem,
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
      assert.strictEqual(getBoard(tree).get([3, 3]), 1)
    })

    it('adds a white stone with AW', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'W')

      assert.deepStrictEqual(tree.root.data.AW, ['dd'])
      assert.strictEqual(tree.root.data.AB, undefined)
      assert.strictEqual(getBoard(tree).get([3, 3]), -1)
    })

    it('replaces a black stone by a white stone on the same vertex', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [3, 3], 'W')

      assert.deepStrictEqual(tree.root.data.AW, ['dd'])
      assert.strictEqual(tree.root.data.AB, undefined)
      assert.strictEqual(getBoard(tree).get([3, 3]), -1)
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
      assert.strictEqual(getBoard(tree).get([3, 3]), 0)
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

    it('renders black and white stones distinctly on different vertices', () => {
      let tree = setSetupStone(createDraft(19), [3, 3], 'B')
      tree = setSetupStone(tree, [4, 4], 'W')

      assert.strictEqual(getBoard(tree).get([3, 3]), 1)
      assert.strictEqual(getBoard(tree).get([4, 4]), -1)
    })

    it('reflects setup changes in descendant boards after solution moves exist', () => {
      let tree = createDraft(9)
      tree = setSetupStone(tree, [3, 3], 'B')
      let move = playMove(tree, tree.root.id, [0, 0])

      // Populate the board cache for the root and the move node.
      assert.strictEqual(getBoard(move.tree, move.nodeId).get([3, 3]), 1)

      tree = setSetupStone(move.tree, [3, 3], 'W')

      // The move node's board must reflect the updated setup stone.
      assert.strictEqual(getBoard(tree, move.nodeId).get([3, 3]), -1)
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

    it('returns the same tree when the comment is unchanged', () => {
      let tree = setComment(createDraft(19), 'Black to play.')
      let same = setComment(tree, 'Black to play.')

      assert.strictEqual(same, tree)
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

  describe('node result annotation', () => {
    it('sets Correct on a move node', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Correct')
    })

    it('sets Wrong on a move node', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'wrong')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Wrong')
    })

    it('clears the result while preserving the human comment', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeComment(result.tree, result.nodeId, 'Black lives.')
      tree = setNodeResult(tree, result.nodeId, 'correct')
      tree = setNodeResult(tree, result.nodeId, null)

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Black lives.')
    })

    it('replaces Correct with Wrong', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      tree = setNodeResult(tree, result.nodeId, 'wrong')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Wrong')
    })

    it('replaces Wrong with Correct', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'wrong')
      tree = setNodeResult(tree, result.nodeId, 'correct')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Correct')
    })

    it('keeps the human comment when changing the result', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeComment(result.tree, result.nodeId, 'Black lives.')
      tree = setNodeResult(tree, result.nodeId, 'correct')

      assert.strictEqual(
        tree.get(result.nodeId).data.C[0],
        'Correct\n\nBlack lives.',
      )
    })

    it('does not accumulate markers when toggling result', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      tree = setNodeResult(tree, result.nodeId, 'wrong')
      tree = setNodeResult(tree, result.nodeId, 'correct')
      tree = setNodeResult(tree, result.nodeId, null)

      assert.strictEqual(tree.get(result.nodeId).data.C, undefined)
    })

    it('removes C entirely when result and comment are both cleared', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      tree = setNodeComment(tree, result.nodeId, '')
      tree = setNodeResult(tree, result.nodeId, null)

      assert.strictEqual(tree.get(result.nodeId).data.C, undefined)
    })

    it('returns the same tree when setting the same result', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      let same = setNodeResult(tree, result.nodeId, 'correct')

      assert.strictEqual(same, tree)
    })

    it('does not annotate the root node', () => {
      let tree = createDraft(19)
      tree = setNodeResult(tree, tree.root.id, 'correct')

      assert.strictEqual(tree.root.data.C, undefined)
    })
  })

  describe('node human comment', () => {
    it('stores a comment without a result marker', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeComment(result.tree, result.nodeId, 'Black lives.')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Black lives.')
    })

    it('preserves the result marker when updating the comment', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      tree = setNodeComment(tree, result.nodeId, 'Black lives.')

      assert.strictEqual(
        tree.get(result.nodeId).data.C[0],
        'Correct\n\nBlack lives.',
      )
    })

    it('updates the comment while keeping the result marker', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'wrong')
      tree = setNodeComment(tree, result.nodeId, 'Old.')
      tree = setNodeComment(tree, result.nodeId, 'New.')

      assert.strictEqual(tree.get(result.nodeId).data.C[0], 'Wrong\n\nNew.')
    })

    it('returns only the human comment from a marked node', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')
      tree = setNodeComment(tree, result.nodeId, 'Black lives.')

      assert.strictEqual(getNodeComment(tree, result.nodeId), 'Black lives.')
    })

    it('returns null result for an unmarked comment', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeComment(result.tree, result.nodeId, 'Just a note.')

      assert.strictEqual(getNodeResult(tree, result.nodeId), null)
      assert.strictEqual(getNodeComment(tree, result.nodeId), 'Just a note.')
    })

    it('returns correct result for a Correct marker', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'correct')

      assert.strictEqual(getNodeResult(tree, result.nodeId), 'correct')
    })

    it('returns wrong result for a Wrong marker', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeResult(result.tree, result.nodeId, 'wrong')

      assert.strictEqual(getNodeResult(tree, result.nodeId), 'wrong')
    })

    it('does not comment the root node', () => {
      let tree = createDraft(19)
      tree = setNodeComment(tree, tree.root.id, 'Note')

      assert.strictEqual(tree.root.data.C, undefined)
    })

    it('returns the same tree when the comment is unchanged', () => {
      let tree = createDraft(19)
      let result = playMove(tree, tree.root.id, [3, 3])
      tree = setNodeComment(result.tree, result.nodeId, 'Black lives.')
      let same = setNodeComment(tree, result.nodeId, 'Black lives.')

      assert.strictEqual(same, tree)
    })
  })

  describe('solver compatibility', () => {
    it('recognizes a single correct solution', () => {
      let tree = createDraft(9)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])
      tree = setNodeResult(r3.tree, r3.nodeId, 'correct')

      let {valid, problem} = validateProblem(tree)
      assert.strictEqual(valid, true)
      assert(problem != null)
      assert.strictEqual(problem.playerToMove, 'B')
    })

    it('marks a wrong variation explicitly', () => {
      let tree = createDraft(9)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])
      tree = setNodeResult(r3.tree, r3.nodeId, 'correct')

      let wrong1 = playMove(tree, tree.root.id, [3, 3])
      assert(wrong1.created)
      let wrong2 = playMove(wrong1.tree, wrong1.nodeId, [4, 4])
      tree = setNodeResult(wrong2.tree, wrong2.nodeId, 'wrong')

      let {valid, problem} = validateProblem(tree)
      assert.strictEqual(valid, true)
      assert(problem != null)
    })

    it('supports multiple correct solutions', () => {
      let tree = createDraft(9)
      let a = playMove(tree, tree.root.id, [0, 0])
      let aEnd = playMove(a.tree, a.nodeId, [1, 1])
      tree = setNodeResult(aEnd.tree, aEnd.nodeId, 'correct')

      let b = playMove(tree, tree.root.id, [2, 2])
      assert(b.created)
      let bEnd = playMove(b.tree, b.nodeId, [3, 3])
      tree = setNodeResult(bEnd.tree, bEnd.nodeId, 'correct')

      let {valid} = validateProblem(tree)
      assert.strictEqual(valid, true)
    })

    it('reports incomplete for a draft without markers', () => {
      let tree = createDraft(9)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])

      let {valid} = validateProblem(r2.tree)
      assert.strictEqual(valid, false)
    })

    it('resolves and advances through a Creator-built solution', () => {
      let tree = createDraft(9)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])
      tree = setNodeResult(r3.tree, r3.nodeId, 'correct')

      let {problem} = validateProblem(tree)
      assert(problem != null)

      let resolved = resolveMove(tree, problem, 'aa')
      assert.strictEqual(resolved.status, 'correct')
      assert.strictEqual(resolved.node.id, r1.nodeId)

      let advanced = advanceSolution(tree, problem, resolved.node)
      assert(advanced != null)
      assert.strictEqual(advanced.automaticMoves.length, 1)
      assert.strictEqual(advanced.automaticMoves[0].id, r2.nodeId)
      assert.strictEqual(advanced.nextPlayerMove.id, r3.nodeId)
    })
  })

  describe('deleteBranch', () => {
    it('does not delete the root', () => {
      let tree = createDraft(19)

      assert.strictEqual(deleteBranch(tree, tree.root.id), null)
      assert.strictEqual(tree.root.data.SZ[0], '19')
    })

    it('deletes a leaf node', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [0, 0])

      let result = deleteBranch(r1.tree, r1.nodeId)
      assert(result != null)
      assert.strictEqual(result.deleted, true)
      assert.strictEqual(result.parentId, tree.root.id)
      assert.strictEqual(result.tree.root.children.length, 0)
    })

    it('deletes a node and all its descendants', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])

      let result = deleteBranch(r3.tree, r2.nodeId)
      assert(result != null)
      assert.strictEqual(result.parentId, r1.nodeId)

      let r1Node = result.tree.get(r1.nodeId)
      assert.strictEqual(r1Node.children.length, 0)
      assert.strictEqual(result.tree.get(r2.nodeId), null)
      assert.strictEqual(result.tree.get(r3.nodeId), null)
    })

    it('keeps sibling variations intact', () => {
      // root
      // └─ B[aa]
      //    ├─ W[bb]
      //    │  └─ B[cc]
      //    └─ W[dd]
      //       └─ B[ee]
      let tree = createDraft(19)
      let baa = playMove(tree, tree.root.id, [0, 0])
      let wbb = playMove(baa.tree, baa.nodeId, [1, 1])
      let bcc = playMove(wbb.tree, wbb.nodeId, [2, 2])
      let wdd = playMove(bcc.tree, baa.nodeId, [3, 3])
      let bee = playMove(wdd.tree, wdd.nodeId, [4, 4])

      let result = deleteBranch(bee.tree, wbb.nodeId)
      assert(result != null)
      assert.strictEqual(result.parentId, baa.nodeId)

      let baaNode = result.tree.get(baa.nodeId)
      assert.strictEqual(baaNode.children.length, 1)
      assert.strictEqual(baaNode.children[0].id, wdd.nodeId)
      assert.strictEqual(result.tree.get(wbb.nodeId), null)
      assert.strictEqual(result.tree.get(bcc.nodeId), null)
      assert.notStrictEqual(result.tree.get(wdd.nodeId), null)
      assert.notStrictEqual(result.tree.get(bee.nodeId), null)
    })

    it('returns a different tree reference', () => {
      let tree = createDraft(19)
      let r1 = playMove(tree, tree.root.id, [0, 0])

      let result = deleteBranch(r1.tree, r1.nodeId)
      assert(result != null)
      assert.notStrictEqual(result.tree, r1.tree)
    })

    it('returns null for an unknown node id', () => {
      let tree = createDraft(19)

      assert.strictEqual(deleteBranch(tree, 'unknown'), null)
    })

    it('invalidates validation when the only correct solution is deleted', () => {
      let tree = createDraft(9)
      let r1 = playMove(tree, tree.root.id, [0, 0])
      let r2 = playMove(r1.tree, r1.nodeId, [1, 1])
      let r3 = playMove(r2.tree, r2.nodeId, [2, 2])
      tree = setNodeResult(r3.tree, r3.nodeId, 'correct')

      assert.strictEqual(validateProblem(tree).valid, true)

      let result = deleteBranch(tree, r1.nodeId)
      assert(result != null)
      assert.strictEqual(validateProblem(result.tree).valid, false)
    })
  })
})
