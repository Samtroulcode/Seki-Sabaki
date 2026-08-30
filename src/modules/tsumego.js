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
// 失败 (failure). EasyGo's "right" is accepted only on a terminal move, and
// Hactar's `WV` is negative evidence. A marker may sit on the move node itself,
// on a descendant
// after the move, or on a non-move prefix before the branch's first move (a
// node describing the variation, e.g. N[正解图]). The first solver move is the
// first move of the solver's color on the path from the root to a marked move
// node, or the first move reachable from a marked prefix without crossing
// another move; the starting position is the first position-defining node
// above the first move (its parent, or the node above a label chain describing
// the variation). The player to move is the color of that first move. A
// `PL` on the starting position must agree with that color; if it contradicts
// it, the problem is considered unreliable and `analyzeProblem` returns
// `null`. If no positive marker is found, a unique non-negative branch may be
// inferred only when every sibling candidate but one is explicitly negative.
// Tsumego-specific callers may additionally opt into treating the structural
// main variation as the solution when the decision point has alternatives.
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
const RIGHT_RE = /\bright\b/i
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

// Main-line fallback is intentionally stricter than legacy marker detection:
// its evidence is only structural, so the move must be unambiguous and lie on
// the SGF board. SZ defaults to 19 as in SGF.
function getPlayableMoveVertex(tree, node) {
  if (node.data == null) return null
  let hasBlack = node.data.B != null
  let hasWhite = node.data.W != null
  if (hasBlack === hasWhite) return null

  let values = node.data[hasBlack ? 'B' : 'W']
  if (!Array.isArray(values) || values.length !== 1) return null
  if (typeof values[0] !== 'string') return null

  let vertex = parseVertex(values[0])
  if (vertex[0] < 0 || vertex[1] < 0) return null

  let size = tree.root.data?.SZ?.[0] ?? '19'
  let dimensions = String(size).split(':').map(Number)
  let width = dimensions[0]
  let height = dimensions[dimensions.length - 1]
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    vertex[0] >= width ||
    vertex[1] >= height
  ) {
    return null
  }
  return vertex
}

function hasCorrectCommentMarker(node) {
  if (node.data == null) return false
  let values = node.data.C
  if (!Array.isArray(values)) return false
  return values.some((value) => CORRECT_RE.test(value))
}

