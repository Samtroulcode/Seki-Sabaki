const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_DIRECTORY_ENTRIES = 256
const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_PREVIEW_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_OPEN_BYTES = 16 * 1024 * 1024
const MAX_COUNT_DEPTH = 32
const MAX_COUNT_TOTAL = 100000

const COLLECTION_MANIFEST_FILENAME = 'collection.json'
const MAX_MANIFEST_BYTES = 64 * 1024
const COLLECTION_MANIFEST_FIELDS = [
  'id',
  'title',
  'author',
  'license',
  'source',
  'description',
]
const COLLECTION_TYPES = ['tsumego', 'games']

function canonicalizeRoot(root) {
  if (typeof root !== 'string' || root === '' || root.includes('\0')) {
    return {ok: false, code: 'invalid-root'}
  }

  let normalized = path.normalize(root)
  if (!path.isAbsolute(normalized)) return {ok: false, code: 'invalid-root'}

  try {
    return {ok: true, root: fs.realpathSync(normalized)}
  } catch (err) {
    return {ok: false, code: 'unresolvable'}
  }
}

function validateRoot(root) {
  let result = canonicalizeRoot(root)
  if (!result.ok) {
    // Preserve the legacy contract: a path that cannot be resolved (deleted or
    // unreadable folder) was reported as not-writable, not not-directory.
    if (result.code === 'unresolvable') return {ok: false, code: 'not-writable'}
    return result
  }

  try {
    if (!fs.statSync(result.root).isDirectory()) {
      return {ok: false, code: 'not-directory'}
    }

    let probe = path.join(
      result.root,
      `.seki-write-test-${process.pid}-${crypto.randomBytes(8).toString('hex')}`,
    )
    let descriptor = fs.openSync(probe, 'wx', 0o600)
    try {
      fs.writeSync(descriptor, 'seki')
    } finally {
      fs.closeSync(descriptor)
      fs.unlinkSync(probe)
    }

    return {ok: true, root: result.root}
  } catch (err) {
    return {ok: false, code: 'not-writable'}
  }
}

function validateRelativeTargetForRoot(rootResult, relativePath, expectedType) {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')) {
    return {ok: false, code: 'invalid-path'}
  }

  let candidate = path.resolve(rootResult.root, relativePath)
  let relative = path.relative(rootResult.root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {ok: false, code: 'invalid-path'}
  }

  try {
    let current = rootResult.root
    let parts = relative === '' ? [] : relative.split(path.sep)
    for (let part of parts) {
      current = path.join(current, part)
      if (fs.lstatSync(current).isSymbolicLink()) {
        return {ok: false, code: 'invalid-path'}
      }
    }

    let stats = fs.lstatSync(candidate)
    if (!expectedType(stats)) return {ok: false, code: 'not-directory'}
    let canonical = fs.realpathSync(candidate)
    let canonicalRelative = path.relative(rootResult.root, canonical)
    if (
      canonicalRelative.startsWith('..') ||
      path.isAbsolute(canonicalRelative)
    ) {
      return {ok: false, code: 'invalid-path'}
    }
    return {
      ok: true,
      root: rootResult.root,
      path: canonical,
      relative: canonicalRelative,
    }
  } catch (err) {
    return {ok: false, code: 'not-directory'}
  }
}

function validateRelativeTarget(root, relativePath = '', expectedType) {
  let rootResult = validateRoot(root)
  if (!rootResult.ok) return rootResult
  return validateRelativeTargetForRoot(rootResult, relativePath, expectedType)
}

// Same traversal/symlink protections as validateRelativeTarget, but without
// the writable probe: used for the read-only built-in library.
function validateReadOnlyRelativeTarget(root, relativePath = '', expectedType) {
  let rootResult = canonicalizeRoot(root)
  if (!rootResult.ok) return rootResult
  return validateRelativeTargetForRoot(rootResult, relativePath, expectedType)
}

function isSgfFile(filename) {
  let extension = path.extname(filename).toLowerCase()
  return extension === '.sgf' || extension === '.rsgf'
}

