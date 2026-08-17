// Tsumego problem detection, move classification, and solution advancement.
//
// This is the business layer of the future Tsumego module. `analyzeProblem`
// determines where a problem starts and which side must play from an
// already-parsed SGF GameTree; `classifyMove` classifies a move played by the
// user from that starting position; `advanceSolution` walks the canonical
// solution line after a correct move. All functions only read the tree and
// never mutate it.
//
// Result markers are read from node comments (`C`) containing "correct" (e.g.
// "Correct Answer", "Correct.", "Also correct") or "wrong" (e.g. "Wrong
// Answer", "Wrong."), and from node names (`N`) containing 正解 (solution) or
// 失败 (failure). A marker may sit on any descendant of a branch, not only on
// the branch's first move: the first solver move is the first move of the
// solver's color on the path from the root to the marked node, and the
// starting position is that move's parent. The player to move is the color of
// that first move. A `PL` on the starting position must agree with that color;
// if it contradicts it, the problem is considered unreliable and
// `analyzeProblem` returns `null`. If no reliable marker is found,
// `analyzeProblem` returns `null` rather than guessing.

import {parseVertex} from '@sabaki/sgf'

// Word-boundary matching is deliberately loose: it also catches natural
// language such as "Correct me if I'm wrong" or "Is this correct?". This is a
// known trade-off of the documented marker vocabulary; a node carrying both
// words is treated as positive (positive wins).
const CORRECT_RE = /\bcorrect\b/i
const WRONG_RE = /\bwrong\b/i

function hasMove(node) {
  return node.data != null && (node.data.B != null || node.data.W != null)
}

function getMoveColor(node) {
  // A malformed node carrying both `B` and `W` is treated as a Black move,
  // mirroring analyzeProblem's color extraction.
  return node.data.B != null ? 'B' : 'W'
}

function getMoveVertex(node) {
  if (node.data == null) return null
  let values = node.data[getMoveColor(node)]
  if (!Array.isArray(values) || values.length === 0) return null
  if (typeof values[0] !== 'string') return null
  return parseVertex(values[0])
}

function sameVertex(a, b) {
  return a != null && b != null && a[0] === b[0] && a[1] === b[1]
}

function hasCorrectCommentMarker(node) {
  if (node.data == null) return false
  let values = node.data.C
  if (!Array.isArray(values)) return false
  return values.some((value) => CORRECT_RE.test(value))
}

function hasWrongCommentMarker(node) {
  if (node.data == null) return false
  let values = node.data.C
  if (!Array.isArray(values)) return false
  return values.some((value) => WRONG_RE.test(value))
}

function hasCorrectNameMarker(node) {
  if (node.data == null) return false
  let values = node.data.N
  if (!Array.isArray(values)) return false
  // 不正解 ("incorrect") contains 正解 as a substring but means the opposite,
  // so it must not count as a positive marker. Other negations (e.g.
  // 正解ではない) are not excluded — the same natural-language trade-off as the
  // comment regexes above.
  return values.some(
    (value) =>
      typeof value === 'string' &&
      value.includes('正解') &&
      !value.includes('不正解'),
  )
}

function hasWrongNameMarker(node) {
  if (node.data == null) return false
  let values = node.data.N
  if (!Array.isArray(values)) return false
  return values.some(
    (value) =>
      typeof value === 'string' &&
      (value.includes('失败') || value.includes('不正解')),
  )
}

// A node carries a positive result when its comment says "correct" or its
// node name marks the branch as the solution (正解).
function hasPositiveResultMarker(node) {
  return hasCorrectCommentMarker(node) || hasCorrectNameMarker(node)
}

// A node carries a negative result when its comment says "wrong" or its node
// name marks the branch as a failure (失败).
function hasNegativeResultMarker(node) {
  return hasWrongCommentMarker(node) || hasWrongNameMarker(node)
}

function hasTeMarker(node) {
  if (node.data == null) return false
  return Array.isArray(node.data.TE) && node.data.TE.length > 0
}

function hasBmMarker(node) {
  // Mirrors the `BM` → 'bad' convention in gametree.js: presence is what
  // matters, never the value.
  if (node.data == null) return false
  return node.data.BM != null
}

// Returns the first solver move on the path from the root to `node`, with its
// depth, or `null` when the path carries no move of the solver's color. The
// solver's color is the marked node's own color when it carries a move, and
// the opposite of the last move on the path otherwise.
function getFirstSolverMove(tree, node, depth) {
  let color = hasMove(node) ? getMoveColor(node) : null

  let current = node
  let currentDepth = depth
  let firstMove = null
  while (current != null) {
    if (hasMove(current)) {
      if (color == null) {
        color = getMoveColor(current) === 'B' ? 'W' : 'B'
      } else if (getMoveColor(current) === color) {
        firstMove = {node: current, depth: currentDepth}
      }
    }
    current = current.parentId != null ? tree.get(current.parentId) : null
    currentDepth--
  }
  return firstMove
}

