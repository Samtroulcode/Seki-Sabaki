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
} = require('./ogs/users.js')
const {ratingToRank} = require('./ogs/ranks.js')
const {sanitizeClock, isFutureClock, isCurrentClock} = require('./ogs/clock.js')

const DEFAULT_SERVER_URL = 'https://online-go.com'
const USER_AGENT = 'Seki-Sabaki/0.1'

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
  }) {
    this.serverUrl = serverUrl
    this.WebSocketImpl = webSocketImpl
    this.onEvent = onEvent
    this.socket = null
    this.state = getInitialSocketState()
    this.lastRequestId = 0
    this.pendingRequests = new Map()
  }

  getState() {
    return {...this.state}
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
        reject(new OgsError('network', this.state.error))
        return
      }

      this.socket = socket

      socket.onopen = async () => {
        if (this.socket !== socket) return

        try {
          console.log('[ogs:socket] open')
          this.state = {status: 'connected', authenticated: false, error: null}
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
          this.rejectPendingRequests(new OgsError('network', this.state.error))
          finish(() => reject(new OgsError('network', this.state.error)))
          return
        }

        if (this.state.status !== 'error') {
          this.state = getInitialSocketState()
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
  } = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
    this.socket = new OgsSocket({
      serverUrl: this.serverUrl,
      webSocketImpl,
      onEvent: (event, payload) => this.handleSocketEvent(event, payload),
    })
    this.session = null
    this.matchmaking = getInitialMatchmakingState()
    this.onlineGame = getInitialOnlineGameState()
    this.pendingClocks = new Map()
    this.activeGames = getInitialActiveGamesState()
  }

  getSession() {
    return this.session == null ? null : this.session.user
  }

  getState() {
    return {
      user: this.getSession(),
      socket: this.socket.getState(),
      matchmaking: {...this.matchmaking},
      onlineGame: cloneOnlineGameState(this.onlineGame),
      activeGames: this.activeGames.map(cloneActiveGameState),
    }
  }

  logout() {
    this.socket.disconnect()
    this.session = null
    this.matchmaking = getInitialMatchmakingState()
    this.onlineGame = getInitialOnlineGameState()
    this.pendingClocks = new Map()
    this.activeGames = getInitialActiveGamesState()
    return true
  }

  async login({username, password}) {
    assertLoginInput(username, password)
    this.logout()

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

    await this.socket.connect(jwtToken)

    this.session = {jwtToken, user}

    return user
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
    this.pendingClocks = new Map()

    this.socket.send('game/connect', {game_id: gameId, chat: true})

    return this.getState()
  }

  disconnectGame(input = {}) {
    let gameId = sanitizeGameId(input.gameId ?? this.onlineGame.gameId)
    this.assertAuthenticatedSocket()

    this.socket.send('game/disconnect', {game_id: gameId})

    if (this.onlineGame.gameId === gameId) {
      this.onlineGame = getInitialOnlineGameState()
      this.pendingClocks = new Map()
    }

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

    return this.getState()
  }

  pass(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    this.assertCanPlayGameCommand(gameId)
    this.socket.send('game/move', {game_id: gameId, move: '..'})
    this.onlineGame = {...this.onlineGame, pendingMove: true}

    return this.getState()
  }

  resign(input = {}) {
    let gameId = sanitizeGameId(input.gameId)

    this.assertCanPlayGameCommand(gameId, {requireTurn: false})
    this.socket.send('game/resign', {game_id: gameId})

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

    return this.getState()
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
    if (event === 'active_game') {
      this.upsertActiveGame(payload)
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
      }

      return
    }

    let match = /^game\/(\d+)\/(.+)$/.exec(event)
    if (match == null) return

    let gameId = sanitizeOptionalGameId(match[1])
    if (gameId == null || gameId !== this.onlineGame.gameId) return

    this.applyGameEvent(match[2], payload)
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
        this.applyPendingClock()
        break

      case 'data':
        this.onlineGame = {
          ...this.onlineGame,
          ...sanitizePartialGameData(payload, this.serverUrl, this.onlineGame),
          status: 'connected',
          error: null,
        }
        this.applyPendingClock()
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

  applyClock(clock) {
    if (isFutureClock(clock, this.onlineGame.moveCount)) {
      this.pendingClocks.set(clock.lastMove, clock)
      this.onlineGame = {
        ...this.onlineGame,
        status: 'connected',
        error: null,
      }
      return
    }

    if (!isCurrentClock(clock, this.onlineGame.moveCount)) {
      this.onlineGame = {
        ...this.onlineGame,
        status: 'connected',
        error: null,
      }
      return
    }

    this.pendingClocks.delete(clock?.lastMove)
    this.onlineGame = {
      ...this.onlineGame,
      status: 'connected',
      clock,
      error: null,
    }
  }

  applyPendingClock() {
    for (let lastMove of this.pendingClocks.keys()) {
      if (lastMove < this.onlineGame.moveCount)
        this.pendingClocks.delete(lastMove)
    }

    let clock = this.pendingClocks.get(this.onlineGame.moveCount)
    if (clock == null) return

    this.pendingClocks.delete(this.onlineGame.moveCount)
    this.onlineGame = {...this.onlineGame, clock}
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
  let has = (key) => Object.prototype.hasOwnProperty.call(data || {}, key)
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

function sanitizeMove(move) {
  return typeof move === 'string' && /^[a-z.]{2}$/.test(move) ? move : null
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

function setupOgsIpcHandlers(ipcMain, client = new OgsClient()) {
  ipcMain.handle('ogs:getSession', () => client.getSession())

  ipcMain.handle('ogs:getState', () => client.getState())

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