// EasyGo accepts "right" as a result annotation. Since the word is common in
// directional prose, trust it only on a move with no later move descendants.
function hasEasyGoRightMarker(node) {
  if (!hasMove(node) || node.data == null) return false
  let values = node.data.C
  if (!Array.isArray(values)) return false
  if (!values.some((value) => RIGHT_RE.test(value))) return false

  let stack = [...node.children]
  while (stack.length) {
    let current = stack.pop()
    if (hasMove(current)) return false
    for (let child of current.children) stack.push(child)
  }
  return true
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

// A node carries a positive result when its comment says "correct", a terminal
// move comment uses EasyGo's "right", or its node name marks the solution (正解).
function hasPositiveResultMarker(node) {
  return (
    hasCorrectCommentMarker(node) ||
    hasEasyGoRightMarker(node) ||
    hasCorrectNameMarker(node)
  )
}

function hasWvMarker(node) {
  return node.data != null && node.data.WV != null
}

// A node carries a negative result when its comment says "wrong", its node
// name marks failure (失败), or Hactar's `WV` property is present.
function hasNegativeResultMarker(node) {
  return (
    hasWrongCommentMarker(node) || hasWrongNameMarker(node) || hasWvMarker(node)
  )
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

// Returns 'correct' | 'wrong' | null for the branch starting at `node`.
// Positive markers are existential and may occur anywhere in the subtree.
// Negative evidence is scoped to this decision: candidate/prefix markers and
// the forced single-child continuation count, but a marker below a later branch
// point does not poison the ancestor move. Positive markers win when both are
// present. `allowTe` counts `TE` as positive proof when explicitly enabled.
function getBranchResult(node, tree, startNode, allowTe = false) {
  let hasPositive = false
  let hasNegative = hasNegativeResultAtDecision(node, tree, startNode)
  let stack = [node]
  while (stack.length) {
    let current = stack.pop()
    if (hasPositiveResultMarker(current)) hasPositive = true
    if (allowTe && hasTeMarker(current)) hasPositive = true
    for (let child of current.children) stack.push(child)
  }

  // A marker on a non-move prefix above the branch's first move (e.g.
  // N[失败图] before W[md]) is inherited by the branch. Stop at the starting
  // position or at the first move encountered.
  let current = node.parentId != null ? tree.get(node.parentId) : null
  while (current != null && current.id !== startNode.id && !hasMove(current)) {
    if (hasPositiveResultMarker(current)) hasPositive = true
    if (allowTe && hasTeMarker(current)) hasPositive = true
    current = current.parentId != null ? tree.get(current.parentId) : null
  }

  if (hasPositive) return 'correct'
  if (hasNegative) return 'wrong'
  return null
}

// Returns the first move of each branch from a decision point, without walking
// through another position-defining node. Descriptive prefixes are transparent.
function getDecisionPointCandidates(node, depth) {
  let candidates = []
  let stack = node.children
    .map((child) => ({node: child, depth: depth + 1}))
    .reverse()
  while (stack.length) {
    let candidate = stack.pop()
    if (hasMove(candidate.node)) candidates.push(candidate)
    else if (!isPositionNode(candidate.node)) {
      for (let child of [...candidate.node.children].reverse()) {
        stack.push({node: child, depth: candidate.depth + 1})
      }
    }
  }
  return candidates
}

// Returns the structural main variation's first move from a decision point.
// Only first children are followed, and descriptive nodes are transparent;
// another position-defining node is a boundary rather than part of this choice.
function getMainLineMoveCandidate(node, depth) {
  let current = node.children[0]
  let currentDepth = depth + 1
  while (current != null) {
    if (hasMove(current)) return {node: current, depth: currentDepth}
    if (isPositionNode(current)) return null
    current = current.children[0]
    currentDepth++
  }
  return null
}

// Reports negative evidence attached to this decision's candidate: its first
// move, descriptive prefix, or forced continuation. Stop at the first branch
// split so evidence belonging to a later alternative remains local to it. BM
// only applies on the candidate move, preserving the existing convention.
function hasNegativeResultAtDecision(node, tree, startNode) {
  let current = node
  while (current != null) {
    if (hasNegativeResultMarker(current)) return true
    if (current.children.length !== 1) break
    current = current.children[0]
  }

  if (hasBmMarker(node)) return true
  current = node.parentId != null ? tree.get(node.parentId) : null
  while (
    current != null &&
    current.id !== startNode.id &&
    !isPositionNode(current)
  ) {
    if (hasNegativeResultMarker(current)) return true
    current = current.parentId != null ? tree.get(current.parentId) : null
  }
  return false
}

// A later local choice cannot become a standalone problem when reaching it
// already required entering a branch marked wrong.
function hasNegativeAncestorPath(tree, node) {
  let current = node
  while (current != null && current.id !== tree.root.id) {
    if (hasNegativeResultMarker(current)) return true
    if (hasMove(current) && hasBmMarker(current)) return true
    current = current.parentId != null ? tree.get(current.parentId) : null
  }
  return false
}

// When positive-marker detection fails, infer a solution only at a decision
// point where at least one sibling is explicitly wrong and exactly one sibling
// of the same color remains non-negative.
function getInferredMoveCandidate(tree, allowTe) {
  let inferred = []
  let mainLine = new Set([...tree.listMainNodes()].map((node) => node.id))
  let stack = [{node: tree.root, depth: 0}]
  while (stack.length) {
    let {node, depth} = stack.pop()

    if (node === tree.root || isPositionNode(node)) {
      let byColor = new Map()
      for (let candidate of getDecisionPointCandidates(node, depth)) {
        let color = getMoveColor(candidate.node)
        let vertex = getMoveVertex(candidate.node)
        if (vertex == null || vertex[0] < 0 || vertex[1] < 0) continue
        let key = `${vertex}`
        if (!byColor.has(color)) byColor.set(color, new Map())
        let byVertex = byColor.get(color)
        if (!byVertex.has(key)) byVertex.set(key, [])
        byVertex.get(key).push(candidate)
      }

      for (let byVertex of byColor.values()) {
        let candidates = [...byVertex.values()].map((variations) => {
          let results = variations.map((candidate) =>
            getBranchResult(candidate.node, tree, node, allowTe),
          )
          return {
            result: results.every((result) => result === 'wrong')
              ? 'wrong'
              : null,
            candidate:
              variations.find(
                (candidate, index) =>
                  results[index] !== 'wrong' && mainLine.has(candidate.node.id),
              ) ??
              variations[results.findIndex((result) => result !== 'wrong')] ??
              variations[0],
          }
        })
        let negativeCount = candidates.filter(
          ({result}) => result === 'wrong',
        ).length
        let remaining = candidates.filter(({result}) => result !== 'wrong')
        if (negativeCount > 0 && remaining.length === 1) {
          inferred.push({
            ...remaining[0].candidate,
            startNodeId: node.id,
            decisionDepth: depth,
          })
        }
      }
    }

    for (let child of node.children) stack.push({node: child, depth: depth + 1})
  }

  if (inferred.length === 0) return null

  let best = inferred[0]
  for (let candidate of inferred) {
    if (
      candidate.depth < best.depth ||
      (candidate.depth === best.depth &&
        mainLine.has(candidate.node.id) &&
        !mainLine.has(best.node.id))
    ) {
      best = candidate
    }
  }
  return best
}

// As the weakest compatibility convention, returns a structural main-line
// move only when its decision point contains another distinct playable move of
// the same color and the main branch has no explicit negative evidence.
function getMainLineFallbackCandidate(tree) {
  let candidates = []
  let mainLine = new Set([...tree.listMainNodes()].map((node) => node.id))
  let stack = [{node: tree.root, depth: 0}]
  while (stack.length) {
    let {node, depth} = stack.pop()

    if (
      (node === tree.root || isPositionNode(node)) &&
      !hasNegativeAncestorPath(tree, node)
    ) {
      let candidate = getMainLineMoveCandidate(node, depth)
      if (candidate != null) {
        let color = getMoveColor(candidate.node)
        let vertex = getPlayableMoveVertex(tree, candidate.node)
        let hasAlternative =
          vertex != null &&
          getDecisionPointCandidates(node, depth).some((alternative) => {
            let alternativeVertex = getPlayableMoveVertex(
              tree,
              alternative.node,
            )
            return (
              getMoveColor(alternative.node) === color &&
              alternativeVertex != null &&
              !sameVertex(alternativeVertex, vertex)
            )
          })

        if (
          hasAlternative &&
          !hasNegativeResultAtDecision(candidate.node, tree, node)
        ) {
          candidates.push({
            ...candidate,
            startNodeId: node.id,
            decisionDepth: depth,
          })
        }
      }
    }

    for (let child of node.children) stack.push({node: child, depth: depth + 1})
  }

  if (candidates.length === 0) return null

  let best = candidates[0]
  for (let candidate of candidates) {
    if (
      candidate.depth < best.depth ||
      (candidate.depth === best.depth &&
        mainLine.has(candidate.node.id) &&
        !mainLine.has(best.node.id))
    ) {
      best = candidate
    }
  }
  return best
}

// Returns `{startNodeId, playerToMove, firstMove, allowTeFallback}` or `null`
// when no reliable solution marker is found. `firstMove` is a live reference
// into the tree's node objects; callers must not mutate it. `allowTeFallback`
// echoes the option so `classifyMove` can apply the same TE gate when reading
// branch results.
//
// `options.allowTeFallback` gates the `TE` (tesuji) property as a secondary
// solution marker. `options.allowMainLineFallback` gates the weaker convention
// that a Tsumego's structural main variation is its solution. Both are disabled
// by default because they are unsafe assumptions for generic game records.
// Comment and node-name markers and TE retain global priority. Compatibility
// inference then prefers the earliest decision point; at the same decision,
// negative-branch inference wins over the main-line convention.
export function analyzeProblem(tree, options = {}) {
  let {allowTeFallback = false, allowMainLineFallback = false} = options || {}

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
  let best
  if (candidates.size > 0) {
    // Pick the shallowest first solver move, preferring the main line (the
    // first-child chain from the root) to break ties between equal-depth
    // branches.
    let mainLine = new Set([...tree.listMainNodes()].map((node) => node.id))
    best = candidates.values().next().value
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
  } else {
    best = getInferredMoveCandidate(tree, allowTeFallback)
    if (allowMainLineFallback) {
      let mainLineFallback = getMainLineFallbackCandidate(tree)
      if (
        best == null ||
        (mainLineFallback != null &&
          mainLineFallback.decisionDepth < best.decisionDepth)
      ) {
        best = mainLineFallback
      }
    }
  }
  if (best == null) return null

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
//   (a comment containing "correct", EasyGo's terminal "right", a node name
//   containing 正解, or — when the problem was detected with the TE fallback —
//   a `TE` property);
// - `'wrong'` when every matching variation carries a negative result marker
//   (a comment containing "wrong", a node name containing 失败, `WV`, or a `BM`
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
export function resolveMove(
  tree,
  problem,
  vertexString,
  decisionPointId,
  expectedMoveNode,
) {
  let emptyResult = {status: null, node: null}
  if (tree == null || problem == null || problem.firstMove == null)
    return emptyResult
  if (typeof vertexString !== 'string') return emptyResult

  let vertex = parseVertex(vertexString)
  // `parseVertex` yields [-1, -1] for invalid input and for a pass (`B[]`), so
  // a pass is never a tsumego solution and cannot be distinguished from garbage.
  if (vertex[0] < 0 || vertex[1] < 0) return emptyResult

  let decisionPoint = tree.get(decisionPointId ?? problem.startNodeId)
  if (decisionPoint == null) return emptyResult

  // The expected correct move at this decision point: the first correct move
  // at the initial position, or the next player move from `advanceSolution`.
  let expectedMove = expectedMoveNode ?? problem.firstMove
  let expectedMoveId = expectedMove != null ? expectedMove.id : null
  let expectedMoveInTree =
    expectedMove != null ? tree.get(expectedMove.id) : null

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

  // The expected move defines the correct answer only when it is a live first
  // move candidate at this decision point. This prevents a caller from
  // accidentally making a move from another branch correct.
  if (
    expectedMoveInTree != null &&
    candidates.some((node) => node.id === expectedMoveInTree.id) &&
    getMoveColor(expectedMoveInTree) === problem.playerToMove &&
    sameVertex(getMoveVertex(expectedMoveInTree), vertex)
  ) {
    return {status: 'correct', node: expectedMoveInTree}
  }

  let matching = candidates.filter(
    (node) =>
      getMoveColor(node) === problem.playerToMove &&
      sameVertex(getMoveVertex(node), vertex),
  )
  if (matching.length === 0) return {status: 'absent', node: null}

  // Positive markers may occur anywhere in the branch. Negative markers are
  // scoped to the candidate, its descriptive prefix, and its forced
  // continuation, stopping before a later branch split. `allowTeFallback` on
  // the problem echoes analyzeProblem's TE gate so `TE` markers count as
  // positive proof only when the caller opted into the fallback.
  let allowTe = problem.allowTeFallback === true
  let results = matching.map((node) =>
    getBranchResult(node, tree, decisionPoint, allowTe),
  )
  let positiveIndex = results.findIndex((result) => result === 'correct')
  if (positiveIndex >= 0) {
    return {status: 'correct', node: matching[positiveIndex]}
  }

  // GoGameGuru-style collections only mark the solution (C[Correct]) and leave
  // the failed tries unmarked. At the solver's decision point, when at least
  // one variation carries a reliable positive proof — a marked branch, or the
  // expected move itself, which is correct by construction — every other
  // variation that is explicitly present without one is wrong. Variations
  // absent from the SGF are never affected by this rule.
  let hasSolution = candidates.some(
    (node) =>
      getMoveColor(node) === problem.playerToMove &&
      ((node.id === expectedMoveId && expectedMoveInTree != null) ||
        getBranchResult(node, tree, decisionPoint, allowTe) === 'correct'),
  )
  if (hasSolution) return {status: 'wrong', node: matching[0]}

  // No proven-correct move at the decision point: keep the cautious behavior
  // and never invent a present-but-unmarked variation as wrong.
  if (results.every((result) => result === 'wrong')) {
    return {status: 'wrong', node: matching[0]}
  }
  return {status: null, node: matching[0]}
}

export function classifyMove(
  tree,
  problem,
  vertexString,
  decisionPointId,
  expectedMoveNode,
) {
  return resolveMove(
    tree,
    problem,
    vertexString,
    decisionPointId,
    expectedMoveNode,
  ).status
}

// Advances the solution after a move the user just played that was recognized
// as correct. `correctMoveNode` is the node of that move — the first correct
// move from `analyzeProblem`, or the `nextPlayerMove` of a previous
// `advanceSolution` call (the call site enforces this via `classifyMove`).
// Walks the canonical continuation, the SGF main line (first child) of the
// correct branch, playing the opponent's responses automatically and stopping
// just before the player's next move.
//
// Returns `{automaticMoves, nextPlayerMove, decisionPointId, positionNodeId,
// solved}`:
// - `automaticMoves`: the opponent's responses on the canonical line (nodes);
// - `nextPlayerMove`: the player's next expected move (node), or `null` when
//   the problem is solved;
// - `decisionPointId`: the node id of the board position the player's next
//   move branches from: the parent of `nextPlayerMove`, walking up past
//   purely descriptive nodes (labels, comments) that do not define a position
//   and never past a node that defines one (a move, setup stones, or a PL);
//   `null` when the problem is solved;
// - `positionNodeId`: the last real position reached by the canonical
//   continuation, including the final position when the problem is solved;
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
  let positionNodeId = node.id
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
          positionNodeId:
            decisionPoint != null ? decisionPoint.id : positionNodeId,
          solved: false,
        }
      }

      // The opponent's move is played automatically.
      positionNodeId = node.id
      automaticMoves.push(node)
    } else if (isPositionNode(node)) {
      positionNodeId = node.id
    }
  }

  // The canonical line ended before another player move.
  return {
    automaticMoves,
    nextPlayerMove: null,
    decisionPointId: null,
    positionNodeId,
    solved: true,
  }
}

