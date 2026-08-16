const {randomUUID} = require('crypto')

const {
  assertLoginInput,
  extractSetCookie,
  getCookieHeader,
  assertOk,
} = require('./ogs/auth.js')
const {
  DEFAULT_MATCHMAKING_OPTIONS,
  AUTOMATCH_BOARD_SIZES,
  AUTOMATCH_SPEEDS,
  AUTOMATCH_TIME_SYSTEMS,
  AUTOMATCH_CONDITIONS,
  AUTOMATCH_RULES,
  AUTOMATCH_HANDICAP_VALUES,
  buildAutomatchPayload,
  sanitizeMatchmakingOptions,
} = require('./ogs/matchmaking.js')
const {OgsError} = require('./ogs/errors.js')
const {
  getInitialSocketState,
  getInitialMatchmakingState,
  getInitialOnlineGameState,
  getInitialActiveGamesState,
  getInitialNetworkState,
  cloneOnlineGameState,
  cloneActiveGameState,
} = require('./ogs/state.js')
const {
  sanitizeBoolean,
  sanitizeNumber,
  sanitizeString,
  sanitizeErrorMessage,
  sanitizeGameId,
  sanitizeOptionalGameId,
  sanitizeMoveCount,
  sanitizeBoardSize,
  sanitizeHandicap,
  sanitizeAutomatchUuid,
  sanitizeOptionalAutomatchUuid,
  sanitizeAutomatchEntry,
} = require('./ogs/sanitize.js')
const {
  sanitizeUser,
  sanitizePlayers,
  sanitizePlayer,
  sanitizeFriends,
  resolveOgsUrl,
} = require('./ogs/users.js')
const {ratingToRank} = require('./ogs/ranks.js')
const {
  sanitizeClock,
  isCurrentClock,
  reduceClockSequence,
  advanceClockSequence,
} = require('./ogs/clock.js')
const {
  sanitizeHistoricalMoves,
  sanitizeLiveMove,
  encodeOgsMove,
  encodeOgsCoordinates,
  mergeMoves,
} = require('./ogs/moves.js')
const {createElectronOgsCredentialStore} = require('./ogs/credentialstore.js')
const {createOgsReviewApi} = require('./ogs/review-api.js')

const DEFAULT_SERVER_URL = 'https://online-go.com'
const USER_AGENT = 'Seki-Sabaki/0.1'
const DEFAULT_GAME_HISTORY_PAGE_SIZE = 10
const MAX_GAME_HISTORY_PAGE_SIZE = 50
const MAX_OGS_SGF_BYTES = 5 * 1024 * 1024

function getWebSocketUrl(serverUrl) {
  let url = new URL(serverUrl)

  if (url.protocol === 'https:') url.protocol = 'wss:'
  else throw new OgsError('invalid-server', 'Unsupported OGS server URL.')

  return url.toString()
}

