import assert from 'assert'

import {
  encodeOgsCoordinates,
  encodeOgsMove,
  isMoveInBoard,
  mergeMoves,
  sanitizeHistoricalMoves,
  sanitizeLiveMove,
} from '../src/ogs/moves.js'

describe('OGS move helpers', () => {
  it('encodes OGS coordinates and board bounds', () => {
    let board = {width: 9, height: 9}

    assert.strictEqual(encodeOgsCoordinates(2, 3, board), 'cd')
    assert.strictEqual(encodeOgsCoordinates(-1, -1, board), '..')
    assert.strictEqual(encodeOgsCoordinates(9, 0, board), null)
    assert.strictEqual(encodeOgsCoordinates(25, 25), 'zz')
    assert.strictEqual(encodeOgsCoordinates(26, 0), null)
    assert.strictEqual(isMoveInBoard('ii', board), true)
    assert.strictEqual(isMoveInBoard('ji', board), false)
  })

  it('normalizes OGS move shapes', () => {
    let board = {width: 9, height: 9}

    assert.strictEqual(encodeOgsMove('aa', board), 'aa')
    assert.strictEqual(encodeOgsMove('..', board), '..')
    assert.strictEqual(encodeOgsMove([1, 1], board), 'bb')
    assert.strictEqual(encodeOgsMove({x: 2, y: 2}, board), 'cc')
    assert.strictEqual(encodeOgsMove('jj', board), null)
    assert.strictEqual(encodeOgsMove('bad', board), null)
  })

  it('sanitizes historical OGS moves', () => {
    let board = {width: 9, height: 9}

    assert.deepStrictEqual(sanitizeHistoricalMoves('aabb', board), [
      {move: 'aa', moveNumber: 1},
      {move: 'bb', moveNumber: 2},
    ])
    assert.deepStrictEqual(
      sanitizeHistoricalMoves(['aa', [1, 1], {x: 2, y: 2}, '..', 'jj'], board),
      [
        {move: 'aa', moveNumber: 1},
        {move: 'bb', moveNumber: 2},
        {move: 'cc', moveNumber: 3},
        {move: '..', moveNumber: 4},
      ],
    )
    assert.deepStrictEqual(sanitizeHistoricalMoves([['aa', 3]], board), [
      {move: 'aa', moveNumber: 3},
    ])
    assert.deepStrictEqual(sanitizeHistoricalMoves(null, board), [])
  })

  it('sanitizes live moves and merges them by move number', () => {
    assert.deepStrictEqual(
      sanitizeLiveMove({move: [2, 3], move_number: 4}, 1, {
        width: 9,
        height: 9,
      }),
      {move: 'cd', moveNumber: 4},
    )
    assert.deepStrictEqual(sanitizeLiveMove({move: 'aa'}, 2), {
      move: 'aa',
      moveNumber: 2,
    })
    assert.strictEqual(sanitizeLiveMove({move: 'bad'}, 2), null)
    assert.deepStrictEqual(
      mergeMoves(
        [
          {move: 'aa', moveNumber: 1},
          {move: 'bb', moveNumber: 2},
        ],
        {move: 'cc', moveNumber: 2},
      ),
      [
        {move: 'aa', moveNumber: 1},
        {move: 'cc', moveNumber: 2},
      ],
    )
  })
})
