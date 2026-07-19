const {randomUUID} = require('crypto')

const DEFAULT_MATCHMAKING_OPTIONS = {
  boardSizes: [19],
  speeds: ['rapid'],
  timeSystem: 'byoyomi',
  lowerRankDiff: 3,
  upperRankDiff: 3,
  rules: {condition: 'required', value: 'japanese'},
  handicap: {condition: 'preferred', value: 'enabled'},
}
const AUTOMATCH_BOARD_SIZES = [9, 13, 19]
const AUTOMATCH_SPEEDS = ['blitz', 'rapid', 'live', 'correspondence']
const AUTOMATCH_TIME_SYSTEMS = ['fischer', 'byoyomi']
const AUTOMATCH_CONDITIONS = ['required', 'preferred', 'no-preference']
const AUTOMATCH_RULES = ['chinese', 'aga', 'japanese', 'korean', 'ing', 'nz']
const AUTOMATCH_HANDICAP_VALUES = ['enabled', 'disabled']

function sanitizeMatchmakingOptions(options = {}) {
  if (options == null || typeof options !== 'object') options = {}

  let boardSizes = sanitizeArrayOption(
    options.boardSizes,
    AUTOMATCH_BOARD_SIZES,
    DEFAULT_MATCHMAKING_OPTIONS.boardSizes,
  )
  let speeds = sanitizeArrayOption(
    options.speeds,
    AUTOMATCH_SPEEDS,
    DEFAULT_MATCHMAKING_OPTIONS.speeds,
  )
  let timeSystem = AUTOMATCH_TIME_SYSTEMS.includes(options.timeSystem)
    ? options.timeSystem
    : DEFAULT_MATCHMAKING_OPTIONS.timeSystem
  let lowerRankDiff = sanitizeRankDiff(
    options.lowerRankDiff,
    DEFAULT_MATCHMAKING_OPTIONS.lowerRankDiff,
  )
  let upperRankDiff = sanitizeRankDiff(
    options.upperRankDiff,
    DEFAULT_MATCHMAKING_OPTIONS.upperRankDiff,
  )
  let rules = sanitizeConditionValue(
    options.rules,
    AUTOMATCH_RULES,
    DEFAULT_MATCHMAKING_OPTIONS.rules,
  )
  let handicap = sanitizeConditionValue(
    options.handicap,
    AUTOMATCH_HANDICAP_VALUES,
    DEFAULT_MATCHMAKING_OPTIONS.handicap,
  )

  return {
    boardSizes,
    speeds,
    timeSystem,
    lowerRankDiff,
    upperRankDiff,
    rules,
    handicap,
  }
}

function sanitizeArrayOption(value, allowedValues, fallback) {
  if (!Array.isArray(value)) return [...fallback]

  let result = value.filter((item) => allowedValues.includes(item))
  return result.length === 0 ? [...fallback] : [...new Set(result)]
}

function sanitizeRankDiff(value, fallback) {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), 9) : fallback
}

function sanitizeConditionValue(value, allowedValues, fallback) {
  if (value == null || typeof value !== 'object') return {...fallback}

  return {
    condition: AUTOMATCH_CONDITIONS.includes(value.condition)
      ? value.condition
      : fallback.condition,
    value: allowedValues.includes(value.value) ? value.value : fallback.value,
  }
}

function buildAutomatchPayload(options = {}, {uuid = randomUUID()} = {}) {
  let sanitized = sanitizeMatchmakingOptions(options)

  return {
    uuid,
    size_speed_options: sanitized.boardSizes.flatMap((boardSize) =>
      sanitized.speeds.map((speed) => ({
        size: `${boardSize}x${boardSize}`,
        speed,
        system: sanitized.timeSystem,
      })),
    ),
    lower_rank_diff: sanitized.lowerRankDiff,
    upper_rank_diff: sanitized.upperRankDiff,
    rules: sanitized.rules,
    handicap: sanitized.handicap,
    timestamp: Date.now(),
  }
}

module.exports = {
  DEFAULT_MATCHMAKING_OPTIONS,
  AUTOMATCH_BOARD_SIZES,
  AUTOMATCH_SPEEDS,
  AUTOMATCH_TIME_SYSTEMS,
  AUTOMATCH_CONDITIONS,
  AUTOMATCH_RULES,
  AUTOMATCH_HANDICAP_VALUES,
  buildAutomatchPayload,
  sanitizeMatchmakingOptions,
}
