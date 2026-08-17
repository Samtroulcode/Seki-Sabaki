import assert from 'assert'
import {readFileSync} from 'fs'
import {join} from 'path'

import {
  getBuiltinCollectionMetadata,
  listBuiltinLibraryEntries,
  openBuiltinLibraryFile,
} from '../src/modules/library.js'

const root = join(process.cwd())

describe('built-in Library renderer bridge', () => {
  it('exposes the built-in IPC channels in main and preload', () => {
    let mainSource = readFileSync(join(root, 'src/main.js'), 'utf8')
    let preloadSource = readFileSync(join(root, 'src/preload.js'), 'utf8')

    for (let channel of [
      'library:listBuiltin',
      'library:openBuiltin',
      'library:getBuiltinCollectionMetadata',
    ]) {
      assert.match(mainSource, new RegExp(`ipcMain\\.handle\\('${channel}'`))
      assert.match(
        preloadSource,
        new RegExp(`ipcRenderer\\.invoke\\('${channel}'`),
      )
    }
  })

  it('delegates built-in operations through window.sabaki', async () => {
    let calls = []
    let previousWindow = global.window
    global.window = {
      sabaki: {
        library: {
          listBuiltin: async (relativePath) => {
            calls.push(['list', relativePath])
            return {ok: true, entries: []}
          },
          openBuiltin: async (relativePath) => {
            calls.push(['open', relativePath])
            return {ok: true, source: 'builtin', content: ''}
          },
          getBuiltinCollectionMetadata: async (relativePath) => {
            calls.push(['metadata', relativePath])
            return {ok: true, metadata: null}
          },
        },
      },
    }

    try {
      await listBuiltinLibraryEntries('tsumego/easy')
      await openBuiltinLibraryFile('tsumego/easy/001.sgf')
      await getBuiltinCollectionMetadata('tsumego/easy')
    } finally {
      global.window = previousWindow
    }

    assert.deepStrictEqual(calls, [
      ['list', 'tsumego/easy'],
      ['open', 'tsumego/easy/001.sgf'],
      ['metadata', 'tsumego/easy'],
    ])
  })
})
