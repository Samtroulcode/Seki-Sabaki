export function getOgsReviewAnalysis(reviewState, gameTree, treePosition) {
  if (reviewState == null || gameTree == null || treePosition == null) {
    return null
  }

  let review = Object.values(reviewState.reviews || {})[0]
  if (review == null) return null

  let sequence = [...gameTree.getSequence(treePosition)]
  let moveNumber = sequence.length - 1
  let move = review.moves?.[String(moveNumber)] || review.moves?.[moveNumber]
  if (move == null) return null

  let variations = Array.isArray(move.branches)
    ? move.branches
        .filter(
          (branch) => Array.isArray(branch.moves) && branch.moves.length > 0,
        )
        .map((branch) => ({
          vertex: [branch.moves[0].x, branch.moves[0].y],
          visits: finiteNonNegative(branch.visits),
          winrate: finiteNumber(branch.win_rate ?? branch.winRate, 0) * 100,
          scoreLead: finiteNumber(branch.score, null),
          moves: branch.moves
            .filter((vertex) => validVertex(vertex))
            .map((vertex) => [vertex.x, vertex.y]),
        }))
        .filter((variation) => variation.moves.length > 0)
    : []

  if (variations.length === 0) return null

  return {
    sign: 1,
    winrate: finiteNumber(move.win_rate ?? move.winRate, 0) * 100,
    scoreLead: finiteNumber(move.score, null),
    variations,
  }
}

function validVertex(vertex) {
  return (
    vertex != null &&
    Number.isInteger(vertex.x) &&
    Number.isInteger(vertex.y) &&
    vertex.x >= 0 &&
    vertex.y >= 0
  )
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function finiteNonNegative(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}
