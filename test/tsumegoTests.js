import assert from 'assert'

import * as gametree from '../src/modules/gametree.js'
import {
  advanceSolution,
  advanceRefutation,
  analyzeProblem,
  classifyMove,
  interpretProblem,
  resolveMove,
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

  it('accepts EasyGo Right on a terminal move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Right']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'correct')
  })

  it('matches terminal EasyGo Right case-insensitively', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {W: ['aa'], C: ['This is rIgHt.']})
      draft.appendNode(draft.root.id, {W: ['bb']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.W[0], 'aa')
  })

  it('ignores directional right prose outside a terminal result', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Play on the right side.'])
      let candidate = draft.appendNode(draft.root.id, {
        B: ['aa'],
        C: ['Continue on the right side.'],
      })
      draft.appendNode(candidate, {W: ['cc']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('keeps Correct comment detection unchanged', () => {
    let tree = buildTree([['B', 'aa', 'Correct Answer']])

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
  })

  it('infers the only unmarked branch when its sibling is negative', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
    assert.strictEqual(classifyMove(tree, result, 'bb'), 'correct')
    assert.strictEqual(resolveMove(tree, result, 'bb').status, 'correct')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'wrong')
    assert.strictEqual(resolveMove(tree, result, 'aa').status, 'wrong')
  })

  it('infers one unmarked branch from two negative siblings', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['bb'], N: ['不正解']})
      draft.appendNode(draft.root.id, {B: ['cc']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'cc')
  })

  it('keeps one negative and two unmarked branches ambiguous', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['bb']})
      draft.appendNode(draft.root.id, {B: ['cc']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('does not infer a solution without a negative branch', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('uses the main-line branch only when the fallback is enabled', () => {
    let response
    let tree = gametree.new().mutate((draft) => {
      let main = draft.appendNode(draft.root.id, {B: ['aa']})
      response = draft.appendNode(main, {W: ['cc']})
      draft.appendNode(response, {B: ['dd']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'correct')
    assert.strictEqual(classifyMove(tree, result, 'bb'), 'wrong')
    assert.strictEqual(classifyMove(tree, result, 'cc'), 'absent')
    let advanced = advanceSolution(tree, result, result.firstMove)
    assert(advanced != null)
    assert.strictEqual(advanced.automaticMoves[0].id, response)
    assert.strictEqual(advanced.nextPlayerMove.data.B[0], 'dd')
  })

  it('uses the main-line branch when several alternatives exist', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {W: ['aa']})
      draft.appendNode(draft.root.id, {W: ['bb']})
      draft.appendNode(draft.root.id, {W: ['cc']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.W[0], 'aa')
  })

  it('follows descriptive first-child nodes to the main-line move', () => {
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {C: ['variation']})
      draft.appendNode(prefix, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
  })

  it('does not override a negative main-line branch', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['bb']})
      draft.appendNode(draft.root.id, {B: ['cc']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('prefers negative-branch inference over main-line ordering', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
  })

  it('keeps a later negative variation scoped to its decision point', () => {
    let response
    let canonical
    let wrong
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'PL', ['B'])
      let initial = draft.appendNode(draft.root.id, {B: ['aa']})
      response = draft.appendNode(initial, {W: ['bb']})
      canonical = draft.appendNode(response, {B: ['cc']})
      wrong = draft.appendNode(response, {B: ['dd'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['ee']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
    assert.notStrictEqual(result.firstMove.data.B[0], 'ee')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'correct')
    assert.strictEqual(classifyMove(tree, result, 'ee'), 'wrong')

    let laterInference = analyzeProblem(tree)
    assert(laterInference != null)
    assert.strictEqual(laterInference.startNodeId, response)
    assert.strictEqual(laterInference.firstMove.id, canonical)

    let advanced = advanceSolution(tree, result, result.firstMove)
    assert(advanced != null)
    assert.strictEqual(advanced.automaticMoves[0].id, response)
    assert.strictEqual(advanced.nextPlayerMove.id, canonical)
    assert.strictEqual(
      classifyMove(
        tree,
        result,
        'cc',
        advanced.decisionPointId,
        advanced.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      resolveMove(
        tree,
        result,
        'dd',
        advanced.decisionPointId,
        advanced.nextPlayerMove,
      ).node.id,
      wrong,
    )
    assert.strictEqual(
      classifyMove(
        tree,
        result,
        'dd',
        advanced.decisionPointId,
        advanced.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('keeps negative evidence on a forced continuation', () => {
    let tree = gametree.new().mutate((draft) => {
      let candidate = draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(candidate, {W: ['bb'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['ee']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'ee')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'wrong')
  })

  it('prefers an explicit off-main-line solution', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['bb'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
  })

  it('prefers an off-main-line TE solution when TE is enabled', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['bb'], TE: ['1']})
    })

    let result = analyzeProblem(tree, {
      allowTeFallback: true,
      allowMainLineFallback: true,
    })
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
  })

  it('rejects a main-line fallback that contradicts PL', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'PL', ['W'])
      draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('rejects a pass as the main-line fallback candidate', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['']})
      draft.appendNode(draft.root.id, {B: ['aa']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('rejects an off-board main-line fallback candidate', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['9'])
      draft.appendNode(draft.root.id, {B: ['zz']})
      draft.appendNode(draft.root.id, {B: ['aa']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('rejects a structurally ambiguous main-line move node', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], W: ['bb']})
      draft.appendNode(draft.root.id, {B: ['cc']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('does not start inside an ancestor branch marked wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      let wrong = draft.appendNode(draft.root.id, {
        B: ['aa'],
        C: ['Wrong Answer'],
      })
      let response = draft.appendNode(wrong, {W: ['bb']})
      draft.appendNode(response, {B: ['cc']})
      draft.appendNode(response, {B: ['dd']})
    })

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('does not treat a linear unmarked game as a main-line problem', () => {
    let tree = buildTree([
      ['B', 'aa'],
      ['W', 'bb'],
      ['B', 'cc'],
    ])

    assert.strictEqual(
      analyzeProblem(tree, {allowMainLineFallback: true}),
      null,
    )
  })

  it('uses a first-move BM marker for negative-branch inference', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], BM: ['1']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'wrong')
  })

  it('classifies a WV-marked candidate variation as wrong', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['bb'], WV: ['']})
    })
    let problem = {
      startNodeId: tree.root.id,
      playerToMove: 'B',
      firstMove: {
        id: 'ghost',
        data: {B: ['aa']},
        parentId: tree.root.id,
        children: [],
      },
    }

    assert.strictEqual(classifyMove(tree, problem, 'bb'), 'wrong')
  })

  it('uses WV for unique-survivor negative inference', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], WV: ['']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'bb')
    assert.strictEqual(classifyMove(tree, result, 'aa'), 'wrong')
  })

  it('keeps WV below a later branch scoped to that decision', () => {
    let response
    let canonical
    let tree = gametree.new().mutate((draft) => {
      let initial = draft.appendNode(draft.root.id, {B: ['aa']})
      response = draft.appendNode(initial, {W: ['bb']})
      canonical = draft.appendNode(response, {B: ['cc']})
      draft.appendNode(response, {B: ['dd'], WV: ['']})
      draft.appendNode(draft.root.id, {B: ['ee']})
    })

    let result = analyzeProblem(tree, {allowMainLineFallback: true})
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')

    let laterInference = analyzeProblem(tree)
    assert(laterInference != null)
    assert.strictEqual(laterInference.startNodeId, response)
    assert.strictEqual(laterInference.firstMove.id, canonical)

    let advanced = advanceSolution(tree, result, result.firstMove)
    assert(advanced != null)
    assert.strictEqual(advanced.nextPlayerMove.id, canonical)
    assert.strictEqual(
      classifyMove(
        tree,
        result,
        'dd',
        advanced.decisionPointId,
        advanced.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('does not interpret TR markup as negative evidence', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], TR: ['cc']})
      draft.appendNode(draft.root.id, {B: ['bb']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('does not infer from conflicting duplicate move branches', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['aa']}, {disableMerging: true})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('does not infer a pass as the solution', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('uses the mainline node for duplicate inferred coordinates', () => {
    let mainline
    let tree = gametree.new().mutate((draft) => {
      mainline = draft.appendNode(draft.root.id, {B: ['aa']})
      draft.appendNode(draft.root.id, {B: ['aa']}, {disableMerging: true})
      draft.appendNode(draft.root.id, {B: ['bb'], C: ['Wrong Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.id, mainline)
  })

  it('uses the local mainline node at an off-mainline decision point', () => {
    let localMainline
    let setup
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {W: ['zz']})
      setup = draft.appendNode(draft.root.id, {PL: ['B']})
      localMainline = draft.appendNode(setup, {B: ['aa']})
      draft.appendNode(setup, {B: ['aa']}, {disableMerging: true})
      draft.appendNode(setup, {B: ['bb'], C: ['Wrong Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, setup)
    assert.strictEqual(result.firstMove.id, localMainline)
  })

  it('keeps explicit positive markers ahead of negative-branch inference', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['bb'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['cc']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.B[0], 'aa')
    assert.strictEqual(classifyMove(tree, result, 'cc'), 'wrong')
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

  it('detects a problem whose marker sits on a non-move prefix before the first move', () => {
    // ROOT -> N[正解图] -> W[na] -> B[ob]
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['正解图']})
      let w1 = draft.appendNode(prefix, {W: ['na']})
      draft.appendNode(w1, {B: ['ob']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, 'W')
    assert.strictEqual(result.firstMove.data.W[0], 'na')
    assert.strictEqual(classifyMove(tree, result, 'na'), 'correct')
  })

  it('returns null when a marked prefix leads to several distinct first moves', () => {
    // ROOT -> N[正解图] -> W[na] and W[md]: ambiguous, fail safely.
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['正解图']})
      draft.appendNode(prefix, {W: ['na']})
      draft.appendNode(prefix, {W: ['md']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('accepts a matching PL on a non-move prefix before the first move', () => {
    // ROOT -> N[setup] PL[W] -> W[na] C[Correct Answer]
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['setup'], PL: ['W']})
      draft.appendNode(prefix, {W: ['na'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.playerToMove, 'W')
  })

  it('returns null when a PL on a non-move prefix contradicts the first move', () => {
    // ROOT -> N[setup] PL[B] -> W[na] C[Correct Answer]
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['setup'], PL: ['B']})
      draft.appendNode(prefix, {W: ['na'], C: ['Correct Answer']})
    })

    assert.strictEqual(analyzeProblem(tree), null)
  })

  it('keeps a setup node with stones as the starting position', () => {
    // ROOT -> W[gm] -> AB[dd] setup -> B[gl] C[Correct Answer]
    let tree = gametree.new().mutate((draft) => {
      let w1 = draft.appendNode(draft.root.id, {W: ['gm']})
      let setup = draft.appendNode(w1, {AB: ['dd']})
      draft.appendNode(setup, {B: ['gl'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    let startNode = tree.get(result.startNodeId)
    assert.strictEqual(startNode.data.AB[0], 'dd')
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('prefers the shallowest occurrence of a repeated first move under a prefix', () => {
    // ROOT -> N[正解图] -> W[na] and N[正解图] -> C[x] -> W[na]
    // ROOT -> C[y] -> W[md] C[Correct Answer]
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['正解图']})
      draft.appendNode(prefix, {W: ['na']})
      let label = draft.appendNode(prefix, {C: ['x']})
      draft.appendNode(label, {W: ['na']})
      let label2 = draft.appendNode(draft.root.id, {C: ['y']})
      draft.appendNode(label2, {W: ['md'], C: ['Correct Answer']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    assert.strictEqual(result.firstMove.data.W[0], 'na')
  })

  it('detects a problem whose marker sits on a prefix below a preliminary move', () => {
    // ROOT -> W[gm] -> N[正解图] -> B[gl]
    let tree = gametree.new().mutate((draft) => {
      let w1 = draft.appendNode(draft.root.id, {W: ['gm']})
      let prefix = draft.appendNode(w1, {N: ['正解图']})
      draft.appendNode(prefix, {B: ['gl']})
    })

    let result = analyzeProblem(tree)
    assert(result != null)
    let startNode = tree.get(result.startNodeId)
    assert.strictEqual(startNode.data.W[0], 'gm')
    assert.strictEqual(result.playerToMove, 'B')
    assert.strictEqual(result.firstMove.data.B[0], 'gl')
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

  it('classifies an unmarked variation as wrong when a correct move exists', () => {
    // A proven-correct move at the decision point turns explicitly present but
    // unmarked variations into wrong moves.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('classifies a vertex with marked and unmarked variations as wrong', () => {
    // The unmarked duplicate loses its caution: a proven-correct move exists at
    // the decision point, so every other explicitly present variation is wrong.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong Answer']})
      draft.appendNode(draft.root.id, {B: ['dd']}, {disableMerging: true})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
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

  it('classifies a variation with only a descendant BM as wrong when a correct move exists', () => {
    // A `BM` on a descendant does not mark the branch wrong by itself, but a
    // proven-correct move elsewhere at the decision point still classifies the
    // explicitly present, unmarked variation as wrong.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct Answer']})
      let wrong = draft.appendNode(draft.root.id, {B: ['dd']})
      draft.appendNode(wrong, {W: ['xx'], BM: ['1']})
    })
    let problem = analyzeProblem(tree)

    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('classifies a wrong branch as wrong when a positive solution exists elsewhere', () => {
    // ROOT -> N[正解图] -> W[na] -> B[ob] -> W[md]
    // ROOT -> W[md] N[失败图]
    let tree = gametree.new().mutate((draft) => {
      let correctPrefix = draft.appendNode(draft.root.id, {N: ['正解图']})
      let w1 = draft.appendNode(correctPrefix, {W: ['na']})
      let b1 = draft.appendNode(w1, {B: ['ob']})
      draft.appendNode(b1, {W: ['md']})

      draft.appendNode(draft.root.id, {W: ['md'], N: ['失败图']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(problem.startNodeId, tree.root.id)
    assert.strictEqual(problem.playerToMove, 'W')
    assert.strictEqual(problem.firstMove.data.W[0], 'na')
    assert.strictEqual(classifyMove(tree, problem, 'na'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'md'), 'wrong')
  })

  it('inherits a negative marker from a non-move prefix before the first move', () => {
    // ROOT -> N[失败图] -> W[md]
    // ROOT -> N[正解图] -> W[na]
    let tree = gametree.new().mutate((draft) => {
      let wrongPrefix = draft.appendNode(draft.root.id, {N: ['失败图']})
      draft.appendNode(wrongPrefix, {W: ['md']})
      let correctPrefix = draft.appendNode(draft.root.id, {N: ['正解图']})
      draft.appendNode(correctPrefix, {W: ['na']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(classifyMove(tree, problem, 'md'), 'wrong')
  })

  it('skips a non-move prefix when the marker sits on the first move itself', () => {
    // ROOT -> N[setup] -> W[na] C[Correct Answer]
    // ROOT -> W[md] C[Wrong Answer]
    let tree = gametree.new().mutate((draft) => {
      let prefix = draft.appendNode(draft.root.id, {N: ['setup']})
      draft.appendNode(prefix, {W: ['na'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {W: ['md'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(problem.startNodeId, tree.root.id)
    assert.strictEqual(problem.playerToMove, 'W')
    assert.strictEqual(problem.firstMove.data.W[0], 'na')
    assert.strictEqual(classifyMove(tree, problem, 'na'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'md'), 'wrong')
  })

  it('classifies the first solver move as correct when the marker sits several moves later', () => {
    // GoGameGuru: B[rs] -> W[rr] -> B[ns] C[Correct]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['rs']})
      let w1 = draft.appendNode(b1, {W: ['rr']})
      draft.appendNode(w1, {B: ['ns'], C: ['Correct']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(problem.firstMove.data.B[0], 'rs')
    assert.strictEqual(classifyMove(tree, problem, 'rs'), 'correct')
  })

  it('classifies unmarked variations as wrong when a positive solution exists', () => {
    // GoGameGuru: only the solution branch carries a marker; the other
    // explicitly present first moves are unmarked.
    let tree = gametree.new().mutate((draft) => {
      let correct = draft.appendNode(draft.root.id, {B: ['rs']})
      let w1 = draft.appendNode(correct, {W: ['rr']})
      draft.appendNode(w1, {B: ['ns'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['sr']})
      draft.appendNode(draft.root.id, {B: ['sq']})
      draft.appendNode(draft.root.id, {B: ['qq']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(problem.playerToMove, 'B')
    assert.strictEqual(classifyMove(tree, problem, 'rs'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'sr'), 'wrong')
    assert.strictEqual(classifyMove(tree, problem, 'sq'), 'wrong')
    assert.strictEqual(classifyMove(tree, problem, 'qq'), 'wrong')
  })

  it('keeps several positive variations correct and marks the rest wrong', () => {
    // Two marked solutions plus an unmarked variation at the same decision
    // point: both solutions stay correct, the unmarked one is wrong.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['rs'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['sr'], C: ['Also correct...']})
      draft.appendNode(draft.root.id, {B: ['sq']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(classifyMove(tree, problem, 'rs'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'sr'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'sq'), 'wrong')
  })

  it('treats the expected move as a positive solution at the decision point', () => {
    // A hand-built problem without markers: the expected move (firstMove) is
    // correct by construction, so an explicitly present unmarked variation at
    // the same decision point is wrong (GoGameGuru rule).
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl']})
      draft.appendNode(draft.root.id, {B: ['dd']})
    })

    assert.strictEqual(analyzeProblem(tree), null)

    let firstMove = tree.get(tree.root.children[0].id)
    let problem = {startNodeId: tree.root.id, playerToMove: 'B', firstMove}
    assert.strictEqual(classifyMove(tree, problem, 'gl'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'dd'), 'wrong')
  })

  it('keeps an unmarked variation null when the expected move is not a candidate', () => {
    // The expected move is not reachable from the decision point, so no
    // positive proof exists there: the present-but-unmarked variation is never
    // invented as wrong.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['dd']})
    })
    let ghostMove = {
      id: 'ghost',
      data: {B: ['gl']},
      parentId: null,
      children: [],
    }
    let problem = {
      startNodeId: tree.root.id,
      playerToMove: 'B',
      firstMove: ghostMove,
    }

    assert.strictEqual(classifyMove(tree, problem, 'dd'), null)
  })

  it('keeps a move absent from the SGF as absent', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['rs'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['sr']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(classifyMove(tree, problem, 'ee'), 'absent')
  })

  it('counts a TE marker as positive proof when the TE fallback is enabled', () => {
    // A TE-marked variation is correct, and a TE marker can also establish the
    // proven-correct move that turns unmarked variations into wrong moves.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['rs'], TE: ['1']})
      draft.appendNode(draft.root.id, {B: ['sr'], TE: ['1']})
      draft.appendNode(draft.root.id, {B: ['sq']})
    })
    let problem = analyzeProblem(tree, {allowTeFallback: true})

    assert(problem != null)
    assert.strictEqual(classifyMove(tree, problem, 'rs'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'sr'), 'correct')
    assert.strictEqual(classifyMove(tree, problem, 'sq'), 'wrong')
  })

  it('does not count a TE marker as positive proof without the TE fallback', () => {
    // The problem is detected from the comment marker; the TE-marked variation
    // must not become correct, and the unmarked rule still applies.
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['rs'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['sr'], TE: ['1']})
    })
    let problem = analyzeProblem(tree)

    assert(problem != null)
    assert.strictEqual(classifyMove(tree, problem, 'sr'), 'wrong')

    // With the fallback enabled the same TE marker is a positive proof.
    let teProblem = analyzeProblem(tree, {allowTeFallback: true})
    assert.strictEqual(classifyMove(tree, teProblem, 'sr'), 'correct')
  })
})

describe('resolveMove', () => {
  it('returns the canonical expected node and keeps classifyMove compatible', () => {
    let canonical
    let tree = gametree.new().mutate((draft) => {
      canonical = draft.appendNode(draft.root.id, {
        B: ['aa'],
        C: ['Correct'],
      })
    })
    let problem = analyzeProblem(tree)

    let result = resolveMove(tree, problem, 'aa')
    assert.strictEqual(result.status, 'correct')
    assert.strictEqual(result.node.id, canonical)
    assert.strictEqual(classifyMove(tree, problem, 'aa'), 'correct')
  })

  it('returns a correctly marked alternative branch node', () => {
    let alternative
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct']})
      let prefix = draft.appendNode(draft.root.id, {N: ['Also correct']})
      alternative = draft.appendNode(prefix, {B: ['bb'], C: ['Correct']})
    })
    let problem = analyzeProblem(tree)
    let before = JSON.stringify(tree.root)

    let result = resolveMove(tree, problem, 'bb')
    assert.strictEqual(result.status, 'correct')
    assert.strictEqual(result.node.id, alternative)
    assert.strictEqual(JSON.stringify(tree.root), before)
  })

  it('prefers the expected node when matching vertices are duplicated', () => {
    let canonical
    let alternative
    let tree = gametree.new().mutate((draft) => {
      canonical = draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct']})
      let prefix = draft.appendNode(draft.root.id, {N: ['failed prefix']})
      alternative = draft.appendNode(prefix, {B: ['aa'], BM: ['1']})
    })
    let problem = analyzeProblem(tree)

    let result = resolveMove(tree, problem, 'aa', null, tree.get(canonical))
    assert.strictEqual(result.status, 'correct')
    assert.strictEqual(result.node.id, canonical)
    assert.notStrictEqual(result.node.id, alternative)
  })

  it('returns the matching wrong node and null for an absent move', () => {
    let wrong
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct']})
      wrong = draft.appendNode(draft.root.id, {B: ['bb'], C: ['Wrong']})
    })
    let problem = analyzeProblem(tree)

    let wrongResult = resolveMove(tree, problem, 'bb')
    assert.strictEqual(wrongResult.status, 'wrong')
    assert.strictEqual(wrongResult.node.id, wrong)
    assert.deepStrictEqual(resolveMove(tree, problem, 'cc'), {
      status: 'absent',
      node: null,
    })
  })

  it('resolves alternatives at a later decision point', () => {
    let alternative
    let tree = gametree.new().mutate((draft) => {
      let first = draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct']})
      let response = draft.appendNode(first, {W: ['bb']})
      draft.appendNode(response, {B: ['cc']})
      alternative = draft.appendNode(response, {B: ['dd'], C: ['Wrong']})
    })
    let problem = analyzeProblem(tree)
    let advanced = advanceSolution(tree, problem, problem.firstMove)
    let result = resolveMove(
      tree,
      problem,
      'dd',
      advanced.decisionPointId,
      advanced.nextPlayerMove,
    )

    assert.strictEqual(result.status, 'wrong')
    assert.strictEqual(result.node.id, alternative)
  })
})

describe('classifyMove at later decision points', () => {
  it('classifies the second correct move after an automatic opponent response', () => {
    // B[gl] Correct -> W[hm] -> B[hl]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.solved, false)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
  })

  it('classifies a documented wrong second move as wrong', () => {
    // B[gl] Correct -> W[hm] -> B[hl] (canonical) and B[xx] Wrong Answer
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
      draft.appendNode(w1, {B: ['xx'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('classifies an unmarked second move as wrong when a solution exists', () => {
    // GoGameGuru-style: the marker sits on the first move only; the canonical
    // second move is unmarked, and an unmarked alternative at the same decision
    // point is a failed try.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
      draft.appendNode(w1, {B: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('classifies a second move absent from the SGF as absent', () => {
    // B[gl] Correct -> W[hm] -> B[hl]
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'ee',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'absent',
    )
  })

  it('keeps two correct second moves possible', () => {
    // Both second moves carry a positive marker, so each stays correct even
    // though only the canonical one is the expected move.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl'], C: ['Correct']})
      draft.appendNode(w1, {B: ['xx'], C: ['Also correct...']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
  })

  it('supports non-move nodes between the opponent response and the variations', () => {
    // B[gl] Correct -> W[hm] -> C[setup] -> B[hl] and B[xx] Wrong Answer:
    // the comment-only node does not define a position, so the decision point
    // is W[hm], and classifyMove still finds the variations through C[setup].
    let w1
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      w1 = draft.appendNode(b1, {W: ['hm']})
      let setupId = draft.appendNode(w1, {C: ['setup']})
      draft.appendNode(setupId, {B: ['hl']})
      draft.appendNode(setupId, {B: ['xx'], C: ['Wrong Answer']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')
    assert.strictEqual(adv.decisionPointId, w1)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('does not inherit a marker from above the decision point', () => {
    // The marker sits on the first move only; it must not leak into variations
    // at the second decision point, or an unmarked alternative would wrongly
    // become correct.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
      draft.appendNode(w1, {B: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    // A leak would classify this as 'correct'; the expected-move rule makes it
    // 'wrong'.
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('inherits a positive prefix marker between the decision point and a variation', () => {
    // A prefix marker below the decision point still labels the variation as
    // the solution, so the branch is correct even though the expected move
    // alone would only make it wrong.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
      let prefix = draft.appendNode(w1, {N: ['正解图']})
      draft.appendNode(prefix, {B: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
  })

  it('walks up descriptive prefixes to the real decision point', () => {
    // W[hm] -> N[正解图] -> B[hl] (canonical) and W[hm] -> N[失败图] -> B[xx]:
    // the label prefixes do not define a position, so the decision point is
    // the W[hm] move and the alternative variation stays visible.
    let w1
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      w1 = draft.appendNode(b1, {W: ['hm']})
      let correctPrefix = draft.appendNode(w1, {N: ['正解图']})
      draft.appendNode(correctPrefix, {B: ['hl']})
      let wrongPrefix = draft.appendNode(w1, {N: ['失败图']})
      draft.appendNode(wrongPrefix, {B: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')
    assert.strictEqual(adv.decisionPointId, w1)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('keeps a setup node as the decision point', () => {
    // W[hm] -> AB[dd] -> B[hl] and B[xx]: the setup node defines a new
    // position, so it stays the decision point instead of walking up to W[hm].
    let setupId
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      setupId = draft.appendNode(w1, {AB: ['dd']})
      draft.appendNode(setupId, {B: ['hl']})
      draft.appendNode(setupId, {B: ['xx']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)
    assert.strictEqual(adv.nextPlayerMove.data.B[0], 'hl')
    assert.strictEqual(adv.decisionPointId, setupId)
    assert.strictEqual(adv.positionNodeId, setupId)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'hl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'correct',
    )
    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'xx',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'wrong',
    )
  })

  it('does not accept the first move again at a later decision point', () => {
    // The initial-position shortcut must not fire once the solver moved on:
    // 'gl' is not a variation from the current decision point.
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      let w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let adv = advanceSolution(tree, problem, problem.firstMove)
    assert(adv != null)

    assert.strictEqual(
      classifyMove(
        tree,
        problem,
        'gl',
        adv.decisionPointId,
        adv.nextPlayerMove,
      ),
      'absent',
    )
  })
})

describe('advanceSolution', () => {
  it('advances B correct -> W automatic -> next B expected', () => {
    let w1
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      w1 = draft.appendNode(b1, {W: ['hm']})
      draft.appendNode(w1, {B: ['hl']})
    })
    let problem = analyzeProblem(tree)

    let result = advanceSolution(tree, problem, problem.firstMove)
    assert(result != null)
    assert.strictEqual(result.solved, false)
    assert.strictEqual(result.automaticMoves.length, 1)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'hm')
    assert.strictEqual(result.nextPlayerMove.data.B[0], 'hl')
    assert.strictEqual(result.decisionPointId, w1)
    assert.strictEqual(result.positionNodeId, w1)
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
    assert.strictEqual(second.positionNodeId, second.decisionPointId)

    let third = advanceSolution(tree, problem, second.nextPlayerMove)
    assert(third != null)
    assert.strictEqual(third.solved, true)
    assert.deepStrictEqual(third.automaticMoves, [])
    assert.strictEqual(third.nextPlayerMove, null)
    assert.strictEqual(third.positionNodeId, second.nextPlayerMove.id)
  })

  it('traverses non-move nodes around the opponent response', () => {
    let w1
    let tree = gametree.new().mutate((draft) => {
      let b1 = draft.appendNode(draft.root.id, {
        B: ['gl'],
        C: ['Correct Answer'],
      })
      let nm1 = draft.appendNode(b1, {C: ['setup']})
      w1 = draft.appendNode(nm1, {W: ['hm']})
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
    // A comment-only node does not define a position, so the decision point
    // walks up to the W[hm] move.
    assert.strictEqual(result.decisionPointId, w1)
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
    assert.strictEqual(result.decisionPointId, null)
    assert.strictEqual(result.positionNodeId, problem.firstMove.id)
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
    assert.strictEqual(result.positionNodeId, result.automaticMoves[0].id)
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

describe('advanceRefutation', () => {
  it('advances through a wrong branch continuation to terminal position', () => {
    // B[gl] Correct -> W[hm] -> B[hl] (canonical)
    // B[dd] Wrong -> W[xx] -> B[yy] (refutation)
    let wrongMove
    let tree = gametree.new().mutate((draft) => {
      let correct = draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      draft.appendNode(correct, {W: ['hm']})
      draft.appendNode(correct, {B: ['hl']})

      wrongMove = draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
      let w1 = draft.appendNode(wrongMove, {W: ['xx']})
      draft.appendNode(w1, {B: ['yy']})
    })

    let result = advanceRefutation(tree, tree.get(wrongMove))
    assert(result != null)
    assert.strictEqual(result.automaticMoves.length, 2)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'xx')
    assert.strictEqual(result.automaticMoves[1].data.B[0], 'yy')
    assert.strictEqual(result.positionNodeId, result.automaticMoves[1].id)
  })

  it('traverses non-move nodes in the refutation continuation', () => {
    let wrongMove
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      wrongMove = draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
      let setup = draft.appendNode(wrongMove, {C: ['refutation setup']})
      let w1 = draft.appendNode(setup, {W: ['xx']})
      draft.appendNode(w1, {B: ['yy']})
    })

    let result = advanceRefutation(tree, tree.get(wrongMove))
    assert(result != null)
    assert.strictEqual(result.automaticMoves.length, 2)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'xx')
    assert.strictEqual(result.automaticMoves[1].data.B[0], 'yy')
  })

  it('returns null for a null node', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
    })

    assert.strictEqual(advanceRefutation(tree, null), null)
  })

  it('returns null when the node is not a move', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      draft.appendNode(draft.root.id, {C: ['setup']})
    })
    let setupNode = tree.get(tree.root.children[1].id)

    assert.strictEqual(advanceRefutation(tree, setupNode), null)
  })

  it('returns null when the node has no data', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
    })
    let dataLessNode = {
      id: tree.root.children[0].id,
      data: null,
      parentId: null,
      children: [],
    }

    assert.strictEqual(advanceRefutation(tree, dataLessNode), null)
  })

  it('returns null when the node is missing from the tree', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
    })
    let otherTree = gametree.new()
    let node = tree.get(tree.root.children[0].id)

    assert.strictEqual(advanceRefutation(otherTree, node), null)
  })

  it('returns null when the continuation contains a pass', () => {
    let tree = gametree.new().mutate((draft) => {
      let wrongMove = draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
      draft.appendNode(wrongMove, {W: ['']})
    })
    let wrongMove = tree.get(tree.root.children[0].id)

    assert.strictEqual(advanceRefutation(tree, wrongMove), null)
  })

  it('returns null when the continuation contains a non-string move value', () => {
    let tree = gametree.new().mutate((draft) => {
      let wrongMove = draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
      draft.appendNode(wrongMove, {W: [null]})
    })
    let wrongMove = tree.get(tree.root.children[0].id)

    assert.strictEqual(advanceRefutation(tree, wrongMove), null)
  })

  it('returns empty automaticMoves when wrong move is terminal', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
    })
    let wrongMove = tree.get(tree.root.children[1].id)

    let result = advanceRefutation(tree, wrongMove)
    assert(result != null)
    assert.deepStrictEqual(result.automaticMoves, [])
    assert.strictEqual(result.positionNodeId, wrongMove.id)
  })

  it('follows only the first child (canonical line) of the wrong branch', () => {
    let wrongMove
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['gl'], C: ['Correct']})
      wrongMove = draft.appendNode(draft.root.id, {B: ['dd'], C: ['Wrong']})
      draft.appendNode(wrongMove, {W: ['xx']}) // first child - canonical
      draft.appendNode(wrongMove, {W: ['yy']}) // sibling - should not be followed
    })
    let canonical = tree.get(tree.get(wrongMove).children[0].id)
    tree = tree.mutate((draft) => {
      draft.appendNode(canonical.id, {B: ['zz']})
    })

    let result = advanceRefutation(tree, tree.get(wrongMove))
    assert(result != null)
    assert.strictEqual(result.automaticMoves.length, 2)
    assert.strictEqual(result.automaticMoves[0].data.W[0], 'xx')
    assert.strictEqual(result.automaticMoves[1].data.B[0], 'zz')
  })
})

describe('interpretProblem', () => {
  it('combines points from multiple positive L answer nodes', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['dj', 'dk'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {L: ['cj', 'ck'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.deepStrictEqual(
      new Set(result.acceptedPoints),
      new Set(['dj', 'dk', 'cj', 'ck']),
    )
    assert.strictEqual(result.acceptedPoints.length, 4)
  })

  it('allows a positive L answer to coexist with an explicit wrong move variation', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['dj'], C: ['Correct Answer']})
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.deepStrictEqual(result.acceptedPoints, ['dj'])
  })

  it('deduplicates duplicate points', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['dj', 'dj'], C: ['Correct']})
      draft.appendNode(draft.root.id, {L: ['dj'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.deepStrictEqual(result.acceptedPoints, ['dj'])
  })

  it('rejects out-of-board markup safely', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['9'])
      draft.appendNode(draft.root.id, {L: ['aa', 'zz'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.deepStrictEqual(result.acceptedPoints, ['aa'])
  })

  it('does not interpret arbitrary explanatory L markup as an answer', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['aa', 'bb'], C: ['Legal position']})
      draft.appendNode(draft.root.id, {L: ['cc'], C: ['Illegal position']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('does not treat LB question labels as answers', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {LB: ['aa:A', 'bb:B'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('prefers existing move-sequence problems over point-selection', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Correct']})
      draft.appendNode(draft.root.id, {L: ['bb'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'move-sequence')
    assert(result.problem != null)
    assert.strictEqual(result.problem.firstMove.data.B[0], 'aa')
  })

  it('infers player color only from structured unambiguous evidence', () => {
    // Explicit PL
    let treePl = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'PL', ['W'])
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
    })
    let resultPl = interpretProblem(treePl)
    assert.strictEqual(resultPl.kind, 'point-selection')
    assert.strictEqual(resultPl.startNodeId, treePl.root.id)
    assert.strictEqual(resultPl.playerToMove, 'W')

    // Consistent move color
    let treeMoves = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['bb'], C: ['Wrong']})
      draft.appendNode(draft.root.id, {B: ['cc'], C: ['Wrong']})
    })
    let resultMoves = interpretProblem(treeMoves)
    assert.strictEqual(resultMoves.kind, 'point-selection')
    assert.strictEqual(resultMoves.startNodeId, treeMoves.root.id)
    assert.strictEqual(resultMoves.playerToMove, 'B')

    // Inconsistent move colors -> null
    let treeMixed = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['bb'], C: ['Wrong']})
      draft.appendNode(draft.root.id, {W: ['cc'], C: ['Wrong']})
    })
    let resultMixed = interpretProblem(treeMixed)
    assert.strictEqual(resultMixed.kind, 'point-selection')
    assert.strictEqual(resultMixed.startNodeId, treeMixed.root.id)
    assert.strictEqual(resultMixed.playerToMove, null)
  })

  it('returns null color when no structured color evidence exists', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, null)
  })

  it('infers B when L answer has B wrong move with W refutation', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['dj'], C: ['Correct Answer']})
      let wrong = draft.appendNode(draft.root.id, {B: ['hc'], C: ['Wrong']})
      draft.appendNode(wrong, {W: ['kk']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, 'B')
  })

  it('returns null for conflicting first-move candidates at same decision point', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['dj'], C: ['Correct']})
      draft.appendNode(draft.root.id, {B: ['aa'], C: ['Wrong']})
      draft.appendNode(draft.root.id, {W: ['bb'], C: ['Wrong']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'point-selection')
    assert.strictEqual(result.startNodeId, tree.root.id)
    assert.strictEqual(result.playerToMove, null)
  })

  it('handles SZ correctly for point-selection', () => {
    // Missing SZ -> 19x19 default
    let treeMissing = gametree.new().mutate((draft) => {
      draft.appendNode(draft.root.id, {L: ['ss'], C: ['Correct']})
    })
    let resultMissing = interpretProblem(treeMissing)
    assert.strictEqual(resultMissing.kind, 'point-selection')
    assert.strictEqual(resultMissing.startNodeId, treeMissing.root.id)
    assert.deepStrictEqual(resultMissing.acceptedPoints, ['ss'])

    // Valid SZ 9x9 -> correct bounds
    let treeValid = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['9'])
      draft.appendNode(draft.root.id, {L: ['aa', 'ii', 'jj'], C: ['Correct']})
    })
    let resultValid = interpretProblem(treeValid)
    assert.strictEqual(resultValid.kind, 'point-selection')
    assert.strictEqual(resultValid.startNodeId, treeValid.root.id)
    assert.deepStrictEqual(
      new Set(resultValid.acceptedPoints),
      new Set(['aa', 'ii']),
    )

    // Valid rectangular SZ
    let treeRect = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['9:13'])
      draft.appendNode(draft.root.id, {L: ['aa', 'ii', 'ai'], C: ['Correct']})
    })
    let resultRect = interpretProblem(treeRect)
    assert.strictEqual(resultRect.kind, 'point-selection')
    assert.strictEqual(resultRect.startNodeId, treeRect.root.id)
    // 9x13: width 9 (aa-ii), height 13 (aa-am), so ai (0,8) valid, ii (8,8) valid
    assert.deepStrictEqual(
      new Set(resultRect.acceptedPoints),
      new Set(['aa', 'ii', 'ai']),
    )

    // Malformed explicit SZ -> no inference
    let treeMalformed = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['foo'])
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
    })
    assert.strictEqual(interpretProblem(treeMalformed).kind, 'unsupported')

    let treeZero = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['0'])
      draft.appendNode(draft.root.id, {L: ['aa'], C: ['Correct']})
    })
    assert.strictEqual(interpretProblem(treeZero).kind, 'unsupported')
  })

  it('fails closed when L answers belong to different decision positions', () => {
    let tree = gametree.new().mutate((draft) => {
      let setup1 = draft.appendNode(draft.root.id, {AB: ['aa']})
      draft.appendNode(setup1, {L: ['bb'], C: ['Correct']})
      let setup2 = draft.appendNode(draft.root.id, {AB: ['cc']})
      draft.appendNode(setup2, {L: ['dd'], C: ['Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('detects Alive/Dead question with White is dead answer', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Alive or Dead?'])
      draft.appendNode(draft.root.id, {C: ['White is dead.', 'Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.judgementType, 'alive-dead')
    assert.strictEqual(result.correctChoice, 'dead')
    assert.deepStrictEqual(result.choices, ['alive', 'dead'])
  })

  it('detects Black is alive answer', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Is this group alive or dead?'])
      draft.appendNode(draft.root.id, {C: ['Black is alive.', 'Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.correctChoice, 'alive')
  })

  it('fails closed when answer contains both alive and dead', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Alive or Dead?'])
      draft.appendNode(draft.root.id, {
        C: ['White is alive and black is dead. Correct'],
      })
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('does not classify arbitrary alive/dead without question', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['This is a normal comment'])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('does not depend on AP producer', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'AP', ['GOWrite:2.0'])
      draft.updateProperty(draft.root.id, 'C', ['Alive or Dead?'])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.correctChoice, 'dead')
  })

  it('accepts Alive or Dead question form', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Alive or Dead?'])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.correctChoice, 'dead')
  })

  it('accepts Is this group alive or dead question form', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', ['Is this group alive or dead?'])
      draft.appendNode(draft.root.id, {C: ['Black is alive. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.correctChoice, 'alive')
  })

  it('accepts longer 046-style question prose', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', [
        'Problem 46. White to play. What about the white group on the left side, is it alive or dead? Black to play and win.',
      ])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'judgement')
    assert.strictEqual(result.correctChoice, 'dead')
  })

  it('rejects declarative alive not dead as question', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', [
        'This group is alive, not dead.',
      ])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })

  it('rejects generic alive can become dead prose as question', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'C', [
        'Alive groups can become dead after a mistake.',
      ])
      draft.appendNode(draft.root.id, {C: ['White is dead. Correct']})
    })

    let result = interpretProblem(tree)
    assert.strictEqual(result.kind, 'unsupported')
  })
})
