const {OgsError} = require('./errors.js')

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
  let cookiesByName = new Map()

  for (let cookie of setCookies) {
    let pair = cookie.split(';')[0].trim()
    if (pair === '') continue

    let separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue

    let name = pair.slice(0, separatorIndex).trim()
    let value = pair.slice(separatorIndex + 1).trim()
    if (name === '') continue

    // Keep the latest value for each cookie name. OGS may rotate csrftoken
    // and sessionid between config and login responses.
    cookiesByName.set(name, `${name}=${value}`)
  }

  return [...cookiesByName.values()].join('; ')
}

function normalizeCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim() === '')
    return null

  let normalized = getCookieHeader(cookieHeader.split(';'))
  return normalized === '' ? null : normalized
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

module.exports = {
  assertLoginInput,
  extractSetCookie,
  getCookieHeader,
  normalizeCookieHeader,
  assertOk,
}
