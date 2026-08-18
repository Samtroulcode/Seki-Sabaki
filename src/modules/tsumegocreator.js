import sgf, {stringifyVertex} from '@sabaki/sgf'

import * as gametree from './gametree.js'
import {analyzeProblem} from './tsumego.js'

function clearCache(tree) {
  gametree.clearBoardCacheForTree(tree)
}

const VALID_SIZES = new Set([9, 13, 19])
const CORRECT_MARKER = 'Correct'
const WRONG_MARKER = 'Wrong'

export function createDraft(size = 19) {
  if (!VALID_SIZES.has(size)) size = 19

  return gametree.new().mutate((draft) => {
    draft.updateProperty(draft.root.id, 'GM', ['1'])
    draft.updateProperty(draft.root.id, 'SZ', [size.toString()])
    draft.updateProperty(draft.root.id, 'PL', ['B'])
  })
}

export function setBoardSize(tree, size) {
  if (!VALID_SIZES.has(size)) return tree

  let nextTree = tree.mutate((draft) => {
    draft.updateProperty(draft.root.id, 'SZ', [size.toString()])
    draft.removeProperty(draft.root.id, 'AB')
    draft.removeProperty(draft.root.id, 'AW')
  })

  clearCache(nextTree)
  return nextTree
}

export function resetDraft(size) {
  return createDraft(size)
}

export function setSetupStone(tree, vertex, color) {
  let sgfVertex = stringifyVertex(vertex)
  if (sgfVertex == null || sgfVertex === '') return tree

  let root = tree.root
  let ab = root.data.AB || []
  let aw = root.data.AW || []
  let nextAb = ab
  let nextAw = aw

  if (color === 'B') {
    nextAb = addVertex(removeVertex(ab, sgfVertex), sgfVertex)
    nextAw = removeVertex(aw, sgfVertex)
  } else if (color === 'W') {
    nextAb = removeVertex(ab, sgfVertex)
    nextAw = addVertex(removeVertex(aw, sgfVertex), sgfVertex)
  } else {
    nextAb = removeVertex(ab, sgfVertex)
    nextAw = removeVertex(aw, sgfVertex)
  }

  if (arraysEqual(nextAb, ab) && arraysEqual(nextAw, aw)) return tree

  let nextTree = tree.mutate((draft) => {
    let rootId = draft.root.id
    if (nextAb.length === 0) draft.removeProperty(rootId, 'AB')
    else draft.updateProperty(rootId, 'AB', nextAb)
    if (nextAw.length === 0) draft.removeProperty(rootId, 'AW')
    else draft.updateProperty(rootId, 'AW', nextAw)
  })

  clearCache(nextTree)
  return nextTree
}

export function setPlayerToMove(tree, color) {
  if (color !== 'B' && color !== 'W') return tree

  return tree.mutate((draft) => {
    draft.updateProperty(draft.root.id, 'PL', [color])
  })
}

export function setComment(tree, comment) {
  let value = comment == null ? '' : String(comment)
  let current = tree.root.data.C?.[0] ?? ''

  if (value === current) return tree

  return tree.mutate((draft) => {
    if (value === '') {
      draft.removeProperty(draft.root.id, 'C')
    } else {
      draft.updateProperty(draft.root.id, 'C', [value])
    }
  })
}

export function hasStones(tree) {
  let root = tree.root
  let ab = root.data.AB
  let aw = root.data.AW
  return (ab != null && ab.length > 0) || (aw != null && aw.length > 0)
}

export function hasSolutionMoves(tree) {
  for (let node of tree.listNodes()) {
    if (node.id === tree.root.id) continue
    if (node.data.B != null || node.data.W != null) return true
  }
  return false
}

export function getBoard(tree, nodeId = tree.root.id) {
  return gametree.getBoard(tree, nodeId)
}

export function getNextPlayer(tree, nodeId) {
  let root = tree.root
  if (nodeId === root.id) {
    return root.data.PL?.[0] === 'W' ? 'W' : 'B'
  }

  let moveCount = 0
  for (let node of tree.listNodesVertically(nodeId, -1, {})) {
    if (node.id === root.id) continue
    if (node.data.B != null || node.data.W != null) moveCount++
  }

  let start = root.data.PL?.[0] === 'W' ? 'W' : 'B'
  return moveCount % 2 === 0 ? start : opposite(start)
}

export function findMatchingChild(tree, parentNodeId, color, sgfVertex) {
  let parent = tree.get(parentNodeId)
  if (parent == null) return null

  for (let child of parent.children) {
    let value = child.data[color]
    if (value != null && value[0] === sgfVertex) return child
  }
  return null
}

