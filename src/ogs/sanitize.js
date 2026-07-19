const {OgsError} = require('./errors.js')

function sanitizeBoolean(value) {
  return typeof value === 'boolean' ? value : null
}

function sanitizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sanitizeString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null
}

function sanitizeErrorMessage(value) {
  if (typeof value === 'string') return value.slice(0, 200)
  if (typeof value?.message === 'string') return value.message.slice(0, 200)
  if (typeof value?.error === 'string') return value.error.slice(0, 200)
  return 'OGS game error.'
}

function sanitizeGameId(value) {
  let gameId = sanitizeOptionalGameId(value)

  if (gameId == null) {
    throw new OgsError('invalid-input', 'A valid OGS game ID is required.')
  }

  return gameId
}

function sanitizeOptionalGameId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)) {
    let number = Number(value)
    return Number.isSafeInteger(number) ? number : null
  }

  return null
}

function sanitizeMoveCount(value, fallback) {
  if (Number.isInteger(value) && value >= 0) return value
  return Number.isInteger(fallback) && fallback >= 0 ? fallback : 0
}

function sanitizeBoardSize(value) {
  return Number.isInteger(value) && value > 0 && value <= 25 ? value : null
}

function sanitizeHandicap(value) {
  return Number.isInteger(value) && value >= 0 && value <= 9 ? value : null
}

function sanitizeAutomatchUuid(value) {
  let uuid = sanitizeOptionalAutomatchUuid(value)
  if (uuid == null) {
    throw new OgsError('invalid-input', 'A valid OGS automatch ID is required.')
  }

  return uuid
}

function sanitizeOptionalAutomatchUuid(value) {
  return typeof value === 'string' && /^[0-9a-f-]{1,80}$/i.test(value)
    ? value
    : null
}

function sanitizeAutomatchEntry(value) {
  if (value == null || typeof value !== 'object') return null

  let uuid = sanitizeOptionalAutomatchUuid(value.uuid)
  if (uuid == null) return null

  return {
    uuid,
    timestamp: sanitizeNumber(value.timestamp),
  }
}

module.exports = {
  sanitizeBoolean,
  sanitizeNumber,
  sanitizeString,
  sanitizeErrorMessage,
  sanitizeGameId,
  sanitizeOptionalGameId,
  sanitizeMoveCount,
  sanitizeBoardSize,
  sanitizeHandicap,
  sanitizeAutomatchUuid,
  sanitizeOptionalAutomatchUuid,
  sanitizeAutomatchEntry,
}