// Validates a relative path for a write operation inside the user library's
// Tsumego folder. The first segment must be exactly `Tsumego`; no segment may
// be empty, `.`, `..`, or carry a drive letter. Returns the split segments and
// the normalized `/`-joined path.
function validateTsumegoWritePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath === '') {
    return {ok: false, code: 'invalid-path'}
  }
  if (relativePath.includes('\0')) return {ok: false, code: 'invalid-path'}

  let segments = relativePath.split(/[\\/]/)
  if (segments[0] !== 'Tsumego') return {ok: false, code: 'outside-tsumego'}
  if (segments.length < 2) return {ok: false, code: 'invalid-path'}

  for (let segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      return {ok: false, code: 'invalid-path'}
    }
    if (/^[a-zA-Z]:/.test(segment)) return {ok: false, code: 'invalid-path'}
  }

  return {ok: true, segments, normalized: segments.join('/')}
}

function ensureTsumegoDirectory(root) {
  let tsumegoPath = path.join(root, 'Tsumego')
  try {
    let existing = fs.existsSync(tsumegoPath)
    if (existing) {
      let stats = fs.lstatSync(tsumegoPath)
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return {ok: false, code: 'tsumego-not-directory'}
      }
    } else {
      fs.mkdirSync(tsumegoPath)
    }
    let validation = validateRoot(tsumegoPath)
    return validation.ok
      ? {ok: true, path: validation.root}
      : {ok: false, code: 'tsumego-not-writable'}
  } catch (err) {
    return {ok: false, code: 'tsumego-not-writable'}
  }
}

function isContained(root, filePath) {
  let relative = path.relative(root, filePath)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

function readBoundedFile(filePath, maxBytes, root = null) {
  let readablePath = filePath
  if (root != null) {
    try {
      readablePath = fs.realpathSync(filePath)
      if (!isContained(root, readablePath)) return null
    } catch (err) {
      return null
    }
  }

  let flags = fs.constants.O_RDONLY
  if (fs.constants.O_NOFOLLOW != null) flags |= fs.constants.O_NOFOLLOW

  let descriptor
  try {
    descriptor = fs.openSync(readablePath, flags)
    let stats = fs.fstatSync(descriptor)
    if (!stats.isFile() || stats.size > maxBytes) return null
    let buffer = Buffer.alloc(maxBytes + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      let count = fs.readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      )
      if (count === 0) break
      bytesRead += count
    }
    if (bytesRead > maxBytes) return null
    return {
      content: buffer.subarray(0, bytesRead).toString('utf8'),
      size: bytesRead,
    }
  } catch (err) {
    return null
  } finally {
    if (descriptor != null) fs.closeSync(descriptor)
  }
}

// Parses the optional collection.json manifest of a built-in collection
// folder. Only the recognized fields are returned; unknown fields (including
// `readOnly`, which is deliberately never honored: built-in collections are
// always read-only by nature) are ignored. Paths in the manifest are never
// interpreted as filesystem paths.
function parseCollectionMetadata(content) {
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    return {ok: false, code: 'invalid-json', metadata: null}
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {ok: false, code: 'invalid-manifest', metadata: null}
  }

  if ('type' in parsed && !COLLECTION_TYPES.includes(parsed.type)) {
    return {ok: false, code: 'invalid-type', metadata: null}
  }

  let metadata = {}
  for (let field of COLLECTION_MANIFEST_FIELDS) {
    let value = parsed[field]
    if (typeof value === 'string' && value !== '') metadata[field] = value
  }
  if (COLLECTION_TYPES.includes(parsed.type)) metadata.type = parsed.type

  return {ok: true, metadata}
}

