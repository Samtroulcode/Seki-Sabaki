export function getOgsClockView(clock, players = {}, now = Date.now()) {
  return {
    black: getPlayerClockView(clock, players.black?.id, clock?.blackTime, now),
    white: getPlayerClockView(clock, players.white?.id, clock?.whiteTime, now),
  }
}

function getPlayerClockView(clock, playerId, time, now) {
  let active = clock?.currentPlayer != null && clock.currentPlayer === playerId
  let paused = clock?.pause?.paused === true
  let remaining = getRemainingMilliseconds(clock, time, active, now)

  return {
    active,
    paused,
    stoneRemoval: clock?.stoneRemovalMode === true,
    label: remaining == null ? '—' : formatClockDuration(remaining),
    detail: getClockDetail(time, {
      paused,
      stoneRemoval: clock?.stoneRemovalMode,
    }),
  }
}

function getRemainingMilliseconds(clock, time, active, now) {
  if (
    active &&
    clock?.expiration != null &&
    clock?.pause?.paused !== true &&
    clock?.stoneRemovalMode !== true
  ) {
    let serverNow = getServerNow(clock, now)
    return Math.max(0, clock.expiration - serverNow)
  }

  let seconds = getStoredTimeSeconds(time)
  if (seconds != null) return Math.max(0, seconds * 1000)

  return null
}

function getStoredTimeSeconds(time) {
  if (time == null) return null
  if (time.thinkingTime != null && time.thinkingTime > 0) {
    return time.thinkingTime
  }
  if (time.periodTimeLeft != null) return time.periodTimeLeft
  if (time.blockTime != null) return time.blockTime
  if (time.thinkingTime != null) return time.thinkingTime

  return null
}

function getServerNow(clock, now) {
  if (clock?.now == null || clock?.receivedAt == null) return now
  return clock.now + (now - clock.receivedAt)
}

function getClockDetail(time, {paused, stoneRemoval}) {
  if (stoneRemoval === true) return 'Stone removal'
  if (paused === true) return 'Paused'
  if (time?.periods != null && time.periodTime != null) {
    return `${time.periods} × ${formatClockDuration(time.periodTime * 1000)}`
  }
  if (time?.movesLeft != null) return `${time.movesLeft} moves`

  return null
}

export function formatClockDuration(milliseconds) {
  let seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  let hours = Math.floor(seconds / 3600)
  let minutes = Math.floor((seconds % 3600) / 60)
  let rest = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${rest
      .toString()
      .padStart(2, '0')}`
  }

  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