// Advances through a refutation variation after a wrong move. `wrongMoveNode`
// is the node of the user's incorrect move that exists in the SGF. Walks the
// canonical continuation (first child) of that branch through to its terminal
// position, collecting all moves for automatic playback.
//
// Returns `{automaticMoves, positionNodeId}` or `null` when the input is
// incoherent (invalid node, a pass/malformed move in the continuation).
// - `automaticMoves`: all subsequent moves on the canonical line after the
//   wrong move (nodes), including both opponent responses and any further moves;
// - `positionNodeId`: the last real position reached by the canonical
//   continuation, including the final position.
//
// Non-move nodes between moves are traversed; sibling variations are never
// followed. Color alternation is not validated: consecutive moves of the same
// color are accepted as-is. Descriptive/setup nodes required to reach the
// correct final SGF position are preserved via `positionNodeId`.
export function advanceRefutation(tree, wrongMoveNode) {
  if (wrongMoveNode == null) return null
  if (!hasMove(wrongMoveNode)) return null

  // Walk from the tree's own node so a stale reference cannot leak stale
  // children into the walk.
  let node = tree.get(wrongMoveNode.id)
  if (node == null || node.data == null) return null

  let automaticMoves = []
  let positionNodeId = node.id
  while (node.children.length > 0) {
    node = node.children[0]

    if (hasMove(node)) {
      // A pass or malformed move in the continuation is incoherent.
      let vertex = getMoveVertex(node)
      if (vertex == null || vertex[0] < 0 || vertex[1] < 0) return null

      positionNodeId = node.id
      automaticMoves.push(node)
    } else if (isPositionNode(node)) {
      positionNodeId = node.id
    }
  }

  return {automaticMoves, positionNodeId}
}

