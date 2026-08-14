import * as sgfFileFormat from './fileformats/sgf.js'
import * as gametree from './gametree.js'

const MAX_PREVIEW_SGF_BYTES = 512 * 1024
const MAX_PREVIEW_NODE_COUNT = 1000
const MAX_PREVIEW_BOARD_SIZE = 25

export function parseSgfPreview(content) {
  try {
    if (!isPreviewSgfContentSafe(content)) {
      return null
    }

    let [tree] = sgfFileFormat.parse(content)
    if (tree == null) return null

    let mainNodes = [...tree.listMainNodes()]
    let node = mainNodes.at(-1) || tree.root
    let board = gametree.getBoard(tree, node.id)

    return {
      width: board.width,
      height: board.height,
      signMap: board.signMap.map((row) => [...row]),
      currentVertex: board.currentVertex,
    }
  } catch (err) {
    return null
  }
}

export function isPreviewSgfContentSafe(content) {
  if (typeof content !== 'string' || !content.trim().startsWith('(')) {
    return false
  }

  if (new Blob([content]).size > MAX_PREVIEW_SGF_BYTES) return false

  let nodeCount = content.match(/;/g)?.length || 0
  if (nodeCount > MAX_PREVIEW_NODE_COUNT) return false

  let sizeMatch = content.match(/SZ\[([^\]]+)\]/)
  if (sizeMatch == null) return true

  let sizes = sizeMatch[1].split(':').map((value) => Number(value))

  return sizes.every(
    (value) =>
      Number.isInteger(value) && value >= 1 && value <= MAX_PREVIEW_BOARD_SIZE,
  )
}
