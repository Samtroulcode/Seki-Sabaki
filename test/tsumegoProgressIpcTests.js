import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  TsumegoProgressStore,
  setupTsumegoProgressIpcHandlers,
} from '../src/tsumegoprogress.js'

function setup({isTrusted = () => true} = {}) {
  let directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seki-tsumego-progress-ipc-'),
  )
  let store = new TsumegoProgressStore({
    storagePath: path.join(directory, 'tsumego-progress.json'),
  })
  store.load()
  let handlers = {}
  let ipcMain = {
    handle: (name, handler) => {
      handlers[name] = handler
    },
  }
  setupTsumegoProgressIpcHandlers(ipcMain, store, {isTrusted})
  return {handlers, store}
}

describe('tsumego progress IPC handlers', () => {
  it('exposes getAll', async () => {
    let {handlers, store} = setup()
    store.markCompleted(
      'builtin',
      'tsumego/easy/001.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    assert.deepStrictEqual(await handlers['tsumegoProgress:getAll']({}), {
      version: 1,
      problems: {
        'builtin:tsumego/easy/001.sgf': {
          completed: true,
          completedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    })
  })

  it('marks a problem completed', async () => {
    let {handlers} = setup()
    let result = await handlers['tsumegoProgress:markCompleted'](
      {},
      'builtin',
      'tsumego/easy/001.sgf',
    )
    assert.strictEqual(result.key, 'builtin:tsumego/easy/001.sgf')
    assert.strictEqual(typeof result.completedAt, 'string')
  })

  it('rejects an untrusted renderer', () => {
    let {handlers} = setup({isTrusted: () => false})
    assert.throws(
      () => handlers['tsumegoProgress:getAll']({}),
      /Untrusted renderer/,
    )
    assert.throws(
      () =>
        handlers['tsumegoProgress:markCompleted'](
          {},
          'builtin',
          'tsumego/easy/001.sgf',
        ),
      /Untrusted renderer/,
    )
  })
})