// Returns board dimensions from SGF SZ property, defaulting to 19x19.
// Returns null when SZ is explicitly present but malformed.
function getBoardDimensions(tree) {
  let sz = tree.root.data?.SZ?.[0]
  if (sz == null) return {width: 19, height: 19}
  let dimensions = String(sz).split(':').map(Number)
  let width = dimensions[0]
  let height = dimensions[dimensions.length - 1]
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return {width, height}
}

// Returns whether a vertex is within board dimensions.
function isVertexOnBoard(vertex, dimensions) {
  return (
    vertex != null &&
    vertex[0] >= 0 &&
    vertex[1] >= 0 &&
    vertex[0] < dimensions.width &&
    vertex[1] < dimensions.height
  )
}

// Returns the decision point for a point-selection answer node.
// Walks up to the nearest position-defining ancestor, or the root.
function getPointSelectionDecisionPoint(tree, node) {
  let current = node.parentId != null ? tree.get(node.parentId) : null
  while (
    current != null &&
    !isPositionNode(current) &&
    current.parentId != null
  ) {
    current = tree.get(current.parentId)
  }
  return current || tree.root
}

// Returns depth of a node by walking from root.
function getNodeDepth(tree, targetId) {
  let stack = [{node: tree.root, depth: 0}]
  while (stack.length) {
    let {node, depth} = stack.pop()
    if (node.id === targetId) return depth
    for (let child of node.children) stack.push({node: child, depth: depth + 1})
  }
  return 0
}

