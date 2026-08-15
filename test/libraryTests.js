import assert from 'assert'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {create, validateRoot} from '../src/library.js'

describe('library root', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-library-'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  it('accepts a writable directory and canonicalizes it', () => {
    let nested = join(directory, 'nested')
    mkdirSync(nested)

    assert.deepStrictEqual(validateRoot(nested), {ok: true, root: nested})
  })

  it('rejects files, relative paths, and missing directories', () => {
    let file = join(directory, 'game.sgf')
    writeFileSync(file, '(;GM[1])')

    assert.strictEqual(validateRoot(file).ok, false)
    assert.strictEqual(validateRoot('relative/library').ok, false)
    assert.strictEqual(validateRoot(join(directory, 'missing')).ok, false)
  })

  it('rejects NUL-containing paths', () => {
    assert.deepStrictEqual(validateRoot(`${directory}\0broken`), {
      ok: false,
      code: 'invalid-root',
    })
  })

  it('persists only a validated folder selected by the native dialog', async () => {
    let values = {'library.root': ''}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => {
        values[key] = value
      },
    }
    let api = create(setting, {
      showOpenDialog: async () => ({filePaths: [directory]}),
    })

    assert.deepStrictEqual(await api.chooseRoot(null), {
      ok: true,
      root: directory,
    })
    assert.strictEqual(values['library.root'], directory)
    assert.deepStrictEqual(api.getConfig(), {configured: true, root: directory})
  })

  it('lists folders and SGF files and opens files inside the root', () => {
    let games = join(directory, 'Games')
    let content = '(;GM[1]SZ[9])'
    mkdirSync(games)
    writeFileSync(join(games, 'game.sgf'), content)
    writeFileSync(join(directory, 'notes.txt'), 'ignore')
    let values = {'library.root': directory}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => (values[key] = value),
    }
    let api = create(setting, {showOpenDialog: async () => ({filePaths: []})})

    let rootEntries = api.list('')
    assert.strictEqual(rootEntries.ok, true)
    assert.deepStrictEqual(
      rootEntries.entries.map((entry) => entry.name),
      ['Games'],
    )

    let gameEntries = api.list('Games')
    assert.deepStrictEqual(gameEntries.entries[0].name, 'game.sgf')
    assert.strictEqual(gameEntries.entries[0].type, 'file')
    assert.strictEqual(api.open('Games/game.sgf').content, content)
    assert.strictEqual(api.open('../outside.sgf').ok, false)
  })
})
