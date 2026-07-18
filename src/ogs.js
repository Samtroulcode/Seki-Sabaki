const {randomUUID} = require('crypto')

const DEFAULT_SERVER_URL = 'https://beta.online-go.com'
const USER_AGENT = 'Seki-Sabaki/0.1'
const DEFAULT_MATCHMAKING_OPTIONS = {
  boardSizes: [19],
  speeds: ['rapid'],
  timeSystem: 'byoyomi',
  lowerRankDiff: 3,
  upperRankDiff: 3,
  rules: {condition: 'required', value: 'japanese'},
  handicap: {condition: 'preferred', value: 'enabled'},
}
const AUTOMATCH_BOARD_SIZES = [9, 13, 19]
const AUTOMATCH_SPEEDS = ['blitz', 'rapid', 'live', 'correspondence']
const AUTOMATCH_TIME_SYSTEMS = ['fischer', 'byoyomi']
const AUTOMATCH_CONDITIONS = ['required', 'preferred', 'no-preference']
const AUTOMATCH_RULES = ['chinese', 'aga', 'japanese', 'korean', 'ing', 'nz']
const AUTOMATCH_HANDICAP_VALUES = ['enabled', 'disabled']

class OgsError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'OgsError'
    this.code = code
  }
}

function assertLoginInput(username, password) {
  if (typeof username !== 'string' || username.trim() === '') {
    throw new OgsError('invalid-input', 'Username is required.')
  }

  if (username.length > 200) {
    throw new OgsError('invalid-input', 'Username is too long.')
  }

  if (typeof password !== 'string' || password === '') {
    throw new OgsError('invalid-input', 'Password is required.')
  }

  if (password.length > 1000) {
    throw new OgsError('invalid-input', 'Password is too long.')
  }
}

function extractSetCookie(headers) {
  if (headers == null) return []

  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()

  let cookie = headers.get && headers.get('set-cookie')
  return cookie == null ? [] : [cookie]
}

function getCookieHeader(setCookies) {
  return setCookies
    .map((cookie) => cookie.split(';')[0].trim())
    .filter((cookie) => cookie !== '')
    .join('; ')
}

function ratingToRank(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null

  let clippedRating = Math.min(Math.max(rating, 100), 6000)
  let rank = Math.round(Math.log(clippedRating / 525) * 23.15)
  rank = Math.min(Math.max(rank, 0), 38)

  if (rank < 30) return `${30 - rank}k`
  return `${rank - 29}d`
}

function resolveOgsUrl(serverUrl, value) {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    let server = new URL(serverUrl)
    let url = new URL(value, server)

    if (url.protocol !== 'https:' || url.origin !== server.origin) return null

    return url.toString()
  } catch (err) {
    return null
  }
}

function sanitizeUser(serverUrl, user) {
  if (user == null || typeof user !== 'object') {
    throw new OgsError('invalid-response', 'OGS login response is invalid.')
  }

  let rating = user.ratings?.overall?.rating ?? user.ranking
  let icon = user.icon || user.icon_url || user.picture || user.avatar || null

  return {
    id: user.id == null ? null : String(user.id),
    username: typeof user.username === 'string' ? user.username : '',
    rank: ratingToRank(rating),
    rating:
      typeof rating === 'number' && Number.isFinite(rating) ? rating : null,
    iconUrl: resolveOgsUrl(serverUrl, icon),
    online: true,
  }
}

function getInitialSocketState() {
  return {
    status: 'disconnected',
    authenticated: false,
    error: null,
  }
}

