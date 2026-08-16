import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {OgsCredentialStore} from '../src/ogs/credentialstore.js'

function createSafeStorage({
  available = true,
  backend = 'gnome_libsecret',
} = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (buffer) =>
      buffer.toString('utf8').replace(/^encrypted:/, ''),
  }
}

describe('OGS credential store', () => {
  it('stores only encrypted OGS session tokens on disk', () => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaki-ogs-store-'))
    let storagePath = path.join(directory, 'ogs-session.json')
    let store = new OgsCredentialStore({
      safeStorage: createSafeStorage(),
      storagePath,
    })

    assert.strictEqual(
      store.saveSession({
        serverUrl: 'https://online-go.com',
        jwtToken: 'secret-jwt',
        cookieHeader: 'sessionid=secret-cookie; csrftoken=csrf',
        user: {id: '7', username: 'sente'},
        createdAt: 1234,
      }),
      true,
    )

    let raw = fs.readFileSync(storagePath, 'utf8')
    assert.strictEqual(raw.includes('secret-jwt'), false)
    assert.strictEqual(raw.includes('secret-cookie'), false)

    assert.deepStrictEqual(store.loadSession(), {
      serverUrl: 'https://online-go.com',
      jwtToken: 'secret-jwt',
      cookieHeader: 'sessionid=secret-cookie; csrftoken=csrf',
      user: {id: '7', username: 'sente'},
      createdAt: 1234,
    })
  })

  it('normalizes duplicated persisted OGS cookies on load', () => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaki-ogs-store-'))
    let storagePath = path.join(directory, 'ogs-session.json')
    let store = new OgsCredentialStore({
      safeStorage: createSafeStorage(),
      storagePath,
    })

    assert.strictEqual(
      store.saveSession({
        serverUrl: 'https://online-go.com',
        jwtToken: 'secret-jwt',
        cookieHeader:
          'csrftoken=old; sessionid=old; csrftoken=new; sessionid=new',
        user: {id: '7', username: 'sente'},
        createdAt: 1234,
      }),
      true,
    )

    assert.deepStrictEqual(store.loadSession(), {
      serverUrl: 'https://online-go.com',
      jwtToken: 'secret-jwt',
      cookieHeader: 'csrftoken=new; sessionid=new',
      user: {id: '7', username: 'sente'},
      createdAt: 1234,
    })
  })

  it('does not persist when encryption is unavailable', () => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaki-ogs-store-'))
    let storagePath = path.join(directory, 'ogs-session.json')
    let store = new OgsCredentialStore({
      safeStorage: createSafeStorage({available: false}),
      storagePath,
    })

    assert.strictEqual(
      store.saveSession({jwtToken: 'secret-jwt', user: {username: 'sente'}}),
      false,
    )
    assert.strictEqual(fs.existsSync(storagePath), false)
    assert.strictEqual(store.loadSession(), null)
  })

  it('does not persist with Electron basic_text storage', () => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaki-ogs-store-'))
    let storagePath = path.join(directory, 'ogs-session.json')
    let store = new OgsCredentialStore({
      safeStorage: createSafeStorage({backend: 'basic_text'}),
      storagePath,
    })

    assert.strictEqual(
      store.saveSession({jwtToken: 'secret-jwt', user: {username: 'sente'}}),
      false,
    )
    assert.strictEqual(fs.existsSync(storagePath), false)
    assert.strictEqual(store.loadSession(), null)
  })

  it('clears stored OGS sessions', () => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaki-ogs-store-'))
    let storagePath = path.join(directory, 'ogs-session.json')
    let store = new OgsCredentialStore({
      safeStorage: createSafeStorage(),
      storagePath,
    })

    store.saveSession({jwtToken: 'secret-jwt', user: {username: 'sente'}})
    assert.strictEqual(fs.existsSync(storagePath), true)

    assert.strictEqual(store.clearSession(), true)
    assert.strictEqual(fs.existsSync(storagePath), false)
  })
})
