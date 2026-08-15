const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_DIRECTORY_ENTRIES = 256
const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_PREVIEW_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_OPEN_BYTES = 16 * 1024 * 1024

function validateRoot(root) {
  if (typeof root !== 'string' || root === '' || root.includes('\0')) {
    return {ok: false, code: 'invalid-root'}
  }

  let normalized = path.normalize(root)
  if (!path.isAbsolute(normalized)) return {ok: false, code: 'invalid-root'}

  try {
    let canonical = fs.realpathSync(normalized)
    if (!fs.statSync(canonical).isDirectory()) {
      return {ok: false, code: 'not-directory'}
    }

    let probe = path.join(
      canonical,
      `.seki-write-test-${process.pid}-${crypto.randomBytes(8).toString('hex')}`,
    )
    let descriptor = fs.openSync(probe, 'wx', 0o600)
    try {
      fs.writeSync(descriptor, 'seki')
    } finally {
      fs.closeSync(descriptor)
      fs.unlinkSync(probe)
    }

    return {ok: true, root: canonical}
  } catch (err) {
    return {ok: false, code: 'not-writable'}
  }
}

function validateRelativeTarget(root, relativePath = '', expectedType) {
  let rootResult = validateRoot(root)
  if (!rootResult.ok) return rootResult
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

function isSgfFile(filename) {
  let extension = path.extname(filename).toLowerCase()
  return extension === '.sgf' || extension === '.rsgf'
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

exports.create = function (setting, dialog) {
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

    let directory = validateRelativeTarget(config.root, relativePath, (stats) =>
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
            let preview = readBoundedFile(
              entryPath,
              MAX_PREVIEW_BYTES,
              config.root,
            )
            if (preview != null) {
              previewContent = preview.content
              previewBytes += preview.size
            }
          }
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            relativePath: path.relative(config.root, entryPath),
            modifiedAt: stats.mtimeMs,
            size: entry.isFile() ? stats.size : null,
            previewContent,
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
      }
    } catch (err) {
      return {ok: false, code: 'read-failed'}
    }
  }

  async function chooseRoot(window) {
    let result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    })
    let selected = result?.filePaths?.[0]
    if (selected == null) return {ok: false, cancelled: true}

    let validation = validateRoot(selected)
    if (!validation.ok) return validation

    setting.set('library.root', validation.root)
    return {ok: true, root: validation.root}
  }

  return {getConfig, chooseRoot, list, open}
}

exports.validateRoot = validateRoot