function logOgsSocketMessage(direction, message) {
  try {
    let data = typeof message === 'string' ? JSON.parse(message) : message

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[ogs:socket] ${direction} non-array message`)
      return
    }

    let event = typeof data[0] === 'string' ? data[0] : typeof data[0]
    let payload = data[1]
    let payloadKeys =
      payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? Object.keys(payload).sort()
        : []

    console.log(
      `[ogs:socket] ${direction}`,
      JSON.stringify({event, payloadKeys, length: data.length}),
    )
  } catch (err) {
    console.log(`[ogs:socket] ${direction} unparsable message`)
  }
}

class OgsSocket {
  constructor({
    serverUrl,
    webSocketImpl = globalThis.WebSocket,
    onEvent = null,
    onStateChange = null,
  }) {
    this.serverUrl = serverUrl
    this.WebSocketImpl = webSocketImpl
    this.onEvent = onEvent
    this.onStateChange = onStateChange
    this.socket = null
    this.state = getInitialSocketState()
    this.lastRequestId = 0
    this.pendingRequests = new Map()
  }

  getState() {
    return {...this.state}
  }

  emitStateChange() {
    if (typeof this.onStateChange === 'function') this.onStateChange()
  }

  disconnect() {
    this.rejectPendingRequests(
      new OgsError('socket-disconnected', 'OGS socket is disconnected.'),
    )

    if (this.socket != null) {
      try {
        this.socket.close()
      } catch (err) {}
    }

    this.socket = null
    this.state = getInitialSocketState()
    this.emitStateChange()
  }

  send(event, data) {
    if (this.socket == null || this.state.status === 'disconnected') {
      throw new OgsError('socket-disconnected', 'OGS socket is disconnected.')
    }

    let message = JSON.stringify(data == null ? [event] : [event, data])

    logOgsSocketMessage('send', message)
    this.socket.send(message)
  }

  sendAndGetResponse(event, data) {
    if (this.socket == null || this.state.status === 'disconnected') {
      return Promise.reject(
        new OgsError('socket-disconnected', 'OGS socket is disconnected.'),
      )
    }

    let id = ++this.lastRequestId
    let message = JSON.stringify([event, data, id])

    let promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {resolve, reject})
    })

    try {
      logOgsSocketMessage('send', message)
      this.socket.send(message)
    } catch (err) {
      this.pendingRequests.delete(id)
      throw err
    }

    return promise
  }

  rejectPendingRequests(err) {
    for (let {reject} of this.pendingRequests.values()) {
      reject(err)
    }

    this.pendingRequests.clear()
  }

  handleMessage(message) {
    let data

    try {
      data = typeof message === 'string' ? JSON.parse(message) : message
    } catch (err) {
      return
    }

    if (!Array.isArray(data) || data.length === 0) return

    let id = data[0]

    if (typeof id === 'string') {
      if (typeof this.onEvent === 'function') this.onEvent(id, data[1])
      return
    }

    if (!Number.isInteger(id)) return

    let pending = this.pendingRequests.get(id)
    if (pending == null) return

    this.pendingRequests.delete(id)

    let error = data.length > 2 ? data[2] : null
    if (error != null) {
      pending.reject(
        new OgsError(
          'socket-request-failed',
          typeof error.message === 'string'
            ? error.message
            : 'OGS socket request failed.',
        ),
      )
    } else {
      pending.resolve(data[1])
    }
  }

  connect(jwtToken) {
    if (typeof jwtToken !== 'string' || jwtToken === '') {
      throw new OgsError('invalid-input', 'Missing OGS session token.')
    }

    if (typeof this.WebSocketImpl !== 'function') {
      throw new OgsError('network', 'WebSocket is not available.')
    }

    this.disconnect()
    this.state = {status: 'connecting', authenticated: false, error: null}
    this.emitStateChange()

    return new Promise((resolve, reject) => {
      let settled = false
      let timeout = setTimeout(() => {
        if (settled) return

        settled = true
        socket.onopen = null
        socket.onerror = null
        socket.onclose = null
        try {
          socket.close()
        } catch (err) {}
        if (this.socket === socket) this.socket = null
        this.state = {
          status: 'error',
          authenticated: false,
          error: 'OGS socket connection timed out.',
        }
        this.emitStateChange()
        this.rejectPendingRequests(new OgsError('network', this.state.error))
        reject(new OgsError('network', this.state.error))
      }, 10000)

      let finish = (fn) => {
        if (settled) return

        settled = true
        clearTimeout(timeout)
        fn()
      }

      let socket

      try {
        socket = new this.WebSocketImpl(getWebSocketUrl(this.serverUrl))
      } catch (err) {
        clearTimeout(timeout)
        this.state = {
          status: 'error',
          authenticated: false,
          error: 'Unable to create OGS socket.',
        }
        this.emitStateChange()
        reject(new OgsError('network', this.state.error))
        return
      }

      this.socket = socket

      socket.onopen = async () => {
        if (this.socket !== socket) return

        try {
          console.log('[ogs:socket] open')
          this.state = {status: 'connected', authenticated: false, error: null}
          this.emitStateChange()
          await this.sendAndGetResponse('authenticate', {
            jwt: jwtToken,
            device_id: randomUUID(),
            user_agent: USER_AGENT,
            language: 'en',
            language_version: '1.0',
            client_version: '0.1',
          })
          this.state = {
            status: 'authenticated',
            authenticated: true,
            error: null,
          }
          this.emitStateChange()
          finish(() => resolve(this.getState()))
        } catch (err) {
          if (settled) return

          try {
            socket.close()
          } catch (closeError) {}
          if (this.socket === socket) this.socket = null
          this.state = {
            status: 'error',
            authenticated: false,
            error:
              err instanceof OgsError
                ? err.message
                : 'OGS socket authentication failed.',
          }
          this.emitStateChange()
          finish(() => reject(err))
        }
      }

      socket.onerror = () => {
        if (this.socket !== socket) return

        console.log('[ogs:socket] error')
        this.state = {
          status: 'error',
          authenticated: false,
          error: 'OGS socket connection failed.',
        }
        this.emitStateChange()
        this.rejectPendingRequests(new OgsError('network', this.state.error))
        finish(() => reject(new OgsError('network', this.state.error)))
      }

      socket.onmessage = (evt) => {
        if (this.socket !== socket) return

        logOgsSocketMessage('recv', evt?.data)
        this.handleMessage(evt?.data)
      }

      socket.onclose = (evt) => {
        if (this.socket !== socket) return

        console.log('[ogs:socket] close', JSON.stringify({code: evt?.code}))

        if (!settled && this.state.status === 'connecting') {
          this.state = {
            status: 'error',
            authenticated: false,
            error: 'OGS socket closed before connecting.',
          }
          this.emitStateChange()
          this.rejectPendingRequests(new OgsError('network', this.state.error))
          finish(() => reject(new OgsError('network', this.state.error)))
          return
        }

        if (this.state.status !== 'error') {
          this.state = getInitialSocketState()
          this.emitStateChange()
        }
        this.rejectPendingRequests(
          new OgsError('socket-disconnected', 'OGS socket is disconnected.'),
        )
      }
    })
  }
}

class OgsClient {
  constructor({
    serverUrl = DEFAULT_SERVER_URL,
    fetchImpl = globalThis.fetch,
    webSocketImpl = globalThis.WebSocket,
    now = () => Date.now(),
    onStateChange = null,
    credentialStore = null,
  } = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
    this.reviewApi = createOgsReviewApi({
      serverUrl: this.serverUrl,
      fetch: this.fetch,
    })
    this.now = now
    this.socket = new OgsSocket({
      serverUrl: this.serverUrl,
      webSocketImpl,
      onEvent: (event, payload) => this.handleSocketEvent(event, payload),
      onStateChange: () => this.emitStateChange(),
    })
    this.onStateChange = onStateChange
    this.credentialStore = credentialStore
    this.sessionRevision = 0
    this.socketAuthRevision = 0
    this.restoreStoredSessionPromise = null
    this.session = null
    this.matchmaking = getInitialMatchmakingState()
    this.onlineGame = getInitialOnlineGameState()
    this.pendingClocks = new Map()
    this.activeGames = getInitialActiveGamesState()
    this.network = getInitialNetworkState()
    this.pendingNetworkPings = new Set()
    this.lastNetworkPingClient = null
    this.lastNetworkPongClient = null
    this.friends = []
    this.pendingPlayerProfileRequests = new Map()
    this.playerProfileCache = new Map()
    this.onlineGameRevision = 0
  }

  getSession() {
    return this.session == null ? null : this.session.user
  }

  getJwtToken() {
    return this.session?.jwtToken || null
  }

  getServerUrl() {
    return this.serverUrl
  }

  getState() {
    return {
      user: this.getSession(),
      socket: this.socket.getState(),
      network: {...this.network},
      matchmaking: {...this.matchmaking},
      onlineGame: cloneOnlineGameState(this.onlineGame),
      activeGames: this.activeGames.map(cloneActiveGameState),
      friends: this.friends.map((friend) => ({...friend})),
    }
  }

  emitStateChange() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.getState())
    }
  }

  logout() {
    this.sessionRevision = (this.sessionRevision || 0) + 1
    this.socketAuthRevision = this.sessionRevision
    return this.resetSession({clearStoredSession: true})
  }

  resetSession({clearStoredSession = false} = {}) {
    if (clearStoredSession) this.credentialStore?.clearSession?.()
    this.session = null
    this.socket.disconnect()
    this.matchmaking = getInitialMatchmakingState()
    this.onlineGame = getInitialOnlineGameState()
    this.pendingClocks = new Map()
    this.activeGames = getInitialActiveGamesState()
    this.network = getInitialNetworkState()
    this.pendingNetworkPings = new Set()
    this.lastNetworkPingClient = null
    this.lastNetworkPongClient = null
    this.friends = []
    this.pendingPlayerProfileRequests = new Map()
    this.playerProfileCache = new Map()
    this.onlineGameRevision++
    this.emitStateChange()
    return true
  }

  async login({username, password}) {
    assertLoginInput(username, password)
    this.sessionRevision = (this.sessionRevision || 0) + 1
    let sessionRevision = this.sessionRevision
    this.socketAuthRevision = sessionRevision
    this.resetSession({clearStoredSession: false})

    if (typeof this.fetch !== 'function') {
      throw new OgsError('network', 'Fetch is not available.')
    }

    let trimmedUsername = username.trim()
    let configResponse = await this.fetch(
      `${this.serverUrl}/api/v1/ui/config`,
      {
        headers: {'User-Agent': USER_AGENT},
        redirect: 'error',
      },
    )

    await assertOk(configResponse, 'config')

    let config = await configResponse.json()
    let csrfToken = config.csrf_token
    let cookieHeader = getCookieHeader(extractSetCookie(configResponse.headers))

    if (typeof csrfToken !== 'string' || csrfToken === '') {
      throw new OgsError('invalid-response', 'OGS did not return a CSRF token.')
    }

    let headers = {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
    }

    if (cookieHeader !== '') headers.Cookie = cookieHeader

    let loginResponse = await this.fetch(`${this.serverUrl}/api/v0/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({username: trimmedUsername, password}),
      redirect: 'error',
    })

    await assertOk(loginResponse, 'login')

    let loginData = await loginResponse.json()
    let jwtToken = loginData.user_jwt

    if (typeof jwtToken !== 'string' || jwtToken === '') {
      throw new OgsError(
        'invalid-response',
        'OGS did not return a session token.',
      )
    }

    let user = sanitizeUser(this.serverUrl, loginData.user)

    if (user.iconUrl == null) {
      let iconUrl = await this.fetchPlayerIconUrl(user.id)
      if (iconUrl != null) user = {...user, iconUrl}
    }

    // The session cookie authenticates OGS REST endpoints that require a
    // signed-in user (e.g. the friends list). When secure persistence is
    // available, it is stored encrypted alongside the JWT.
    let sessionCookieHeader = getCookieHeader([
      ...extractSetCookie(configResponse.headers),
      ...extractSetCookie(loginResponse.headers),
    ])

    await this.socket.connect(jwtToken)
    this.sendNetworkPing()

    if (
      sessionRevision !== this.sessionRevision ||
      sessionRevision !== this.socketAuthRevision
    ) {
      return this.getSession()
    }

    this.session = {
      jwtToken,
      user,
      cookieHeader: sessionCookieHeader !== '' ? sessionCookieHeader : null,
    }
    if (
      !this.persistSession({jwtToken, cookieHeader: sessionCookieHeader, user})
    ) {
      this.credentialStore?.clearSession?.()
    }
    this.emitStateChange()

    return user
  }

  async restoreStoredSession() {
    if (this.restoreStoredSessionPromise != null) {
      return await this.restoreStoredSessionPromise
    }

    this.restoreStoredSessionPromise = this.restoreStoredSessionOnce().finally(
      () => {
        this.restoreStoredSessionPromise = null
      },
    )

    return await this.restoreStoredSessionPromise
  }

  async restoreStoredSessionOnce() {
    if (this.session != null || this.credentialStore == null) {
      return this.getState()
    }

    let sessionRevision = this.sessionRevision || 0

    let storedSession = null

    try {
      storedSession = this.credentialStore.loadSession?.()
    } catch (err) {
      this.credentialStore.clearSession?.()
      return this.getState()
    }

    if (
      storedSession == null ||
      storedSession.serverUrl !== this.serverUrl ||
      typeof storedSession.jwtToken !== 'string' ||
      storedSession.jwtToken === '' ||
      storedSession.user == null
    ) {
      return this.getState()
    }

    if (
      typeof storedSession.user !== 'object' ||
      Array.isArray(storedSession.user)
    ) {
      this.credentialStore.clearSession?.()
      return this.getState()
    }

    let user = null

    try {
      user = sanitizeUser(this.serverUrl, {
        ...storedSession.user,
        icon: storedSession.user.iconUrl,
      })
    } catch (err) {
      this.credentialStore.clearSession?.()
      return this.getState()
    }

    try {
      this.socketAuthRevision = sessionRevision
      await this.socket.connect(storedSession.jwtToken)
      this.sendNetworkPing()

      if (
        sessionRevision !== (this.sessionRevision || 0) ||
        sessionRevision !== this.socketAuthRevision
      ) {
        return this.getState()
      }

      this.session = {
        jwtToken: storedSession.jwtToken,
        cookieHeader:
          typeof storedSession.cookieHeader === 'string' &&
          storedSession.cookieHeader !== ''
            ? storedSession.cookieHeader
            : null,
        user,
      }

      if (user.iconUrl == null) {
        let iconUrl = await this.fetchPlayerIconUrl(user.id)
        if (
          iconUrl != null &&
          sessionRevision === (this.sessionRevision || 0) &&
          sessionRevision === this.socketAuthRevision &&
          this.session != null
        ) {
          this.session = {
            ...this.session,
            user: {...this.session.user, iconUrl},
          }
        }
      }

      this.emitStateChange()
    } catch (err) {
      if (sessionRevision !== (this.sessionRevision || 0)) {
        return this.getState()
      }

      this.credentialStore.clearSession?.()
      this.sessionRevision = (this.sessionRevision || 0) + 1
      this.socketAuthRevision = this.sessionRevision
      this.resetSession({clearStoredSession: false})
    }

    return this.getState()
  }

  persistSession({jwtToken, cookieHeader = null, user}) {
    try {
      return !!this.credentialStore?.saveSession?.({
        serverUrl: this.serverUrl,
        jwtToken,
        cookieHeader,
        user,
        createdAt: this.now(),
      })
    } catch (err) {
      return false
    }
  }

  async fetchPlayerIconUrl(userId) {
    let sanitizedUserId = sanitizeOptionalGameId(userId)
    if (sanitizedUserId == null || typeof this.fetch !== 'function') {
      return null
    }

    try {
      // OGS documents player profiles as anonymously readable where ACL
      // permits, so this does not require the session cookie.
      let response = await this.fetch(
        `${this.serverUrl}/api/v1/players/${sanitizedUserId}/`,
        {
          headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
          redirect: 'error',
        },
      )

      if (!response?.ok) return null

      let data = await response.json()
      let icon = data?.icon || data?.icon_url || data?.picture || data?.avatar

      return resolveOgsUrl(this.serverUrl, icon)
    } catch (err) {
      return null
    }
  }

  enrichOnlineGamePlayers(gameId, revision = this.onlineGameRevision) {
    if (
      gameId == null ||
      this.onlineGame.gameId !== gameId ||
      this.onlineGameRevision !== revision
    ) {
      return
    }

    for (let player of [
      this.onlineGame.players?.black,
      this.onlineGame.players?.white,
    ]) {
      let playerId = sanitizeOptionalGameId(player?.id)
      if (playerId == null || hasCompletePlayerProfile(player)) continue

      this.fetchPlayerProfile(playerId).then((profile) => {
        if (
          profile == null ||
          this.onlineGame.gameId !== gameId ||
          this.onlineGameRevision !== revision ||
          this.onlineGame.players == null
        ) {
          return
        }

        let color =
          this.onlineGame.players.black?.id === playerId ? 'black' : 'white'
        let current = this.onlineGame.players[color]
        if (current == null || current.id !== playerId) return

        this.onlineGame = {
          ...this.onlineGame,
          players: {
            ...this.onlineGame.players,
            [color]: {
              ...profile,
              ...current,
              rank: current.rank || profile.rank,
              iconUrl: current.iconUrl || profile.iconUrl,
            },
          },
        }
        this.emitStateChange()
      })
    }
  }

  async fetchPlayerProfile(userId) {
    let sanitizedUserId = sanitizeOptionalGameId(userId)
    if (sanitizedUserId == null || typeof this.fetch !== 'function') return null

    if (this.playerProfileCache.has(sanitizedUserId)) {
      return this.playerProfileCache.get(sanitizedUserId)
    }

    if (this.pendingPlayerProfileRequests.has(sanitizedUserId)) {
      return await this.pendingPlayerProfileRequests.get(sanitizedUserId)
    }

    let request = (async () => {
      try {
        let response = await this.fetch(
          `${this.serverUrl}/api/v1/players/${sanitizedUserId}/`,
          {
            headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
            redirect: 'error',
          },
        )
        if (!response?.ok) return null

        return sanitizePlayer(await response.json(), this.serverUrl)
      } catch (err) {
        return null
      }
    })()

    this.pendingPlayerProfileRequests.set(sanitizedUserId, request)
    try {
      let profile = await request
      this.playerProfileCache.set(sanitizedUserId, profile)
      return profile
    } finally {
      this.pendingPlayerProfileRequests.delete(sanitizedUserId)
    }
  }

  async listFriends() {
    if (this.session == null) {
      throw new OgsError('not-authenticated', 'Connect to OGS first.')
    }

    if (typeof this.fetch !== 'function') {
      throw new OgsError('network', 'Fetch is not available.')
    }

    if (!this.session.cookieHeader) {
      throw new OgsError(
        'not-authenticated',
        'Sign in again in this session to load OGS friends.',
      )
    }

    let response = await this.fetch(`${this.serverUrl}/api/v1/ui/friends`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Cookie: this.session.cookieHeader,
      },
      redirect: 'error',
    })

    await assertOk(response, 'friends')

    let data = await response.json()
    let friends = sanitizeFriends(data?.friends, this.serverUrl)

    this.friends = friends
    this.monitorFriendsPresence(friends.map((friend) => friend.id))
    this.emitStateChange()

    return friends
  }

  monitorFriendsPresence(userIds) {
    let ids = (userIds || []).filter((id) => Number.isInteger(id))
    if (ids.length === 0) return
    if (this.socket.getState().status !== 'authenticated') return

    try {
      this.socket.send('user/monitor', {user_ids: ids})
    } catch (err) {}
  }

  applyUserStatePayload(payload) {
    if (payload == null || typeof payload !== 'object') return false

    let changed = false

    this.friends = this.friends.map((friend) => {
      let key = String(friend.id)
      if (!Object.prototype.hasOwnProperty.call(payload, key)) return friend

      let online = Boolean(payload[key])
      if (friend.online === online) return friend

      changed = true
      return {...friend, online}
    })

    return changed
  }

  setMatchmakingOptions(options) {
    if (['searching', 'matched'].includes(this.matchmaking.status)) {
      throw new OgsError(
        'invalid-state',
        'Stop OGS automatch before changing matchmaking options.',
      )
    }

    this.matchmaking = {
      ...this.matchmaking,
      status: 'idle',
      options: sanitizeMatchmakingOptions(options),
      payload: null,
      matchedGameId: null,
      error: null,
    }

    this.emitStateChange()
    return this.getState()
  }

  startAutomatch() {
    let payload = buildAutomatchPayload(this.matchmaking.options)
    this.assertAuthenticatedSocket()

    if (['searching', 'matched'].includes(this.matchmaking.status)) {
      throw new OgsError('invalid-state', 'OGS automatch is already active.')
    }

    this.socket.send('automatch/find_match', payload)

    this.matchmaking = {
      ...this.matchmaking,
      status: 'searching',
      payload,
      matchedGameId: null,
      error: null,
    }

    console.log('[ogs:automatch] find_match', JSON.stringify(payload))

    this.emitStateChange()
    return this.getState()
  }

  cancelAutomatch() {
    let uuid = sanitizeAutomatchUuid(this.matchmaking.payload?.uuid)
    this.assertAuthenticatedSocket()

    if (this.matchmaking.status !== 'searching') {
      throw new OgsError('invalid-state', 'OGS automatch is not searching.')
    }

    this.socket.send('automatch/cancel', {uuid})
    this.matchmaking = {
      ...this.matchmaking,
      status: 'idle',
      payload: null,
      matchedGameId: null,
      error: null,
    }

    this.emitStateChange()
    return this.getState()
  }

  acknowledgeAutomatchOpen(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    if (this.matchmaking.matchedGameId === gameId) {
      this.matchmaking = {
        ...this.matchmaking,
        status: 'idle',
        payload: null,
        matchedGameId: null,
        error: null,
      }
    }

    this.emitStateChange()
    return this.getState()
  }

  connectGame(input = {}) {
    let gameId = sanitizeGameId(input.gameId)
    this.assertAuthenticatedSocket()

    this.onlineGame = {
      ...getInitialOnlineGameState(),
      status: 'connecting',
      gameId,
    }
    this.onlineGameRevision++
    this.pendingClocks = new Map()

    this.sendNetworkPing()
    this.socket.send('game/connect', {game_id: gameId, chat: true})

    this.emitStateChange()
    return this.getState()
  }

  disconnectGame(input = {}) {
    let gameId = sanitizeGameId(input.gameId ?? this.onlineGame.gameId)
    this.assertAuthenticatedSocket()

    this.socket.send('game/disconnect', {game_id: gameId})

    if (this.onlineGame.gameId === gameId) {
      this.onlineGameRevision++
      this.onlineGame = getInitialOnlineGameState()
      this.pendingClocks = new Map()
    }

    this.emitStateChange()
    return this.getState()
  }

  playMove(input = {}) {
    let gameId = sanitizeGameId(input.gameId)
    let board = this.onlineGame.board

    if (board == null) {
      throw new OgsError('invalid-state', 'OGS board size is not available.')
    }

    let move = encodeOgsCoordinates(input.x, input.y, board)

    if (move == null || move === '..') {
      throw new OgsError('invalid-input', 'A valid OGS move is required.')
    }

    this.assertCanPlayGameCommand(gameId)
    this.socket.send('game/move', {game_id: gameId, move})
    this.onlineGame = {...this.onlineGame, pendingMove: true}

    this.emitStateChange()
    return this.getState()
  }

  pass(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    this.assertCanPlayGameCommand(gameId)
    this.socket.send('game/move', {game_id: gameId, move: '..'})
    this.onlineGame = {...this.onlineGame, pendingMove: true}

    this.emitStateChange()
    return this.getState()
  }

  resign(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    this.assertCanPlayGameCommand(gameId, {requireTurn: false})
    this.socket.send('game/resign', {game_id: gameId})

    this.emitStateChange()
    return this.getState()
  }

  setRemovedStones(input = {}) {
    let gameId = sanitizeGameId(input.gameId)
    let stones = encodeClientOgsStones(input.stones, this.onlineGame.board)
    let removed = sanitizeRemovedFlag(input.removed)

    this.assertCanRemoveStones(gameId)
    this.socket.send('game/removed_stones/set', {
      game_id: gameId,
      removed,
      stones,
    })
    this.onlineGame = {
      ...this.onlineGame,
      removedStones: mergeRemovedStoneStrings(
        this.onlineGame.removedStones,
        stones,
        removed,
      ),
    }

    this.emitStateChange()
    return this.getState()
  }

  acceptRemovedStones(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    this.assertCanRemoveStones(gameId)
    let stones = sanitizeRemovedStoneString(
      this.onlineGame.removedStones,
      this.onlineGame.board,
    )
    this.socket.send('game/removed_stones/accept', {
      game_id: gameId,
      stones,
      strict_seki_mode: input.strictSekiMode === true,
    })

    this.emitStateChange()
    return this.getState()
  }

  sendChat(input = {}) {
    let gameId = sanitizeGameId(input.gameId)
    let body = sanitizeOutgoingChatBody(input.body)

    this.assertCanChat(gameId)
    this.socket.send('game/chat', {
      game_id: gameId,
      type: 'main',
      move_number: sanitizeMoveCount(this.onlineGame.moveCount, 0),
      body,
    })

    this.emitStateChange()
    return this.getState()
  }

  async listGameHistory(input = {}) {
    if (this.session == null) {
      throw new OgsError('not-authenticated', 'Connect to OGS first.')
    }

    let userId = sanitizeGameId(this.session.user?.id)
    let page = sanitizePositiveInteger(input.page, 1, 100000)
    let pageSize = sanitizePositiveInteger(
      input.pageSize,
      DEFAULT_GAME_HISTORY_PAGE_SIZE,
      MAX_GAME_HISTORY_PAGE_SIZE,
    )

    if (typeof this.fetch !== 'function') {
      throw new OgsError('network', 'Fetch is not available.')
    }

    let url = new URL(
      `${this.serverUrl}/api/v1/players/${userId}/game_history/`,
    )
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(pageSize))

    // OGS documents this endpoint as anonymously readable where ACL permits.
    // The stored user_jwt is for websocket auth, so don't send it as REST auth.
    let response = await this.fetch(url.toString(), {
      headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
      redirect: 'error',
    })

    await assertOk(response, 'game-history')

    return sanitizeGameHistoryResponse(await response.json(), pageSize)
  }

  async downloadGameSgf(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    if (this.session == null) {
      throw new OgsError('not-authenticated', 'Connect to OGS first.')
    }

    if (typeof this.fetch !== 'function') {
      throw new OgsError('network', 'Fetch is not available.')
    }

    // OGS documents game SGF downloads as anonymously readable where ACL permits.
    // The stored user_jwt is for websocket auth, so don't send it as REST auth.
    let response = await this.fetch(
      `${this.serverUrl}/api/v1/games/${gameId}/sgf`,
      {
        headers: {'User-Agent': USER_AGENT, Accept: 'application/x-go-sgf'},
        redirect: 'error',
      },
    )

    await assertOk(response, 'game-sgf')

    let contentLength = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_OGS_SGF_BYTES) {
      throw new OgsError('invalid-response', 'OGS SGF file is too large.')
    }

    let sgfText = await readLimitedTextResponse(response, MAX_OGS_SGF_BYTES)

    if (typeof sgfText !== 'string' || !sgfText.trim().startsWith('(')) {
      throw new OgsError('invalid-response', 'OGS did not return an SGF file.')
    }

    return sgfText
  }

  async listAiReviews(input = {}) {
    if (this.session == null) {
      throw new OgsError('not-authenticated', 'Connect to OGS first.')
    }

    return await this.reviewApi.listReviews(input.gameId)
  }

  assertAuthenticatedSocket() {
    let state = this.socket.getState()

    if (!state.authenticated || state.status !== 'authenticated') {
      throw new OgsError(
        'socket-not-authenticated',
        'OGS socket is not authenticated.',
      )
    }
  }

  assertCanPlayGameCommand(gameId, {requireTurn = true} = {}) {
    this.assertAuthenticatedSocket()

    if (
      this.onlineGame.gameId !== gameId ||
      this.onlineGame.status !== 'connected'
    ) {
      throw new OgsError('invalid-state', 'OGS game is not connected.')
    }

    if (this.onlineGame.phase !== 'play') {
      throw new OgsError('invalid-state', 'OGS game is not in play phase.')
    }

    if (requireTurn && this.onlineGame.pendingMove) {
      throw new OgsError('move-pending', 'An OGS move is already pending.')
    }

    let userId = sanitizeOptionalGameId(this.session?.user?.id)
    if (userId == null) {
      throw new OgsError('invalid-state', 'OGS user is not available.')
    }

    let blackId = this.onlineGame.players?.black?.id
    let whiteId = this.onlineGame.players?.white?.id

    if (blackId == null || whiteId == null) {
      throw new OgsError('invalid-state', 'OGS game players are not available.')
    }

    if (![blackId, whiteId].includes(userId)) {
      throw new OgsError(
        'invalid-state',
        'OGS user is not a player in this game.',
      )
    }

    let playerToMove = this.getPlayerToMove(gameId)
    if (requireTurn && playerToMove != null && playerToMove !== userId) {
      throw new OgsError(
        'not-your-turn',
        'It is not your turn in this OGS game.',
      )
    }
  }

  assertCanRemoveStones(gameId) {
    this.assertAuthenticatedSocket()

    if (
      this.onlineGame.gameId !== gameId ||
      this.onlineGame.status !== 'connected'
    ) {
      throw new OgsError('invalid-state', 'OGS game is not connected.')
    }

    if (
      this.onlineGame.phase !== 'stone removal' &&
      this.onlineGame.clock?.stoneRemovalMode !== true
    ) {
      throw new OgsError(
        'invalid-state',
        'OGS game is not in stone removal phase.',
      )
    }

    let userId = sanitizeOptionalGameId(this.session?.user?.id)
    let blackId = this.onlineGame.players?.black?.id
    let whiteId = this.onlineGame.players?.white?.id

    if (userId == null || ![blackId, whiteId].includes(userId)) {
      throw new OgsError(
        'invalid-state',
        'OGS user is not a player in this game.',
      )
    }
  }

  assertCanChat(gameId) {
    this.assertAuthenticatedSocket()

    if (
      this.onlineGame.gameId !== gameId ||
      this.onlineGame.status !== 'connected'
    ) {
      throw new OgsError('invalid-state', 'OGS game is not connected.')
    }

    let userId = sanitizeOptionalGameId(this.session?.user?.id)
    let blackId = this.onlineGame.players?.black?.id
    let whiteId = this.onlineGame.players?.white?.id

    if (userId == null || ![blackId, whiteId].includes(userId)) {
      throw new OgsError(
        'invalid-state',
        'OGS user is not a player in this game.',
      )
    }
  }

  getPlayerToMove(gameId) {
    if (
      this.onlineGame.clock?.currentPlayer != null &&
      isCurrentClock(this.onlineGame.clock, this.onlineGame.moveCount)
    ) {
      return this.onlineGame.clock.currentPlayer
    }

    let historyPlayerToMove = getPlayerToMoveFromHistory(this.onlineGame)
    if (historyPlayerToMove != null) return historyPlayerToMove

    let activePlayerToMove = this.activeGames.find(
      (game) => game.id === gameId,
    )?.playerToMove
    if (activePlayerToMove != null) return activePlayerToMove

    return null
  }

  handleSocketEvent(event, payload) {
    if (event === 'net/pong') {
      this.handleNetworkPong(payload)
      this.emitStateChange()
      return
    }

    if (event === 'user/state') {
      if (this.applyUserStatePayload(payload)) this.emitStateChange()
      return
    }

    if (event === 'active_game') {
      this.upsertActiveGame(payload)
      this.emitStateChange()
      return
    }

    if (event === 'notification') {
      this.applyOgsNotification(payload)
      this.emitStateChange()
      return
    }

    if (event === 'automatch/entry') {
      let entry = sanitizeAutomatchEntry(payload)
      if (entry == null) return

      if (
        this.matchmaking.status !== 'searching' ||
        entry.uuid !== this.matchmaking.payload?.uuid
      ) {
        return
      }

      this.matchmaking = {
        ...this.matchmaking,
        status: 'searching',
        payload: {
          ...this.matchmaking.payload,
          timestamp: entry.timestamp ?? this.matchmaking.payload.timestamp,
        },
        matchedGameId: null,
        error: null,
      }
      this.emitStateChange()
      return
    }

    if (event === 'automatch/cancel') {
      let uuid = sanitizeOptionalAutomatchUuid(payload?.uuid)
      if (
        this.matchmaking.status === 'searching' &&
        uuid === this.matchmaking.payload?.uuid
      ) {
        this.matchmaking = {
          ...this.matchmaking,
          status: 'idle',
          payload: null,
          matchedGameId: null,
          error: null,
        }
        this.emitStateChange()
      }
      return
    }

    if (event === 'automatch/start') {
      let gameId = sanitizeOptionalGameId(payload?.game_id)
      let uuid = sanitizeOptionalAutomatchUuid(payload?.uuid)

      if (
        gameId != null &&
        this.matchmaking.status === 'searching' &&
        uuid != null &&
        uuid === this.matchmaking.payload?.uuid
      ) {
        this.matchmaking = {
          ...this.matchmaking,
          status: 'matched',
          matchedGameId: gameId,
          payload: this.matchmaking.payload,
          error: null,
        }
        this.connectGame({gameId})
        this.emitStateChange()
      }

      return
    }

    let match = /^game\/(\d+)\/(.+)$/.exec(event)
    if (match == null) return

    let gameId = sanitizeOptionalGameId(match[1])
    if (gameId == null || gameId !== this.onlineGame.gameId) return

    this.applyGameEvent(match[2], payload)
    this.emitStateChange()
  }

  applyGameEvent(type, payload) {
    switch (type) {
      case 'gamedata':
        this.onlineGame = {
          ...this.onlineGame,
          ...sanitizeGameData(payload, this.serverUrl),
          status: 'connected',
          error: null,
        }
        if (hasOwn(payload, 'clock'))
          this.applyClock(sanitizeClock(payload.clock))
        this.applyPendingClock()
        this.enrichOnlineGamePlayers(
          this.onlineGame.gameId,
          this.onlineGameRevision,
        )
        break

      case 'data':
        this.onlineGame = {
          ...this.onlineGame,
          ...sanitizePartialGameData(payload, this.serverUrl, this.onlineGame),
          status: 'connected',
          error: null,
        }
        if (hasOwn(payload, 'clock'))
          this.applyClock(sanitizeClock(payload.clock))
        this.applyPendingClock()
        this.enrichOnlineGamePlayers(this.onlineGame.gameId)
        break

      case 'move':
        let move = sanitizeLiveMove(
          payload,
          this.onlineGame.moves.length + 1,
          this.onlineGame.board,
        )
        if (move == null) break

        let moves = mergeMoves(this.onlineGame.moves, move)

        this.onlineGame = {
          ...this.onlineGame,
          status: 'connected',
          moves,
          moveCount: moves.length,
          lastMove: move.move,
          pendingMove: false,
          error: null,
        }
        this.applyPendingClock()
        break

      case 'clock':
        this.applyClock(sanitizeClock(payload))
        break

      case 'latency':
        this.applyGameLatency(payload)
        break

      case 'phase':
        this.onlineGame = {
          ...this.onlineGame,
          status: 'connected',
          phase: sanitizeGamePhase(payload),
          error: null,
        }
        break

      case 'removed_stones':
        let removedStones = sanitizeRemovedStones(
          payload,
          this.onlineGame.board,
        )
        this.onlineGame = {
          ...this.onlineGame,
          status: 'connected',
          ...(removedStones == null ? {} : {removedStones}),
          error: null,
        }
        break

      case 'removed_stones_accepted':
        this.onlineGame = {
          ...this.onlineGame,
          status: 'connected',
          phase: sanitizeGamePhase(payload?.phase) || this.onlineGame.phase,
          outcome:
            sanitizeString(payload?.outcome, 200) || this.onlineGame.outcome,
          winner:
            sanitizeOptionalGameId(payload?.winner) || this.onlineGame.winner,
          removedStones: sanitizeRemovedStoneString(
            payload?.stones,
            this.onlineGame.board,
          ),
          removedStonesAccepted: sanitizeRemovedStonesAccepted(
            payload,
            this.onlineGame,
            this.onlineGame.removedStonesAccepted,
          ),
          error: null,
        }
        break

      case 'chat':
        this.onlineGame = {
          ...this.onlineGame,
          status: 'connected',
          chat: [...this.onlineGame.chat, sanitizeGameChatLine(payload)]
            .filter((line) => line != null)
            .slice(-20),
          error: null,
        }
        break

      case 'reset-chats':
        this.onlineGame = {...this.onlineGame, chat: []}
        break

      case 'error':
        this.onlineGame = {
          ...this.onlineGame,
          status: 'error',
          pendingMove: false,
          error: sanitizeErrorMessage(payload),
        }
        break
    }
  }

  applyOgsNotification(payload) {
    let gameId = sanitizeOptionalGameId(payload?.game_id)
    if (gameId == null || gameId !== this.onlineGame.gameId) return
    if (payload?.type !== 'gameEnded') return

    let winner = sanitizeOptionalGameId(
      payload?.winner_id ?? payload?.winner ?? payload?.player_id,
    )
    let outcome = sanitizeString(payload?.outcome, 200)

    this.onlineGame = {
      ...this.onlineGame,
      status: 'connected',
      phase: 'finished',
      outcome: outcome || this.onlineGame.outcome,
      winner: winner || this.onlineGame.winner,
      error: null,
    }
  }

  applyClock(clock) {
    let result = reduceClockSequence({
      currentClock: this.onlineGame.clock,
      pendingClocks: this.pendingClocks,
      moveCount: this.onlineGame.moveCount,
      incomingClock: clock,
    })

    this.pendingClocks = result.pendingClocks
    this.onlineGame = {
      ...this.onlineGame,
      status: 'connected',
      clock: result.clock,
      error: null,
    }
  }

  applyPendingClock() {
    let result = advanceClockSequence({
      currentClock: this.onlineGame.clock,
      pendingClocks: this.pendingClocks,
      moveCount: this.onlineGame.moveCount,
    })

    this.pendingClocks = result.pendingClocks
    if (result.action === 'applied') {
      this.onlineGame = {...this.onlineGame, clock: result.clock}
    }
  }

  handleNetworkPong(payload) {
    let client = sanitizeNumber(payload?.client)
    let server = sanitizeNumber(payload?.server)
    if (client == null || server == null) return
    if (
      this.lastNetworkPingClient == null ||
      client > this.lastNetworkPingClient ||
      !this.pendingNetworkPings.has(client)
    ) {
      return
    }
    if (
      this.lastNetworkPongClient != null &&
      client < this.lastNetworkPongClient
    ) {
      return
    }

    let now = this.now()
    let latency = Math.max(0, now - client)
    let drift = now - latency / 2 - server

    this.lastNetworkPongClient = client
    this.pendingNetworkPings.delete(client)
    this.network = {latency, drift, updatedAt: now}
    this.sendGameLatency(latency)
  }

  sendNetworkPing() {
    if (this.socket.getState().status !== 'authenticated') return false

    let now = this.now()
    let client =
      this.lastNetworkPingClient == null
        ? now
        : Math.max(now, this.lastNetworkPingClient + 1)
    let {latency, drift} = this.network
    this.lastNetworkPingClient = client
    this.pendingNetworkPings.add(client)
    this.socket.send('net/ping', {
      client,
      latency: latency ?? 0,
      drift: drift ?? 0,
    })

    return true
  }

  sendGameLatency(latency = this.network.latency) {
    if (this.socket.getState().status !== 'authenticated') return false
    if (this.onlineGame.gameId == null) return false

    let sanitizedLatency = sanitizeLatency(latency)
    if (sanitizedLatency == null) return false

    this.socket.send('game/latency', {
      game_id: this.onlineGame.gameId,
      latency: sanitizedLatency,
    })

    return true
  }

  applyGameLatency(payload) {
    let playerId = sanitizeOptionalGameId(payload?.player_id)
    let latency = sanitizeLatency(payload?.latency)
    if (playerId == null || latency == null) return

    this.onlineGame = {
      ...this.onlineGame,
      latencies: {
        ...(this.onlineGame.latencies || {}),
        [playerId]: latency,
      },
    }
  }

  upsertActiveGame(payload) {
    let game = sanitizeActiveGame(payload, this.serverUrl)
    if (game == null) return

    this.activeGames = [
      ...this.activeGames.filter((item) => item.id !== game.id),
      game,
    ].sort((a, b) => a.id - b.id)
  }
}

