import assert from 'assert'

import * as gametree from '../src/modules/gametree.js'
import {analyzeProblem, classifyMove} from '../src/modules/tsumego.js'

// Build a tree from a list of moves. Each entry is `[color, vertex, comment]`
// where `comment` is optional. The first entry is appended to the root.
function buildTree(moves) {
  return gametree.new().mutate((draft) => {
    let parentId = draft.root.id
    for (let [color, vertex, comment] of moves) {
      let data = {[color]: [vertex]}
      if (comment != null) data.C = [comment]
      parentId = draft.appendNode(parentId, data)
    }
  })
}

describe('analyzeProblem', () => {
  it('detects a problem that starts directly at the root', () => {
    let tree = buildTree([['B', 'gl', 'Correct Answer']])

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, 'B')
    assert.strictEqual(result.firstMove.data.B[0], 'gl')
  })

  it('detects a problem with a preliminary move (the documented example)', () => {
    // ROOT -> W[gm] -> B[gl] C[Correct Answer]
    let tree = buildTree([
      ['W', 'gm'],
      ['B', 'gl', 'Correct Answer'],
    ])

    let result = analyzeProblem(tree)
    assert(result != null)
    let startNode = tree.get(result.startNodeId)
    assert.strictEqual(startNode.data.W[0], 'gm')
    assert.strictEqual(result.playerToMove, 'B')
    assert.strictEqual(result.firstMove.data.B[0], 'gl')
  })

  it('returns null when no solution marker is identifiable', () => {
    let tree = buildTree([
      ['W', 'gm'],
      ['B', 'gl'],
    ])

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('returns null when the only marker sits on a setup node without a move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'AB', ['dd'])
      draft.updateProperty(draft.root.id, 'C', ['Correct Answer'])
      draft.appendNode(draft.root.id, {B: ['gl']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('returns null when the first correct move is the root itself', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'B', ['gl'])
      draft.updateProperty(draft.root.id, 'C', ['Correct Answer'])
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('ignores a root move marker and uses a deeper valid candidate', () => {
    // A move + marker on the root has no parent, so it must not poison the
    // analysis when a valid deeper candidate exists.
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'B', ['gl'])
      draft.updateProperty(draft.root.id, 'C', ['Correct Answer'])
      draft.appendNode(draft.root.id, {W: ['dd'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, 'W')
    assert.strictEqual(result.firstMove.data.W[0], 'dd')
  })

  it('does not throw when options is null', () => {
    let tree = buildTree([['B', 'gl', 'Correct Answer']])

    let result = analyzeProblem(tree, null)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('matches "Correct Answer" case-insensitively', () => {
    let tree = buildTree([['B', 'gl', 'correct ANSWER']])

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('does not match a comment that does not contain the phrase', () => {
    let tree = buildTree([['B', 'gl', 'This is a wrong answer']])

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('reads the marker from any value of a multi-value comment', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['first value', 'Correct Answer'],
      })
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('prefers the main line when two branches share the shallowest marker', () => {
    // Both branches carry a "Correct Answer" first move at the same depth; the
    // main line (first child) must win.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'gl')
  })

  it('keeps the first-move color when a matching PL is on the starting position', () => {
    // FF[4] forbids mixing a move (B/W) and a setup property (PL) in one node,
    // so the starting position is a setup node carrying only PL.
    let tree = gametree.new().mutate((draft) => {
      let setup = draft.appendNode(draft.root.id, {PL: ['B']})
      draft.appendNode(setup, {B: ['gl'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('returns null when PL on the starting position contradicts the first move', () => {
    let tree = gametree.new().mutate((draft) => {
      let setup = draft.appendNode(draft.root.id, {PL: ['W']})
      draft.appendNode(setup, {B: ['gl'], C: ['Correct Answer']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('ignores an invalid PL on the starting position', () => {
    let tree = gametree.new().mutate((draft) => {
      let setup = draft.appendNode(draft.root.id, {PL: ['X']})
      draft.appendNode(setup, {B: ['gl'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('ignores TE markers unless the tsumego fallback is enabled', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], TE: ['1']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
    let result = analyzeProblem(tree, {allowTeFallback: true})
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('prefers comment markers over TE markers when both exist', () => {
    let tree = gametree.new().mutate((draft) => {
      let te = draft.appendNode(draft.root.id, {B: ['dd'], TE: ['1']})
      draft.appendNode(te, {W: ['gl'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree, {allowTeFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.W[0], 'gl')
    assert.strictEqual(result.playerToMove, 'W')
  })
})

describe('classifyMove', () => {
  it('classifies the first correct move as correct', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'gl'), 'correct')
  })

  it('classifies the first correct move after a preliminary move', () => {
    // ROOT -> W[gm] -> B[gl] C[Correct Answer]
    let tree = gametree.new().mutate((draft) => {
      let setup = draft.appendNode(draft.root.id, {W: ['gm']})
      draft.appendNode(setup, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'gl'), 'correct')
  })

  it('classifies a documented Wrong Answer as wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('matches Wrong Answer case-insensitively', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['wrong ANSWER']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('reads Wrong Answer from any value of a multi-value comment', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['first', 'Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('classifies a BM-marked variation as wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], BM: ['1']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('classifies a move absent from the SGF as absent', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'ee'), 'absent')
  })

  it('does not accept the right intersection with the wrong color', () => {
    // The intersection is documented, but only for White; the user plays as
    // Black (playerToMove), so the move must not be accepted as that variation.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {W: ['dd'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'absent')
  })

  it('ignores a wrong-color variation at the correct intersection', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {W: ['gl'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'gl'), 'correct')
  })

  it('finds a variation through an intermediate node without a move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      let setup = draft.appendNode(draft.root.id, {C: ['setup']})
      draft.appendNode(setup, {B: ['dd'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('finds variations that branch at an intermediate node without a move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      let setup = draft.appendNode(draft.root.id, {C: ['setup']})
      draft.appendNode(setup, {B: ['dd'], C: ['Wrong Answer']})
      draft.appendNode(setup, {B: ['ee'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'ee'), 'wrong')
  })

  it('returns null for a matching variation that is not clearly marked', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), null)
  })

  it('returns null when a vertex mixes marked and unmarked variations', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['dd']}, {disableMerging: true})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), null)
  })

  it('prefers the correct answer over a BM-marked branch at the same vertex', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(
        draft.root.id,
        {B: ['gl'], BM: ['1']},
        {disableMerging: true},
      )
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'gl'), 'correct')
  })

  it('returns null for an invalid vertex', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'blah'), null)
    assert.strictEqual(classifyMove(tree, problem, 'd'), null)
    assert.strictEqual(classifyMove(tree, problem, 'a1'), null)
  })

  it('returns null for a pass', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, ''), null)
  })

  it('returns null when problem is null', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })

    assert.strictEqual(classifyMove(tree, null, 'gl'), null)
  })

  it('returns null when the tree no longer contains the starting position', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)
    let otherTree = gametree.new()

    assert.strictEqual(classifyMove(otherTree, problem, 'gl'), null)
    assert.strictEqual(classifyMove(otherTree, problem, 'dd'), null)
  })

  it('does not return correct when the tree lacks the first correct move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    // A tree whose root is the starting position but which has no variations.
    let otherTree = gametree.new({
      root: {
        id: problem.startNodeId,
        data: {},
        parentId: null,
        children: [],
      },
    })

    assert.strictEqual(classifyMove(otherTree, problem, 'gl'), 'absent')
  })

  it('returns null for a non-string vertex', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, null), null)
    assert.strictEqual(classifyMove(tree, problem, undefined), null)
  })

  it('does not match a move that is not a first move from the starting position', () => {
    // The move exists deeper in the tree, but only the next moves from the
    // starting position are candidates.
    let tree = gametree.new().mutate((draft) => {
      let correct = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(correct, {W: ['dd']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'absent')
  })

  it('does not throw on a candidate with an empty move property', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: []}, {disableMerging: true})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'absent')
  })
})