// Reads the manifest of a built-in collection folder, or reports its absence.
function readCollectionManifest(root, directoryPath) {
  let manifestPath = path.join(directoryPath, COLLECTION_MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return {ok: true, metadata: null}

  let file = readBoundedFile(manifestPath, MAX_MANIFEST_BYTES, root)
  if (file == null) {
    return {ok: false, code: 'manifest-unreadable', metadata: null}
  }
  return parseCollectionMetadata(file.content)
}

// Resolves the read-only built-in library root. In a packaged build it lives
// under the app's real resources directory (shipped via extraResources); in
// development it is read directly from the repository's resources/library.
function resolveBuiltinRoot({
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  appPath = path.resolve(__dirname, '..'),
  exists = fs.existsSync,
} = {}) {
  let candidates = []
  if (typeof resourcesPath === 'string' && resourcesPath !== '') {
    let bundledPath = path.join(resourcesPath, 'library')
    if (isPackaged || exists(bundledPath)) {
      candidates.push(bundledPath)
    }
  }
  candidates.push(path.join(appPath, 'resources', 'library'))

  for (let candidate of candidates) {
    let result = canonicalizeRoot(candidate)
    if (result.ok) return result
  }
  return {ok: false, code: 'builtin-unavailable'}
}

function listDirectory(root, relativePath, source, validateTarget) {
  let directory = validateTarget(root, relativePath, (stats) =>
    stats.isDirectory(),
  )
  if (!directory.ok) return {...directory, entries: []}

  try {
    let directoryEntries = fs
      .readdirSync(directory.path, {withFileTypes: true})
      .filter(
        (entry) =>
          (entry.isDirectory() && !entry.isSymbolicLink()) ||
          (entry.isFile() && isSgfFile(entry.name)),
      )
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory()
          ? a.name.localeCompare(b.name)
          : a.isDirectory()
            ? -1
            : 1,
      )
    let truncated = directoryEntries.length > MAX_DIRECTORY_ENTRIES
    directoryEntries = directoryEntries.slice(0, MAX_DIRECTORY_ENTRIES)
    let previewBytes = 0
    let entries = directoryEntries
      .map((entry) => {
        let entryPath = path.join(directory.path, entry.name)
        let stats = fs.statSync(entryPath)
        let previewContent = null
        if (
          entry.isFile() &&
          stats.size <= MAX_PREVIEW_BYTES &&
          previewBytes + stats.size <= MAX_PREVIEW_TOTAL_BYTES
        ) {
          let preview = readBoundedFile(entryPath, MAX_PREVIEW_BYTES, root)
          if (preview != null) {
            previewContent = preview.content
            previewBytes += preview.size
          }
        }
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          relativePath: path.relative(root, entryPath),
          modifiedAt: stats.mtimeMs,
          size: entry.isFile() ? stats.size : null,
          previewContent,
          source,
        }
      })
      .sort((a, b) =>
        a.type === b.type
          ? a.name.localeCompare(b.name)
          : a.type === 'directory'
            ? -1
            : 1,
      )

    return {ok: true, entries, truncated}
  } catch (err) {
    return {ok: false, code: 'read-failed', entries: []}
  }
}

// Counts SGF files under a directory, recursively, without reading any file
// content — only the directory structure is walked. Symlinks are skipped so a
// cycle cannot recurse forever; depth and total caps bound pathological trees.
function countSgfFilesRecursively(directoryPath, depth = 0) {
  if (depth > MAX_COUNT_DEPTH) return 0
  let count = 0
  let entries
  try {
    entries = fs.readdirSync(directoryPath, {withFileTypes: true})
  } catch (err) {
    return 0
  }
  for (let entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      count += countSgfFilesRecursively(
        path.join(directoryPath, entry.name),
        depth + 1,
      )
    } else if (entry.isFile() && isSgfFile(entry.name)) {
      count += 1
    }
    if (count > MAX_COUNT_TOTAL) return MAX_COUNT_TOTAL
  }
  return count
}