function sanitizePositiveInteger(value, fallback, max) {
  let result = Number(value)
  if (!Number.isInteger(result) || result < 1) return fallback
  return Math.min(result, max)
}

async function readLimitedTextResponse(response, maxBytes) {
  let reader = response.body?.getReader?.()

  if (reader == null) {
    let text = await response.text()

    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new OgsError('invalid-response', 'OGS SGF file is too large.')
    }

    return text
  }

  let chunks = []
  let totalBytes = 0

  try {
    while (true) {
      let {done, value} = await reader.read()
      if (done) break

      let buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
      totalBytes += buffer.byteLength

      if (totalBytes > maxBytes) {
        await reader.cancel?.()
        throw new OgsError('invalid-response', 'OGS SGF file is too large.')
      }

      chunks.push(buffer)
    }
  } finally {
    reader.releaseLock?.()
  }

  return Buffer.concat(chunks).toString('utf8')
}

function sanitizeGameHistoryResponse(
  response,
  maxResults = MAX_GAME_HISTORY_PAGE_SIZE,
) {
  let results = Array.isArray(response?.results)
    ? response.results
    : Array.isArray(response)
      ? response
      : []

  return {
    count: sanitizeOptionalCount(response?.count),
    next: typeof response?.next === 'string' ? response.next : null,
    previous: typeof response?.previous === 'string' ? response.previous : null,
    results: sanitizeGameHistoryEntries(results, maxResults),
  }
}