// Returns 'correct' | 'wrong' | null for the branch starting at `node`, based
// on result markers anywhere in the branch's subtree. A `BM` on the branch's
// first move marks it wrong (the existing BM convention). Positive markers win
// over negative ones when both are present.
function getBranchResult(node) {
  let hasPositive = false
  let hasNegative = hasBmMarker(node)
  let stack = [node]
  while (stack.length) {
    let current = stack.pop()
    if (hasPositiveResultMarker(current)) hasPositive = true
    if (hasNegativeResultMarker(current)) hasNegative = true
    for (let child of current.children) stack.push(child)
  }
  if (hasPositive) return 'correct'
  if (hasNegative) return 'wrong'
  return null
}

// Returns `{startNodeId, playerToMove, firstMove}` or `null` when no reliable
// solution marker is found. `firstMove` is a live reference into the tree's
// node objects; callers must not mutate it.
//
// `options.allowTeFallback` gates the `TE` (tesuji) property as a secondary
// solution marker. `TE` is a generic move annotation in normal game records, so
// it is only trusted when the caller knows it is operating on tsumego content
// (e.g. a tsumego library). Comment and node-name markers are always preferred
// over `TE`.
export function analyzeProblem(tree, options = {}) {
  let {allowTeFallback = false} = options || {}

  // Single DFS pass tracking depth. Markers may sit on any node, move or not;
  // the first solver move is derived from the path to the marked node. A first
  // solver move at the root has no parent, so there is no position to start
  // from and it is excluded.
  let commentCandidates = []
  let teCandidates = []

  let stack = [{node: tree.root, depth: 0}]
  while (stack.length) {
    let {node, depth} = stack.pop()

    if (hasPositiveResultMarker(node)) commentCandidates.push({node, depth})
    else if (allowTeFallback && hasTeMarker(node))
      teCandidates.push({node, depth})

    for (let child of node.children) stack.push({node: child, depth: depth + 1})
  }

  let pool = commentCandidates.length
    ? commentCandidates
    : allowTeFallback
      ? teCandidates
      : []
  if (pool.length === 0) return null

  // Map each marked node to the first solver move of its branch, deduplicated
  // by node id: several markers in the same branch (e.g. "Correct" and "Also
  // correct") must not create competing candidates.
  let candidates = new Map()
  for (let {node, depth} of pool) {
    let firstMove = getFirstSolverMove(tree, node, depth)
    if (firstMove == null || firstMove.node.parentId == null) continue
    if (!candidates.has(firstMove.node.id)) {
      candidates.set(firstMove.node.id, firstMove)
    }
  }
  if (candidates.size === 0) return null

  // Pick the shallowest first solver move, preferring the main line (the
  // first-child chain from the root) to break ties between equal-depth
  // branches.
  let mainLine = new Set([...tree.listMainNodes()].map((node) => node.id))
  let best = candidates.values().next().value
  for (let candidate of candidates.values()) {
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
  let playerToMove = getMoveColor(best.node)

  // The first correct move's color defines the player to move. A `PL` on the
  // starting position must agree with it; a contradicting `PL` makes the
  // problem unreliable, so fail cleanly instead of picking one arbitrarily.
  let startNode = tree.get(startNodeId)
  if (
    startNode != null &&
    startNode.data != null &&
    startNode.data.PL != null
  ) {
    let pl = startNode.data.PL[0]
    if ((pl === 'B' || pl === 'W') && pl !== playerToMove) return null
  }

  return {startNodeId, playerToMove, firstMove: best.node}
}

// Classifies a move played by the user from the starting position detected by
// `analyzeProblem`. `problem` must be a valid (non-null) result of
// `analyzeProblem`, and `vertexString` is the played intersection as an SGF
// coordinate string (e.g. 'gl'), parsed with `parseVertex` from `@sabaki/sgf`.
// The user is assumed to play as `problem.playerToMove`; variations of the
// other color never match.
//
// Returns:
// - `'correct'` when the move matches the first correct move, or when a
//   matching variation carries a positive result marker anywhere in its branch
//   (a comment containing "correct", or a node name containing 正解);
// - `'wrong'` when every matching variation carries a negative result marker
//   (a comment containing "wrong", a node name containing 失败, or a `BM`
//   property on the variation's first move — the same `BM` → 'bad' convention
//   used in gametree.js);
// - `'absent'` when no variation from the starting position contains the move
//   for the player's color;
// - `null` when the move matches a variation that is present but not clearly
//   marked as correct or wrong (never invented as wrong), or when the input is
//   invalid (e.g. a pass or a malformed vertex).
//
// Only the next moves from the starting position are considered: each branch is
// walked down to its first move node, never past a move, so non-move nodes
// between the starting position and a variation move are handled.
export function classifyMove(tree, problem, vertexString) {
  if (problem == null || problem.firstMove == null) return null
  if (typeof vertexString !== 'string') return null

  let vertex = parseVertex(vertexString)
  // `parseVertex` yields [-1, -1] for invalid input and for a pass (`B[]`), so
  // a pass is never a tsumego solution and cannot be distinguished from garbage.
  if (vertex[0] < 0 || vertex[1] < 0) return null

  let startNode = tree.get(problem.startNodeId)
  if (startNode == null) return null

  // The first correct move defines the expected answer. The tree must still
  // contain it so a stale problem cannot produce a false 'correct'. The color
  // check is defensive: `playerToMove` is derived from the first move's color.
  let firstMoveColor = getMoveColor(problem.firstMove)
  if (
    firstMoveColor === problem.playerToMove &&
    sameVertex(getMoveVertex(problem.firstMove), vertex) &&
    tree.get(problem.firstMove.id) != null
  ) {
    return 'correct'
  }

  // Collect the first move node of each branch from the starting position,
  // never traversing past a move. Branches may split at non-move nodes, so this
  // is a DFS rather than a linear walk.
  let candidates = []
  let stack = [...startNode.children]
  while (stack.length) {
    let node = stack.pop()
    if (hasMove(node)) candidates.push(node)
    else for (let child of node.children) stack.push(child)
  }

  let matching = candidates.filter(
    (node) =>
      getMoveColor(node) === problem.playerToMove &&
      sameVertex(getMoveVertex(node), vertex),
  )
  if (matching.length === 0) return 'absent'

  // A branch's result is determined by markers anywhere in its subtree, so a
  // marker carried by a descendant (e.g. W[ba] C[Wrong.]) still classifies the
  // branch's first move. A variation that is present but not clearly marked as
  // bad must not be invented as wrong; fail cleanly instead of guessing.
  let results = matching.map((node) => getBranchResult(node))
  if (results.some((result) => result === 'correct')) return 'correct'
  if (results.every((result) => result === 'wrong')) return 'wrong'
  return null
}

// Advances the solution after a move the user just played that was recognized
// as correct. `correctMoveNode` is the node of that move — in V1, the first
// correct move from `analyzeProblem` (the call site enforces this via
// `classifyMove`). Walks the canonical continuation, the SGF main line (first
// child) of the correct branch, playing the opponent's responses automatically
// and stopping just before the player's next move.
//
// Returns `{automaticMoves, nextPlayerMove, solved}`:
// - `automaticMoves`: the opponent's responses on the canonical line (nodes);
// - `nextPlayerMove`: the player's next expected move (node), or `null` when
//   the problem is solved;
// - `solved`: whether the canonical line ended before another player move.
//
// Non-move nodes between moves are traversed; sibling variations are never
// followed. Color alternation within the continuation is not validated:
// consecutive moves of the same color are accepted as-is. Returns `null` when
// the input is incoherent (invalid problem, a non-move node, a node missing
// from the tree, a move of the wrong color, or a pass/malformed move in the
// continuation).
export function advanceSolution(tree, problem, correctMoveNode) {
  if (problem == null || correctMoveNode == null) return null
  if (!hasMove(correctMoveNode)) return null

  // Walk from the tree's own node so a stale reference cannot leak stale
  // children into the walk.
  let node = tree.get(correctMoveNode.id)
  if (node == null || node.data == null) return null
  if (getMoveColor(node) !== problem.playerToMove) return null

  let automaticMoves = []
  while (node.children.length > 0) {
    node = node.children[0]

    if (hasMove(node)) {
      // A pass or malformed move in the continuation is incoherent for a
      // tsumego solution.
      let vertex = getMoveVertex(node)
      if (vertex == null || vertex[0] < 0 || vertex[1] < 0) return null

      if (getMoveColor(node) === problem.playerToMove) {
        // Stop just before the player's next move.
        return {automaticMoves, nextPlayerMove: node, solved: false}
      }

      // The opponent's move is played automatically.
      automaticMoves.push(node)
    }
  }

  // The canonical line ended before another player move.
  return {automaticMoves, nextPlayerMove: null, solved: true}
}