exports.create = function (setting, dialog, options = {}) {
  function resolveBuiltin() {
    let builtin = options.builtin
    if (typeof builtin === 'string') {
      return canonicalizeRoot(builtin)
    }
    return resolveBuiltinRoot(typeof builtin === 'object' ? builtin : undefined)
  }

  function getConfig() {
    let result = validateRoot(setting.get('library.root'))
    return result.ok
      ? {configured: true, root: result.root}
      : {configured: false, root: null, error: result.code}
  }

  function list(relativePath = '') {
    let config = getConfig()
    if (!config.configured)
      return {ok: false, code: 'not-configured', entries: []}

    return listDirectory(
      config.root,
      relativePath,
      'user',
      validateRelativeTarget,
    )
  }

  function listBuiltin(relativePath = '') {
    let rootResult = resolveBuiltin()
    if (!rootResult.ok) return {ok: false, code: rootResult.code, entries: []}

    return listDirectory(
      rootResult.root,
      relativePath,
      'builtin',
      validateReadOnlyRelativeTarget,
    )
  }

  function open(relativePath) {
    let config = getConfig()
    if (!config.configured) return {ok: false, code: 'not-configured'}
    if (typeof relativePath !== 'string' || !isSgfFile(relativePath)) {
      return {ok: false, code: 'invalid-file'}
    }

    let target = validateRelativeTarget(config.root, relativePath, (stats) =>
      stats.isFile(),
    )
    if (!target.ok) return {ok: false, code: 'invalid-file'}

    try {
      let file = readBoundedFile(target.path, MAX_OPEN_BYTES, config.root)
      if (file == null) return {ok: false, code: 'invalid-file'}
      return {
        ok: true,
        content: file.content,
        path: target.path,
        source: 'user',
      }
    } catch (err) {
      return {ok: false, code: 'read-failed'}
    }
  }

  function openBuiltin(relativePath) {
    let rootResult = resolveBuiltin()
    if (!rootResult.ok) return {ok: false, code: rootResult.code}
    if (typeof relativePath !== 'string' || !isSgfFile(relativePath)) {
      return {ok: false, code: 'invalid-file'}
    }

    let target = validateReadOnlyRelativeTarget(
      rootResult.root,
      relativePath,
      (stats) => stats.isFile(),
    )
    if (!target.ok) return {ok: false, code: 'invalid-file'}

    try {
      let file = readBoundedFile(target.path, MAX_OPEN_BYTES, rootResult.root)
      if (file == null) return {ok: false, code: 'invalid-file'}
      return {
        ok: true,
        content: file.content,
        path: target.path,
        source: 'builtin',
      }
    } catch (err) {
      return {ok: false, code: 'read-failed'}
    }
  }

  function getBuiltinCollectionMetadata(relativePath) {
    let rootResult = resolveBuiltin()
    if (!rootResult.ok)
      return {ok: false, code: rootResult.code, metadata: null}

    let directory = validateReadOnlyRelativeTarget(
      rootResult.root,
      relativePath,
      (stats) => stats.isDirectory(),
    )
    if (!directory.ok) return {...directory, metadata: null}

    return readCollectionManifest(rootResult.root, directory.path)
  }

  // Counts SGF problems under a directory (recursively) for progress
  // statistics. Never reads file contents.
  function countProblems(source, relativePath = '') {
    let rootResult
    let validateTarget
    if (source === 'builtin') {
      rootResult = resolveBuiltin()
      validateTarget = validateReadOnlyRelativeTarget
    } else if (source === 'user') {
      let config = getConfig()
      if (!config.configured)
        return {ok: false, code: 'not-configured', count: 0}
      rootResult = {ok: true, root: config.root}
      validateTarget = validateRelativeTarget
    } else {
      return {ok: false, code: 'invalid-source', count: 0}
    }
    if (!rootResult.ok) return {ok: false, code: rootResult.code, count: 0}

    let directory = validateTarget(rootResult.root, relativePath, (stats) =>
      stats.isDirectory(),
    )
    if (!directory.ok) return {...directory, count: 0}

    return {ok: true, count: countSgfFilesRecursively(directory.path)}
  }

  // Writes an SGF file into the user library, always under `Tsumego`. The
  // path is validated segment by segment (no traversal, no absolute path, no
  // symlinked directories) and the write is atomic: a temp file is written in
  // the destination directory and renamed over the target, so an interruption
  // cannot leave a partially written file behind. An existing file is only
  // replaced when `overwrite` is explicitly requested.
  function saveFile(relativePath, content, {overwrite = false} = {}) {
    let config = getConfig()
    if (!config.configured) return {ok: false, code: 'not-configured'}
    if (typeof content !== 'string') return {ok: false, code: 'invalid-content'}

    let pathResult = validateTsumegoWritePath(relativePath)
    if (!pathResult.ok) return pathResult
    if (!isSgfFile(relativePath)) return {ok: false, code: 'invalid-file'}

    let tsumego = ensureTsumegoDirectory(config.root)
    if (!tsumego.ok) return tsumego

    let directory = validateRelativeTarget(
      config.root,
      pathResult.segments.slice(0, -1).join('/'),
      (stats) => stats.isDirectory(),
    )
    if (!directory.ok) return {ok: false, code: 'invalid-directory'}

    let filename = pathResult.segments[pathResult.segments.length - 1]
    let targetPath = path.join(directory.path, filename)

    try {
      let stats = fs.lstatSync(targetPath)
      if (stats.isSymbolicLink()) return {ok: false, code: 'invalid-file'}
      if (!stats.isFile()) return {ok: false, code: 'invalid-file'}
      if (!overwrite) return {ok: false, exists: true}
    } catch (err) {
      // The target does not exist yet — a fresh save.
    }

    let tempPath = path.join(
      directory.path,
      `.${filename}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
    )
    try {
      fs.writeFileSync(tempPath, content, {mode: 0o644})
      fs.renameSync(tempPath, targetPath)
    } catch (err) {
      try {
        fs.unlinkSync(tempPath)
      } catch (cleanupErr) {
        // The temp file may never have been created.
      }
      return {ok: false, code: 'write-failed'}
    }

    return {ok: true, relativePath: pathResult.normalized}
  }

  // Creates a directory inside the user library's `Tsumego` folder. The
  // parent must already exist (folders are created one level at a time by the
  // picker). An existing directory is reported as `exists` so the UI can show
  // a clear message instead of silently reusing it.
  function createDirectory(relativePath) {
    let config = getConfig()
    if (!config.configured) return {ok: false, code: 'not-configured'}

    let pathResult = validateTsumegoWritePath(relativePath)
    if (!pathResult.ok) return pathResult

    let tsumego = ensureTsumegoDirectory(config.root)
    if (!tsumego.ok) return tsumego

    let directory = validateRelativeTarget(
      config.root,
      pathResult.segments.slice(0, -1).join('/'),
      (stats) => stats.isDirectory(),
    )
    if (!directory.ok) return {ok: false, code: 'invalid-directory'}

    let name = pathResult.segments[pathResult.segments.length - 1]
    let targetPath = path.join(directory.path, name)

    try {
      let stats = fs.lstatSync(targetPath)
      if (stats.isSymbolicLink()) return {ok: false, code: 'invalid-path'}
      if (stats.isDirectory()) return {ok: false, exists: true}
      return {ok: false, code: 'invalid-path'}
    } catch (err) {
      // The directory does not exist yet.
    }

    try {
      fs.mkdirSync(targetPath)
    } catch (err) {
      return {ok: false, code: 'mkdir-failed'}
    }

    return {ok: true, relativePath: pathResult.normalized}
  }

  async function chooseRoot(window) {
    let result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    })
    let selected = result?.filePaths?.[0]
    if (selected == null) return {ok: false, cancelled: true}

    let validation = validateRoot(selected)
    if (!validation.ok) return validation

    let tsumego = ensureTsumegoDirectory(validation.root)
    if (!tsumego.ok) return tsumego

    setting.set('library.root', validation.root)
    return {ok: true, root: validation.root, tsumegoRoot: tsumego.path}
  }

  return {
    getConfig,
    chooseRoot,
    list,
    open,
    listBuiltin,
    openBuiltin,
    getBuiltinCollectionMetadata,
    countProblems,
    saveFile,
    createDirectory,
  }
}

exports.validateRoot = validateRoot
exports.resolveBuiltinRoot = resolveBuiltinRoot
exports.parseCollectionMetadata = parseCollectionMetadata
exports.validateTsumegoWritePath = validateTsumegoWritePath