function sanitizeGameHistoryEntries(results, maxResults) {
  let sanitized = []

  for (let entry of results) {
    let game = sanitizeGameHistoryEntry(entry)
    if (game == null) continue

    sanitized.push(game)
    if (sanitized.length >= maxResults) break
  }

  return sanitized
}

function sanitizeOptionalCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function sanitizeGameHistoryEntry(entry) {
  if (entry == null || typeof entry !== 'object') return null

  let id = sanitizeOptionalGameId(entry.id ?? entry.game_id)
  if (id == null) return null

  return {
    id,
    name: sanitizeString(entry.name || entry.game_name, 120),
    result: sanitizeString(entry.result || entry.outcome, 80),
    winner: sanitizeOptionalGameId(
      entry.winner_id ?? entry.winner?.id ?? entry.winner,
    ),
    ended: sanitizeString(entry.ended || entry.ended_at || entry.finished, 80),
    board: sanitizeHistoryBoard(entry),
    black: sanitizeHistoryPlayer(entry.players?.black),
    white: sanitizeHistoryPlayer(entry.players?.white),
  }
}

function sanitizeHistoryBoard(entry) {
  let width = sanitizeBoardSize(entry.width ?? entry.board_width ?? entry.size)
  let height = sanitizeBoardSize(
    entry.height ?? entry.board_height ?? entry.size,
  )

  return width == null || height == null ? null : {width, height}
}

