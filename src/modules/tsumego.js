// Tsumego problem detection, move classification, and solution advancement.
//
// This is the business layer of the future Tsumego module. `analyzeProblem`
// determines where a problem starts and which side must play from an
// already-parsed SGF GameTree; `classifyMove` classifies a move played by the
// user at the solver's current decision point (the initial position by
// default); `advanceSolution` walks the canonical solution line after a
// correct move and reports the next decision point. All functions only read
// the tree and never mutate it.
//
// Result markers are read from node comments (`C`) containing "correct" (e.g.
// "Correct Answer", "Correct.", "Also correct") or "wrong" (e.g. "Wrong
// Answer", "Wrong."), and from node names (`N`) containing 正解 (solution) or
// 失败 (failure). A marker may sit on the move node itself, on a descendant
// after the move, or on a non-move prefix before the branch's first move (a
// node describing the variation, e.g. N[正解图]). The first solver move is the
// first move of the solver's color on the path from the root to a marked move
// node, or the first move reachable from a marked prefix without crossing
// another move; the starting position is the first position-defining node
// above the first move (its parent, or the node above a label chain describing
// the variation). The player to move is the color of that first move. A
// `PL` on the starting position must agree with that color; if it contradicts
// it, the problem is considered unreliable and `analyzeProblem` returns
// `null`. If no reliable marker is found, `analyzeProblem` returns `null`
// rather than guessing.
//
// Move classification is conservative by default: without a proven-correct
// move at the decision point, an explicitly present variation is only `wrong`
// when it carries a negative marker. GoGameGuru collections only mark the
// solution (`C[Correct]`) and leave failed tries unmarked, so when at least
// one variation at the decision point carries a reliable positive proof —
// a marked branch, or the expected move itself, which is correct by
// construction — every other explicitly present variation without one is
// classified `wrong`; variations absent from the SGF stay `absent`.

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

// Returns whether any ancestor of `node` (up to the root) carries a move.
function hasMoveAncestor(tree, node) {
  let current = node.parentId != null ? tree.get(node.parentId) : null
  while (current != null) {
    if (hasMove(current)) return true
    current = current.parentId != null ? tree.get(current.parentId) : null
  }
  return false
}

// Returns the first solver move for a marked prefix node: the first move
// reachable from the prefix without crossing another move, with its depth.
// Returns `null` when the prefix leads to no move or to several distinct first
// moves (ambiguous — fail safely rather than guess).
function getPrefixFirstMove(tree, node, depth) {
  let firstMoves = []
  let stack = node.children.map((child) => ({node: child, depth: depth + 1}))
  while (stack.length) {
    let {node: current, depth: currentDepth} = stack.pop()
    if (hasMove(current)) firstMoves.push({node: current, depth: currentDepth})
    else
      for (let child of current.children)
        stack.push({node: child, depth: currentDepth + 1})
  }
  if (firstMoves.length === 0) return null

  let distinct = new Set(
    firstMoves.map(({node: move}) => {
      let vertex = getMoveVertex(move)
      // Malformed or pass moves (no valid vertex) are distinct by node id so
      // several of them under one prefix count as ambiguous.
      let key =
        vertex != null && vertex[0] >= 0 && vertex[1] >= 0
          ? `${getMoveColor(move)}:${vertex}`
          : `${getMoveColor(move)}:${move.id}`
      return key
    }),
  )
  if (distinct.size > 1) return null

  // The same first move may be reachable at several depths (e.g. through a
  // label chain); report the shallowest occurrence.
  return firstMoves.reduce((a, b) => (b.depth < a.depth ? b : a))
}

// Returns whether `node` defines a position: a move, setup stones (AB/AW/AE),
// or a player-to-move property (PL). Pure label/comment nodes (e.g. N[正解图])
// do not define a position.
function isPositionNode(node) {
  if (hasMove(node)) return true
  if (node.data == null) return false
  return (
    node.data.AB != null ||
    node.data.AW != null ||
    node.data.AE != null ||
    node.data.PL != null
  )
}

