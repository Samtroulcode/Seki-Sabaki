import assert from 'assert'

import * as gametree from '../src/modules/gametree.js'
import {
  advanceSolution,
  analyzeProblem,
  classifyMove,
} from '../src/modules/tsumego.js'

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

  it('does not treat a comment without a positive marker as a problem', () => {
    let tree = buildTree([['B', 'gl', 'This is a ko fight']])

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

  it('finds the first solver move when the marker sits several moves later', () => {
    // GoGameGuru: B[rs] -> W[rr] -> B[ns] C[Correct]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['rs']})
      let w1 = draft.appendNode(b1, {W: ['rr']})
      draft.appendNode(w1, {B: ['ns'], C: ['Correct']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, 'B')
    assert.strictEqual(result.firstMove.data.B[0], 'rs')
  })

  it('accepts several correct continuations in the same branch', () => {
    // GoGameGuru: B[rs] -> W[rr] with B[ns] C[Correct] and B[ps] C[Also correct...]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['rs']})
      let w1 = draft.appendNode(b1, {W: ['rr']})
      draft.appendNode(w1, {B: ['ns'], C: ['Correct']})
      draft.appendNode(w1, {B: ['ps'], C: ['Also correct...']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'rs')
  })

  it('reads a positive result from a node name containing 正解', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['ba'], N: ['正解图']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'ba')
  })

  it('finds the first solver move when the marker sits on a setup node', () => {
    // B[rs] -> W[rr] -> C[Correct] (marker on a non-move node)
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['rs']})
      let w1 = draft.appendNode(b1, {W: ['rr']})
      draft.appendNode(w1, {C: ['Correct']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'rs')
  })

  it('does not throw on a tree containing a data-less node', () => {
    let tree = gametree.new({
      root: {id: 'r', data: null, parentId: null, children: []},
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('does not throw when the starting position has no data', () => {
    // The marked move's parent (the starting position) is a data-less node.
    let tree = gametree.new({
      root: {
        id: 'r',
        data: null,
        parentId: null,
        children: [
          {
            id: 'm',
            data: {B: ['gl'], C: ['Correct Answer']},
            parentId: 'r',
            children: [],
          },
        ],
      },
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, 'r')
  })

  it('does not treat 不正解 as a positive marker', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], N: ['不正解']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('classifies a branch named 不正解 as wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], N: ['不正解']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('returns null when the marker sits on a setup node with no solver move', () => {
    // B[rs] C[Correct]: the last move is Black, so the solver would be White,
    // but the path carries no White move.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['rs']})
      draft.appendNode(b1, {C: ['Correct']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
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

  it('classifies a branch as wrong when the marker sits on a descendant', () => {
    // Cho L&D: B[ca] -> W[ba] C[Wrong.]
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['ba'], C: ['Correct.']})
      let wrong = draft.appendNode(draft.root.id, {B: ['ca']})
      draft.appendNode(wrong, {W: ['ba'], C: ['Wrong.']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'ca'), 'wrong')
  })

  it('classifies a branch from a node name containing 正解 or 失败', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['ba'], N: ['正解图']})
      draft.appendNode(draft.root.id, {B: ['ca'], N: ['失败图1']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'ba'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'ca'), 'wrong')
  })

  it('prefers a positive marker over a negative one in the same branch', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      let wrong = draft.appendNode(draft.root.id, {B: ['dd']})
      draft.appendNode(wrong, {W: ['xx'], C: ['Wrong.']})
      draft.appendNode(wrong, {W: ['yy'], C: ['Correct.']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'correct')
  })

  it('treats a comment containing both words as positive', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {
        B: ['dd'],
        C: ['Correct me if I am wrong'],
      })
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'correct')
  })

  it('does not treat a BM on a descendant as wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      let wrong = draft.appendNode(draft.root.id, {B: ['dd']})
      draft.appendNode(wrong, {W: ['xx'], BM: ['1']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), null)
  })
})

