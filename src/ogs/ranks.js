function ratingToRank(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null

  let clippedRating = Math.min(Math.max(rating, 100), 6000)
  let rank = Math.round(Math.log(clippedRating / 525) * 23.15)
  rank = Math.min(Math.max(rank, 0), 38)

  if (rank < 30) return `${30 - rank}k`
  return `${rank - 29}d`
}

function rankNumberToRank(rank) {
  if (!Number.isInteger(rank) || rank < 0 || rank > 38) return null

  if (rank < 30) return `${30 - rank}k`
  return `${rank - 29}d`
}

module.exports = {
  ratingToRank,
  rankNumberToRank,
}
