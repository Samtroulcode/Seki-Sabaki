import assert from 'assert'

import {
  MiniGoban,
  getHistoryPreview,
} from '../src/components/sidebars/OgsGameHistory.js'

describe('OGS game history UI helpers', () => {
  it('limits history previews without mutating the source list', () => {
    let games = [{id: 1}, {id: 2}, {id: 3}, {id: 4}]

    assert.deepStrictEqual(getHistoryPreview(games, 3), [
      {id: 1},
      {id: 2},
      {id: 3},
    ])
    assert.strictEqual(games.length, 4)
  })

  it('returns an empty history preview for non-arrays', () => {
    assert.deepStrictEqual(getHistoryPreview(null, 3), [])
    assert.deepStrictEqual(getHistoryPreview(undefined, 3), [])
  })

  it('labels mini gobans with the OGS board size', () => {
    let vnode = MiniGoban({board: {width: 9, height: 13}})

    assert.strictEqual(vnode.props.class, 'ogs-mini-goban')
    assert.strictEqual(vnode.props['aria-label'], '9x13')
    assert.strictEqual(vnode.props.children[1].props.children, '9x13')
  })
})
