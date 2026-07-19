const {OgsError} = require('./errors.js')
const {ratingToRank, rankNumberToRank} = require('./ranks.js')
const {
  sanitizeNumber,
  sanitizeOptionalGameId,
  sanitizeString,
} = require('./sanitize.js')

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

module.exports = {
  resolveOgsUrl,
  sanitizeUser,
  sanitizePlayers,
  sanitizePlayer,
}
