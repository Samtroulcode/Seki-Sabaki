import assert from 'assert'

import * as gametree from '../src/modules/gametree.js'
import {analyzeProblem} from '../src/modules/tsumego.js'

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
