const fs = require('fs')
const path = require('path')

const STORE_VERSION = 1
const STORE_FILENAME = 'ogs-session.json'

class OgsCredentialStore {
  constructor({safeStorage = null, storagePath = null} = {}) {
    this.safeStorage = safeStorage
    this.storagePath = storagePath
  }

  isAvailable() {
    return (
      this.safeStorage != null &&
      typeof this.safeStorage.isEncryptionAvailable === 'function' &&
      this.safeStorage.isEncryptionAvailable() &&
      this.getSelectedStorageBackend() !== 'basic_text' &&
      typeof this.safeStorage.encryptString === 'function' &&
      typeof this.safeStorage.decryptString === 'function' &&
      typeof this.storagePath === 'string' &&
      this.storagePath !== ''
    )
  }

  getSelectedStorageBackend() {
    return typeof this.safeStorage?.getSelectedStorageBackend === 'function'
      ? this.safeStorage.getSelectedStorageBackend()
      : null
  }

  saveSession({serverUrl, jwtToken, user, createdAt = Date.now()} = {}) {
    if (!this.isAvailable()) return false
    if (typeof jwtToken !== 'string' || jwtToken === '') return false

    let encryptedToken = this.safeStorage.encryptString(jwtToken)
    let data = {
      version: STORE_VERSION,
      serverUrl,
      user,
      createdAt,
      encryptedToken: Buffer.from(encryptedToken).toString('base64'),
    }

    fs.mkdirSync(path.dirname(this.storagePath), {recursive: true})
    fs.writeFileSync(this.storagePath, JSON.stringify(data), {mode: 0o600})

    return true
  }

  loadSession() {
    if (!this.isAvailable() || !fs.existsSync(this.storagePath)) return null

    let data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'))

    if (
      data == null ||
      data.version !== STORE_VERSION ||
      typeof data.encryptedToken !== 'string'
    ) {
      return null
    }

    let jwtToken = this.safeStorage.decryptString(
      Buffer.from(data.encryptedToken, 'base64'),
    )

    if (typeof jwtToken !== 'string' || jwtToken === '') return null

    return {
      serverUrl: typeof data.serverUrl === 'string' ? data.serverUrl : '',
      jwtToken,
      user: data.user,
      createdAt: data.createdAt,
    }
  }

  clearSession() {
    if (typeof this.storagePath !== 'string' || this.storagePath === '') {
      return false
    }

    try {
      if (fs.existsSync(this.storagePath)) fs.unlinkSync(this.storagePath)
      return true
    } catch (err) {
      return false
    }
  }
}

function createElectronOgsCredentialStore({electron = null} = {}) {
  if (electron == null) {
    try {
      electron = require('electron')
    } catch (err) {
      electron = null
    }
  }

  let app = electron?.app
  let safeStorage = electron?.safeStorage

  if (app == null || typeof app.getPath !== 'function') {
    return new OgsCredentialStore()
  }

  return new OgsCredentialStore({
    safeStorage,
    storagePath: path.join(app.getPath('userData'), STORE_FILENAME),
  })
}

module.exports = {
  STORE_FILENAME,
  STORE_VERSION,
  OgsCredentialStore,
  createElectronOgsCredentialStore,
}