function sanitizeHistoryPlayer(player) {
  if (player == null || typeof player !== 'object') return null

  return {
    id: sanitizeOptionalGameId(player.id),
    username: sanitizeString(player.username || player.name, 80),
    rank: sanitizeString(player.rank, 20),
  }
}

function sanitizeActiveGame(data, serverUrl) {
  let id = sanitizeOptionalGameId(data?.id)
  let width = sanitizeBoardSize(data?.width)
  let height = sanitizeBoardSize(data?.height)

  if (id == null) return null

  return {
    id,
    name: sanitizeString(data?.name, 200),
    board: width == null || height == null ? null : {width, height},
    phase: sanitizeGamePhase(data?.phase),
    ranked: sanitizeBoolean(data?.ranked),
    rules: sanitizeString(data?.rules, 80),
    timeControl: sanitizeTimeControl(data?.time_control),
    handicap: sanitizeHandicap(data?.handicap),
    komi: sanitizeNumber(data?.komi),
    timePerMove: sanitizeNumber(data?.time_per_move),
    moveNumber: sanitizeMoveCount(data?.move_number, 0),
    playerToMove: sanitizeOptionalGameId(data?.player_to_move),
    clockExpiration:
      typeof data?.clock_expiration === 'number' &&
      Number.isFinite(data.clock_expiration)
        ? data.clock_expiration
        : null,
    black: sanitizePlayer(data?.black, serverUrl),
    white: sanitizePlayer(data?.white, serverUrl),
  }
}

