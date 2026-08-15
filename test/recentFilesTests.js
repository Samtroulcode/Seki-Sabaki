import assert from 'assert'
import {mkdtempSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {create} from '../src/recentfiles.js'

describe('recent files', () => {
  let directory

  function createStore(initial = []) {
    let values = {'app.recent_files': initial}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => {
        values[key] = value
      },
    }
    return {store: create(setting), values}
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-recent-files-'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  it('records SGF files and ignores non-SGF files', () => {
    let sgfPath = join(directory, 'game.sgf')
    let txtPath = join(directory, 'notes.txt')
    writeFileSync(sgfPath, '(;GM[1]SZ[9])')
    writeFileSync(txtPath, 'not a game')
    let {store, values} = createStore()

    store.add(sgfPath)
    store.add(txtPath)

    assert.deepStrictEqual(
      store.list().map((entry) => entry.filename),
      ['game.sgf'],
    )
    assert.strictEqual(values['app.recent_files'].length, 1)
  })

  it('deduplicates files and opens them by opaque id', () => {
    let sgfPath = join(directory, 'game.sgf')
    let content = '(;GM[1]SZ[9]PB[Black]PW[White])'
    writeFileSync(sgfPath, content)
    let {store} = createStore()

    store.add(sgfPath)
    let first = store.list()[0]
    store.add(sgfPath)

    assert.strictEqual(store.list().length, 1)
    assert.deepStrictEqual(store.open(first.id), {
      content,
      filename: 'game.sgf',
      path: sgfPath,
    })
  })

  it('removes missing and invalid persisted entries', () => {
    let missingPath = join(directory, 'missing.sgf')
    let txtPath = join(directory, 'notes.txt')
    writeFileSync(txtPath, 'notes')
    let {store, values} = createStore([
      {path: missingPath, lastOpenedAt: 2},
      {path: txtPath, lastOpenedAt: 1},
    ])

    assert.deepStrictEqual(store.list(), [])
    assert.deepStrictEqual(values['app.recent_files'], [])
  })
})
