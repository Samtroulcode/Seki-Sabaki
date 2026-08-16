import i18n from '../i18n.js'
import {defaultMatchmakingOptions} from './ogsmatchmakingoptions.js'

const t = i18n.context('OgsPanel')

export function createInitialOnlineNetworkState() {
  return {
    status: 'offline',
    lastError: null,
    lastSuccessfulSyncAt: null,
  }
}

export function createInitialOnlineState() {
  return {
    username: '',
    user: null,
    busy: false,
    error: null,
    connected: false,
    socket: null,
    network: createInitialOnlineNetworkState(),
    matchmaking: {options: defaultMatchmakingOptions},
    onlineGame: null,
    activeGames: [],
    gameHistory: [],
    gameHistoryPage: 1,
    gameHistoryHasNext: false,
    gameHistoryHasPrevious: false,
    gameHistoryBusy: false,
    gameHistoryError: null,
    friends: [],
    friendsBusy: false,
    friendsError: null,
    playerProfile: null,
    playerProfileBusy: false,
    playerProfileError: null,
  }
}

export class OnlineStore {
  constructor({ogs = () => window.sabaki.ogs, now = () => Date.now()} = {}) {
    this.ogs = ogs
    this.now = now
    this.state = createInitialOnlineState()
    this.listeners = new Set()
    this.unsubscribeOgsStateChange = null
    this.subscribedOgs = null
    this.sessionRequestId = 0
    this.gameHistoryRequestId = 0
  }

  getState() {
    return cloneOnlineState(this.state)
  }

  setState(change) {
    this.state = {...this.state, ...change}
    this.emitChange()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize() {
    let ogs = this.ogs()

    if (
      this.unsubscribeOgsStateChange == null &&
      typeof ogs?.onStateChange === 'function'
    ) {
      this.unsubscribeOgsStateChange = ogs.onStateChange((state) => {
        this.applyOgsState(state)
      })
      this.subscribedOgs = ogs
    }

    if (typeof ogs?.restoreSession === 'function') {
      try {
        let result = await ogs.restoreSession()
        if (result?.ok === false) {
          if (result.state != null) this.applyOgsState(result.state)
          this.applySyncError(result.error, {
            code: result.error?.code || 'restore-failed',
            message:
              result.error?.message || t('Unable to restore OGS session.'),
          })
          return result.state || null
        }

        if (result?.state != null) {
          this.applyOgsState(result.state)
          return result.state
        }
      } catch (err) {
        this.applySyncError(err, {
          code: 'restore-failed',
          message: t('Unable to restore OGS session.'),
        })
      }
    }

    return await this.refresh()
  }

  isUsingCurrentOgsStateChangeEvents() {
    let ogs = this.ogs()

    return (
      this.subscribedOgs === ogs &&
      this.unsubscribeOgsStateChange != null &&
      typeof ogs?.onStateChange === 'function'
    )
  }

  dispose() {
    this.unsubscribeOgsStateChange?.()
    this.unsubscribeOgsStateChange = null
    this.subscribedOgs = null
  }

  emitChange() {
    for (let listener of this.listeners) listener(this.getState())
  }

  setUsername(username) {
    this.setState({username})
  }

  async refresh() {
    let state = null

    try {
      state = await this.ogs().getState()
    } catch (err) {
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: t('Unable to refresh OGS state.'),
      })
      return null
    }

    this.applyOgsState(state)

