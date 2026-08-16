const {OgsError} = require('./errors.js')
const {ratingToRank, rankNumberToRank} = require('./ranks.js')
const {
  sanitizeNumber,
  sanitizeOptionalGameId,
  sanitizeString,
} = require('./sanitize.js')

function getDefaultAllowedIconOrigins(serverUrl) {
  try {
    let server = new URL(serverUrl)

    // OGS serves uploaded avatars from a dedicated subdomain, separate from
    // the main site origin. Verified against https://online-go.com/api/v1/
    // players/{id}/ returning icons hosted on user-uploads.online-go.com.
    return [`https://user-uploads.${server.hostname}`]
  } catch (err) {
    return []
  }
}

function resolveOgsUrl(serverUrl, value) {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    let server = new URL(serverUrl)
    let url = new URL(value, server)

    if (url.protocol !== 'https:') return null

    let allowedOrigins = new Set([
      server.origin,
      ...getDefaultAllowedIconOrigins(serverUrl),
    ])

    if (!allowedOrigins.has(url.origin)) return null

    return url.toString()
  } catch (err) {
    return null
  }
}

function sanitizeUser(serverUrl, user) {
  if (user == null || typeof user !== 'object') {
    throw new OgsError('invalid-response', 'OGS login response is invalid.')
  }

  let rating = user.ratings?.overall?.rating ?? user.rating ?? user.elo
  let rank = sanitizeString(user.rank, 20) || rankNumberToRank(user.ranking)
  let icon = user.icon || user.icon_url || user.picture || user.avatar || null

  return {
    id: user.id == null ? null : String(user.id),
    username: typeof user.username === 'string' ? user.username : '',
    rank: rank || ratingToRank(rating),
    rating:
      typeof rating === 'number' && Number.isFinite(rating) ? rating : null,
    iconUrl: resolveOgsUrl(serverUrl, icon),
    online: true,
  }
}

function sanitizePlayers(players, serverUrl) {
  if (players == null || typeof players !== 'object') return null

  return {
    black: sanitizePlayer(players.black, serverUrl),
    white: sanitizePlayer(players.white, serverUrl),
  }
}

function sanitizePlayer(player, serverUrl) {
  if (player == null || typeof player !== 'object') return null

  let rating = player.ratings?.overall?.rating ?? player.rating ?? player.elo
  let rank =
    sanitizeString(player.rank, 20) ||
    rankNumberToRank(player.ranking) ||
    rankNumberToRank(player.rank) ||
    ratingToRank(rating)
  let icon =
    player.icon || player.icon_url || player.picture || player.avatar || null

  return {
    id: sanitizeOptionalGameId(player.id),
    username: sanitizeString(player.username || player.name, 80),
    rank,
    rating: sanitizeNumber(rating),
    iconUrl: resolveOgsUrl(serverUrl, icon),
  }
}

function sanitizeFriends(friends, serverUrl) {
  if (!Array.isArray(friends)) return []

  let sanitized = []

  for (let friend of friends) {
    let player = sanitizePlayer(friend, serverUrl)
    if (player == null || player.id == null) continue

    // Online status is unknown until a `user/state` socket event arrives
    // for this friend (see `user/monitor` in the goban protocol).
    sanitized.push({...player, online: null})
  }

  return sanitized
}

module.exports = {
  resolveOgsUrl,
  sanitizeUser,
  sanitizePlayers,
  sanitizePlayer,
  sanitizeFriends,
}
