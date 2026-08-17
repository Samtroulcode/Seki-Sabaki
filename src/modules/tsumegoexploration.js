// Local, non-SGF exploration primitives for the Tsumego solver. Boards are
// immutable values; these helpers never mutate the parsed GameTree or its
// cached SGF boards.

export function applyExplorationMove(board, sign, vertex) {
  if (board == null || !Array.isArray(vertex)) return null

  try {
    let analysis = board.analyzeMove(sign, vertex)
    if (
      analysis.pass ||
      analysis.overwrite ||
      analysis.suicide ||
      analysis.ko
    ) {
      return null
    }
    let next = board.makeMove(sign, vertex, {
      preventOverwrite: true,
      preventSuicide: true,
      preventKo: true,
    })
    return copyBoardMetadata(next, board)
  } catch (err) {
    return null
  }
}

export function cloneExplorationBoard(board) {
  return copyBoardMetadata(board.clone(), board)
}

function copyBoardMetadata(target, source) {
  return Object.assign(target, {
    markers: source.markers,
    lines: source.lines,
    childrenInfo: source.childrenInfo,
    siblingsInfo: source.siblingsInfo,
    currentVertex: source.currentVertex,
  })
}

export function getExplorationPlayer(node, fallback) {
  if (node?.data == null) return fallback
  if (node.data.PL != null) return node.data.PL[0] === 'W' ? -1 : 1
  if (node.data.B != null || (node.data.HA != null && +node.data.HA[0] >= 1))
    return -1
  if (node.data.W != null) return 1
  return fallback
}