// Returns the start position for a first move `node`: the first ancestor that
// defines a position (a move, setup stones, or a PL) or the root, skipping the
// non-move label chain that describes the variation.
function getStartPosition(tree, node) {
  let current = node.parentId != null ? tree.get(node.parentId) : null
  while (
    current != null &&
    !isPositionNode(current) &&
    current.parentId != null
  ) {
    current = tree.get(current.parentId)
  }
  return current
}

// Returns `{node, depth, startNodeId}` for a marked node, or `null` when the
// node yields no reliable candidate. A marker on a move node (or on a later
// move of the same color) resolves by walking up; a marker on a non-move
// prefix above all moves of its branch resolves by walking down to the first
// move reachable without crossing another move; any other non-move marker
// annotates a position below a move and resolves by walking up, falling back
// to walking down when the path up carries no solver move. The starting
// position is the first position-defining node above the first move.
function getMarkedMoveCandidate(tree, node, depth) {
  let firstMove
  if (hasMove(node)) {
    firstMove = getFirstSolverMove(tree, node, depth)
  } else if (node.parentId != null && !hasMoveAncestor(tree, node)) {
    firstMove = getPrefixFirstMove(tree, node, depth)
  } else {
    firstMove = getFirstSolverMove(tree, node, depth)
    // A non-move marker below a move usually annotates a position (walk up);
    // when the path up carries no solver move, it may label the variation
    // below (walk down). Root markers are excluded: a marker on the root
    // annotates the initial position, not a variation.
    if (firstMove == null && node.parentId != null) {
      firstMove = getPrefixFirstMove(tree, node, depth)
    }
  }
  if (firstMove == null) return null

  let startNode = getStartPosition(tree, firstMove.node)
  if (startNode == null) return null
  return {...firstMove, startNodeId: startNode.id}
}

// Returns 'correct' | 'wrong' | null for the branch starting at `node`, based
// on result markers anywhere in the branch's subtree and on the non-move
// prefix between the starting position and the branch's first move. A `BM` on
// the branch's first move marks it wrong (the existing BM convention).
// Positive markers win over negative ones when both are present. `allowTe`
// counts `TE` markers as positive proof, mirroring analyzeProblem's TE
// fallback gate: `TE` is only trusted when the caller opted into it.
function getBranchResult(node, tree, startNode, allowTe = false) {
  let hasPositive = false
  let hasNegative = hasBmMarker(node)
  let stack = [node]
  while (stack.length) {
    let current = stack.pop()
    if (hasPositiveResultMarker(current)) hasPositive = true
    if (allowTe && hasTeMarker(current)) hasPositive = true
    if (hasNegativeResultMarker(current)) hasNegative = true
    for (let child of current.children) stack.push(child)
  }

  // A marker on a non-move prefix above the branch's first move (e.g.
  // N[失败图] before W[md]) is inherited by the branch. Stop at the starting
  // position or at the first move encountered.
  let current = node.parentId != null ? tree.get(node.parentId) : null
  while (current != null && current.id !== startNode.id && !hasMove(current)) {
    if (hasPositiveResultMarker(current)) hasPositive = true
    if (allowTe && hasTeMarker(current)) hasPositive = true
    if (hasNegativeResultMarker(current)) hasNegative = true
    current = current.parentId != null ? tree.get(current.parentId) : null
  }

  if (hasPositive) return 'correct'
  if (hasNegative) return 'wrong'
  return null
}