describe('advanceSolution', () => {
  it('advances B correct -> W automatic -> next B expected', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hl')
  })

  it('advances through the documented longer solution line step by step', () => {
    // B[gl] -> W[hm] -> B[hl] -> W[im] -> B[il]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let w1 = draft.appendNode(b1, {W: ['hm']})
      let b2 = draft.appendNode(w1, {B: ['hl']})
      let w2 = draft.appendNode(b2, {W: ['im']})
      draft.appendNode(w2, {B: ['il']})
    })
    let problem = analyzeProblem(tree)

    // Each call stops just before the player's next move, so the full line is
    // walked by feeding the returned next move back in.
    let first = advanceSolution(tree, problem, problem.firstMove)
    assert(first != null)
    assert.strictEqual(first.solved, false)
    assert.strictEqual(first.automaticMoves.length, 1)
    assert.strictEqual(first.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(first.nextPlayerMove.data.B[0], 'hl')

    let second = advanceSolution(tree, problem, first.nextPlayerMove)
    assert(second != null)
    assert.strictEqual(second.solved, false)
    assert.strictEqual(second.automaticMoves.length, 1)
    assert.strictEqual(second.automaticMoves[0].data.W[0], 'im')
    assert.strictEqual(second.nextPlayerMove.data.B[0], 'il')

    let third = advanceSolution(tree, problem, second.nextPlayerMove)
    assert(third != null)
    assert.strictEqual(third.solved, true)
    assert.deepStrictEqual(third.automaticMoves, [])
    assert.strictEqual(third.nextPlayerMove, null)
  })

  it('traverses non-move nodes around the opponent response', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let nm1 = draft.appendNode(b1, {C: ['setup']})
      let w1 = draft.appendNode(nm1, {W: ['hm']})
      let nm2 = draft.appendNode(w1, {C: ['setup']})
      draft.appendNode(nm2, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hl')
  })

  it('reports solved when the solution ends immediately after the correct move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, true)
    assert.deepStrictEqual(result.automaticMoves, [])
    assert.strictEqual(result.nextPlayerMove, null)
  })

  it('reports solved after a last opponent response', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {W: ['hm']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, true)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove, null)
  })

  it('reports solved when the line ends on a trailing non-move node', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {C: ['setup']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, true)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove, null)
  })

  it('never follows a sibling branch instead of the canonical continuation', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
      let sibling = draft.appendNode(b1, {W: ['xx']})
      draft.appendNode(sibling, {B: ['yy']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hl')
  })

  it('returns null for a null problem or node', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(advanceSolution(tree, null, problem.firstMove), null)
    assert.strictEqual(advanceSolution(tree, problem, null), null)
  })

  it('returns null when the node is not a move', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {C: ['setup']})
    })
    let problem = analyzeProblem(tree)
    let setupNode = tree.get(problem.firstMove.children[0].id)

    assert.strictEqual(advanceSolution(tree, problem, setupNode), null)
  })

  it('returns null when the node has no data', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)
    let dataLessNode = {
      id: problem.firstMove.id,
      data: null,
      parentId: null,
      children: [],
    }

    assert.strictEqual(advanceSolution(tree, problem, dataLessNode), null)
  })

  it('walks the tree node, not a stale passed-in reference', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    // The passed node carries valid move data but stale (empty) children; the
    // walk must re-fetch the tree's own node and follow its children.
    let staleNode = {
      id: problem.firstMove.id,
      data: {B: ['gl']},
      parentId: null,
      children: [],
    }

    let result = advanceSolution(tree, problem, staleNode)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hl')
  })

  it('returns null when the node is missing from the tree', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
    })
    let problem = analyzeProblem(tree)
    let otherTree = gametree.new()

    assert.strictEqual(
      advanceSolution(otherTree, problem, problem.firstMove),
      null,
    )
  })

  it('returns null when the node has the wrong color', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {W: ['hm']})
    })
    let problem = analyzeProblem(tree)
    let opponentNode = tree.get(problem.firstMove.children[0].id)

    assert.strictEqual(advanceSolution(tree, problem, opponentNode), null)
  })

  it('returns null when the continuation contains a pass', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {W: ['']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(advanceSolution(tree, problem, problem.firstMove), null)
  })

  it('returns null when the continuation contains a non-string move value', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {W: [null]})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(advanceSolution(tree, problem, problem.firstMove), null)
  })

  it('treats a node with both B and W as Black', () => {
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      draft.appendNode(b1, {B: ['hm'], W: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hm')
  })
})
