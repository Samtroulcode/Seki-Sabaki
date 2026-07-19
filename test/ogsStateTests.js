import assert from 'assert'

import {
  cloneActiveGameState,
  cloneOnlineGameState,
  getInitialMatchmakingState,
  getInitialOnlineGameState,
} from '../src/ogs/state.js'

describe('OGS state helpers', () => {
  it('creates stable initial states', () => {
    assert.deepStrictEqual(getInitialMatchmakingState(), {
      status: 'idle',
      options: {
        boardSizes: [19],
        speeds: ['rapid'],
        timeSystem: 'byoyomi',
        lowerRankDiff: 3,
        upperRankDiff: 3,
        rules: {condition: 'required', value: 'japanese'},
        handicap: {condition: 'preferred', value: 'enabled'},
      },
      payload: null,
      matchedGameId: null,
      error: null,
    })

    assert.deepStrictEqual(getInitialOnlineGameState().moves, [])
  })

  it('clones online game state without sharing nested mutable data', () => {
    let state = {
      ...getInitialOnlineGameState(),
      board: {width: 19, height: 19},
      timeControl: {system: 'byoyomi'},
      players: {
        black: {id: 1, username: 'black'},
        white: {id: 2, username: 'white'},
      },
      clock: {
        blackTime: {thinkingTime: 10},
        whiteTime: {thinkingTime: 20},
        pause: {paused: true},
      },
      removedStonesAccepted: [1],
      moves: [{move: 'aa', moveNumber: 1}],
      chat: [{body: 'hello'}],
    }
    let clone = cloneOnlineGameState(state)

    clone.board.width = 9
    clone.players.black.username = 'changed'
    clone.clock.blackTime.thinkingTime = 0
    clone.moves[0].move = 'bb'
    clone.chat[0].body = 'changed'
    clone.removedStonesAccepted.push(2)

    assert.strictEqual(state.board.width, 19)
    assert.strictEqual(state.players.black.username, 'black')
    assert.strictEqual(state.clock.blackTime.thinkingTime, 10)
    assert.strictEqual(state.moves[0].move, 'aa')
    assert.strictEqual(state.chat[0].body, 'hello')
    assert.deepStrictEqual(state.removedStonesAccepted, [1])
  })

  it('clones active game state nested values', () => {
    let game = {
      id: 42,
      board: {width: 19, height: 19},
      timeControl: {system: 'fischer'},
      black: {id: 1},
      white: {id: 2},
    }
    let clone = cloneActiveGameState(game)

    clone.board.width = 9
    clone.timeControl.system = 'byoyomi'
    clone.black.id = 3

    assert.strictEqual(game.board.width, 19)
    assert.strictEqual(game.timeControl.system, 'fischer')
    assert.strictEqual(game.black.id, 1)
  })
})
