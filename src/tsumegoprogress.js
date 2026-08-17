const fs = require('fs')
const path = require('path')

const STORE_VERSION = 1
const STORE_FILENAME = 'tsumego-progress.json'
const SOURCES = ['builtin', 'user']

// Builds the canonical progress key for a tsumego problem:
// `${source}:${relativePath}` with `/` separators. The key is an opaque
// identity string only — it is never used to access a file. Returns `null`
// for an unknown source, an empty path, an absolute path, or a path that
// escapes its source (traversal or drive-letter segments).
function normalizeProblemKey(source, relativePath) {
  if (typeof source !== 'string' || !SOURCES.includes(source)) return null
  if (typeof relativePath !== 'string' || relativePath === '') return null
  if (relativePath.includes('\0')) return null

  let segments = relativePath.split(/[\\/]/)
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    return null
  }

  let normalized = segments.join('/')
  if (/^[a-zA-Z]:/.test(normalized)) return null
  return `${source}:${normalized}`
}

// Validates a key read back from the store file. The key must already be in
// canonical form; anything else (unknown source, traversal, backslash
// separators, absolute path) is rejected so a hand-edited or foreign file
// cannot smuggle in a non-canonical entry.
function normalizeStoredKey(key) {
  if (typeof key !== 'string') return null
  let index = key.indexOf(':')
  if (index <= 0) return null
  let source = key.slice(0, index)
  let relativePath = key.slice(index + 1)
  let normalized = normalizeProblemKey(source, relativePath)
  return normalized === key ? normalized : null
}

// Parses the store file content into a normalized progress object. Tolerant:
// missing/corrupt JSON, an unknown version, and invalid entries all degrade to
// an empty progress instead of throwing. Unknown properties are ignored.
function parseProgressFile(content) {
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    return {version: STORE_VERSION, problems: {}}
  }

  if (
    parsed == null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.version !== STORE_VERSION
  ) {
    return {version: STORE_VERSION, problems: {}}
  }

  let problems = {}
  if (
    parsed.problems != null &&
    typeof parsed.problems === 'object' &&
    !Array.isArray(parsed.problems)
  ) {
    for (let [key, entry] of Object.entries(parsed.problems)) {
      if (normalizeStoredKey(key) == null) continue
      if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
        continue
      }
      if (entry.completed !== true) continue
      let completedAt =
        typeof entry.completedAt === 'string' && entry.completedAt !== ''
          ? entry.completedAt
          : new Date().toISOString()
      problems[key] = {completed: true, completedAt}
    }
  }

  return {version: STORE_VERSION, problems}
}

// Pure mutation: marks `key` completed. Idempotent — when the problem is
// already completed the same object is returned unchanged (so the caller can
// skip a write and never overwrite the original `completedAt`).
function markProblemCompleted(
  progress,
  key,
  completedAt = new Date().toISOString(),
) {
  let existing = progress.problems[key]
  if (existing != null && existing.completed === true) return progress
  return {
    version: progress.version,
    problems: {...progress.problems, [key]: {completed: true, completedAt}},
  }
}

class TsumegoProgressStore {
  constructor({storagePath}) {
    if (typeof storagePath !== 'string' || storagePath === '') {
      throw new Error('TsumegoProgressStore requires a storagePath')
    }
    this.storagePath = storagePath
    this.progress = {version: STORE_VERSION, problems: {}}
  }

  // Reads the store file. Any failure (missing file, unreadable, corrupt)
  // leaves an empty progress; the store never crashes on load.
  load() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        this.progress = {version: STORE_VERSION, problems: {}}
        return this.getAll()
      }
      let content = fs.readFileSync(this.storagePath, 'utf8')
      this.progress = parseProgressFile(content)
    } catch (err) {
      this.progress = {version: STORE_VERSION, problems: {}}
    }
    return this.getAll()
  }

  getAll() {
    return {
      version: this.progress.version,
      problems: {...this.progress.problems},
    }
  }

  markCompleted(source, relativePath, completedAt = new Date().toISOString()) {
    let key = normalizeProblemKey(source, relativePath)
    if (key == null) throw new Error('Invalid tsumego problem key')

    let next = markProblemCompleted(this.progress, key, completedAt)
    if (next !== this.progress) {
      this.progress = next
      this.save()
    }
    return {key, completedAt: this.progress.problems[key].completedAt}
  }

  // Atomic write: write to a temp file then rename over the final path, so an
  // interruption cannot leave a partially written store file behind.
  save() {
    let directory = path.dirname(this.storagePath)
    fs.mkdirSync(directory, {recursive: true})
    let tempPath = `${this.storagePath}.tmp`
    fs.writeFileSync(tempPath, `${JSON.stringify(this.progress, null, 2)}\n`, {
      mode: 0o600,
    })
    fs.renameSync(tempPath, this.storagePath)
  }
}

function setupTsumegoProgressIpcHandlers(
  ipcMain,
  store,
  {isTrusted = () => false} = {},
) {
  ipcMain.handle('tsumegoProgress:getAll', (event) => {
    if (!isTrusted(event)) throw new Error('Untrusted renderer')
    return store.getAll()
  })
  ipcMain.handle(
    'tsumegoProgress:markCompleted',
    (event, source, relativePath) => {
      if (!isTrusted(event)) throw new Error('Untrusted renderer')
      return store.markCompleted(source, relativePath)
    },
  )
}

function createTsumegoProgressStore({userDataDirectory = null} = {}) {
  if (typeof userDataDirectory !== 'string' || userDataDirectory === '') {
    throw new Error('TsumegoProgressStore requires a userDataDirectory')
  }
  return new TsumegoProgressStore({
    storagePath: path.join(userDataDirectory, STORE_FILENAME),
  })
}

module.exports = {
  STORE_VERSION,
  STORE_FILENAME,
  normalizeProblemKey,
  parseProgressFile,
  markProblemCompleted,
  TsumegoProgressStore,
  setupTsumegoProgressIpcHandlers,
  createTsumegoProgressStore,
}