function hasCompletePlayerProfile(player) {
  return player?.rank != null && player?.iconUrl != null
}

function getPlayerToMoveFromHistory(onlineGame) {
  let blackId = onlineGame.players?.black?.id
  let whiteId = onlineGame.players?.white?.id
  if (blackId == null || whiteId == null) return null

  let firstPlayer = onlineGame.handicap > 1 ? whiteId : blackId
  let secondPlayer = firstPlayer === blackId ? whiteId : blackId

  return onlineGame.moveCount % 2 === 0 ? firstPlayer : secondPlayer
}

function sanitizeGameData(data, serverUrl) {
  let width = sanitizeBoardSize(data?.width)
  let height = sanitizeBoardSize(data?.height)
  let board = width == null || height == null ? null : {width, height}
  let moves = sanitizeHistoricalMoves(data?.moves, board)

  return {
    gameName: sanitizeString(data?.game_name, 200),
    board,
    handicap: sanitizeHandicap(data?.handicap),
    komi: sanitizeNumber(data?.komi),
    rules: sanitizeString(data?.rules, 80),
    ranked: sanitizeBoolean(data?.ranked),
    timeControl: sanitizeTimeControl(data?.time_control),
    timePerMove: sanitizeNumber(data?.time_per_move),
    phase: sanitizeGamePhase(data?.phase),
    outcome: sanitizeString(data?.outcome, 200),
    winner: sanitizeOptionalGameId(data?.winner),
    players: sanitizePlayers(data?.players, serverUrl),
    moves,
    moveCount: moves.length,
    lastMove: moves.at(-1)?.move || null,
  }
}

