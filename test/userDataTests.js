import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  PROFILE_DIRECTORY_NAME,
  configureUserDataDirectory,
  resolveUserDataDirectory,
} from '../src/userdata.js'

function createApp({appData, userData = null, explicit = false}) {
  return {
    commandLine: {hasSwitch: (name) => name === 'user-data-dir' && explicit},
    getPath: (name) => (name === 'appData' ? appData : userData),
  }
}

describe('user-data namespace', () => {
  it('uses a deterministic Seki profile below the platform app-data root', () => {
    let appData = path.join(path.parse(process.cwd()).root, 'profiles')
    let result = resolveUserDataDirectory({
      app: createApp({appData}),
      env: {},
    })

    assert.strictEqual(PROFILE_DIRECTORY_NAME, 'Seki')
    assert.strictEqual(result, path.join(appData, 'Seki'))
    assert.strictEqual(result.includes('Sabaki'), false)
  })

  it('uses a Seki profile beside the Windows portable executable', () => {
    let portableDirectory = path.join(
      path.parse(process.cwd()).root,
      'portable',
    )
    let result = resolveUserDataDirectory({
      app: createApp({appData: '/unused'}),
      env: {PORTABLE_EXECUTABLE_DIR: portableDirectory},
    })

    assert.strictEqual(result, path.join(portableDirectory, 'Seki'))
    assert.strictEqual(result.includes('Sabaki'), false)
  })

  it('preserves an explicit command-line profile override', () => {
    let userData = path.join(path.parse(process.cwd()).root, 'isolated-profile')
    let result = resolveUserDataDirectory({
      app: createApp({
        appData: '/unused',
        userData,
        explicit: true,
      }),
      env: {PORTABLE_EXECUTABLE_DIR: '/unused-portable'},
    })

    assert.strictEqual(result, userData)
  })

  it('uses one profile root for application and Electron session data', () => {
    let appData = fs.mkdtempSync(path.join(os.tmpdir(), 'seki-app-data-'))
    let configuredPaths = {}
    let app = {
      ...createApp({appData}),
      setPath: (name, value) => (configuredPaths[name] = value),
    }

    try {
      let result = configureUserDataDirectory({app, env: {}})

      assert.strictEqual(result, path.join(appData, 'Seki'))
      assert.deepStrictEqual(configuredPaths, {
        userData: result,
        sessionData: result,
      })
      assert.strictEqual(fs.statSync(result).isDirectory(), true)
    } finally {
      fs.rmSync(appData, {recursive: true, force: true})
    }
  })
})
