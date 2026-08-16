export function getOgsClockView(
  clock,
  players = {},
  now = Date.now(),
  options = {},
) {
  players = players || {}

  return {
    black: getPlayerClockView(
      clock,
      players.black?.id ?? clock?.blackPlayerId,
      clock?.blackTime,
      now,
      options,
    ),
    white: getPlayerClockView(
      clock,
      players.white?.id ?? clock?.whitePlayerId,
      clock?.whiteTime,
      now,
      options,
    ),
  }
}

function getPlayerClockView(clock, playerId, time, now, options) {
  let active = clock?.currentPlayer != null && clock.currentPlayer === playerId
  let paused = clock?.pause?.paused === true
  let freezeActive =
    (options.freezeActive === true || options.freezeFinished === true) && active
  let state = getPlayerClockState(clock, time, active, now, {
    freezeActive,
    freezeFinished: options.freezeFinished === true,
    freezeAt: options.freezeAt,
    drift: options.drift,
  })

  return {
    active,
    paused,
    stoneRemoval: clock?.stoneRemovalMode === true,
    label:
      state.milliseconds == null
        ? '—'
        : formatClockDuration(state.milliseconds),
    detail: getClockDetail(time, {
      paused,
      submitting: freezeActive && options.freezeFinished !== true,
      stoneRemoval: clock?.stoneRemovalMode,
      periods: state.periods,
    }),
  }
}

function getPlayerClockState(clock, time, active, now, options = {}) {
  if (
    active &&
    clock?.expiration != null &&
    clock?.pause?.paused !== true &&
    clock?.stoneRemovalMode !== true &&
    options.freezeFinished !== true
  ) {
    let clockNow = options.freezeActive
      ? Math.max(options.freezeAt || now, clock.receivedAt || 0)
      : now
    let serverNow = getServerNow(clock, clockNow, {
      drift: options.drift,
    })
    let remaining = Math.max(0, clock.expiration - serverNow)

    return getActiveStoredTimeState(time, remaining)
  }

  let seconds = getStoredTimeSeconds(time)
  if (seconds != null) return {milliseconds: Math.max(0, seconds * 1000)}

  return {milliseconds: null}
}

function getActiveStoredTimeState(time, remaining) {
  if (time?.periodTime != null && time?.periods != null) {
    let periodTime = Math.max(0, time.periodTime * 1000)
    let overtime = Math.max(0, time.periods * periodTime)

    if (periodTime > 0 && overtime > 0) {
      let mainTime = Math.max(0, remaining - overtime)
      if (mainTime > 0) return {milliseconds: mainTime, periods: time.periods}

      let overtimeUsed = Math.max(0, overtime - remaining)
      let periodsUsed = Math.floor(overtimeUsed / periodTime)
      let periods = Math.max(0, time.periods - periodsUsed)
      let periodTimeLeft = periodTime - (overtimeUsed % periodTime)

      return {milliseconds: remaining <= 0 ? 0 : periodTimeLeft, periods}
    }
  }

  return {milliseconds: remaining}
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

function getServerNow(clock, now, {drift = null} = {}) {
  if (clock?.now == null || clock?.receivedAt == null) {
    return typeof drift === 'number' && Number.isFinite(drift)
      ? now - drift
      : now
  }

  return clock.now + (now - clock.receivedAt)
}

function getClockDetail(time, {paused, submitting, stoneRemoval, periods}) {
  if (stoneRemoval === true) return 'Stone removal'
  if (submitting === true) return 'Submitting move'
  if (paused === true) return 'Paused'
  if (periods != null && time?.periodTime != null) {
    return `${periods} × ${formatClockDuration(time.periodTime * 1000)}`
  }
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
