const STRUCTURED_PROGRESS_PREFIX = 'ANALYZE_SGF_PROGRESS '

function parseAnalyzeSgfProgress(line) {
  if (typeof line !== 'string') return null

  let structured = parseStructuredProgress(line)
  if (structured != null) return structured

  let match = line.match(
    /(?:^|\s)(\d{1,3})%\s*\(\s*(\d+)\s*\/\s*(\d+)\s*,\s*([\d.]+)\s*([kKmM]?)\s+visits?\s*\)/,
  )

  if (match == null) return null

  let percent = Number(match[1])
  let currentMove = Number(match[2])
  let totalMoves = Number(match[3])
  let visits = parseVisits(match[4], match[5])

  if (!isValidProgress({percent, currentMove, totalMoves, visits})) return null

  return {percent, currentMove, totalMoves, visits}
}

function parseStructuredProgress(line) {
  let index = line.indexOf(STRUCTURED_PROGRESS_PREFIX)
  if (index === -1) return null

  let json = line.slice(index + STRUCTURED_PROGRESS_PREFIX.length).trim()
  let value

  try {
    value = JSON.parse(json)
  } catch (err) {
    return null
  }

  if (value == null || typeof value !== 'object') return null

  let progress = {
    percent: value.percent,
    currentMove: value.currentMove,
    totalMoves: value.totalMoves,
    visits: value.visits,
  }

  return isValidProgress(progress) ? progress : null
}

function isValidProgress({percent, currentMove, totalMoves, visits}) {
  return (
    Number.isInteger(percent) &&
    percent >= 0 &&
    percent <= 100 &&
    Number.isInteger(currentMove) &&
    currentMove >= 0 &&
    Number.isInteger(totalMoves) &&
    totalMoves >= 0 &&
    currentMove <= totalMoves &&
    Number.isInteger(visits) &&
    visits >= 0
  )
}

function parseVisits(value, suffix) {
  let visits = Number(value)
  if (!Number.isFinite(visits)) return NaN

  let multiplier =
    suffix.toLowerCase() === 'k' ? 1e3 : suffix.toLowerCase() === 'm' ? 1e6 : 1

  return Math.round(visits * multiplier)
}

exports.parseAnalyzeSgfProgress = parseAnalyzeSgfProgress
