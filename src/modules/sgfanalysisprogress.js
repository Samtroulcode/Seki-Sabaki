export function parseAnalyzeSgfProgress(line) {
  if (typeof line !== 'string') return null

  let match = line.match(
    /(?:^|\s)(\d{1,3})%\s*\(\s*(\d+)\s*\/\s*(\d+)\s*,\s*([\d.]+)\s*([kKmM]?)\s+visits?\s*\)/,
  )

  if (match == null) return null

  let percent = Number(match[1])
  let currentMove = Number(match[2])
  let totalMoves = Number(match[3])
  let visits = parseVisits(match[4], match[5])

  if (
    !Number.isInteger(percent) ||
    percent < 0 ||
    percent > 100 ||
    !Number.isInteger(currentMove) ||
    currentMove < 0 ||
    !Number.isInteger(totalMoves) ||
    totalMoves < 0 ||
    currentMove > totalMoves ||
    !Number.isInteger(visits) ||
    visits < 0
  ) {
    return null
  }

  return {percent, currentMove, totalMoves, visits}
}

function parseVisits(value, suffix) {
  let visits = Number(value)
  if (!Number.isFinite(visits)) return NaN

  let multiplier =
    suffix.toLowerCase() === 'k' ? 1e3 : suffix.toLowerCase() === 'm' ? 1e6 : 1

  return Math.round(visits * multiplier)
}
