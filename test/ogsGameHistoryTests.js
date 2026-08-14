import assert from 'assert'

import {
  MiniGoban,
  getHistoryPreview,
} from '../src/components/sidebars/OgsGameHistory.js'
import {
  isPreviewSgfContentSafe,
  parseSgfPreview,
} from '../src/modules/sgfpreview.js'

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
    assert.strictEqual(
      findChildByClass(vnode, 'ogs-mini-size').props.children,
      '9x13',
    )
  })

  it('renders SGF preview stones in mini gobans', () => {
    let preview = parseSgfPreview('(;GM[1]FF[4]SZ[9];B[aa];W[bb])')
    let vnode = MiniGoban({board: {width: 9, height: 9}, preview})
    let stones = findChildrenByClass(vnode, 'ogs-mini-stone')

    assert.strictEqual(vnode.props.class, 'ogs-mini-goban has-preview')
    assert.strictEqual(stones.length, 2)
    assert.ok(stones.some((node) => node.props.class.includes('black')))
    assert.ok(stones.some((node) => node.props.class.includes('white')))
    assert.strictEqual(
      findChildByClass(vnode, 'ogs-mini-current-vertex').props.style.left,
      '12.5%',
    )
  })

  it('renders a clear fallback when preview loading fails', () => {
    let vnode = MiniGoban({board: {width: 19, height: 19}, status: 'error'})

    assert.strictEqual(
      findChildByClass(vnode, 'ogs-mini-placeholder').props.children,
      'Preview unavailable',
    )
  })
})

describe('SGF preview parser', () => {
  it('replays the main line into a plain board preview', () => {
    let preview = parseSgfPreview('(;GM[1]FF[4]SZ[9];B[aa];W[bb];B[cc])')

    assert.strictEqual(preview.width, 9)
    assert.strictEqual(preview.height, 9)
    assert.strictEqual(preview.signMap[0][0], 1)
    assert.strictEqual(preview.signMap[1][1], -1)
    assert.strictEqual(preview.signMap[2][2], 1)
    assert.deepStrictEqual(preview.currentVertex, [2, 2])
  })

  it('handles captures with Sabaki board replay', () => {
    let preview = parseSgfPreview(
      '(;GM[1]FF[4]SZ[5];B[bb];W[ba];W[ab];W[cb];W[bc])',
    )

    assert.strictEqual(preview.signMap[1][1], 0)
    assert.strictEqual(preview.signMap[1][0], -1)
  })

  it('chooses the first main variation and tolerates invalid SGF', () => {
    let preview = parseSgfPreview('(;GM[1]FF[4]SZ[9];B[aa](;W[bb])(;W[cc]))')

    assert.strictEqual(preview.signMap[1][1], -1)
    assert.strictEqual(preview.signMap[2][2], 0)
    assert.strictEqual(parseSgfPreview('not sgf'), null)
  })

  it('rejects previews that are too large for renderer thumbnails', () => {
    let hugeGame = `(;GM[1]FF[4]SZ[9]${';B[aa]'.repeat(1001)})`

    assert.strictEqual(isPreviewSgfContentSafe('(;GM[1]FF[4]SZ[26])'), false)
    assert.strictEqual(isPreviewSgfContentSafe(hugeGame), false)
    assert.strictEqual(parseSgfPreview(hugeGame), null)
  })
})

function findChildByClass(vnode, className) {
  return findChildrenByClass(vnode, className)[0]
}

function findChildrenByClass(vnode, className) {
  if (Array.isArray(vnode)) {
    return vnode.flatMap((child) => findChildrenByClass(child, className))
  }

  if (vnode == null || typeof vnode !== 'object') return []

  let children = Array.isArray(vnode.props?.children)
    ? vnode.props.children
    : [vnode.props?.children]
  let matches = vnode.props?.class?.includes(className) ? [vnode] : []

  return matches.concat(
    children.flatMap((child) => findChildrenByClass(child, className)),
  )
}