function getInitialMatchmakingState() {
  return {
    status: 'idle',
    options: DEFAULT_MATCHMAKING_OPTIONS,
    payload: null,
    error: null,
  }
}

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
  constructor({serverUrl, webSocketImpl = globalThis.WebSocket}) {
    this.serverUrl = serverUrl
    this.WebSocketImpl = webSocketImpl
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
    this.socket = new OgsSocket({serverUrl: this.serverUrl, webSocketImpl})
    this.session = null
    this.matchmaking = getInitialMatchmakingState()
  }

  getSession() {
    return this.session == null ? null : this.session.user
  }

  getState() {
    return {
      user: this.getSession(),
      socket: this.socket.getState(),
      matchmaking: {...this.matchmaking},
    }
  }

  logout() {
    this.socket.disconnect()
    this.session = null
    this.matchmaking = getInitialMatchmakingState()
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
    this.matchmaking = {
      ...this.matchmaking,
      status: 'idle',
      options: sanitizeMatchmakingOptions(options),
      payload: null,
      error: null,
    }

    return this.getState()
  }

  logMockAutomatchRequest() {
    let payload = buildAutomatchPayload(this.matchmaking.options)

    this.matchmaking = {
      ...this.matchmaking,
      status: 'mock-logged',
      payload,
      error: null,
    }

    console.log('[ogs:automatch] mock find_match', JSON.stringify(payload))

    return this.getState()
  }
}

function sanitizeMatchmakingOptions(options = {}) {
  if (options == null || typeof options !== 'object') options = {}

  let boardSizes = sanitizeArrayOption(
    options.boardSizes,
    AUTOMATCH_BOARD_SIZES,
    DEFAULT_MATCHMAKING_OPTIONS.boardSizes,
  )
  let speeds = sanitizeArrayOption(
    options.speeds,
    AUTOMATCH_SPEEDS,
    DEFAULT_MATCHMAKING_OPTIONS.speeds,
  )
  let timeSystem = AUTOMATCH_TIME_SYSTEMS.includes(options.timeSystem)
    ? options.timeSystem
    : DEFAULT_MATCHMAKING_OPTIONS.timeSystem
  let lowerRankDiff = sanitizeRankDiff(
    options.lowerRankDiff,
    DEFAULT_MATCHMAKING_OPTIONS.lowerRankDiff,
  )
  let upperRankDiff = sanitizeRankDiff(
    options.upperRankDiff,
    DEFAULT_MATCHMAKING_OPTIONS.upperRankDiff,
  )
  let rules = sanitizeConditionValue(
    options.rules,
    AUTOMATCH_RULES,
    DEFAULT_MATCHMAKING_OPTIONS.rules,
  )
  let handicap = sanitizeConditionValue(
    options.handicap,
    AUTOMATCH_HANDICAP_VALUES,
    DEFAULT_MATCHMAKING_OPTIONS.handicap,
  )

  return {
    boardSizes,
    speeds,
    timeSystem,
    lowerRankDiff,
    upperRankDiff,
    rules,
    handicap,
  }
}

function sanitizeArrayOption(value, allowedValues, fallback) {
  if (!Array.isArray(value)) return [...fallback]

  let result = value.filter((item) => allowedValues.includes(item))
  return result.length === 0 ? [...fallback] : [...new Set(result)]
}

function sanitizeRankDiff(value, fallback) {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), 9) : fallback
}

function sanitizeConditionValue(value, allowedValues, fallback) {
  if (value == null || typeof value !== 'object') return {...fallback}

  return {
    condition: AUTOMATCH_CONDITIONS.includes(value.condition)
      ? value.condition
      : fallback.condition,
    value: allowedValues.includes(value.value) ? value.value : fallback.value,
  }
}

function buildAutomatchPayload(options = {}, {uuid = randomUUID()} = {}) {
  let sanitized = sanitizeMatchmakingOptions(options)

  return {
    uuid,
    size_speed_options: sanitized.boardSizes.flatMap((boardSize) =>
      sanitized.speeds.map((speed) => ({
        size: `${boardSize}x${boardSize}`,
        speed,
        system: sanitized.timeSystem,
      })),
    ),
    lower_rank_diff: sanitized.lowerRankDiff,
    upper_rank_diff: sanitized.upperRankDiff,
    rules: sanitized.rules,
    handicap: sanitized.handicap,
    timestamp: Date.now(),
  }
}

async function assertOk(response, step) {
  if (response?.ok) return

  if (step === 'login' && [400, 401, 403].includes(response?.status)) {
    throw new OgsError(
      'invalid-credentials',
      'Invalid OGS username or password.',
    )
  }

  throw new OgsError('network', `OGS ${step} request failed.`)
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

  ipcMain.handle('ogs:logMockAutomatchRequest', () =>
    client.logMockAutomatchRequest(),
  )

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
