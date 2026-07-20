const {
  sanitizeNumber,
  sanitizeOptionalGameId,
  sanitizeString,
} = require('./sanitize.js')

function sanitizeClock(clock) {
  if (clock == null || typeof clock !== 'object') return null

  return {
    gameId: sanitizeOptionalGameId(clock.game_id),
    title: sanitizeString(clock.title, 80),
    blackPlayerId: sanitizeOptionalGameId(clock.black_player_id),
    whitePlayerId: sanitizeOptionalGameId(clock.white_player_id),
    currentPlayer: sanitizeOptionalGameId(clock.current_player),
    expiration:
      typeof clock.expiration === 'number' && Number.isFinite(clock.expiration)
        ? clock.expiration
        : null,
    now: sanitizeNumber(clock.now),
    receivedAt: Date.now(),
    lastMove: sanitizeOptionalMoveCount(clock.last_move),
    blackTime: sanitizeClockTime(clock.black_time),
    whiteTime: sanitizeClockTime(clock.white_time),
    pause: sanitizeClockPause(clock.pause, clock.paused_since),
    stoneRemovalMode: clock.stone_removal_mode === true,
    stoneRemovalExpiration: sanitizeNumber(clock.stone_removal_expiration),
  }
}

function sanitizeOptionalMoveCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 10000 ? value : null
}

function sanitizeClockTime(time) {
  if (time == null || typeof time !== 'object') return null

  return {
    thinkingTime: sanitizeNumber(time.thinking_time),
    periodTime: sanitizeNumber(time.period_time),
    periodTimeLeft: sanitizeNumber(time.period_time_left),
    periods:
      Number.isInteger(time.periods) && time.periods >= 0 ? time.periods : null,
    blockTime: sanitizeNumber(time.block_time),
    movesLeft:
      Number.isInteger(time.moves_left) && time.moves_left >= 0
        ? time.moves_left
        : null,
    skipBonus: time.skip_bonus === true,
  }
}

function sanitizeClockPause(pause, pausedSince = null) {
  let result = {
    paused: false,
    pausedSince: sanitizeNumber(pausedSince),
  }

  if (pause == null || typeof pause !== 'object') return result

  return {
    paused: pause.paused === true,
    pausedSince: sanitizeNumber(pause.paused_since) || result.pausedSince,
  }
}

function isFutureClock(clock, moveCount) {
  return clock?.lastMove != null && clock.lastMove > moveCount
}

function isCurrentClock(clock, moveCount) {
  return clock?.lastMove == null || clock.lastMove === moveCount
}

function reduceClockSequence({
  currentClock = null,
  pendingClocks = new Map(),
  moveCount = 0,
  incomingClock = null,
} = {}) {
  let nextPendingClocks = new Map(pendingClocks)

  if (isFutureClock(incomingClock, moveCount)) {
    nextPendingClocks.set(incomingClock.lastMove, incomingClock)
    return {
      clock: currentClock,
      pendingClocks: nextPendingClocks,
      appliedClock: null,
      action: 'buffered',
    }
  }

  if (!isCurrentClock(incomingClock, moveCount)) {
    return {
      clock: currentClock,
      pendingClocks: nextPendingClocks,
      appliedClock: null,
      action: 'ignored',
    }
  }

  nextPendingClocks.delete(incomingClock?.lastMove)

  return {
    clock: incomingClock,
    pendingClocks: nextPendingClocks,
    appliedClock: incomingClock,
    action: 'applied',
  }
}

function advanceClockSequence({
  currentClock = null,
  pendingClocks = new Map(),
  moveCount = 0,
} = {}) {
  let nextPendingClocks = new Map(pendingClocks)

  for (let lastMove of nextPendingClocks.keys()) {
    if (lastMove < moveCount) nextPendingClocks.delete(lastMove)
  }

  let clock = nextPendingClocks.get(moveCount)
  if (clock == null) {
    return {
      clock: currentClock,
      pendingClocks: nextPendingClocks,
      appliedClock: null,
      action: 'unchanged',
    }
  }

  nextPendingClocks.delete(moveCount)

  return {
    clock,
    pendingClocks: nextPendingClocks,
    appliedClock: clock,
    action: 'applied',
  }
}

module.exports = {
  sanitizeClock,
  sanitizeOptionalMoveCount,
  sanitizeClockTime,
  sanitizeClockPause,
  isFutureClock,
  isCurrentClock,
  reduceClockSequence,
  advanceClockSequence,
}
