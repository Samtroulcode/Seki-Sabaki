const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

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

exports.create = function (setting, dialog) {
  function getConfig() {
    let result = validateRoot(setting.get('library.root'))
    return result.ok
      ? {configured: true, root: result.root}
      : {configured: false, root: null, error: result.code}
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

  return {getConfig, chooseRoot}
}

exports.validateRoot = validateRoot
