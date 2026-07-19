const {sanitizeMoveCount} = require('./sanitize.js')

function sanitizeHistoricalMoves(value, board = null) {
  if (typeof value === 'string') {
    let moves = []

    for (let i = 0; i < value.length - 1; i += 2) {
      let move = encodeOgsMove(value.slice(i, i + 2), board)
      if (move != null) moves.push({move, moveNumber: moves.length + 1})
    }

    return moves
  }

  if (!Array.isArray(value)) return []

  let moves = []

  for (let item of value) {
    let move = sanitizeHistoricalMove(item, moves.length, board)
    if (move != null) moves.push(move)
  }

  return moves
}

function sanitizeHistoricalMove(value, index, board = null) {
  if (typeof value === 'string') {
    let move = encodeOgsMove(value, board)
    return move == null ? null : {move, moveNumber: index + 1}
  }

  if (Array.isArray(value)) {
    if (typeof value[0] === 'number') {
      let move = encodeOgsMove(value, board)
      return move == null ? null : {move, moveNumber: index + 1}
    }

    let move = encodeOgsMove(value[0], board)
    if (move == null) return null

    return {
      move,
      moveNumber: sanitizeMoveCount(value[1], index + 1),
    }
  }

  let move = encodeOgsMove(value, board)
  if (move != null) return {move, moveNumber: index + 1}

  return sanitizeLiveMove(value, index + 1, board)
}

function sanitizeLiveMove(value, fallbackMoveNumber = null, board = null) {
  let move = encodeOgsMove(value?.move, board)
  if (move == null) return null

  return {
    move,
    moveNumber: sanitizeMoveCount(value?.move_number, fallbackMoveNumber),
  }
}

function encodeOgsMove(value, board = null) {
  if (typeof value === 'string') {
    if (!/^[a-z.]{2}$/.test(value)) return null
    return isMoveInBoard(value, board) ? value : null
  }

  if (Array.isArray(value) && typeof value[0] === 'number') {
    return encodeOgsCoordinates(value[0], value[1], board)
  }

  if (
    value != null &&
    typeof value === 'object' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  ) {
    return encodeOgsCoordinates(value.x, value.y, board)
  }

  return null
}

function encodeOgsCoordinates(x, y, board = null) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  if (x === -1 && y === -1) return '..'
  if (x < 0 || y < 0 || x > 25 || y > 25) return null

  let move = String.fromCharCode(97 + x) + String.fromCharCode(97 + y)
  return isMoveInBoard(move, board) ? move : null
}

function isMoveInBoard(move, board) {
  if (move === '..' || board == null) return true

  let x = move.charCodeAt(0) - 97
  let y = move.charCodeAt(1) - 97

  return x >= 0 && y >= 0 && x < board.width && y < board.height
}

function mergeMoves(moves, move) {
  let result = moves.filter((item) => item.moveNumber !== move.moveNumber)
  result.push(move)

  return result.sort((a, b) => a.moveNumber - b.moveNumber)
}

module.exports = {
  sanitizeHistoricalMoves,
  sanitizeHistoricalMove,
  sanitizeLiveMove,
  encodeOgsMove,
  encodeOgsCoordinates,
  isMoveInBoard,
  mergeMoves,
}
