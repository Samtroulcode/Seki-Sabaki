// Tsumego problem detection.
//
// This is the first business brick of the future Tsumego module: given an
// already-parsed SGF GameTree, determine where the problem actually starts and
// which side must play. It only reads the tree and never mutates it.
//
// Solution markers are read from node comments (`C`) containing "Correct
// Answer". The first correct move is the shallowest such node that carries a
// move (`B`/`W`). The starting position is that move's parent, and the player
// to move is the color of that first move. A `PL` on the starting position must
// agree with that color; if it contradicts it, the problem is considered
// unreliable and `analyzeProblem` returns `null`. If no reliable marker is
// found, `analyzeProblem` returns `null` rather than guessing.

const CORRECT_ANSWER_RE = /\bcorrect answer\b/i

function hasMove(node) {
  return node.data.B != null || node.data.W != null
}

function hasCorrectAnswerMarker(node) {
  let values = node.data.C
  if (!Array.isArray(values)) return false
  return values.some((value) => CORRECT_ANSWER_RE.test(value))
}

function hasTeMarker(node) {
  return Array.isArray(node.data.TE) && node.data.TE.length > 0
}

// Returns `{startNodeId, playerToMove, firstMove}` or `null` when no reliable
// solution marker is found. `firstMove` is a live reference into the tree's
// node objects; callers must not mutate it.
//
// `options.allowTeFallback` gates the `TE` (tesuji) property as a secondary
// solution marker. `TE` is a generic move annotation in normal game records, so
// it is only trusted when the caller knows it is operating on tsumego content
// (e.g. a tsumego library). Comment markers are always preferred over `TE`.
export function analyzeProblem(tree, options = {}) {
  let {allowTeFallback = false} = options || {}

  // Single DFS pass tracking depth. Candidates must carry a move so setup nodes
  // are excluded, and must not be the root (a move at the root has no parent,
  // so there is no position to start from).
  let commentCandidates = []
  let teCandidates = []

  let stack = [{node: tree.root, depth: 0}]
  while (stack.length) {
    let {node, depth} = stack.pop()

    if (hasMove(node) && node.parentId != null) {
      if (hasCorrectAnswerMarker(node)) commentCandidates.push({node, depth})
      else if (hasTeMarker(node)) teCandidates.push({node, depth})
    }

    for (let child of node.children) stack.push({node: child, depth: depth + 1})
  }

  let pool = commentCandidates.length
    ? commentCandidates
    : allowTeFallback
      ? teCandidates
      : []
  if (pool.length === 0) return null

  // Pick the shallowest candidate, preferring the main line (the first-child
  // chain from the root) to break ties between equal-depth branches.
  let mainLine = new Set([...tree.listMainNodes()].map((node) => node.id))
  let best = pool[0]
  for (let candidate of pool) {
    if (
      candidate.depth < best.depth ||
      (candidate.depth === best.depth &&
        mainLine.has(candidate.node.id) &&
        !mainLine.has(best.node.id))
    ) {
      best = candidate
    }
  }

  let startNodeId = best.node.parentId
  let playerToMove = best.node.data.B != null ? 'B' : 'W'

  // The first correct move's color defines the player to move. A `PL` on the
  // starting position must agree with it; a contradicting `PL` makes the
  // problem unreliable, so fail cleanly instead of picking one arbitrarily.
  let startNode = tree.get(startNodeId)
  if (startNode != null && startNode.data.PL != null) {
    let pl = startNode.data.PL[0]
    if ((pl === 'B' || pl === 'W') && pl !== playerToMove) return null
  }

  return {startNodeId, playerToMove, firstMove: best.node}
}