    return state
  }

  async login(username, password) {
    this.setState({busy: true, error: null})

    let result
    let syncErrorApplied = false

    try {
      result = await this.ogs().login(username, password)
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to connect to OGS.')}}
      this.applySyncError(err, {
        code: 'network',
        message: result.error.message,
      })
      syncErrorApplied = true
    }

    if (result.ok) {
      this.applyPublicState(result.state, {
        username,
        user: result.user,
        connected: true,
      })
    } else {
      if (!syncErrorApplied) {
        this.applySyncError(result.error, {
          code: result.error?.code || 'login-failed',
          message: result.error?.message || t('OGS login failed.'),
        })
      }
      this.setState({error: result.error?.message || t('OGS login failed.')})
    }

    this.setState({busy: false})
    return result
  }

  async logout() {
    this.sessionRequestId++
    this.gameHistoryRequestId++
    this.setState({
      gameHistory: [],
      gameHistoryPage: 1,
      gameHistoryHasNext: false,
      gameHistoryHasPrevious: false,
      gameHistoryBusy: false,
      gameHistoryError: null,
      friends: [],
      friendsBusy: false,
      friendsError: null,
      playerProfile: null,
      playerProfileBusy: false,
      playerProfileError: null,
    })

    await this.ogs().logout()
    this.setState({
      user: null,
      connected: false,
      error: null,
      socket: null,
      network: this.mergeNetworkState(null, {
        status: 'offline',
        lastError: null,
        lastSuccessfulSyncAt: null,
      }),
      onlineGame: null,
      activeGames: [],
      gameHistory: [],
      gameHistoryPage: 1,
      gameHistoryHasNext: false,
      gameHistoryHasPrevious: false,
      gameHistoryBusy: false,
      gameHistoryError: null,
      friends: [],
      friendsBusy: false,
      friendsError: null,
      playerProfile: null,
      playerProfileBusy: false,
      playerProfileError: null,
    })
  }

  async refreshGameHistory({page = 1, pageSize = 10} = {}) {
    let requestId = ++this.gameHistoryRequestId
    let sessionRequestId = this.sessionRequestId
    let userId = this.state.user?.id ?? null

    this.setState({gameHistoryBusy: true, gameHistoryError: null})

    let result

    try {
      result = await this.ogs().listGameHistory({page, pageSize})
    } catch (err) {
      result = {
        ok: false,
        error: serializeOnlineStoreError(err, {
          code: 'history-failed',
          message: t('Unable to load game history.'),
        }),
      }
    }

    if (
      requestId !== this.gameHistoryRequestId ||
      sessionRequestId !== this.sessionRequestId ||
      userId !== this.state.user?.id
    ) {
      return result
    }

    if (result.ok) {
      this.setState({
        gameHistory: result.history?.results || [],
        gameHistoryPage: page,
        gameHistoryHasNext: result.history?.next != null,
        gameHistoryHasPrevious: result.history?.previous != null || page > 1,
        gameHistoryError: null,
      })
    } else {
      this.applySyncError(result.error, {
        code: result.error?.code || 'history-failed',
        message: result.error?.message || t('Unable to load game history.'),
      })
      this.setState({
        gameHistoryError:
          result.error?.message || t('Unable to load game history.'),
      })
    }

    this.setState({gameHistoryBusy: false})
    return result
  }

  async refreshFriends() {
    let sessionRequestId = this.sessionRequestId

    this.setState({friendsBusy: true, friendsError: null})

    let result

    try {
      result = await this.ogs().listFriends()
    } catch (err) {
      result = {
        ok: false,
        error: serializeOnlineStoreError(err, {
          code: 'friends-failed',
          message: t('Unable to load OGS friends.'),
        }),
      }
    }

    if (sessionRequestId !== this.sessionRequestId) return result

    if (result.ok) {
      this.setState({friends: result.friends || [], friendsError: null})
    } else {
      this.applySyncError(result.error, {
        code: result.error?.code || 'friends-failed',
        message: result.error?.message || t('Unable to load OGS friends.'),
      })
      this.setState({
        friendsError: result.error?.message || t('Unable to load OGS friends.'),
      })
    }

    this.setState({friendsBusy: false})
    return result
  }

  async refreshPlayerProfile() {
    let sessionRequestId = this.sessionRequestId
    let userId = this.state.user?.id ?? null

    this.setState({playerProfileBusy: true, playerProfileError: null})

    let result
    try {
      result = await this.ogs().getPlayerProfile()
    } catch (err) {
      result = {
        ok: false,
        error: serializeOnlineStoreError(err, {
          code: 'profile-failed',
          message: t('Unable to load OGS player profile.'),
        }),
      }
    }

    if (
      sessionRequestId !== this.sessionRequestId ||
      userId !== this.state.user?.id
    ) {
      return result
    }

    if (result.ok) {
      this.setState({playerProfile: result.profile, playerProfileError: null})
    } else {
      this.applySyncError(result.error, {
        code: result.error?.code || 'profile-failed',
        message:
          result.error?.message || t('Unable to load OGS player profile.'),
      })
      this.setState({
        playerProfileError:
          result.error?.message || t('Unable to load OGS player profile.'),
      })
    }

    this.setState({playerProfileBusy: false})
    return result
  }

  async downloadGameSgf(gameId, {recordError = true} = {}) {
    let sessionRequestId = this.sessionRequestId
    let userId = this.state.user?.id ?? null

    try {
      let result = await this.ogs().downloadGameSgf(gameId)

      if (
        sessionRequestId !== this.sessionRequestId ||
        userId !== this.state.user?.id
      ) {
        return {ok: false, stale: true}
      }

      if (!result.ok && recordError) {
        this.applySyncError(result.error, {
          code: result.error?.code || 'sgf-download-failed',
          message:
            result.error?.message || t('Unable to download SGF from OGS.'),
        })
      }

      return result
    } catch (err) {
      if (
        sessionRequestId !== this.sessionRequestId ||
        userId !== this.state.user?.id
      ) {
        return {ok: false, stale: true}
      }

      if (recordError) {
        this.applySyncError(err, {
          code: 'sgf-download-failed',
          message: t('Unable to download SGF from OGS.'),
        })
      }
      return {
        ok: false,
        error: {message: t('Unable to download SGF from OGS.')},
      }
    }
  }

  async listAiReviews(gameId) {
    try {
      let result = await this.ogs().listAiReviews(gameId)

      if (result?.ok === false) return result

      return {ok: true, reviews: result?.reviews || result || []}
    } catch (err) {
      return {
        ok: false,
        error: serializeOnlineStoreError(err, {
          code: 'ai-review-failed',
          message: t('Unable to load OGS AI reviews.'),
        }),
      }
    }
  }

  async connectGame(gameId, {manageBusy = true} = {}) {
    if (manageBusy) this.setState({busy: true, error: null})

    let result

    try {
      result = await this.ogs().connectGame(gameId)

      if (result.ok) {
        this.applyCommandState(result.state)
      } else {
        this.applySyncError(result.error, {
          code: result.error?.code || 'connect-game-failed',
          message: result.error?.message || t('Unable to connect to game.'),
        })
        this.setState({
          error: result.error?.message || t('Unable to connect to game.'),
          onlineGame: result.state?.onlineGame || this.state.onlineGame,
          activeGames: result.state?.activeGames || this.state.activeGames,
        })
      }
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to connect to game.')}}
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: result.error.message,
      })
      this.setState({error: result.error.message})
    }

    if (manageBusy) this.setState({busy: false})
    return result
  }

  async disconnectGame(gameId) {
    let result

    try {
      result = await this.ogs().disconnectGame(gameId)
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to disconnect game.')}}
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: result.error.message,
      })
      return result
    }

    if (result.ok) {
      this.setState({
        onlineGame: result.state.onlineGame,
        network: this.mergeNetworkState(result.state.network, {
          status: 'online',
          lastError: null,
          lastSuccessfulSyncAt: this.now(),
        }),
      })
    } else {
      this.applySyncError(result.error, {
        code: result.error?.code || 'disconnect-game-failed',
        message: result.error?.message || t('Unable to disconnect game.'),
      })
    }

    return result
  }

  async setMatchmakingOptions(options) {
    this.setState({matchmaking: {...this.state.matchmaking, options}})

    try {
      let state = await this.ogs().setMatchmakingOptions(options)
      this.setState({
        matchmaking: state.matchmaking,
        socket: state.socket,
        network: this.mergeNetworkState(state.network, {
          status: 'online',
          lastError: null,
          lastSuccessfulSyncAt: this.now(),
        }),
      })
      return state
    } catch (err) {
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: t('Unable to update automatch options.'),
      })
      return null
    }
  }

  async startAutomatch() {
    return await this.updateAutomatch(
      () => this.ogs().startAutomatch(),
      t('Unable to start automatch.'),
    )
  }

  async cancelAutomatch() {
    return await this.updateAutomatch(
      () => this.ogs().cancelAutomatch(),
      t('Unable to cancel automatch.'),
    )
  }

  async acknowledgeAutomatchOpen(gameId) {
    let result

    try {
      result = await this.ogs().acknowledgeAutomatchOpen(gameId)
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to update automatch.')}}
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: result.error.message,
      })
      return result
    }

    if (result.ok) {
      this.applyCommandState(result.state)
    } else {
      this.applySyncError(result.error, {
        code: result.error?.code || 'automatch-failed',
        message: result.error?.message || t('Unable to update automatch.'),
      })
    }

    return result
  }

  async updateAutomatch(action, fallbackMessage) {
    this.setState({busy: true, error: null})

    let result

    try {
      result = await action()

      if (result.ok) {
        this.setState({
          matchmaking: result.state.matchmaking,
          socket: result.state.socket,
          network: this.mergeNetworkState(result.state.network, {
            status: 'online',
            lastError: null,
            lastSuccessfulSyncAt: this.now(),
          }),
        })
      } else {
        this.applySyncError(result.error, {
          code: result.error?.code || 'automatch-failed',
          message: result.error?.message || fallbackMessage,
        })
        this.setState({
          error: result.error?.message || fallbackMessage,
          matchmaking: result.state?.matchmaking || this.state.matchmaking,
          socket: result.state?.socket || this.state.socket,
        })
      }
    } catch (err) {
      result = {ok: false, error: {message: fallbackMessage}}
      this.applySyncError(err, {
        code: 'ipc-failure',
        message: fallbackMessage,
      })
      this.setState({error: fallbackMessage})
    }

    this.setState({busy: false})
    return result
  }

  applyPublicState(state, extra = {}) {
    let nextUser = state?.user || null
    let previousUserId = this.state.user?.id ?? null
    let nextUserId = nextUser?.id ?? null
    let userChanged = previousUserId != null && nextUserId !== previousUserId

    if (userChanged) {
      this.sessionRequestId++
      this.gameHistoryRequestId++
    }

    this.setState({
      username: state?.user?.username || this.state.username,
      user: nextUser,
      socket: state?.socket || null,
      network: this.mergeNetworkState(state?.network, {
        status: 'online',
        lastError: null,
        lastSuccessfulSyncAt: this.now(),
      }),
      matchmaking: state?.matchmaking || this.state.matchmaking,
      onlineGame: state?.onlineGame || null,
      activeGames: state?.activeGames || [],
      gameHistory: userChanged ? [] : this.state.gameHistory,
      gameHistoryPage: userChanged ? 1 : this.state.gameHistoryPage,
      gameHistoryHasNext: userChanged ? false : this.state.gameHistoryHasNext,
      gameHistoryHasPrevious: userChanged
        ? false
        : this.state.gameHistoryHasPrevious,
      gameHistoryBusy: userChanged ? false : this.state.gameHistoryBusy,
      gameHistoryError: userChanged ? null : this.state.gameHistoryError,
      friends: state?.friends || (userChanged ? [] : this.state.friends),
      friendsBusy: userChanged ? false : this.state.friendsBusy,
      friendsError: userChanged ? null : this.state.friendsError,
      playerProfile:
        state?.playerProfile || (userChanged ? null : this.state.playerProfile),
      playerProfileBusy: userChanged ? false : this.state.playerProfileBusy,
      playerProfileError: userChanged ? null : this.state.playerProfileError,
      connected: true,
      ...extra,
    })
  }

  applyDisconnectedState(state = null, extra = {}) {
    this.sessionRequestId++
    this.gameHistoryRequestId++

    this.setState({
      user: null,
      socket: state?.socket || null,
      network: this.mergeNetworkState(state?.network, {
        status: 'offline',
        lastError: null,
        lastSuccessfulSyncAt: state == null ? null : this.now(),
      }),
      matchmaking: state?.matchmaking || this.state.matchmaking,
      onlineGame: null,
      activeGames: state?.activeGames || [],
      gameHistory: [],
      gameHistoryPage: 1,
      gameHistoryHasNext: false,
      gameHistoryHasPrevious: false,
      gameHistoryBusy: false,
      gameHistoryError: null,
      friends: [],
      friendsBusy: false,
      friendsError: null,
      playerProfile: null,
      playerProfileBusy: false,
      playerProfileError: null,
      connected: false,
      ...extra,
    })
  }

  applyOgsState(state) {
    if (state?.user != null) {
      this.applyPublicState(state)
    } else {
      this.applyDisconnectedState(state)
    }
  }

  applyCommandState(state) {
    this.setState({
      socket: state.socket,
      network: this.mergeNetworkState(state.network, {
        status: 'online',
        lastError: null,
        lastSuccessfulSyncAt: this.now(),
      }),
      matchmaking: state.matchmaking,
      onlineGame: state.onlineGame,
      activeGames: state.activeGames || this.state.activeGames,
    })
  }

  applySyncError(err, fallback) {
    this.setState({
      network: this.mergeNetworkState(this.state.network, {
        status: 'degraded',
        lastError: serializeOnlineStoreError(err, fallback),
      }),
    })
  }

  mergeNetworkState(network, metadata = {}) {
    return {
      ...createInitialOnlineNetworkState(),
      ...this.state.network,
      ...(network || {}),
      ...metadata,
    }
  }
}

function serializeOnlineStoreError(err, fallback) {
  return {
    code:
      typeof err?.code === 'string'
        ? err.code
        : typeof fallback?.code === 'string'
          ? fallback.code
          : 'unknown',
    message:
      typeof err?.message === 'string' && err.message !== ''
        ? err.message
        : fallback?.message || t('Unable to connect to OGS.'),
  }
}

function cloneOnlineState(state) {
  return {
    ...state,
    user: cloneObject(state.user),
    socket: cloneObject(state.socket),
    network: cloneObject(state.network),
    matchmaking: cloneMatchmaking(state.matchmaking),
    onlineGame: cloneObject(state.onlineGame),
    activeGames: Array.isArray(state.activeGames)
      ? state.activeGames.map(cloneObject)
      : [],
    gameHistory: Array.isArray(state.gameHistory)
      ? state.gameHistory.map(cloneObject)
      : [],
    friends: Array.isArray(state.friends) ? state.friends.map(cloneObject) : [],
    playerProfile: cloneObject(state.playerProfile),
  }
}

function cloneMatchmaking(matchmaking) {
  return cloneObject(matchmaking)
}

function cloneObject(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneObject)

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneObject(child)]),
  )
}

export default new OnlineStore()
