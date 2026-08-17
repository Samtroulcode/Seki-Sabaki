const LAST_COLLECTION_KEY = 'tsumego.last_collection'

// Normalizes a relative path to a canonical forward-slash form, dropping empty
// segments (leading/trailing slashes, doubled separators).
export function normalizeRelativePath(relativePath) {
  return String(relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .join('/')
}

// Validates a stored/requested collection value. The value is treated as
// untrusted: only `builtin`/`user` sources and relative paths without
// traversal are accepted. Filesystem existence is left to the Library APIs.
export function isValidCollection(value) {
  if (value == null || typeof value !== 'object') return false
  if (value.source !== 'builtin' && value.source !== 'user') return false

  let parts = String(value.relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
  if (parts.length === 0) return false
  if (parts.some((part) => part === '..' || part === '.')) return false

  return true
}

// Persists the last opened Tsumego collection as a UI/navigation preference.
// Returns false and stores nothing when the value is invalid.
export function setLastTsumegoCollection(value) {
  if (!isValidCollection(value)) return false

  window.sabaki.setting.set(LAST_COLLECTION_KEY, {
    source: value.source,
    relativePath: normalizeRelativePath(value.relativePath),
  })
  return true
}

// Reads the last opened Tsumego collection. Returns a validated
// {source, relativePath} object, or null when absent or invalid.
export function getLastTsumegoCollection() {
  let value = window.sabaki.setting.get(LAST_COLLECTION_KEY)
  if (!isValidCollection(value)) return null

  return {
    source: value.source,
    relativePath: normalizeRelativePath(value.relativePath),
  }
}
