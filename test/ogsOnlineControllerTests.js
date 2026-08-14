import assert from 'assert'

import {OgsOnlineController} from '../src/modules/ogsonlinecontroller.js'

function createStore(initialState = {}) {
  let listeners = new Set()
  let state = initialState
  let calls = []

  return {
    calls,
    getState: () => state,
    setState: (change) => {
      state = {...state, ...change}
      calls.push(['setState', change])
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: (nextState) => {
      state = nextState
      for (let listener of listeners) listener(nextState)
    },
    connectGame: async (gameId) => {
      calls.push(['connectGame', gameId])
      return {ok: true, state}
    },
    acknowledgeAutomatchOpen: async (gameId) => {
      calls.push(['acknowledgeAutomatchOpen', gameId])
      return {ok: true, state}
    },
  }
}

function createSabaki(overrides = {}) {
  let calls = []

  return {
    calls,
    state: {onlineGameId: null},
    ogsPendingMove: null,
    setState: (change) => calls.push(['setState', change]),
    handleOgsGameError: async (onlineGame) => {
      calls.push(['handleOgsGameError', onlineGame.gameId, onlineGame.error])
      return true
    },
    applyOgsGameUpdate: async (onlineGame) => {
      calls.push(['applyOgsGameUpdate', onlineGame.gameId])
      return true
    },
    loadOgsGame: async (onlineGame, options) => {
      calls.push(['loadOgsGame', onlineGame.gameId, options])
      return true
    },
    showOgsGameEndInfo: async (onlineGame) => {
      calls.push(['showOgsGameEndInfo', onlineGame.gameId])
      return true
    },
    detachOgsGame: (gameId) => calls.push(['detachOgsGame', gameId]),
    enterOgsStoneRemovalMode: (onlineGame) => {
      calls.push(['enterOgsStoneRemovalMode', onlineGame.gameId])
    },
    ...overrides,
  }
}

function createOnlineGame(overrides = {}) {
  return {
    status: 'connected',
    gameId: 42,
    board: {width: 19, height: 19},
    moves: [{move: 'aa', moveNumber: 1}],
    moveCount: 1,
    phase: 'play',
    handicap: 0,
    ...overrides,
  }
}

function createState(overrides = {}) {
  return {
    user: {id: 7, username: 'sekibot'},
    matchmaking: {status: 'idle'},
    onlineGame: createOnlineGame(),
    ...overrides,
  }
}

describe('OGS online controller', () => {
  it('subscribes once to OnlineStore state changes', () => {
    let store = createStore()
    let controller = new OgsOnlineController({store, sabaki: createSabaki()})

    controller.initialize()
    controller.initialize()
    store.emit(createState({user: null}))

    assert.strictEqual(controller.unsubscribeStore != null, true)
    controller.dispose()
    assert.strictEqual(controller.unsubscribeStore, null)
  })

  it('opens matched automatch games outside panel lifecycle', async () => {
    let store = createStore()
    let sabaki = createSabaki()
    let controller = new OgsOnlineController({store, sabaki})
    let state = createState({
      matchmaking: {status: 'matched', matchedGameId: 42},
    })

    await controller.handleState(state)

    assert.deepStrictEqual(sabaki.calls, [
      ['loadOgsGame', 42, {suppressAskForSave: false, clearHistory: true}],
    ])
    assert.deepStrictEqual(store.calls, [['acknowledgeAutomatchOpen', 42]])
  })

  it('syncs attached online game updates with stone-removal entry', async () => {
    let store = createStore()
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsOnlineController({store, sabaki})

    await controller.handleState(
      createState({onlineGame: createOnlineGame({phase: 'stone removal'})}),
    )

    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 42],
      ['enterOgsStoneRemovalMode', 42],
    ])
  })

  it('updates inactive online-game tabs without activating them', async () => {
    let state = createState({
      onlineGame: createOnlineGame({gameId: 99, moveCount: 2}),
    })
    let store = createStore(state)
    let sabaki = createSabaki({
      state: {onlineGameId: 42},
      getOnlineGameTabByGameId: (gameId) =>
        gameId === 99 ? {id: 'online-tab-99'} : null,
      updateOnlineGameTabFromOnlineGame: (onlineGame) => {
        sabaki.calls.push([
          'updateOnlineGameTabFromOnlineGame',
          onlineGame.gameId,
        ])
        return true
      },
    })
    let controller = new OgsOnlineController({store, sabaki})

    await controller.handleState(state)

    assert.deepStrictEqual(sabaki.calls, [
      ['updateOnlineGameTabFromOnlineGame', 99],
    ])
  })

  it('runs finished retained online-game tabs through the finished flow', async () => {
    let state = createState({
      onlineGame: createOnlineGame({
        gameId: 99,
        phase: 'finished',
        moveCount: 2,
      }),
    })
    let store = createStore(state)
    let sabaki = createSabaki({
      state: {onlineGameId: null},
      getOnlineGameTabByGameId: (gameId) =>
        gameId === 99 ? {id: 'online-tab-99'} : null,
    })
    let controller = new OgsOnlineController({store, sabaki})

    await controller.handleState(state)

    assert.deepStrictEqual(sabaki.calls, [
      ['loadOgsGame', 99, {suppressAskForSave: false, clearHistory: true}],
      ['showOgsGameEndInfo', 99],
    ])
  })

  it('does not sync the board while an optimistic move is pending', async () => {
    let store = createStore()
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsOnlineController({store, sabaki})

    await controller.handleState(
      createState({onlineGame: createOnlineGame({pendingMove: true})}),
    )

    assert.deepStrictEqual(sabaki.calls, [])
  })

  it('replays the latest pushed state after an in-progress sync', async () => {
    let store = createStore()
    let resolveFirstSync
    let firstSync = new Promise((resolve) => {
      resolveFirstSync = resolve
    })
    let sabaki = createSabaki({
      state: {onlineGameId: 42},
      applyOgsGameUpdate: async (onlineGame) => {
        sabaki.calls.push(['applyOgsGameUpdate', onlineGame.moveCount])
        if (onlineGame.moveCount === 1) await firstSync
        return true
      },
    })
    let controller = new OgsOnlineController({store, sabaki})

    let first = controller.enqueueState(createState())
    await controller.enqueueState(
      createState({
        onlineGame: createOnlineGame({
          moves: [
            {move: 'aa', moveNumber: 1},
            {move: 'bb', moveNumber: 2},
          ],
          moveCount: 2,
        }),
      }),
    )
    resolveFirstSync()
    await first

    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 1],
      ['applyOgsGameUpdate', 2],
    ])
  })

  it('replays pushed state after user-triggered open sync completes', async () => {
    let resolveFirstSync
    let firstSync = new Promise((resolve) => {
      resolveFirstSync = resolve
    })
    let initialState = createState()
    let store = createStore(initialState)
    let sabaki = createSabaki({
      state: {onlineGameId: 42},
      applyOgsGameUpdate: async (onlineGame) => {
        sabaki.calls.push(['applyOgsGameUpdate', onlineGame.moveCount])
        if (onlineGame.moveCount === 1) await firstSync
        return true
      },
    })
    let controller = new OgsOnlineController({store, sabaki})

    let opening = controller.openGame(42, initialState)
    await controller.enqueueState(
      createState({
        onlineGame: createOnlineGame({
          moves: [
            {move: 'aa', moveNumber: 1},
            {move: 'bb', moveNumber: 2},
          ],
          moveCount: 2,
        }),
      }),
    )
    resolveFirstSync()
    await opening

    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 1],
      ['applyOgsGameUpdate', 2],
    ])
  })
})
