import assert from 'assert'
import {readFileSync} from 'fs'
import {join} from 'path'

import {
  createLibraryDirectory,
  getBuiltinCollectionMetadata,
  listBuiltinLibraryEntries,
  openBuiltinLibraryFile,
  saveLibraryFile,
} from '../src/modules/library.js'
import {
  buildProgressKey,
  getTsumegoProgress,
  markTsumegoProblemCompleted,
} from '../src/modules/tsumegoprogress.js'

const root = join(process.cwd())

describe('built-in Library renderer bridge', () => {
  it('exposes the built-in IPC channels in main and preload', () => {
    let mainSource = readFileSync(join(root, 'src/main.js'), 'utf8')
    let preloadSource = readFileSync(join(root, 'src/preload.js'), 'utf8')
    let progressSource = readFileSync(
      join(root, 'src/tsumegoprogress.js'),
      'utf8',
    )

    for (let channel of [
      'library:listBuiltin',
      'library:openBuiltin',
      'library:getBuiltinCollectionMetadata',
      'library:countProblems',
      'library:saveFile',
      'library:createDirectory',
    ]) {
      assert.match(
        mainSource,
        new RegExp(`ipcMain\\.handle\\(\\s*'${channel}'`),
      )
      assert.match(
        preloadSource,
        new RegExp(`ipcRenderer\\.invoke\\(\\s*'${channel}'`),
      )
    }

    for (let channel of [
      'tsumegoProgress:getAll',
      'tsumegoProgress:markCompleted',
    ]) {
      assert.match(
        progressSource,
        new RegExp(`ipcMain\\.handle\\(\\s*'${channel}'`),
      )
      assert.match(
        preloadSource,
        new RegExp(`ipcRenderer\\.invoke\\(\\s*'${channel}'`),
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

  it('delegates save operations through window.sabaki', async () => {
    let calls = []
    let previousWindow = global.window
    global.window = {
      sabaki: {
        library: {
          saveFile: async (relativePath, content, options) => {
            calls.push(['saveFile', relativePath, content, options])
            return {ok: true, relativePath}
          },
          createDirectory: async (relativePath) => {
            calls.push(['createDirectory', relativePath])
            return {ok: true, relativePath}
          },
        },
      },
    }

    try {
      await saveLibraryFile('Tsumego/My Problems/foo.sgf', '(;GM[1])', {
        overwrite: true,
      })
      await createLibraryDirectory('Tsumego/My Problems')
    } finally {
      global.window = previousWindow
    }

    assert.deepStrictEqual(calls, [
      [
        'saveFile',
        'Tsumego/My Problems/foo.sgf',
        '(;GM[1])',
        {overwrite: true},
      ],
      ['createDirectory', 'Tsumego/My Problems'],
    ])
  })

  it('delegates tsumego progress operations through window.sabaki', async () => {
    let calls = []
    let previousWindow = global.window
    global.window = {
      sabaki: {
        tsumegoProgress: {
          getAll: async () => {
            calls.push(['getAll'])
            return {version: 1, problems: {}}
          },
          markCompleted: async (source, relativePath) => {
            calls.push(['markCompleted', source, relativePath])
            return {key: `${source}:${relativePath}`, completedAt: 'x'}
          },
        },
      },
    }

    try {
      await getTsumegoProgress()
      await markTsumegoProblemCompleted('builtin', 'tsumego/easy/001.sgf')
    } finally {
      global.window = previousWindow
    }

    assert.deepStrictEqual(calls, [
      ['getAll'],
      ['markCompleted', 'builtin', 'tsumego/easy/001.sgf'],
    ])
  })

  it('builds canonical progress keys', () => {
    assert.strictEqual(
      buildProgressKey('builtin', 'tsumego/easy/ggg-easy-01.sgf'),
      'builtin:tsumego/easy/ggg-easy-01.sgf',
    )
    assert.strictEqual(
      buildProgressKey('user', 'Tsumego\\My Problems\\foo.sgf'),
      'user:Tsumego/My Problems/foo.sgf',
    )
    assert.strictEqual(buildProgressKey('builtin', '../escape.sgf'), null)
    assert.strictEqual(buildProgressKey('cloud', 'tsumego/easy/x.sgf'), null)
  })
})
