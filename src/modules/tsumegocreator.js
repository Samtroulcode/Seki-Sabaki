import sgf, {stringifyVertex} from '@sabaki/sgf'

import * as gametree from './gametree.js'

const VALID_SIZES = new Set([9, 13, 19])

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

  return tree.mutate((draft) => {
    draft.updateProperty(draft.root.id, 'SZ', [size.toString()])
    draft.removeProperty(draft.root.id, 'AB')
    draft.removeProperty(draft.root.id, 'AW')
  })
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

  return tree.mutate((draft) => {
    let rootId = draft.root.id
    if (nextAb.length === 0) draft.removeProperty(rootId, 'AB')
    else draft.updateProperty(rootId, 'AB', nextAb)
    if (nextAw.length === 0) draft.removeProperty(rootId, 'AW')
    else draft.updateProperty(rootId, 'AW', nextAw)
  })
}

export function setPlayerToMove(tree, color) {
  if (color !== 'B' && color !== 'W') return tree

  return tree.mutate((draft) => {
    draft.updateProperty(draft.root.id, 'PL', [color])
  })
}

export function setComment(tree, comment) {
  let value = comment == null ? '' : String(comment)

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

export function getBoard(tree) {
  return gametree.getBoard(tree, tree.root.id)
}

export function serialize(tree, options = {}) {
  let {linebreak = ''} = options
  return sgf.stringify([tree.root], {linebreak})
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
