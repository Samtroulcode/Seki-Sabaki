import assert from 'assert'

import {formatClockDuration, getOgsClockView} from '../src/modules/ogsclock.js'

describe('OGS clock display', () => {
  it('formats clock durations', () => {
    assert.strictEqual(formatClockDuration(0), '0:00')
    assert.strictEqual(formatClockDuration(1000), '0:01')
    assert.strictEqual(formatClockDuration(61000), '1:01')
    assert.strictEqual(formatClockDuration(3661000), '1:01:01')
  })

  it('derives active time from server expiration and offset', () => {
    let clock = {
      currentPlayer: 7,
      expiration: 1060000,
      now: 1000000,
      receivedAt: 5000,
      blackTime: {thinkingTime: 120},
      whiteTime: {thinkingTime: 90},
    }
    let view = getOgsClockView(clock, {black: {id: 7}, white: {id: 8}}, 35000)

    assert.strictEqual(view.black.active, true)
    assert.strictEqual(view.black.label, '0:30')
    assert.strictEqual(view.white.active, false)
    assert.strictEqual(view.white.label, '1:30')
  })

  it('uses player ids from clock payload when game players are unavailable', () => {
    let clock = {
      blackPlayerId: 7,
      whitePlayerId: 8,
      currentPlayer: 7,
      expiration: 1060000,
      now: 1000000,
      receivedAt: 5000,
    }
    let view = getOgsClockView(clock, null, 35000)

    assert.strictEqual(view.black.active, true)
    assert.strictEqual(view.black.label, '0:30')
    assert.strictEqual(view.white.active, false)
    assert.strictEqual(view.white.label, '—')
  })

  it('uses measured server drift when clock snapshots lack server now', () => {
    let clock = {
      currentPlayer: 7,
      expiration: 1006000,
      blackTime: {thinkingTime: 120},
      whiteTime: {thinkingTime: 90},
    }
    let view = getOgsClockView(clock, {black: {id: 7}, white: {id: 8}}, 7000, {
      drift: 1000,
    })

    assert.strictEqual(view.black.label, '16:40')
  })

  it('shows pause and byo-yomi details without ticking', () => {
    let clock = {
      currentPlayer: 7,
      expiration: 1000,
      pause: {paused: true},
      blackTime: {thinkingTime: 45, periods: 3, periodTime: 30},
      whiteTime: {thinkingTime: 90},
    }
    let view = getOgsClockView(clock, {black: {id: 7}, white: {id: 8}}, 5000)

    assert.strictEqual(view.black.paused, true)
    assert.strictEqual(view.black.label, '0:45')
    assert.strictEqual(view.black.detail, 'Paused')
  })

  it('uses overtime fields when main time is exhausted', () => {
    let view = getOgsClockView(
      {
        currentPlayer: 8,
        blackTime: {thinkingTime: 0, periodTimeLeft: 25, periods: 4},
        whiteTime: {thinkingTime: 0, blockTime: 300, movesLeft: 10},
      },
      {black: {id: 7}, white: {id: 8}},
      5000,
    )

    assert.strictEqual(view.black.label, '0:25')
    assert.strictEqual(view.white.label, '5:00')
  })

  it('freezes the active clock while a move is submitting', () => {
    let clock = {
      currentPlayer: 7,
      expiration: 1060000,
      now: 1000000,
      receivedAt: 5000,
      blackTime: {thinkingTime: 120},
      whiteTime: {thinkingTime: 90},
    }

    let view = getOgsClockView(clock, {black: {id: 7}, white: {id: 8}}, 35000, {
      freezeActive: true,
      freezeAt: 15000,
    })

    assert.strictEqual(view.black.active, true)
    assert.strictEqual(view.black.label, '0:50')
    assert.strictEqual(view.black.detail, 'Submitting move')
    assert.strictEqual(view.white.label, '1:30')
  })

  it('does not rewind clock snapshots received after submission began', () => {
    let clock = {
      currentPlayer: 7,
      expiration: 1060000,
      now: 1020000,
      receivedAt: 25000,
      blackTime: {thinkingTime: 120},
      whiteTime: {thinkingTime: 90},
    }

    let view = getOgsClockView(clock, {black: {id: 7}, white: {id: 8}}, 35000, {
      freezeActive: true,
      freezeAt: 15000,
    })

    assert.strictEqual(view.black.label, '0:40')
    assert.strictEqual(view.black.detail, 'Submitting move')
  })
})