// Compares structural problem anchors. An ancestor is earlier than its
// descendant; unrelated branches are not reliably ordered.
function compareProblemAnchors(tree, firstId, secondId) {
  if (firstId === secondId) return 0
  let current = tree.get(secondId)
  while (current != null && current.parentId != null) {
    if (current.parentId === firstId) return -1
    current = tree.get(current.parentId)
  }
  current = tree.get(firstId)
  while (current != null && current.parentId != null) {
    if (current.parentId === secondId) return 1
    current = tree.get(current.parentId)
  }
  return null
}

// Infers playerToMove for point-selection from structured SGF evidence
// in the decision context. Returns 'B' | 'W' | null when ambiguous or absent.
function inferPointSelectionPlayerToMove(tree, decisionPoint) {
  if (decisionPoint == null) return null

  // Explicit valid PL on the relevant decision position is strongest evidence.
  let pl = decisionPoint.data?.PL?.[0]
  if (pl === 'B' || pl === 'W') return pl
  if (pl != null) return null // invalid PL

  // Fall back to consistent first-move color from the decision point's
  // first playable candidates, treating descriptive nodes as transparent.
  let depth = getNodeDepth(tree, decisionPoint.id)
  let candidates = getDecisionPointCandidates(decisionPoint, depth)
  let colors = new Set()
  for (let {node} of candidates) {
    if (node.data == null) continue
    if (node.data.B != null && node.data.W == null) colors.add('B')
    else if (node.data.W != null && node.data.B == null) colors.add('W')
    else if (node.data.B != null && node.data.W != null) return null
  }
  if (colors.size === 1) return [...colors][0]
  return null
}

