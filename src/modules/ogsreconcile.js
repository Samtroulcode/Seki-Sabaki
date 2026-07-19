export function getOgsServerMoves(onlineGame) {
  let board = onlineGame?.board || {}
  let width = Number.isInteger(board.width) ? board.width : 19
  let height = Number.isInteger(board.height) ? board.height : width
  let moveIndex = 0

  return [...onlineGame.moves]
    .sort((a, b) => {
      let aNumber = Number.isInteger(a?.moveNumber) ? a.moveNumber : Infinity
      let bNumber = Number.isInteger(b?.moveNumber) ? b.moveNumber : Infinity

      return aNumber - bNumber
    })
    .flatMap((move) => {
      if (parseOgsMove(move?.move, width, height) == null) return []

      moveIndex++

      let result = {
        moveNumber: moveIndex,
        move: move?.move,
      }

      return [result]
    })
}

export function parseOgsMove(move, width, height) {
  if (move === '..') return [-1, -1]
  if (typeof move !== 'string' || !/^[a-z]{2}$/.test(move)) return null

  let x = move.charCodeAt(0) - 97
  let y = move.charCodeAt(1) - 97

  if (x < 0 || y < 0 || x >= width || y >= height) return null

  return [x, y]
}

export function getOgsMovePlayer(moveNumber, handicap) {
  let firstPlayer = Number.isInteger(handicap) && handicap > 1 ? -1 : 1
  let secondPlayer = -firstPlayer

  return moveNumber % 2 === 1 ? firstPlayer : secondPlayer
}

export function getOgsPlayerToMove(onlineGame) {
  if (
    onlineGame.clock?.currentPlayer != null &&
    onlineGame.clock.lastMove >= onlineGame.moveCount
  ) {
    return normalizeOgsId(onlineGame.clock.currentPlayer)
  }

  let blackId = normalizeOgsId(onlineGame.players?.black?.id)
  let whiteId = normalizeOgsId(onlineGame.players?.white?.id)
  if (blackId == null || whiteId == null) return null

  let firstPlayer = onlineGame.handicap > 1 ? whiteId : blackId
  let secondPlayer = firstPlayer === blackId ? whiteId : blackId

  return onlineGame.moveCount % 2 === 0 ? firstPlayer : secondPlayer
}

export function normalizeOgsId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)) {
    let number = Number(value)
    return Number.isSafeInteger(number) ? number : null
  }

  return null
}

export function getOgsLineMoves(lineNodes) {
  return lineNodes
    .map((node) => node.data)
    .slice(1)
    .map((data, index) => {
      let move = null

      if (data.B != null) move = data.B[0] || '..'
      else if (data.W != null) move = data.W[0] || '..'

      return {moveNumber: index + 1, move}
    })
    .filter((move) => move.move != null)
}

export function reconcileOgsMoves({
  localMoves,
  serverMoves,
  pendingMove = null,
}) {
  if (!Array.isArray(localMoves) || !Array.isArray(serverMoves)) {
    return {
      status: 'invalid-server-state',
      appendMoves: [],
      confirmedPendingMove: null,
    }
  }

  let findConfirmedPendingMove = () =>
    pendingMove == null
      ? null
      : serverMoves.find((move) => movesEqual([move], [pendingMove])) || null

  if (movesEqual(localMoves, serverMoves)) {
    return {
      status: 'in-sync',
      appendMoves: [],
      confirmedPendingMove: findConfirmedPendingMove(),
    }
  }

  if (
    pendingMove != null &&
    localMoves.length === serverMoves.length + 1 &&
    movesEqual(localMoves.slice(0, -1), serverMoves) &&
    movesEqual([localMoves.at(-1)], [pendingMove])
  ) {
    return {
      status: 'pending-local-move',
      appendMoves: [],
      confirmedPendingMove: null,
    }
  }

  if (localMoves.length > serverMoves.length) {
    return {
      status: 'diverged',
      appendMoves: [],
      confirmedPendingMove: null,
    }
  }

  for (let i = 0; i < localMoves.length; i++) {
    let localMove = localMoves[i]
    let serverMove = serverMoves[i]
    let pendingConfirmed =
      pendingMove != null &&
      movesEqual([localMove], [pendingMove]) &&
      movesEqual([localMove], [serverMove])

    if (!pendingConfirmed && !movesEqual([localMove], [serverMove])) {
      return {
        status: 'diverged',
        appendMoves: [],
        confirmedPendingMove: null,
      }
    }
  }

  return {
    status: 'applied',
    appendMoves: serverMoves.slice(localMoves.length),
    confirmedPendingMove: findConfirmedPendingMove(),
  }
}

export function parseOgsStoneString(value, width, height) {
  if (typeof value !== 'string') return []

  let boardWidth = Number.isInteger(width) ? width : 19
  let boardHeight = Number.isInteger(height) ? height : boardWidth

  let result = []
  for (let i = 0; i < value.length - 1; i += 2) {
    let vertex = parseOgsMove(value.slice(i, i + 2), boardWidth, boardHeight)
    if (vertex != null && !sameVertex(vertex, [-1, -1])) {
      result.push(vertex)
    }
  }

  return result
}

export function sameVertices(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false
  }

  return a.every((vertex) => b.some((other) => sameVertex(vertex, other)))
}

export function movesEqual(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every(
      (move, index) =>
        move?.moveNumber === b[index]?.moveNumber &&
        move?.move === b[index]?.move,
    )
  )
}

function sameVertex(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  )
}
