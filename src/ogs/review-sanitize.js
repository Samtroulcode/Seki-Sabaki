const reviewTypes = new Set(['fast', 'full'])
const reviewEngines = new Set(['katago', 'leela_zero'])

function sanitizeReviewList(response, maxResults = 20) {
  let results = Array.isArray(response) ? response : response?.results
  if (!Array.isArray(results)) return []

  let sanitized = []
  for (let entry of results.slice(0, maxResults * 4)) {
    let review = sanitizeReview(entry)
    if (review == null) continue
    sanitized.push(review)
    if (sanitized.length >= maxResults) break
  }
  return sanitized
}

function sanitizeReview(value) {
  if (value == null || typeof value !== 'object') return null

  let id = sanitizePositiveInteger(value.id)
  if (id == null) return null

  return {
    id,
    uuid: sanitizeUuid(value.uuid),
    type: reviewTypes.has(value.type) ? value.type : null,
    engine: reviewEngines.has(value.engine) ? value.engine : null,
    engineVersion: sanitizeString(value.engine_version, 80),
    network: sanitizeString(value.network, 120),
    networkSize: sanitizeString(value.network_size, 80),
    strength: sanitizeFiniteNumber(value.strength),
    playouts: sanitizeNonNegativeInteger(value.playouts),
    visits: sanitizeNonNegativeInteger(value.visits),
    date: sanitizeFiniteNumber(value.date),
    winRate: sanitizeFiniteNumber(value.win_rate),
    status: sanitizeString(value.status, 40),
  }
}

function sanitizeReviewMove(value) {
  if (value == null || typeof value !== 'object') return null

  let move = sanitizeVertex(value.move)
  if (move == null) return null

  return {
    moveNumber: sanitizeNonNegativeInteger(value.move_number),
    move,
    winRate: sanitizeProbability(value.win_rate),
    score: sanitizeFiniteNumber(value.score),
    branches: Array.isArray(value.branches)
      ? value.branches.slice(0, 100).map(sanitizeReviewBranch).filter(Boolean)
      : [],
  }
}

function sanitizeReviewBranch(value) {
  if (value == null || typeof value !== 'object') return null

  let moves = Array.isArray(value.moves)
    ? value.moves.slice(0, 20).map(sanitizeVertex).filter(Boolean)
    : []
  if (moves.length === 0) return null

  return {
    moves,
    winRate: sanitizeProbability(value.win_rate),
    score: sanitizeFiniteNumber(value.score),
    visits: sanitizeNonNegativeInteger(value.visits) || 0,
  }
}

function sanitizeReviewUpdate(value) {
  if (value == null || typeof value !== 'object') return null

  let result = {}
  for (let [key, entry] of Object.entries(value).slice(0, 5000)) {
    if (/^move-\d+$/.test(key)) {
      let move = sanitizeReviewMove(entry)
      if (move != null) result[key] = move
    } else if (key.startsWith('variation-')) {
      let move = sanitizeReviewMove(entry)
      if (move != null) result[key] = move
    } else if (key === 'metadata') {
      result.metadata = sanitizeReview(entry)
    } else if (key === 'error') {
      result.error = sanitizeString(entry, 200)
    }
  }
  return result
}

function selectBestReview(reviews) {
  return [...(Array.isArray(reviews) ? reviews : [])]
    .filter((review) => review?.uuid != null && review?.type != null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'full' ? -1 : 1
      if ((b.strength || 0) !== (a.strength || 0)) {
        return (b.strength || 0) - (a.strength || 0)
      }
      return (b.date || 0) - (a.date || 0)
    })[0]
}

function sanitizeUuid(value) {
  return typeof value === 'string' && /^[0-9a-f-]{16,80}$/i.test(value)
    ? value
    : null
}

function sanitizeString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null
}

function sanitizeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sanitizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

function sanitizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function sanitizeProbability(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0
}

function sanitizeVertex(value) {
  return value != null &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    value.x >= 0 &&
    value.x < 25 &&
    value.y >= 0 &&
    value.y < 25
    ? {x: value.x, y: value.y}
    : null
}

module.exports = {
  sanitizeReviewList,
  sanitizeReview,
  sanitizeReviewUpdate,
  selectBestReview,
}