// Analyzes point-selection candidates when no move-sequence problem exists.
// Returns {startNodeId, acceptedPoints, answerGroups, playerToMove} or null when no valid candidate.
function analyzePointSelection(tree, options = {}) {
  let {allowTeFallback = false} = options || {}
  let dimensions = getBoardDimensions(tree)
  if (dimensions == null) return null
  let points = new Map() // key: vertex string, value: vertex string
  let decisionPoints = new Map() // key: decisionPoint id, value: decisionPoint
  let answerGroups = [] // {nodeId, points: [...]}

  for (let node of tree.listNodes()) {
    if (node.data == null || node.data.L == null) continue
    if (!Array.isArray(node.data.L) || node.data.L.length === 0) continue

    // Only consider L nodes with reliable positive result evidence.
    let hasPositive = hasPositiveResultMarker(node)
    if (!hasPositive && allowTeFallback && hasTeMarker(node)) hasPositive = true
    if (!hasPositive) continue

    let validPoints = []
    let seenInGroup = new Set()
    for (let value of node.data.L) {
      if (typeof value !== 'string') continue
      let vertex = parseVertex(value)
      if (!isVertexOnBoard(vertex, dimensions)) continue
      let key = `${vertex[0]},${vertex[1]}`
      if (seenInGroup.has(key)) continue
      seenInGroup.add(key)
      validPoints.push(value)
      if (!points.has(key)) points.set(key, value)
    }

    if (validPoints.length > 0) {
      answerGroups.push({nodeId: node.id, points: validPoints})
    }

    let decisionPoint = getPointSelectionDecisionPoint(tree, node)
    if (decisionPoint != null)
      decisionPoints.set(decisionPoint.id, decisionPoint)
  }

  if (points.size === 0) return null
  if (decisionPoints.size !== 1) return null

  let decisionPoint = [...decisionPoints.values()][0]
  let acceptedPoints = [...points.values()]
  let playerToMove = inferPointSelectionPlayerToMove(tree, decisionPoint)
  return {
    startNodeId: decisionPoint.id,
    acceptedPoints,
    answerGroups,
    playerToMove,
  }
}

