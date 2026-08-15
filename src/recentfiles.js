const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_ENTRIES = 8
const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_OPEN_BYTES = 16 * 1024 * 1024

function normalizeFilePath(filePath) {
  if (
    typeof filePath !== 'string' ||
    filePath === '' ||
    filePath.includes('\0')
  ) {
    return null
  }

  let normalized = path.normalize(filePath)
  return path.isAbsolute(normalized) ? normalized : null
}

function getFileInfo(filePath) {
  let normalized = normalizeFilePath(filePath)
  if (normalized == null) return null

  try {
    let canonicalPath = fs.realpathSync(normalized)
    let stats = fs.statSync(canonicalPath)
    if (!stats.isFile()) return null
    return {path: canonicalPath, size: stats.size}
  } catch (err) {
    return null
  }
}

function isSgfPath(filePath) {
  let extension = path.extname(filePath).toLowerCase()
  return extension === '.sgf' || extension === '.rsgf'
}

function getPathKey(filePath) {
  let normalized = normalizeFilePath(filePath)
  if (normalized == null) return null
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function getEntryId(filePath) {
  return crypto
    .createHash('sha256')
    .update(getPathKey(filePath) || '')
    .digest('hex')
    .slice(0, 16)
}

function readStoredEntries(setting) {
  let stored = setting.get('app.recent_files')
  if (!Array.isArray(stored)) return []

  let entries = []
  let keys = new Set()
  for (let value of stored) {
    let info = getFileInfo(value?.path)
    let timestamp = Number(value?.lastOpenedAt)
    let key =
      info == null || !isSgfPath(info.path) ? null : getPathKey(info.path)
    if (
      info == null ||
      key == null ||
      keys.has(key) ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0
    ) {
      continue
    }

    keys.add(key)
    entries.push({path: info.path, lastOpenedAt: timestamp})
  }

  return entries
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_ENTRIES)
}

function serializeEntries(entries) {
  return entries.map(({path: filePath, lastOpenedAt}) => ({
    path: filePath,
    lastOpenedAt,
  }))
}

function readPreview(filePath, size) {
  if (size > MAX_PREVIEW_BYTES) return null

  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    return null
  }
}

exports.create = function (setting) {
  function list() {
    let entries = readStoredEntries(setting)
    let serialized = JSON.stringify(serializeEntries(entries))
    if (JSON.stringify(setting.get('app.recent_files')) !== serialized) {
      setting.set('app.recent_files', serializeEntries(entries))
    }

    return entries.map((entry) => {
      let info = getFileInfo(entry.path)
      return {
        id: getEntryId(entry.path),
        filename: path.basename(entry.path),
        lastOpenedAt: entry.lastOpenedAt,
        previewContent:
          info == null ? null : readPreview(entry.path, info.size),
      }
    })
  }

  function add(filePath) {
    let info = getFileInfo(filePath)
    if (info == null || !isSgfPath(info.path)) return list()

    let entries = readStoredEntries(setting).filter(
      (entry) => getPathKey(entry.path) !== getPathKey(info.path),
    )
    entries.unshift({path: info.path, lastOpenedAt: Date.now()})
    setting.set(
      'app.recent_files',
      serializeEntries(entries.slice(0, MAX_ENTRIES)),
    )
    return list()
  }

  function open(id) {
    if (typeof id !== 'string' || id.length !== 16) return null

    let entry = readStoredEntries(setting).find(
      (candidate) => getEntryId(candidate.path) === id,
    )
    if (entry == null) return null

    let info = getFileInfo(entry.path)
    if (info == null || info.size > MAX_OPEN_BYTES) return null

    try {
      return {
        content: fs.readFileSync(entry.path, 'utf8'),
        filename: path.basename(entry.path),
        path: entry.path,
      }
    } catch (err) {
      return null
    }
  }

  return {list, add, open}
}

exports.MAX_ENTRIES = MAX_ENTRIES
