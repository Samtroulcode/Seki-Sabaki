import sgf from '@sabaki/sgf'
import Board from '@sabaki/go-board'

import * as gametree from './gametree.js'

export function buildOgsGameTree(
  onlineGame,
  {appName = 'Seki-Sabaki', version = '0.0.0'} = {},
) {
  let board = onlineGame?.board || {}
  let width = Number.isInteger(board.width) ? board.width : 19
  let height = Number.isInteger(board.height) ? board.height : width
  let sizeInfo = width === height ? width.toString() : `${width}:${height}`
  let rootData = {
    GM: ['1'],
    FF: ['4'],
    CA: ['UTF-8'],
    AP: [`${appName}:${version}`],
    SZ: [sizeInfo],
    EV: ['Online-Go.com'],
  }

  if (onlineGame?.gameName) rootData.GN = [onlineGame.gameName]
  if (onlineGame?.gameId != null) {
    rootData.SO = [`https://online-go.com/game/${onlineGame.gameId}`]
  }
  if (Number.isInteger(onlineGame?.handicap) && onlineGame.handicap > 1) {
    let handicapStones = Board.fromDimensions(width, height)
      .getHandicapPlacement(onlineGame.handicap)
      .map(sgf.stringifyVertex)

    rootData.HA = [handicapStones.length.toString()]
    rootData.AB = handicapStones
  }

  let black = onlineGame?.players?.black
  let white = onlineGame?.players?.white
  if (black?.username) rootData.PB = [black.username]
  if (white?.username) rootData.PW = [white.username]

  return gametree.new().mutate((draft) => {
    for (let prop in rootData) {
      draft.updateProperty(draft.root.id, prop, rootData[prop])
    }

    let position = draft.root.id
    let moves = Array.isArray(onlineGame?.moves)
      ? [...onlineGame.moves].sort(compareMoves)
      : []
    let moveIndex = 0

    for (let i = 0; i < moves.length; i++) {
      let vertex = parseOgsMove(moves[i]?.move, width, height)
      if (vertex == null) continue

      let moveNumber = Number.isInteger(moves[i].moveNumber)
        ? moves[i].moveNumber
        : moveIndex + 1
      let color = getMoveColor(moveNumber, onlineGame?.handicap)
      position = draft.appendNode(position, {
        [color]: [sgf.stringifyVertex(vertex)],
      })
      moveIndex++
    }
  })
}

function compareMoves(a, b) {
  let aNumber = Number.isInteger(a?.moveNumber) ? a.moveNumber : Infinity
  let bNumber = Number.isInteger(b?.moveNumber) ? b.moveNumber : Infinity

  return aNumber - bNumber
}

function getMoveColor(moveNumber, handicap) {
  let firstPlayer = Number.isInteger(handicap) && handicap > 1 ? 'W' : 'B'
  let secondPlayer = firstPlayer === 'B' ? 'W' : 'B'

  return moveNumber % 2 === 1 ? firstPlayer : secondPlayer
}

export function parseOgsMove(move, width, height) {
  if (move === '..') return [-1, -1]
  if (typeof move !== 'string' || !/^[a-z]{2}$/.test(move)) return null

  let x = move.charCodeAt(0) - 97
  let y = move.charCodeAt(1) - 97

  if (x < 0 || y < 0 || x >= width || y >= height) return null

  return [x, y]
}
