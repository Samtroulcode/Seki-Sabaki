import assert from 'assert'

import {
  getOgsLineMoves,
  getOgsMovePlayer,
  getOgsPlayerToMove,
  getOgsServerMoves,
  movesEqual,
  normalizeOgsId,
  parseOgsStoneString,
  reconcileOgsMoves,
  sameVertices,
} from '../src/modules/ogsreconcile.js'

describe('OGS reconciliation', () => {
  it('normalizes server moves deterministically', () => {
    assert.deepStrictEqual(
      getOgsServerMoves({
        board: {width: 9, height: 9},
        moves: [
          {move: 'bb', moveNumber: 2},
          {move: 'jj', moveNumber: 3},
          {move: '..', moveNumber: 4},
          {move: 'aa', moveNumber: 1},
          {move: 'cc'},
        ],
      }),
      [
        {moveNumber: 1, move: 'aa'},
        {moveNumber: 2, move: 'bb'},
        {moveNumber: 3, move: '..'},
        {moveNumber: 4, move: 'cc'},
      ],
    )
  })

  it('uses stable fallback dimensions and numbering after filtering', () => {
    assert.deepStrictEqual(
      getOgsServerMoves({
        board: {},
        moves: [{move: 'tt'}, {move: 'aa'}, {move: 'bb'}],
      }),
      [
        {moveNumber: 1, move: 'aa'},
        {moveNumber: 2, move: 'bb'},
      ],
    )
  })

  it('extracts local moves from the OGS main line', () => {
    assert.deepStrictEqual(
      getOgsLineMoves([
        {data: {}},
        {data: {B: ['aa']}},
        {data: {W: ['']}},
        {data: {C: ['comment only']}},
        {data: {B: ['bb']}},
      ]),
      [
        {moveNumber: 1, move: 'aa'},
        {moveNumber: 2, move: '..'},
        {moveNumber: 4, move: 'bb'},
      ],
    )
  })

  it('reports synchronized and confirmed optimistic moves', () => {
    let pendingMove = {moveNumber: 3, move: 'cc'}
    let result = reconcileOgsMoves({
      localMoves: [
        {moveNumber: 1, move: 'aa'},
        {moveNumber: 2, move: 'bb'},
        pendingMove,
      ],
      serverMoves: [
        {moveNumber: 1, move: 'aa'},
        {moveNumber: 2, move: 'bb'},
        {moveNumber: 3, move: 'cc'},
      ],
      pendingMove,
    })

    assert.deepStrictEqual(result, {
      status: 'in-sync',
      appendMoves: [],
      confirmedPendingMove: pendingMove,
    })
  })

  it('keeps an unconfirmed optimistic move local', () => {
    let pendingMove = {moveNumber: 3, move: 'cc'}

    assert.deepStrictEqual(
      reconcileOgsMoves({
        localMoves: [
          {moveNumber: 1, move: 'aa'},
          {moveNumber: 2, move: 'bb'},
          pendingMove,
        ],
        serverMoves: [
          {moveNumber: 1, move: 'aa'},
          {moveNumber: 2, move: 'bb'},
        ],
        pendingMove,
      }),
      {
        status: 'pending-local-move',
        appendMoves: [],
        confirmedPendingMove: null,
      },
    )
  })

  it('returns explicit append and divergence results', () => {
    assert.deepStrictEqual(
      reconcileOgsMoves({
        localMoves: [{moveNumber: 1, move: 'aa'}],
        serverMoves: [
          {moveNumber: 1, move: 'aa'},
          {moveNumber: 2, move: 'bb'},
        ],
      }),
      {
        status: 'applied',
        appendMoves: [{moveNumber: 2, move: 'bb'}],
        confirmedPendingMove: null,
      },
    )

    assert.deepStrictEqual(
      reconcileOgsMoves({
        localMoves: [
          {moveNumber: 1, move: 'aa'},
          {moveNumber: 2, move: 'cc'},
        ],
        serverMoves: [
          {moveNumber: 1, move: 'aa'},
          {moveNumber: 2, move: 'bb'},
        ],
      }),
      {
        status: 'diverged',
        appendMoves: [],
        confirmedPendingMove: null,
      },
    )
  })

  it('keeps OGS ID, player, stone, vertex, and move helpers stable', () => {
    assert.strictEqual(normalizeOgsId('42'), 42)
    assert.strictEqual(normalizeOgsId('0'), null)
    assert.strictEqual(getOgsMovePlayer(1, 0), 1)
    assert.strictEqual(getOgsMovePlayer(1, 2), -1)
    assert.strictEqual(
      getOgsPlayerToMove({
        moveCount: 1,
        handicap: 0,
        players: {black: {id: '7'}, white: {id: 8}},
      }),
      8,
    )
    assert.deepStrictEqual(parseOgsStoneString('aabb..bad', 9, 9), [
      [0, 0],
      [1, 1],
      [1, 0],
    ])
    assert.deepStrictEqual(parseOgsStoneString('aajj', 9, 9), [[0, 0]])
    assert.strictEqual(sameVertices([[1, 1]], [[1, 1]]), true)
    assert.strictEqual(
      movesEqual([{moveNumber: 1, move: 'aa'}], [{moveNumber: 1, move: 'aa'}]),
      true,
    )
  })
})
