function normalizeExternalUrl(url) {
  if (typeof url !== 'string') return null

  try {
    let parsed = new URL(url)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed.href
  } catch (err) {
    return null
  }
}

function openExternalUrl(shell, url) {
  let normalizedUrl = normalizeExternalUrl(url)

  if (normalizedUrl == null) return false

  return shell.openExternal(normalizedUrl)
}

module.exports = {
  normalizeExternalUrl,
  openExternalUrl,
}
