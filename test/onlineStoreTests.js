import assert from 'assert'

import {
  OnlineStore,
  createInitialOnlineState,
} from '../src/modules/onlinestore.js'
import {defaultMatchmakingOptions} from '../src/modules/ogsmatchmakingoptions.js'

function createStore(ogs) {
  return new OnlineStore({ogs: () => ogs, now: () => 1234})
}

function createPublicState(overrides = {}) {
  return {
    user: {id: 1, username: 'Seki'},
    socket: {status: 'authenticated'},
    matchmaking: {status: 'idle', options: defaultMatchmakingOptions},
    onlineGame: {gameId: 42, status: 'connected'},
    activeGames: [{gameId: 42}],
    ...overrides,
  }
}

describe('online store', () => {
  it('creates stable initial online state', () => {
    assert.deepStrictEqual(createInitialOnlineState(), {
      username: '',
      user: null,
      busy: false,
      error: null,
      connected: false,
      socket: null,
      network: {
        status: 'offline',
        lastError: null,
        lastSuccessfulSyncAt: null,
      },
      matchmaking: {options: defaultMatchmakingOptions},
      onlineGame: null,
      activeGames: [],
    })
  })

  it('notifies subscribers and supports unsubscribe', () => {
    let store = createStore({})
    let states = []
    let unsubscribe = store.subscribe((state) => states.push(state))

    store.setUsername('Black')
    unsubscribe()
    store.setUsername('White')

    assert.strictEqual(states.length, 1)
    assert.strictEqual(states[0].username, 'Black')
    assert.strictEqual(store.getState().username, 'White')
  })

  it('does not expose mutable internal state to consumers', () => {
    let store = createStore({})
    store.setState({
      user: {username: 'Original'},
      matchmaking: {
        options: {boardSizes: [19], rules: {value: 'japanese'}},
        payload: {size_speed_options: [{size: '19x19'}]},
      },
      onlineGame: {
        gameId: 42,
        players: {black: {username: 'Black'}, white: {username: 'White'}},
        moves: [{move: 'aa', moveNumber: 1}],
      },
      activeGames: [{gameId: 42}],
    })

    let state = store.getState()
    state.user.username = 'Changed'
    state.matchmaking.options.boardSizes.push(9)
    state.matchmaking.options.rules.value = 'chinese'
    state.matchmaking.payload.size_speed_options[0].size = '9x9'
    state.onlineGame.players.black.username = 'Changed'
    state.onlineGame.moves[0].move = 'bb'
    state.activeGames[0].gameId = 43

    assert.strictEqual(store.getState().user.username, 'Original')
    assert.deepStrictEqual(
      store.getState().matchmaking.options.boardSizes,
      [19],
    )
    assert.strictEqual(
      store.getState().matchmaking.options.rules.value,
      'japanese',
    )
    assert.strictEqual(
      store.getState().matchmaking.payload.size_speed_options[0].size,
      '19x19',
    )
    assert.strictEqual(
      store.getState().onlineGame.players.black.username,
      'Black',
    )
    assert.strictEqual(store.getState().onlineGame.moves[0].move, 'aa')
    assert.deepStrictEqual(store.getState().activeGames, [{gameId: 42}])
  })

  it('refreshes from public OGS state when logged in', async () => {
    let publicState = createPublicState()
    let store = createStore({getState: async () => publicState})

    assert.strictEqual(await store.refresh(), publicState)
    assert.deepStrictEqual(store.getState(), {
      ...createInitialOnlineState(),
      username: 'Seki',
      user: publicState.user,
      socket: publicState.socket,
      network: {
        status: 'online',
        lastError: null,
        lastSuccessfulSyncAt: 1234,
      },
      matchmaking: publicState.matchmaking,
      onlineGame: publicState.onlineGame,
      activeGames: publicState.activeGames,
      connected: true,
    })
  })

  it('applies disconnected state when refresh has no user', async () => {
    let store = createStore({getState: async () => ({user: null})})
    store.setState({username: 'Keep', user: {username: 'Old'}, connected: true})

    assert.deepStrictEqual(await store.refresh(), {user: null})
    assert.strictEqual(store.getState().username, 'Keep')
    assert.strictEqual(store.getState().user, null)
    assert.strictEqual(store.getState().connected, false)
    assert.strictEqual(store.getState().network.status, 'offline')
    assert.strictEqual(store.getState().network.lastSuccessfulSyncAt, 1234)
  })

  it('initializes a single pushed-state subscription', async () => {
    let callbacks = []
    let ogs = {
      getState: async () => ({user: null}),
      onStateChange: (callback) => {
        callbacks.push(callback)
        return () => callbacks.splice(callbacks.indexOf(callback), 1)
      },
    }
    let store = createStore(ogs)

    await store.initialize()
    await store.initialize()

    assert.strictEqual(callbacks.length, 1)
    assert.strictEqual(store.isUsingCurrentOgsStateChangeEvents(), true)

    callbacks[0](createPublicState({user: {id: 2, username: 'Event'}}))

    assert.strictEqual(store.getState().user.username, 'Event')
    assert.strictEqual(store.getState().connected, true)

    store.dispose()
    assert.strictEqual(callbacks.length, 0)
    assert.strictEqual(store.isUsingCurrentOgsStateChangeEvents(), false)
  })

  it('detects when the renderer OGS API has been replaced after init', async () => {
    let ogs = {
      getState: async () => ({user: null}),
      onStateChange: () => () => {},
    }
    let currentOgs = ogs
    let store = new OnlineStore({ogs: () => currentOgs})

    await store.initialize()
    assert.strictEqual(store.isUsingCurrentOgsStateChangeEvents(), true)

    currentOgs = {getState: async () => ({user: null})}
    assert.strictEqual(store.isUsingCurrentOgsStateChangeEvents(), false)
  })

  it('keeps current state when refresh fails', async () => {
    let store = createStore({
      getState: async () => {
        throw new Error('offline')
      },
    })
    store.setState({username: 'Keep', connected: true})

    assert.strictEqual(await store.refresh(), null)
    assert.strictEqual(store.getState().username, 'Keep')
    assert.strictEqual(store.getState().connected, true)
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'ipc-failure', message: 'offline'},
      lastSuccessfulSyncAt: null,
    })
  })

  it('preserves server network metrics when adding sync metadata', async () => {
    let publicState = createPublicState({
      network: {latency: 50, drift: -10, updatedAt: 1000},
    })
    let store = createStore({getState: async () => publicState})

    await store.refresh()

    assert.deepStrictEqual(store.getState().network, {
      latency: 50,
      drift: -10,
      updatedAt: 1000,
      status: 'online',
      lastError: null,
      lastSuccessfulSyncAt: 1234,
    })
  })

  it('updates state after successful login', async () => {
    let publicState = createPublicState({user: {id: 2, username: 'Server'}})
    let store = createStore({
      login: async () => ({
        ok: true,
        user: {id: 2, username: 'Local'},
        state: publicState,
      }),
    })

    let result = await store.login('Local', 'secret')

    assert.strictEqual(result.ok, true)
    assert.strictEqual(store.getState().busy, false)
    assert.strictEqual(store.getState().username, 'Local')
    assert.deepStrictEqual(store.getState().user, {id: 2, username: 'Local'})
    assert.deepStrictEqual(store.getState().onlineGame, publicState.onlineGame)
    assert.strictEqual(store.getState().connected, true)
  })

  it('stores public login errors without throwing', async () => {
    let store = createStore({
      login: async () => ({ok: false, error: {message: 'Bad credentials'}}),
    })

    let result = await store.login('Seki', 'bad')

    assert.strictEqual(result.ok, false)
    assert.strictEqual(store.getState().busy, false)
    assert.strictEqual(store.getState().error, 'Bad credentials')
  })

  it('keeps IPC login errors in network state', async () => {
    let store = createStore({
      login: async () => {
        throw new Error('offline')
      },
    })

    let result = await store.login('Seki', 'bad')

    assert.strictEqual(result.ok, false)
    assert.strictEqual(store.getState().busy, false)
    assert.strictEqual(store.getState().error, 'Unable to connect to OGS.')
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'network', message: 'offline'},
      lastSuccessfulSyncAt: null,
    })
  })

  it('resets public session state on logout', async () => {
    let calls = []
    let store = createStore({logout: async () => calls.push('logout')})
    store.setState({...createPublicState(), connected: true, error: 'old'})

    await store.logout()

    assert.deepStrictEqual(calls, ['logout'])
    assert.strictEqual(store.getState().user, null)
    assert.strictEqual(store.getState().connected, false)
    assert.strictEqual(store.getState().error, null)
    assert.strictEqual(store.getState().onlineGame, null)
    assert.deepStrictEqual(store.getState().activeGames, [])
  })

  it('updates public game state after connect success and failure', async () => {
    let publicState = createPublicState({
      socket: {status: 'connected'},
      matchmaking: {status: 'idle'},
      onlineGame: {gameId: 43, status: 'connected'},
      activeGames: [{gameId: 43}],
    })
    let store = createStore({
      connectGame: async () => ({ok: true, state: publicState}),
    })

    let result = await store.connectGame(43)

    assert.strictEqual(result.ok, true)
    assert.strictEqual(store.getState().busy, false)
    assert.deepStrictEqual(store.getState().onlineGame, publicState.onlineGame)
    assert.deepStrictEqual(store.getState().socket, publicState.socket)

    store = createStore({
      connectGame: async () => ({
        ok: false,
        error: {message: 'No game'},
        state: {onlineGame: {gameId: 44}, activeGames: [{gameId: 44}]},
      }),
    })

    result = await store.connectGame(44)

    assert.strictEqual(result.ok, false)
    assert.strictEqual(store.getState().busy, false)
    assert.strictEqual(store.getState().error, 'No game')
    assert.deepStrictEqual(store.getState().onlineGame, {gameId: 44})
    assert.deepStrictEqual(store.getState().activeGames, [{gameId: 44}])
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'connect-game-failed', message: 'No game'},
      lastSuccessfulSyncAt: null,
    })
  })

  it('can leave busy state under caller control while connecting games', async () => {
    let store = createStore({
      connectGame: async () => ({ok: true, state: createPublicState()}),
    })
    store.setState({busy: true})

    let result = await store.connectGame(42, {manageBusy: false})

    assert.strictEqual(result.ok, true)
    assert.strictEqual(store.getState().busy, true)
  })

  it('updates online game after disconnect success', async () => {
    let store = createStore({
      disconnectGame: async () => ({ok: true, state: {onlineGame: null}}),
    })
    store.setState({onlineGame: {gameId: 42}})

    let result = await store.disconnectGame(42)

    assert.strictEqual(result.ok, true)
    assert.strictEqual(store.getState().onlineGame, null)
  })

  it('marks network degraded when disconnect fails', async () => {
    let store = createStore({
      disconnectGame: async () => ({ok: false, error: {message: 'Busy'}}),
    })

    let result = await store.disconnectGame(42)

    assert.strictEqual(result.ok, false)
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'disconnect-game-failed', message: 'Busy'},
      lastSuccessfulSyncAt: null,
    })
  })

  it('keeps optimistic matchmaking options when syncing options fails', async () => {
    let options = {...defaultMatchmakingOptions, boardSizes: [9]}
    let store = createStore({
      setMatchmakingOptions: async () => {
        throw new Error('offline')
      },
    })

    assert.strictEqual(await store.setMatchmakingOptions(options), null)
    assert.deepStrictEqual(store.getState().matchmaking.options, options)
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'ipc-failure', message: 'offline'},
      lastSuccessfulSyncAt: null,
    })
  })

  it('updates matchmaking and socket for automatch results', async () => {
    let store = createStore({
      startAutomatch: async () => ({
        ok: true,
        state: {
          matchmaking: {status: 'searching'},
          socket: {status: 'authenticated'},
        },
      }),
    })

    let result = await store.startAutomatch()

    assert.strictEqual(result.ok, true)
    assert.strictEqual(store.getState().busy, false)
    assert.deepStrictEqual(store.getState().matchmaking, {status: 'searching'})
    assert.deepStrictEqual(store.getState().socket, {status: 'authenticated'})
  })

  it('updates network state for automatch acknowledgements', async () => {
    let store = createStore({
      acknowledgeAutomatchOpen: async () => ({
        ok: true,
        state: createPublicState({
          matchmaking: {status: 'idle'},
          onlineGame: {gameId: 42},
        }),
      }),
    })

    let result = await store.acknowledgeAutomatchOpen(42)

    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(store.getState().matchmaking, {status: 'idle'})
    assert.deepStrictEqual(store.getState().network, {
      status: 'online',
      lastError: null,
      lastSuccessfulSyncAt: 1234,
    })
  })

  it('marks network degraded when automatch acknowledgement fails', async () => {
    let store = createStore({
      acknowledgeAutomatchOpen: async () => ({
        ok: false,
        error: {code: 'invalid-state', message: 'No match'},
      }),
    })

    let result = await store.acknowledgeAutomatchOpen(42)

    assert.strictEqual(result.ok, false)
    assert.deepStrictEqual(store.getState().network, {
      status: 'degraded',
      lastError: {code: 'invalid-state', message: 'No match'},
      lastSuccessfulSyncAt: null,
    })
  })
})