export function playMove(tree, parentNodeId, vertex) {
  if (vertex == null) return null
  let sgfVertex = stringifyVertex(vertex)
  if (sgfVertex == null || sgfVertex === '') return null

  let color = getNextPlayer(tree, parentNodeId)
  let existing = findMatchingChild(tree, parentNodeId, color, sgfVertex)
  if (existing != null) {
    return {tree, nodeId: existing.id, created: false}
  }

  let board = getBoard(tree, parentNodeId)
  let sign = color === 'B' ? 1 : -1

  try {
    let analysis = board.analyzeMove(sign, vertex)
    if (analysis.overwrite || analysis.suicide || analysis.ko) return null

    let nextBoard = board.makeMove(sign, vertex, {
      preventOverwrite: true,
      preventSuicide: true,
      preventKo: true,
    })
    if (nextBoard == null) return null
  } catch (err) {
    return null
  }

  let nextTree = tree.mutate((draft) => {
    draft.appendNode(
      parentNodeId,
      {[color]: [sgfVertex]},
      {disableMerging: true},
    )
  })

  clearCache(nextTree)

  let newNode = findMatchingChild(nextTree, parentNodeId, color, sgfVertex)
  if (newNode == null) return null

  return {tree: nextTree, nodeId: newNode.id, created: true}
}

export function serialize(tree, options = {}) {
  let {linebreak = ''} = options
  return sgf.stringify([tree.root], {linebreak})
}

export function getNodeResult(tree, nodeId) {
  let node = tree.get(nodeId)
  if (node == null) return null

  return parseCommentValue(node.data.C?.[0]).result
}

export function getNodeComment(tree, nodeId) {
  let node = tree.get(nodeId)
  if (node == null) return ''

  return parseCommentValue(node.data.C?.[0]).humanComment
}

export function setNodeResult(tree, nodeId, result) {
  if (result !== 'correct' && result !== 'wrong' && result != null) return tree

  let node = tree.get(nodeId)
  if (node == null) return tree
  if (nodeId === tree.root.id) return tree

  let {humanComment} = parseCommentValue(node.data.C?.[0])
  let nextValue = buildCommentValue(result, humanComment)

  if (nextValue === node.data.C?.[0]) return tree

  return tree.mutate((draft) => {
    if (nextValue == null) draft.removeProperty(nodeId, 'C')
    else draft.updateProperty(nodeId, 'C', [nextValue])
  })
}

export function setNodeComment(tree, nodeId, comment) {
  let node = tree.get(nodeId)
  if (node == null) return tree
  if (nodeId === tree.root.id) return tree

  let {result} = parseCommentValue(node.data.C?.[0])
  let nextValue = buildCommentValue(result, comment)

  if (nextValue === node.data.C?.[0]) return tree

  return tree.mutate((draft) => {
    if (nextValue == null) draft.removeProperty(nodeId, 'C')
    else draft.updateProperty(nodeId, 'C', [nextValue])
  })
}

export function validateProblem(tree) {
  let problem = analyzeProblem(tree, {allowTeFallback: true})
  return {valid: problem != null, problem}
}

export function deleteBranch(tree, nodeId) {
  if (nodeId === tree.root.id) return null

  let node = tree.get(nodeId)
  if (node == null) return null
  if (node.parentId == null) return null

  let parentId = node.parentId
  let nextTree = tree.mutate((draft) => {
    draft.removeNode(nodeId)
  })

  clearCache(nextTree)
  return {tree: nextTree, parentId, deleted: true}
}

function parseCommentValue(value) {
  if (value == null) return {result: null, humanComment: ''}

  let correctMatch = value.match(/^Correct(?:\r?\n\r?\n([\s\S]*))?$/)
  if (correctMatch) {
    return {result: 'correct', humanComment: correctMatch[1] || ''}
  }

  let wrongMatch = value.match(/^Wrong(?:\r?\n\r?\n([\s\S]*))?$/)
  if (wrongMatch) {
    return {result: 'wrong', humanComment: wrongMatch[1] || ''}
  }

  return {result: null, humanComment: value}
}

function buildCommentValue(result, humanComment) {
  humanComment = humanComment == null ? '' : String(humanComment).trim()

  if (result === 'correct') {
    return humanComment === ''
      ? CORRECT_MARKER
      : `${CORRECT_MARKER}\n\n${humanComment}`
  }

  if (result === 'wrong') {
    return humanComment === ''
      ? WRONG_MARKER
      : `${WRONG_MARKER}\n\n${humanComment}`
  }

  return humanComment === '' ? null : humanComment
}

function removeVertex(list, vertex) {
  return list.filter((v) => v !== vertex)
}

function addVertex(list, vertex) {
  if (list.includes(vertex)) return list
  return [...list, vertex]
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function opposite(color) {
  return color === 'W' ? 'B' : 'W'
}
