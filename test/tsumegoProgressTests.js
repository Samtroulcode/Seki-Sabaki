import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  STORE_VERSION,
  normalizeProblemKey,
  parseProgressFile,
  markProblemCompleted,
  TsumegoProgressStore,
} from '../src/tsumegoprogress.js'

function createStore() {
  let directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seki-tsumego-progress-'),
  )
  let storagePath = path.join(directory, 'tsumego-progress.json')
  let store = new TsumegoProgressStore({storagePath})
  return {store, storagePath}
}

describe('tsumego progress store', () => {
  it('returns empty progress when the file is absent', () => {
    let {store} = createStore()
    store.load()
    assert.deepStrictEqual(store.getAll(), {
      version: STORE_VERSION,
      problems: {},
    })
  })

  it('parses a valid store file', () => {
    let {store, storagePath} = createStore()
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        version: 1,
        problems: {
          'builtin:tsumego/easy/ggg-easy-01.sgf': {
            completed: true,
            completedAt: '2026-08-17T00:00:00.000Z',
          },
        },
      }),
    )
    store.load()
    assert.deepStrictEqual(store.getAll(), {
      version: 1,
      problems: {
        'builtin:tsumego/easy/ggg-easy-01.sgf': {
          completed: true,
          completedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    })
  })

  it('degrades to empty progress on corrupt JSON', () => {
    let {store, storagePath} = createStore()
    fs.writeFileSync(storagePath, '{ not valid json')
    store.load()
    assert.deepStrictEqual(store.getAll(), {
      version: STORE_VERSION,
      problems: {},
    })
  })

  it('degrades to empty progress on an unknown version', () => {
    let {store, storagePath} = createStore()
    fs.writeFileSync(storagePath, JSON.stringify({version: 99, problems: {}}))
    store.load()
    assert.deepStrictEqual(store.getAll(), {
      version: STORE_VERSION,
      problems: {},
    })
  })

  it('ignores invalid entries and unknown properties', () => {
    let {store, storagePath} = createStore()
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        version: 1,
        extra: 'ignored',
        problems: {
          'builtin:tsumego/easy/ok.sgf': {
            completed: true,
            completedAt: '2026-01-01T00:00:00.000Z',
          },
          'builtin:tsumego/easy/not-completed.sgf': {completed: false},
          'builtin:tsumego/easy/string-completed.sgf': {completed: 'yes'},
          'builtin:tsumego/easy/null-entry.sgf': null,
          'builtin:tsumego/../escape.sgf': {completed: true},
          'unknown:tsumego/easy/x.sgf': {completed: true},
          'builtin:tsumego\\backslash.sgf': {completed: true},
        },
      }),
    )
    store.load()
    assert.deepStrictEqual(store.getAll(), {
      version: 1,
      problems: {
        'builtin:tsumego/easy/ok.sgf': {
          completed: true,
          completedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
  })

  it('canonicalizes builtin and user keys', () => {
    assert.strictEqual(
      normalizeProblemKey('builtin', 'tsumego/easy/ggg-easy-01.sgf'),
      'builtin:tsumego/easy/ggg-easy-01.sgf',
    )
    assert.strictEqual(
      normalizeProblemKey('user', 'Tsumego/My Problems/foo.sgf'),
      'user:Tsumego/My Problems/foo.sgf',
    )
    assert.strictEqual(
      normalizeProblemKey('user', 'Tsumego\\My Problems\\foo.sgf'),
      'user:Tsumego/My Problems/foo.sgf',
    )
  })

  it('rejects traversal, absolute, and unknown-source keys', () => {
    assert.strictEqual(normalizeProblemKey('builtin', '../escape.sgf'), null)
    assert.strictEqual(
      normalizeProblemKey('builtin', 'tsumego/../../escape.sgf'),
      null,
    )
    assert.strictEqual(normalizeProblemKey('builtin', '/etc/passwd'), null)
    assert.strictEqual(
      normalizeProblemKey('builtin', 'C:\\Windows\\x.sgf'),
      null,
    )
    assert.strictEqual(normalizeProblemKey('cloud', 'tsumego/easy/x.sgf'), null)
    assert.strictEqual(normalizeProblemKey('builtin', ''), null)
    assert.strictEqual(
      normalizeProblemKey('builtin', 'tsumego//double.sgf'),
      null,
    )
  })

  it('marks a problem completed', () => {
    let {store} = createStore()
    store.load()
    let result = store.markCompleted(
      'builtin',
      'tsumego/easy/ggg-easy-01.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    assert.deepStrictEqual(result, {
      key: 'builtin:tsumego/easy/ggg-easy-01.sgf',
      completedAt: '2026-08-17T00:00:00.000Z',
    })
    assert.deepStrictEqual(store.getAll(), {
      version: 1,
      problems: {
        'builtin:tsumego/easy/ggg-easy-01.sgf': {
          completed: true,
          completedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    })
  })

  it('is idempotent and preserves the original completedAt', () => {
    let {store} = createStore()
    store.load()
    store.markCompleted(
      'builtin',
      'tsumego/easy/ggg-easy-01.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    let result = store.markCompleted(
      'builtin',
      'tsumego/easy/ggg-easy-01.sgf',
      '2026-08-18T00:00:00.000Z',
    )
    assert.strictEqual(result.completedAt, '2026-08-17T00:00:00.000Z')
    assert.deepStrictEqual(
      store.getAll().problems['builtin:tsumego/easy/ggg-easy-01.sgf'],
      {completed: true, completedAt: '2026-08-17T00:00:00.000Z'},
    )
  })

  it('persists across a new store instance', () => {
    let {store, storagePath} = createStore()
    store.load()
    store.markCompleted(
      'builtin',
      'tsumego/easy/ggg-easy-01.sgf',
      '2026-08-17T00:00:00.000Z',
    )

    let reloaded = new TsumegoProgressStore({storagePath})
    reloaded.load()
    assert.deepStrictEqual(reloaded.getAll(), {
      version: 1,
      problems: {
        'builtin:tsumego/easy/ggg-easy-01.sgf': {
          completed: true,
          completedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    })
  })

  it('keeps two different problems', () => {
    let {store} = createStore()
    store.load()
    store.markCompleted(
      'builtin',
      'tsumego/easy/001.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    store.markCompleted(
      'user',
      'Tsumego/My Problems/foo.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    assert.deepStrictEqual(Object.keys(store.getAll().problems).sort(), [
      'builtin:tsumego/easy/001.sgf',
      'user:Tsumego/My Problems/foo.sgf',
    ])
  })

  it('writes atomically without leaving a temp file', () => {
    let {store, storagePath} = createStore()
    store.load()
    store.markCompleted(
      'builtin',
      'tsumego/easy/001.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    assert.strictEqual(fs.existsSync(`${storagePath}.tmp`), false)
    let parsed = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
    assert.strictEqual(parsed.version, 1)
    assert.strictEqual(
      parsed.problems['builtin:tsumego/easy/001.sgf'].completed,
      true,
    )
  })

  it('rejects an invalid key on markCompleted', () => {
    let {store} = createStore()
    store.load()
    assert.throws(
      () => store.markCompleted('builtin', '../escape.sgf'),
      /Invalid tsumego problem key/,
    )
  })

  it('markProblemCompleted is idempotent at the pure level', () => {
    let progress = {version: 1, problems: {}}
    let next = markProblemCompleted(
      progress,
      'builtin:tsumego/easy/001.sgf',
      '2026-08-17T00:00:00.000Z',
    )
    assert.notStrictEqual(next, progress)
    let again = markProblemCompleted(
      next,
      'builtin:tsumego/easy/001.sgf',
      '2026-08-18T00:00:00.000Z',
    )
    assert.strictEqual(again, next)
  })

  it('parseProgressFile tolerates a missing completedAt', () => {
    let parsed = parseProgressFile(
      JSON.stringify({
        version: 1,
        problems: {'builtin:tsumego/easy/001.sgf': {completed: true}},
      }),
    )
    assert.strictEqual(
      parsed.problems['builtin:tsumego/easy/001.sgf'].completed,
      true,
    )
    assert.strictEqual(
      typeof parsed.problems['builtin:tsumego/easy/001.sgf'].completedAt,
      'string',
    )
  })
})
