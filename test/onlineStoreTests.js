import assert from 'assert'

import {
  OnlineStore,
  createInitialOnlineState,
} from '../src/modules/onlinestore.js'
import {defaultMatchmakingOptions} from '../src/components/sidebars/ogsPanelData.js'

function createStore(ogs) {
  return new OnlineStore({ogs: () => ogs})
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
      matchmaking: publicState.matchmaking,
      onlineGame: publicState.onlineGame,
      activeGames: publicState.activeGames,
      connected: true,
    })
  })

  it('keeps current state when refresh fails or has no user', async () => {
    let store = createStore({getState: async () => ({user: null})})
    store.setState({username: 'Keep', connected: true})

    assert.deepStrictEqual(await store.refresh(), {user: null})
    assert.strictEqual(store.getState().username, 'Keep')
    assert.strictEqual(store.getState().connected, true)

    store = createStore({
      getState: async () => {
        throw new Error('offline')
      },
    })
    store.setState({username: 'Keep', connected: true})

    assert.strictEqual(await store.refresh(), null)
    assert.strictEqual(store.getState().username, 'Keep')
    assert.strictEqual(store.getState().connected, true)
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

  it('keeps optimistic matchmaking options when syncing options fails', async () => {
    let options = {...defaultMatchmakingOptions, boardSizes: [9]}
    let store = createStore({
      setMatchmakingOptions: async () => {
        throw new Error('offline')
      },
    })

    assert.strictEqual(await store.setMatchmakingOptions(options), null)
    assert.deepStrictEqual(store.getState().matchmaking.options, options)
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
})