function sanitizePartialGameData(data, serverUrl, previous) {
  let sanitized = sanitizeGameData(data, serverUrl)
  let has = (key) => hasOwn(data, key)
  let hasBoard = has('width') && has('height')
  let hasMoves = has('moves')
  let board = hasBoard ? sanitized.board : previous.board
  let moves = hasMoves ? sanitizeHistoricalMoves(data?.moves, board) : null

  return {
    gameName: has('game_name') ? sanitized.gameName : previous.gameName,
    board,
    handicap: has('handicap') ? sanitized.handicap : previous.handicap,
    komi: has('komi') ? sanitized.komi : previous.komi,
    rules: has('rules') ? sanitized.rules : previous.rules,
    ranked: has('ranked') ? sanitized.ranked : previous.ranked,
    timeControl: has('time_control')
      ? sanitized.timeControl
      : previous.timeControl,
    timePerMove: has('time_per_move')
      ? sanitized.timePerMove
      : previous.timePerMove,
    phase: has('phase') ? sanitized.phase : previous.phase,
    outcome: has('outcome') ? sanitized.outcome : previous.outcome,
    winner: has('winner') ? sanitized.winner : previous.winner,
    players: has('players') ? sanitized.players : previous.players,
    moves: hasMoves ? moves : previous.moves,
    moveCount: hasMoves ? moves.length : previous.moveCount,
    lastMove: hasMoves ? moves.at(-1)?.move || null : previous.lastMove,
  }
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key)
}

function sanitizeLatency(value) {
  let latency = sanitizeNumber(value)
  return latency == null || latency < 0 ? null : latency
}

function encodeClientOgsStones(value, board = null) {
  if (board == null) {
    throw new OgsError('invalid-state', 'OGS board size is not available.')
  }

  let maxStones = board.width * board.height
  let moves = []

  if (typeof value === 'string') {
    if (value.length > maxStones * 2 || value.length % 2 !== 0) {
      throw new OgsError('invalid-input', 'Invalid OGS stone list.')
    }

    for (let i = 0; i < value.length; i += 2) {
      moves.push(value.slice(i, i + 2))
    }
  } else if (Array.isArray(value)) {
    if (value.length === 0 || value.length > maxStones) {
      throw new OgsError('invalid-input', 'Invalid OGS stone list.')
    }

    moves = value.map((vertex) => {
      if (Array.isArray(vertex)) {
        return encodeOgsCoordinates(vertex[0], vertex[1], board)
      }
      if (vertex != null && typeof vertex === 'object') {
        return encodeOgsCoordinates(vertex.x, vertex.y, board)
      }

      return null
    })
  } else {
    throw new OgsError('invalid-input', 'Invalid OGS stone list.')
  }

  let result = []

  for (let move of moves) {
    let encoded = encodeOgsMove(move, board)

    if (encoded == null || encoded === '..') {
      throw new OgsError('invalid-input', 'Invalid OGS stone list.')
    }

    if (!result.includes(encoded)) result.push(encoded)
  }

  if (result.length === 0) {
    throw new OgsError('invalid-input', 'Invalid OGS stone list.')
  }

  return result.join('')
}

function sanitizeRemovedFlag(value) {
  if (value == null) return true
  if (typeof value === 'boolean') return value

  throw new OgsError('invalid-input', 'Invalid OGS removed-stones flag.')
}

function sanitizeOutgoingChatBody(value) {
  if (typeof value !== 'string') {
    throw new OgsError('invalid-input', 'A valid OGS chat message is required.')
  }

  let body = value.trim()
  if (body === '') {
    throw new OgsError('invalid-input', 'A valid OGS chat message is required.')
  }

  if (body.length > 1000) {
    throw new OgsError('invalid-input', 'OGS chat message is too long.')
  }

  return body
}

