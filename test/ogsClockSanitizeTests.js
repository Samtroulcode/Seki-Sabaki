import assert from 'assert'

import {
  advanceClockSequence,
  isCurrentClock,
  isFutureClock,
  reduceClockSequence,
  sanitizeClock,
  sanitizeClockPause,
  sanitizeClockTime,
  sanitizeOptionalMoveCount,
} from '../src/ogs/clock.js'

describe('OGS clock sanitize helpers', () => {
  it('sanitizes OGS clock payloads', () => {
    let originalNow = Date.now
    Date.now = () => 123456

    try {
      assert.deepStrictEqual(
        sanitizeClock({
          game_id: 12345,
          title: 'Byo-Yomi',
          black_player_id: 7,
          white_player_id: 8,
          current_player: 8,
          expiration: 1784381000000,
          now: 1784380940000,
          last_move: 3,
          black_time: {thinking_time: 120, skip_bonus: true},
          white_time: {
            thinking_time: 60,
            period_time: 30,
            period_time_left: 20,
            periods: 5,
          },
          pause: {paused: true, paused_since: 1784380900000},
          stone_removal_mode: true,
          stone_removal_expiration: 1784381100000,
          jwt: 'must-not-leak',
        }),
        {
          gameId: 12345,
          title: 'Byo-Yomi',
          blackPlayerId: 7,
          whitePlayerId: 8,
          currentPlayer: 8,
          expiration: 1784381000000,
          now: 1784380940000,
          receivedAt: 123456,
          lastMove: 3,
          blackTime: {
            thinkingTime: 120,
            periodTime: null,
            periodTimeLeft: null,
            periods: null,
            blockTime: null,
            movesLeft: null,
            skipBonus: true,
          },
          whiteTime: {
            thinkingTime: 60,
            periodTime: 30,
            periodTimeLeft: 20,
            periods: 5,
            blockTime: null,
            movesLeft: null,
            skipBonus: false,
          },
          pause: {paused: true, pausedSince: 1784380900000},
          stoneRemovalMode: true,
          stoneRemovalExpiration: 1784381100000,
        },
      )
    } finally {
      Date.now = originalNow
    }
  })

  it('sanitizes optional clock fields', () => {
    assert.strictEqual(sanitizeClock(null), null)
    assert.strictEqual(sanitizeClock('bad'), null)
    assert.strictEqual(sanitizeOptionalMoveCount(0), 0)
    assert.strictEqual(sanitizeOptionalMoveCount(-1), null)
    assert.strictEqual(sanitizeOptionalMoveCount(null), null)
    assert.deepStrictEqual(sanitizeClockTime(null), null)
    assert.deepStrictEqual(
      sanitizeClockTime({block_time: 300, moves_left: 10}),
      {
        thinkingTime: null,
        periodTime: null,
        periodTimeLeft: null,
        periods: null,
        blockTime: 300,
        movesLeft: 10,
        skipBonus: false,
      },
    )
    assert.deepStrictEqual(sanitizeClockPause(null, 10), {
      paused: false,
      pausedSince: 10,
    })
  })

  it('classifies sequenced clocks against local moves', () => {
    assert.strictEqual(isFutureClock({lastMove: 3}, 2), true)
    assert.strictEqual(isFutureClock({lastMove: 2}, 2), false)
    assert.strictEqual(isCurrentClock({lastMove: 2}, 2), true)
    assert.strictEqual(isCurrentClock({lastMove: 1}, 2), false)
    assert.strictEqual(isCurrentClock({lastMove: null}, 2), true)
  })

  it('applies, buffers, and ignores sequenced clock updates', () => {
    let currentClock = {lastMove: 2, currentPlayer: 7}
    let pendingClocks = new Map([[4, {lastMove: 4, currentPlayer: 7}]])

    let result = reduceClockSequence({
      currentClock,
      pendingClocks,
      moveCount: 2,
      incomingClock: {lastMove: 3, currentPlayer: 8},
    })

    assert.strictEqual(result.action, 'buffered')
    assert.strictEqual(result.clock, currentClock)
    assert.strictEqual(result.pendingClocks.get(3).currentPlayer, 8)
    assert.strictEqual(pendingClocks.has(3), false)

    result = reduceClockSequence({
      currentClock,
      pendingClocks: result.pendingClocks,
      moveCount: 2,
      incomingClock: {lastMove: 1, currentPlayer: 8},
    })

    assert.strictEqual(result.action, 'ignored')
    assert.strictEqual(result.clock, currentClock)

    result = reduceClockSequence({
      currentClock,
      pendingClocks: result.pendingClocks,
      moveCount: 2,
      incomingClock: {lastMove: 2, currentPlayer: 8},
    })

    assert.strictEqual(result.action, 'applied')
    assert.deepStrictEqual(result.clock, {lastMove: 2, currentPlayer: 8})
  })

  it('advances buffered clocks and purges stale clock updates', () => {
    let result = advanceClockSequence({
      currentClock: {lastMove: 2, currentPlayer: 7},
      pendingClocks: new Map([
        [1, {lastMove: 1, currentPlayer: 7}],
        [3, {lastMove: 3, currentPlayer: 8}],
        [4, {lastMove: 4, currentPlayer: 7}],
      ]),
      moveCount: 3,
    })

    assert.strictEqual(result.action, 'applied')
    assert.deepStrictEqual(result.clock, {lastMove: 3, currentPlayer: 8})
    assert.strictEqual(result.pendingClocks.has(1), false)
    assert.strictEqual(result.pendingClocks.has(3), false)
    assert.strictEqual(result.pendingClocks.has(4), true)
  })
})
