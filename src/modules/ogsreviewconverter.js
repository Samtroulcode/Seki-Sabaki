import sgf from '@sabaki/sgf'

export function mergeOgsReviewIntoGameTree(tree, review) {
  if (tree == null || review == null) return tree

  let mainSequence = [...tree.getSequence(tree.root.id)]
  let moveEntries = Object.entries(review.moves || {})
    .map(([key, move]) => [Number(key), move])
    .filter(
      ([moveNumber, move]) => Number.isInteger(moveNumber) && move != null,
    )

  if (moveEntries.length === 0) return tree

  let changed = false
  let dimensions = getTreeDimensions(tree)

  let enriched = tree.mutate((draft) => {
    for (let [moveNumber, move] of moveEntries) {
      let parent = mainSequence[moveNumber]
      if (parent == null) continue

      let mainProperties = getAnalysisProperties(move)
      changed = updateProperties(draft, parent.id, mainProperties) || changed

      let branches = Array.isArray(move.branches) ? move.branches : []
      let variation = review.variations?.[String(moveNumber)]
      if (variation?.branches != null)
        branches = [...branches, ...variation.branches]
      for (let branch of branches) {
        changed =
          mergeBranch(
            draft,
            parent,
            branch,
            moveNumber,
            mainSequence,
            dimensions,
          ) || changed
      }
    }
  })

  return changed ? enriched : tree
}

function mergeBranch(
  draft,
  parent,
  branch,
  moveNumber,
  mainSequence,
  dimensions,
) {
  if (!Array.isArray(branch?.moves) || branch.moves.length === 0) return false

  let nextColor = getNextColor(mainSequence[moveNumber + 1], parent)
  let current = parent
  let color = nextColor
  let changed = false

  for (let [index, vertex] of branch.moves.entries()) {
    if (!validVertex(vertex, dimensions)) return changed

    let property = {
      [color]: [
        isPass(vertex) ? '' : sgf.stringifyVertex([vertex.x, vertex.y]),
      ],
    }
    let latestCurrent = draft.get(current.id)
    let existing = latestCurrent?.children.find((child) =>
      sameMove(child.data, property),
    )

    if (existing == null) {
      let id = draft.appendNode(current.id, property, {disableMerging: true})
      current = draft.get(id)
      changed = true
    } else {
      current = existing
    }

    if (index === 0 && existing == null) {
      changed =
        updateProperties(draft, current.id, getAnalysisProperties(branch)) ||
        changed
    }
    color = color === 'B' ? 'W' : 'B'
  }

  return changed
}

function getAnalysisProperties(value) {
  let properties = {}
  let winRate = value?.winRate ?? value?.win_rate
  let score = value?.score

  if (typeof winRate === 'number' && Number.isFinite(winRate)) {
    properties.SBKV = [(winRate <= 1 ? winRate * 100 : winRate).toFixed(2)]
  }

  if (typeof score === 'number' && Number.isFinite(score)) {
    properties.SBKS = [score.toFixed(2)]
  }

  return properties
}

function updateProperties(draft, nodeId, properties) {
  let changed = false
  let node = draft.get(nodeId)
  for (let [property, values] of Object.entries(properties)) {
    if (JSON.stringify(node?.data?.[property]) === JSON.stringify(values))
      continue
    draft.updateProperty(nodeId, property, values)
    changed = true
  }
  return changed
}

function getNextColor(nextNode, parent) {
  if (nextNode?.data?.B != null) return 'B'
  if (nextNode?.data?.W != null) return 'W'
  return parent?.data?.B != null ? 'W' : 'B'
}

function sameMove(data, property) {
  let color = property.B != null ? 'B' : 'W'
  return data?.[color]?.[0] === property[color]?.[0]
}

function validVertex(vertex, dimensions) {
  return (
    vertex != null &&
    Number.isInteger(vertex.x) &&
    Number.isInteger(vertex.y) &&
    (isPass(vertex) ||
      (vertex.x >= 0 &&
        vertex.y >= 0 &&
        vertex.x < dimensions.width &&
        vertex.y < dimensions.height))
  )
}

function isPass(vertex) {
  return vertex.x === -1 && vertex.y === -1
}

function getTreeDimensions(tree) {
  let size = tree.root.data.SZ?.[0] || '19'
  let values = String(size).split(':').map(Number)
  return {
    width: Number.isInteger(values[0]) ? values[0] : 19,
    height: Number.isInteger(values.at(-1)) ? values.at(-1) : 19,
  }
}

export function getOgsReviewGameTree(tree, review) {
  return mergeOgsReviewIntoGameTree(tree, review)
}
