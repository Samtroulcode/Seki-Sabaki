import assert from 'assert'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {create, resolveBuiltinRoot, validateRoot} from '../src/library.js'

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
      tsumegoRoot: join(directory, 'Tsumego'),
    })
    assert.strictEqual(values['library.root'], directory)
    assert.strictEqual(existsSync(join(directory, 'Tsumego')), true)
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

describe('built-in library', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-builtin-'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  function makeApi(builtinRoot, userRoot = '') {
    let values = {'library.root': userRoot}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => (values[key] = value),
    }
    return create(
      setting,
      {showOpenDialog: async () => ({filePaths: []})},
      {builtin: builtinRoot},
    )
  }

  it('serves the built-in library without a configured user library', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'games'), {recursive: true})
    writeFileSync(join(builtinRoot, 'games', 'game.sgf'), '(;GM[1]SZ[9])')
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.list(''), {
      ok: false,
      code: 'not-configured',
      entries: [],
    })
    assert.strictEqual(api.listBuiltin('').ok, true)
    assert.strictEqual(
      api.openBuiltin('games/game.sgf').content,
      '(;GM[1]SZ[9])',
    )
  })

  it('reads a built-in SGF and marks it as built-in', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'games'), {recursive: true})
    writeFileSync(join(builtinRoot, 'games', 'game.sgf'), '(;GM[1]SZ[9])')
    let api = makeApi(builtinRoot)

    let result = api.openBuiltin('games/game.sgf')
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.content, '(;GM[1]SZ[9])')
    assert.strictEqual(result.source, 'builtin')
  })

  it('refuses path traversal in the built-in library', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'games'), {recursive: true})
    writeFileSync(join(builtinRoot, 'games', 'game.sgf'), '(;GM[1]SZ[9])')
    writeFileSync(join(directory, 'outside.sgf'), '(;GM[1])')
    let api = makeApi(builtinRoot)

    assert.strictEqual(api.openBuiltin('../outside.sgf').ok, false)
    assert.strictEqual(api.listBuiltin('../').ok, false)
  })

  it('serves the built-in library without the writable check', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'games'), {recursive: true})
    writeFileSync(join(builtinRoot, 'games', 'game.sgf'), '(;GM[1]SZ[9])')
    chmodSync(builtinRoot, 0o555)

    try {
      // The same folder fails the user-library writable validation...
      assert.strictEqual(validateRoot(builtinRoot).ok, false)

      // ...but is served read-only as the built-in library.
      let api = makeApi(builtinRoot)
      assert.strictEqual(api.listBuiltin('').ok, true)
      assert.strictEqual(
        api.openBuiltin('games/game.sgf').content,
        '(;GM[1]SZ[9])',
      )
    } finally {
      chmodSync(builtinRoot, 0o700)
    }
  })

  it('distinguishes built-in entries from user entries', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(builtinRoot)
    writeFileSync(join(builtinRoot, 'builtin.sgf'), '(;GM[1])')
    let userRoot = join(directory, 'user')
    mkdirSync(userRoot)
    writeFileSync(join(userRoot, 'user.sgf'), '(;GM[1])')
    let api = makeApi(builtinRoot, userRoot)

    assert.strictEqual(api.list('').entries[0].source, 'user')
    assert.strictEqual(api.listBuiltin('').entries[0].source, 'builtin')
    assert.strictEqual(api.open('user.sgf').source, 'user')
    assert.strictEqual(api.openBuiltin('builtin.sgf').source, 'builtin')
  })

  it('resolves the built-in library without options, like main.js does', () => {
    // create() is called by main.js without a builtin option, so the default
    // resolver must find the repository resources/library in development.
    let values = {'library.root': ''}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => (values[key] = value),
    }
    let api = create(setting, {showOpenDialog: async () => ({filePaths: []})})

    let result = api.listBuiltin('')
    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(
      result.entries.map((entry) => [entry.name, entry.source]),
      [
        ['games', 'builtin'],
        ['tsumego', 'builtin'],
      ],
    )
  })
})

describe('built-in library root resolution', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-builtin-root-'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  it('resolves to the repository resources in development', () => {
    let appPath = join(directory, 'app')
    let resourcesPath = join(directory, 'electron-resources')
    mkdirSync(join(appPath, 'resources', 'library'), {recursive: true})
    mkdirSync(resourcesPath)

    let result = resolveBuiltinRoot({isPackaged: false, resourcesPath, appPath})
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.root, join(appPath, 'resources', 'library'))
  })

  it('resolves to the packaged resources when shipped', () => {
    let appPath = join(directory, 'app')
    let resourcesPath = join(directory, 'electron-resources')
    mkdirSync(join(resourcesPath, 'library'), {recursive: true})
    mkdirSync(appPath)

    let result = resolveBuiltinRoot({isPackaged: true, resourcesPath, appPath})
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.root, join(resourcesPath, 'library'))
  })

  it('reports unavailable when no built-in library exists', () => {
    let result = resolveBuiltinRoot({
      isPackaged: false,
      resourcesPath: join(directory, 'missing-resources'),
      appPath: join(directory, 'missing-app'),
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.code, 'builtin-unavailable')
  })
})