function sanitizeRemovedStones(payload, board = null) {
  if (payload == null || typeof payload !== 'object') return null

  if (
    !Object.prototype.hasOwnProperty.call(payload, 'all_removed') &&
    !Object.prototype.hasOwnProperty.call(payload, 'stones')
  ) {
    return null
  }

  let value = Object.prototype.hasOwnProperty.call(payload, 'all_removed')
    ? payload.all_removed
    : payload.stones

  return sanitizeRemovedStoneString(value, board)
}

function sanitizeRemovedStoneString(value, board = null) {
  if (typeof value !== 'string') return ''

  let maxStones = board == null ? 26 * 26 : board.width * board.height
  value = value.slice(0, maxStones * 2)

  let result = []
  for (let i = 0; i < value.length - 1; i += 2) {
    let move = encodeOgsMove(value.slice(i, i + 2), board)
    if (move != null && move !== '..' && !result.includes(move)) {
      result.push(move)
      if (result.length >= maxStones) break
    }
  }

  return result.join('')
}

function sanitizeRemovedStonesAccepted(payload, onlineGame, previous = []) {
  if (payload?.player_id === 0) {
    return [
      onlineGame.players?.black?.id,
      onlineGame.players?.white?.id,
    ].filter((id) => sanitizeOptionalGameId(id) != null)
  }

  let playerId = sanitizeOptionalGameId(payload?.player_id)
  if (playerId == null) return previous

  return [...new Set([...previous, playerId])]
}

function mergeRemovedStoneStrings(previous, stones, removed) {
  let values = new Set(parseOgsStoneString(previous))

  for (let stone of parseOgsStoneString(stones)) {
    if (removed) values.add(stone)
    else values.delete(stone)
  }

  return [...values].sort().join('')
}

function parseOgsStoneString(value) {
  if (typeof value !== 'string') return []

  let result = []
  for (let i = 0; i < value.length - 1; i += 2) {
    let move = value.slice(i, i + 2)
    if (/^[a-z]{2}$/.test(move)) result.push(move)
  }

  return result
}

function sanitizeGamePhase(value) {
  return sanitizeString(
    value != null && typeof value === 'object' ? value.phase : value,
    80,
  )
}

function sanitizeTimeControl(value) {
  if (value == null || typeof value !== 'object') return null

  return {
    system: sanitizeString(value.system, 80),
    speed: sanitizeString(value.speed, 80),
    timePerMove: sanitizeNumber(value.time_per_move),
    mainTime: sanitizeNumber(value.main_time),
    periodTime: sanitizeNumber(value.period_time),
    periods:
      Number.isInteger(value.periods) && value.periods >= 0
        ? value.periods
        : null,
  }
}

function sanitizeGameChatLine(message) {
  let line = message?.line || message
  if (line == null || typeof line !== 'object') return null

  let body = line.body

  if (typeof body !== 'string') return null

  body = sanitizeString(body, 1000)
  if (body === '') return null

  return {
    channel: sanitizeString(line.channel || message?.channel || 'main', 40),
    username: sanitizeString(line.username, 80),
    body,
    moveNumber: sanitizeMoveCount(line.move_number, null),
    date:
      typeof line.date === 'number' && Number.isFinite(line.date)
        ? line.date
        : null,
  }
}

function serializeError(err) {
  if (err instanceof OgsError) return {code: err.code, message: err.message}

  return {
    code: 'network',
    message: 'Unable to connect to OGS.',
  }
}

function setupOgsIpcHandlers(
  ipcMain,
  client = null,
  {sendStateChange = null} = {},
) {
  if (client == null) {
    client = new OgsClient({
      credentialStore: createElectronOgsCredentialStore(),
    })
  }

  if (typeof sendStateChange === 'function') {
    let previousOnStateChange = client.onStateChange
    let scheduledStateChange = false
    let latestState = null

    client.onStateChange = (state) => {
      if (typeof previousOnStateChange === 'function') {
        previousOnStateChange(state)
      }

      latestState = state

      if (scheduledStateChange) return
      scheduledStateChange = true

      setTimeout(() => {
        scheduledStateChange = false
        let state = latestState
        latestState = null
        sendStateChange(state)
      }, 0)
    }
  }

  ipcMain.handle('ogs:getSession', () => client.getSession())

  ipcMain.handle('ogs:getState', () => client.getState())

  ipcMain.handle('ogs:restoreSession', async () => {
    try {
      return {ok: true, state: await client.restoreStoredSession()}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:logout', () => client.logout())

  ipcMain.handle('ogs:setMatchmakingOptions', (evt, options) =>
    client.setMatchmakingOptions(options),
  )

  ipcMain.handle('ogs:startAutomatch', () => {
    try {
      return {ok: true, state: client.startAutomatch()}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:cancelAutomatch', (evt, input) => {
    try {
      return {ok: true, state: client.cancelAutomatch(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:acknowledgeAutomatchOpen', (evt, input) => {
    try {
      return {ok: true, state: client.acknowledgeAutomatchOpen(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:connectGame', (evt, input) => {
    try {
      return {ok: true, state: client.connectGame(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:disconnectGame', (evt, input) => {
    try {
      return {ok: true, state: client.disconnectGame(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:playMove', (evt, input) => {
    try {
      return {ok: true, state: client.playMove(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:pass', (evt, input) => {
    try {
      return {ok: true, state: client.pass(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:resign', (evt, input) => {
    try {
      return {ok: true, state: client.resign(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:setRemovedStones', (evt, input) => {
    try {
      return {ok: true, state: client.setRemovedStones(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:acceptRemovedStones', (evt, input) => {
    try {
      return {ok: true, state: client.acceptRemovedStones(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:sendChat', (evt, input) => {
    try {
      return {ok: true, state: client.sendChat(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:listGameHistory', async (evt, input) => {
    try {
      return {ok: true, history: await client.listGameHistory(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err)}
    }
  })

  ipcMain.handle('ogs:downloadGameSgf', async (evt, input) => {
    try {
      return {ok: true, sgf: await client.downloadGameSgf(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err)}
    }
  })

  ipcMain.handle('ogs:listAiReviews', async (evt, input) => {
    try {
      return {ok: true, reviews: await client.listAiReviews(input || {})}
    } catch (err) {
      return {ok: false, error: serializeError(err)}
    }
  })

  ipcMain.handle('ogs:listFriends', async () => {
    try {
      return {
        ok: true,
        friends: await client.listFriends(),
        state: client.getState(),
      }
    } catch (err) {
      return {ok: false, error: serializeError(err), state: client.getState()}
    }
  })

  ipcMain.handle('ogs:login', async (evt, credentials) => {
    try {
      return {
        ok: true,
        user: await client.login(credentials || {}),
        state: client.getState(),
      }
    } catch (err) {
      return {
        ok: false,
        error: serializeError(err),
      }
    }
  })

  return client
}

module.exports = {
  DEFAULT_SERVER_URL,
  DEFAULT_MATCHMAKING_OPTIONS,
  AUTOMATCH_BOARD_SIZES,
  AUTOMATCH_SPEEDS,
  AUTOMATCH_TIME_SYSTEMS,
  AUTOMATCH_CONDITIONS,
  AUTOMATCH_RULES,
  AUTOMATCH_HANDICAP_VALUES,
  buildAutomatchPayload,
  OgsClient,
  OgsError,
  OgsSocket,
  ratingToRank,
  sanitizeUser,
  sanitizeMatchmakingOptions,
  setupOgsIpcHandlers,
}