// Judgement detection for Alive/Dead, Legal/Illegal, Yes/No, Good/Bad problems.
// Shared pipeline: find question → classify domain → find answer candidates → classify answer → resolve ambiguity.
function analyzeJudgement(tree, options = {}) {
  let {allowTeFallback = false} = options || {}

  const JUDGEMENT_TYPES = [
    {
      judgementType: 'alive-dead',
      questionRe:
        /\balive\b[^.!?]*\bor\b[^.!?]*\bdead\b|\bdead\b[^.!?]*\bor\b[^.!?]*\balive\b/i,
      answerRes: {alive: /\balive\b/i, dead: /\bdead\b/i},
      choices: ['alive', 'dead'],
      isQuestionNode: (node) => true, // any position node
    },
    {
      judgementType: 'legal-illegal',
      questionRe: /\blegal\b/i, // will check more strictly below
      answerRes: {legal: /\blegal\b/i, illegal: /\billegal\b/i},
      choices: ['legal', 'illegal'],
      isQuestionNode: (node) => true,
      // Custom question check for Legal/Illegal
      isQuestion: (value) => {
        let hasLegal = /\blegal\b/i.test(value)
        let hasIllegal = /\billegal\b/i.test(value)
        let hasQuestion = /\?/.test(value) || /\bcan\b.*\bplay\b/i.test(value)
        return (hasLegal || hasIllegal) && hasQuestion
      },
    },
    {
      judgementType: 'yes-no',
      questionRe: /\bcan\b|\bcould\b|\bdoes\b|\bis\b/i,
      answerRes: {
        yes: /\byes\b/i,
        no: /\bno\b|\bcannot\b|\bcan\s+not\b|\bnot\b|\bunable\b|\bimpossible\b/i,
      },
      choices: ['yes', 'no'],
      isQuestionNode: (node) => true,
      isQuestion: (value) =>
        /\?/.test(value) && /\bcan\b|\bcould\b|\bdoes\b|\bis\b/i.test(value),
    },
    {
      judgementType: 'good-bad',
      questionRe:
        /\bgood\b[^.!?]*\bor\b[^.!?]*\bbad\b|\bbad\b[^.!?]*\bor\b[^.!?]*\bgood\b/i,
      answerRes: {good: /\bgood\b/i, bad: /\bbad\b/i},
      choices: ['good', 'bad'],
      isQuestionNode: (node) =>
        node.data != null && (node.data.B != null || node.data.W != null),
    },
  ]

  for (let type of JUDGEMENT_TYPES) {
    let result = analyzeJudgementType(tree, type, allowTeFallback)
    if (result != null) return result
  }
  return null
}

function analyzeJudgementType(tree, type, allowTeFallback) {
  // Find question node
  let questionNode = null
  let candidates = []
  // For Good/Bad, prioritize move nodes over root
  if (type.judgementType === 'good-bad') {
    for (let node of tree.listNodes()) {
      if (node.data != null && (node.data.B != null || node.data.W != null)) {
        candidates.push(node)
      }
    }
    // Also check position nodes as fallback (but not root first)
    for (let node of tree.listNodes()) {
      if (
        node !== tree.root &&
        isPositionNode(node) &&
        type.isQuestionNode(node) &&
        !candidates.includes(node)
      ) {
        candidates.push(node)
      }
    }
    if (!candidates.includes(tree.root) && type.isQuestionNode(tree.root)) {
      candidates.push(tree.root)
    }
  } else {
    candidates = [tree.root]
    for (let node of tree.listNodes()) {
      if (
        node !== tree.root &&
        isPositionNode(node) &&
        type.isQuestionNode(node)
      ) {
        candidates.push(node)
      } else if (
        type.judgementType === 'good-bad' &&
        node.data != null &&
        (node.data.B != null || node.data.W != null)
      ) {
        // For Good/Bad, question is on move node, not necessarily position node
        if (!candidates.includes(node)) candidates.push(node)
      }
    }
  }

  for (let node of candidates) {
    if (node.data == null || node.data.C == null) continue
    for (let value of node.data.C) {
      if (typeof value !== 'string') continue
      let isQuestion = false
      if (type.isQuestion != null) {
        isQuestion = type.isQuestion(value)
      } else {
        isQuestion = type.questionRe.test(value)
      }
      if (isQuestion) {
        questionNode = node
        break
      }
    }
    if (questionNode != null) break
  }
  if (questionNode == null) return null

  // Find the minimum structural answer distance. Entering a position costs
  // one; descriptive nodes are transparent.
  let questionDecisionPoint = isPositionNode(questionNode)
    ? questionNode
    : tree.root
  let anchor =
    type.judgementType === 'good-bad' ? questionNode : questionDecisionPoint
  let queue = anchor.children.map((node) => ({
    node,
    distance: isPositionNode(node) ? 1 : 0,
  }))
  let distances = new Map()
  let nearestDistance = null
  let nearestAnswers = []

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance)
    let {node, distance} = queue.shift()
    if (nearestDistance != null && distance > nearestDistance) break
    if (distances.has(node.id) && distances.get(node.id) <= distance) continue
    distances.set(node.id, distance)

    let answer = classifyJudgementAnswer(node, type, allowTeFallback)
    if (answer === 'ambiguous') return null
    if (answer != null) {
      nearestDistance = distance
      nearestAnswers.push(answer)
      continue
    }

    for (let child of node.children) {
      queue.push({
        node: child,
        distance: distance + (isPositionNode(child) ? 1 : 0),
      })
    }
  }

  if (nearestAnswers.length === 0) return null
  let choices = new Set(nearestAnswers.map((answer) => answer.choice))
  if (choices.size !== 1) return null
  let answer = nearestAnswers.find((candidate) => candidate.marked)
  answer = answer || nearestAnswers[0]
  let startNodeId = isPositionNode(questionNode)
    ? questionNode.id
    : questionDecisionPoint.id
  if (type.judgementType === 'good-bad') startNodeId = questionNode.id
  return {
    judgementType: type.judgementType,
    startNodeId,
    answerNodeId: answer.node.id,
    choices: type.choices,
    correctChoice: answer.choice,
  }
}

