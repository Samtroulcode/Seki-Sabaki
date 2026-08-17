import assert from 'assert'

import * as gametree from '../src/modules/gametree.js'
import {
  applyExplorationMove,
  getExplorationPlayer,
} from '../src/modules/tsumegoexploration.js'

describe('Tsumego exploration board', () => {
  it('applies legal alternating moves without mutating the GameTree', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['5'])
    })
    let before = JSON.stringify(tree.root)
    let board = gametree.getBoard(tree, tree.root.id).clone()

    let afterBlack = applyExplorationMove(board, 1, [0, 0])
    let afterWhite = applyExplorationMove(afterBlack, -1, [1, 0])

    assert.strictEqual(board.signMap[0][0], 0)
    assert.strictEqual(afterBlack.signMap[0][0], 1)
    assert.strictEqual(afterWhite.signMap[0][1], -1)
    assert.strictEqual(JSON.stringify(tree.root), before)
  })

  it('handles local captures and rejects illegal moves', () => {
    let tree = gametree.new().mutate((draft) => {
      draft.updateProperty(draft.root.id, 'SZ', ['5'])
      draft.updateProperty(draft.root.id, 'PL', ['B'])
      draft.updateProperty(draft.root.id, 'AB', ['ba', 'ab', 'cb'])
      draft.updateProperty(draft.root.id, 'AW', ['bb'])
    })
    let board = gametree.getBoard(tree, tree.root.id).clone()

    let captured = applyExplorationMove(board, 1, [1, 2])
    assert.strictEqual(captured.signMap[1][1], 0)
    assert.strictEqual(captured.signMap[2][1], 1)
    assert.strictEqual(applyExplorationMove(captured, -1, [1, 2]), null)
  })

  it('derives the next exploration player from an SGF position', () => {
    assert.strictEqual(getExplorationPlayer({data: {B: ['aa']}}, 1), -1)
    assert.strictEqual(getExplorationPlayer({data: {W: ['aa']}}, 1), 1)
    assert.strictEqual(getExplorationPlayer({data: {PL: ['W']}}, 1), -1)
    assert.strictEqual(getExplorationPlayer({data: {}}, -1), -1)
  })
})
