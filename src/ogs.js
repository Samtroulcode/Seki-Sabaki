const DEFAULT_SERVER_URL = 'https://beta.online-go.com'
const USER_AGENT = 'Seki-Sabaki/0.1'

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

class OgsClient {
  constructor({
    serverUrl = DEFAULT_SERVER_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
    this.session = null
  }

  getSession() {
    return this.session == null ? null : this.session.user
  }

  logout() {
    this.session = null
    return true
  }

  async login({username, password}) {
    assertLoginInput(username, password)

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
    this.session = {jwtToken, user}

    return user
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

  ipcMain.handle('ogs:logout', () => client.logout())

  ipcMain.handle('ogs:login', async (evt, credentials) => {
    try {
      return {
        ok: true,
        user: await client.login(credentials || {}),
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
  OgsClient,
  OgsError,
  ratingToRank,
  sanitizeUser,
  setupOgsIpcHandlers,
}