// Returns `{startNodeId, playerToMove, firstMove, allowTeFallback}` or `null`
// when no reliable solution marker is found. `firstMove` is a live reference
// into the tree's node objects; callers must not mutate it. `allowTeFallback`
// echoes the option so `classifyMove` can apply the same TE gate when reading
// branch results.
//
// `options.allowTeFallback` gates the `TE` (tesuji) property as a secondary
// solution marker. `TE` is a generic move annotation in normal game records, so
// it is only trusted when the caller knows it is operating on tsumego content
// (e.g. a tsumego library). Comment and node-name markers are always preferred
// over `TE`.
export function analyzeProblem(tree, options = {}) {
  let {allowTeFallback = false} = options || {}

  // Single DFS pass tracking depth. Markers may sit on any node, move or not;
  // the first solver move is derived from the path to the marked node, or by
  // walking down from a marked non-move prefix. A first solver move at the
  // root has no position to start from and it is excluded.
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
    let candidate = getMarkedMoveCandidate(tree, node, depth)
    if (candidate == null || candidate.startNodeId == null) continue
    if (!candidates.has(candidate.node.id)) {
      candidates.set(candidate.node.id, candidate)
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

  let startNodeId = best.startNodeId
  let playerToMove = getMoveColor(best.node)

  // The first correct move's color defines the player to move. A `PL` on the
  // starting position must agree with that color; a contradicting `PL` makes
  // the problem unreliable, so fail cleanly instead of picking one
  // arbitrarily. The starting position is the first position-defining node
  // above the first move (a move, setup stones, or a PL), so the walk never
  // passes a move and any `PL` it finds sits on the starting position itself.
  let plNode = best.node.parentId != null ? tree.get(best.node.parentId) : null
  while (plNode != null) {
    if (plNode.data != null && plNode.data.PL != null) {
      let pl = plNode.data.PL[0]
      if ((pl === 'B' || pl === 'W') && pl !== playerToMove) return null
    }
    if (plNode.id === startNodeId) break
    plNode = plNode.parentId != null ? tree.get(plNode.parentId) : null
  }

  return {startNodeId, playerToMove, firstMove: best.node, allowTeFallback}
}

// Classifies a move played by the user at the solver's current decision point.
// `problem` must be a valid (non-null) result of `analyzeProblem`, and
// `vertexString` is the played intersection as an SGF coordinate string (e.g.
// 'gl'), parsed with `parseVertex` from `@sabaki/sgf`. The user is assumed to
// play as `problem.playerToMove`; variations of the other color never match.
//
// The decision point is where the player must choose their next move: the
// initial position (`problem.startNodeId`) by default, or the position
// reported by `advanceSolution` (`decisionPointId`) after a correct move.
// `expectedMoveNode` is the expected correct move at that decision point: the
// first correct move (`problem.firstMove`) at the initial position, or the
// next player move returned by `advanceSolution`. Both parameters default to
// the initial position so existing callers keep working unchanged.
//
// Returns:
// - `'correct'` when the move matches the expected correct move, or when a
//   matching variation carries a positive result marker anywhere in its branch
//   (a comment containing "correct", a node name containing 正解, or — when the
//   problem was detected with the TE fallback — a `TE` property);
// - `'wrong'` when every matching variation carries a negative result marker
//   (a comment containing "wrong", a node name containing 失败, or a `BM`
//   property on the variation's first move — the same `BM` → 'bad' convention
//   used in gametree.js), or when at least one variation at the decision point
//   carries a reliable positive proof — a marked branch, or the expected move
//   itself, which is correct by construction — and the played variation is
//   explicitly present without one (GoGameGuru collections only mark the
//   solution);
// - `'absent'` when no variation from the decision point contains the move
//   for the player's color;
// - `null` when the played variation is present but not clearly marked and no
//   proven-correct move exists at the decision point (never invented as
//   wrong), or when the input is invalid (e.g. a pass or a malformed vertex).
//
// Only the next moves from the decision point are considered: each branch is
// walked down to its first move node, never past a move, so non-move nodes
// between the decision point and a variation move are handled. Moves that are
// not explicitly present as variations from the decision point stay
// `'absent'` and are never reclassified.
export function classifyMove(
  tree,
  problem,
  vertexString,
  decisionPointId,
  expectedMoveNode,
) {
  if (problem == null || problem.firstMove == null) return null
  if (typeof vertexString !== 'string') return null

  let vertex = parseVertex(vertexString)
  // `parseVertex` yields [-1, -1] for invalid input and for a pass (`B[]`), so
  // a pass is never a tsumego solution and cannot be distinguished from garbage.
  if (vertex[0] < 0 || vertex[1] < 0) return null

  let decisionPoint = tree.get(decisionPointId ?? problem.startNodeId)
  if (decisionPoint == null) return null

  // The expected correct move at this decision point: the first correct move
  // at the initial position, or the next player move from `advanceSolution`.
  let expectedMove = expectedMoveNode ?? problem.firstMove
  let expectedMoveId = expectedMove != null ? expectedMove.id : null

  // The expected move defines the correct answer. The tree must still contain
  // it so a stale problem cannot produce a false 'correct'. The color check is
  // defensive: `playerToMove` is derived from the first move's color.
  if (
    expectedMove != null &&
    getMoveColor(expectedMove) === problem.playerToMove &&
    sameVertex(getMoveVertex(expectedMove), vertex) &&
    tree.get(expectedMove.id) != null
  ) {
    return 'correct'
  }

  // Collect the first move node of each branch from the decision point, never
  // traversing past a move. Branches may split at non-move nodes, so this is a
  // DFS rather than a linear walk.
  let candidates = []
  let stack = [...decisionPoint.children]
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

  // A branch's result is determined by markers anywhere in its subtree and on
  // the non-move prefix between the decision point and the branch's first
  // move, so a marker carried by a descendant (e.g. W[ba] C[Wrong.]) or by a
  // prefix label (e.g. N[失败图] before W[md]) still classifies the branch's
  // first move. `allowTeFallback` on the problem echoes analyzeProblem's TE
  // gate so `TE` markers count as positive proof only when the caller opted
  // into the fallback.
  let allowTe = problem.allowTeFallback === true
  let results = matching.map((node) =>
    getBranchResult(node, tree, decisionPoint, allowTe),
  )
  if (results.some((result) => result === 'correct')) return 'correct'

  // GoGameGuru-style collections only mark the solution (C[Correct]) and leave
  // the failed tries unmarked. At the solver's decision point, when at least
  // one variation carries a reliable positive proof — a marked branch, or the
  // expected move itself, which is correct by construction — every other
  // variation that is explicitly present without one is wrong. Variations
  // absent from the SGF are never affected by this rule.
  let hasSolution = candidates.some(
    (node) =>
      getMoveColor(node) === problem.playerToMove &&
      (node.id === expectedMoveId ||
        getBranchResult(node, tree, decisionPoint, allowTe) === 'correct'),
  )
  if (hasSolution) return 'wrong'

  // No proven-correct move at the decision point: keep the cautious behavior
  // and never invent a present-but-unmarked variation as wrong.
  if (results.every((result) => result === 'wrong')) return 'wrong'
  return null
}

// Advances the solution after a move the user just played that was recognized
// as correct. `correctMoveNode` is the node of that move — the first correct
// move from `analyzeProblem`, or the `nextPlayerMove` of a previous
// `advanceSolution` call (the call site enforces this via `classifyMove`).
// Walks the canonical continuation, the SGF main line (first child) of the
// correct branch, playing the opponent's responses automatically and stopping
// just before the player's next move.
//
// Returns `{automaticMoves, nextPlayerMove, decisionPointId, solved}`:
// - `automaticMoves`: the opponent's responses on the canonical line (nodes);
// - `nextPlayerMove`: the player's next expected move (node), or `null` when
//   the problem is solved;
// - `decisionPointId`: the node id of the board position the player's next
//   move branches from: the parent of `nextPlayerMove`, walking up past
//   purely descriptive nodes (labels, comments) that do not define a position
//   and never past a node that defines one (a move, setup stones, or a PL);
//   `null` when the problem is solved;
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
        // Stop just before the player's next move. The decision point is the
        // board position the player's variations branch from: the parent of
        // the next move, walking up past purely descriptive nodes (labels,
        // comments) that do not define a position, so alternative variations
        // under sibling prefixes stay visible. The walk never passes a node
        // that defines a position (a move, setup stones, or a PL).
        let decisionPoint = getStartPosition(tree, node)
        return {
          automaticMoves,
          nextPlayerMove: node,
          decisionPointId:
            decisionPoint != null ? decisionPoint.id : node.parentId,
          solved: false,
        }
      }

      // The opponent's move is played automatically.
      automaticMoves.push(node)
    }
  }

  // The canonical line ended before another player move.
  return {
    automaticMoves,
    nextPlayerMove: null,
    decisionPointId: null,
    solved: true,
  }
}