function classifyJudgementAnswer(node, type, allowTeFallback) {
  if (node.data == null || !Array.isArray(node.data.C)) return null
  let matchedChoices = new Set()
  for (let value of node.data.C) {
    if (typeof value !== 'string') continue
    for (let choice of type.choices) {
      if (type.answerRes[choice].test(value)) matchedChoices.add(choice)
    }
  }
  if (matchedChoices.size > 1) return 'ambiguous'
  if (matchedChoices.size === 0) return null
  let marked = hasPositiveResultMarker(node)
  if (!marked && allowTeFallback && hasTeMarker(node)) marked = true
  return {node, choice: [...matchedChoices][0], marked}
}

// Higher-level interpretation that distinguishes move-sequence and
// point-selection problems while preserving the existing analyzeProblem API.
//
// Returns:
// - {kind: 'move-sequence', problem} when a playable move-sequence is found
// - {kind: 'point-selection', startNodeId, acceptedPoints, answerGroups, playerToMove} when
//   L-based point-selection is detected
// - {kind: 'judgement', judgementType, startNodeId, answerNodeId, choices, correctChoice} when
//   judgement is detected
// - {kind: 'unsupported'} otherwise
export function interpretProblem(tree, options = {}) {
  let problem = analyzeProblem(tree, options)
  if (problem != null) {
    return {kind: 'move-sequence', problem}
  }

  // Compute non-move interpretations independently
  let pointSelection = analyzePointSelection(tree, options)
  let judgement = analyzeJudgement(tree, options)

  // Arbitrate by structural problem anchor: earlier startNodeId wins
  if (pointSelection != null && judgement != null) {
    let order = compareProblemAnchors(
      tree,
      pointSelection.startNodeId,
      judgement.startNodeId,
    )
    if (order === -1) {
      return {
        kind: 'point-selection',
        startNodeId: pointSelection.startNodeId,
        acceptedPoints: pointSelection.acceptedPoints,
        answerGroups: pointSelection.answerGroups,
        playerToMove: pointSelection.playerToMove,
      }
    }
    if (order === 1) {
      return {
        kind: 'judgement',
        judgementType: judgement.judgementType,
        startNodeId: judgement.startNodeId,
        answerNodeId: judgement.answerNodeId,
        choices: judgement.choices,
        correctChoice: judgement.correctChoice,
      }
    }
    return {kind: 'unsupported'}
  }

  if (pointSelection != null) {
    return {
      kind: 'point-selection',
      startNodeId: pointSelection.startNodeId,
      acceptedPoints: pointSelection.acceptedPoints,
      answerGroups: pointSelection.answerGroups,
      playerToMove: pointSelection.playerToMove,
    }
  }

  if (judgement != null) {
    return {
      kind: 'judgement',
      judgementType: judgement.judgementType,
      startNodeId: judgement.startNodeId,
      answerNodeId: judgement.answerNodeId,
      choices: judgement.choices,
      correctChoice: judgement.correctChoice,
    }
  }

  return {kind: 'unsupported'}
}
