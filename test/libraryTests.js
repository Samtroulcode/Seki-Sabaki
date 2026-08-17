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

import {
  create,
  parseCollectionMetadata,
  resolveBuiltinRoot,
  validateRoot,
} from '../src/library.js'

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

  it('serves the built-in library without the writable check', function () {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'games'), {recursive: true})
    writeFileSync(join(builtinRoot, 'games', 'game.sgf'), '(;GM[1]SZ[9])')
    chmodSync(builtinRoot, 0o555)

    try {
      // Some platforms (notably Windows) do not enforce directory read-only
      // semantics through chmod, so the writable probe still succeeds there
      // and this scenario cannot be reproduced.
      if (validateRoot(builtinRoot).ok) this.skip()

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

describe('built-in collection metadata', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-collection-'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  function makeApi(builtinRoot) {
    let values = {'library.root': ''}
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

  it('returns metadata for a folder with a valid manifest', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'easy'), {recursive: true})
    writeFileSync(
      join(builtinRoot, 'easy', 'collection.json'),
      JSON.stringify({
        id: 'gogameguru-easy',
        title: 'GoGameGuru — Easy',
        type: 'tsumego',
        author: 'An Younggil & David Ormerod',
        license: 'CC BY-NC-SA 4.0',
        source: 'GoGameGuru',
        description: 'Beginner tsumego collection',
      }),
    )
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('easy'), {
      ok: true,
      metadata: {
        id: 'gogameguru-easy',
        title: 'GoGameGuru — Easy',
        type: 'tsumego',
        author: 'An Younggil & David Ormerod',
        license: 'CC BY-NC-SA 4.0',
        source: 'GoGameGuru',
        description: 'Beginner tsumego collection',
      },
    })
  })

  it('returns no metadata when the manifest is absent', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'plain'), {recursive: true})
    writeFileSync(join(builtinRoot, 'plain', 'game.sgf'), '(;GM[1])')
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('plain'), {
      ok: true,
      metadata: null,
    })
    // The folder stays fully usable without a manifest.
    assert.strictEqual(api.openBuiltin('plain/game.sgf').content, '(;GM[1])')
  })

  it('reports invalid JSON without crashing', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'broken'), {recursive: true})
    writeFileSync(join(builtinRoot, 'broken', 'collection.json'), '{nope')
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('broken'), {
      ok: false,
      code: 'invalid-json',
      metadata: null,
    })
    // An invalid manifest never breaks the folder.
    assert.strictEqual(api.listBuiltin('broken').ok, true)
  })

  it('rejects an oversized manifest', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'huge'), {recursive: true})
    writeFileSync(
      join(builtinRoot, 'huge', 'collection.json'),
      JSON.stringify({title: 'x'.repeat(70 * 1024)}),
    )
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('huge'), {
      ok: false,
      code: 'manifest-unreadable',
      metadata: null,
    })
  })

  it('rejects a manifest with an unrecognized type', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'wrong'), {recursive: true})
    writeFileSync(
      join(builtinRoot, 'wrong', 'collection.json'),
      JSON.stringify({title: 'Wrong', type: 'problems'}),
    )
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('wrong'), {
      ok: false,
      code: 'invalid-type',
      metadata: null,
    })
  })

  it('ignores unknown fields and never honors readOnly', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'set'), {recursive: true})
    writeFileSync(
      join(builtinRoot, 'set', 'collection.json'),
      JSON.stringify({
        id: 'set-a',
        title: 'Set A',
        type: 'games',
        unknownField: 'whatever',
        cover: 'cover.png',
        nested: {deep: true},
        readOnly: true,
      }),
    )
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('set'), {
      ok: true,
      metadata: {id: 'set-a', title: 'Set A', type: 'games'},
    })
  })

  it('does not list collection.json as a playable SGF', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'easy'), {recursive: true})
    writeFileSync(
      join(builtinRoot, 'easy', 'collection.json'),
      JSON.stringify({title: 'Easy', type: 'tsumego'}),
    )
    writeFileSync(join(builtinRoot, 'easy', 'game.sgf'), '(;GM[1])')
    let api = makeApi(builtinRoot)

    assert.deepStrictEqual(
      api.listBuiltin('easy').entries.map((entry) => entry.name),
      ['game.sgf'],
    )
    assert.strictEqual(api.openBuiltin('easy/collection.json').ok, false)
  })

  it('never treats manifest fields as paths', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'sneaky'), {recursive: true})
    writeFileSync(join(builtinRoot, 'outside.sgf'), '(;GM[1])')
    writeFileSync(
      join(builtinRoot, 'sneaky', 'collection.json'),
      JSON.stringify({
        title: 'Sneaky',
        source: '../outside.sgf',
        license: '../../../../etc/passwd',
      }),
    )
    let api = makeApi(builtinRoot)

    // Path-looking strings are just metadata and are never followed.
    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('sneaky'), {
      ok: true,
      metadata: {
        title: 'Sneaky',
        source: '../outside.sgf',
        license: '../../../../etc/passwd',
      },
    })
  })

  it('refuses to reach a manifest outside the built-in library', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'easy'), {recursive: true})
    writeFileSync(join(builtinRoot, 'easy', 'collection.json'), '{}')
    writeFileSync(
      join(builtinRoot, 'collection.json'),
      JSON.stringify({title: 'root'}),
    )
    writeFileSync(join(directory, 'collection.json'), '{}')
    let api = makeApi(builtinRoot)

    // '..' segments never escape the root: they normalize back inside it.
    assert.deepStrictEqual(api.getBuiltinCollectionMetadata('easy/../'), {
      ok: true,
      metadata: {title: 'root'},
    })
    // Real escape attempts are refused.
    assert.strictEqual(api.getBuiltinCollectionMetadata('../').ok, false)
    assert.strictEqual(api.getBuiltinCollectionMetadata('../../').ok, false)
  })
})

describe('collection manifest parser', () => {
  it('rejects non-object manifests', () => {
    for (let content of ['[]', '"text"', 'null', '42', 'true']) {
      assert.deepStrictEqual(parseCollectionMetadata(content), {
        ok: false,
        code: 'invalid-manifest',
        metadata: null,
      })
    }
  })

  it('rejects a non-string type', () => {
    assert.deepStrictEqual(parseCollectionMetadata(JSON.stringify({type: 5})), {
      ok: false,
      code: 'invalid-type',
      metadata: null,
    })
    assert.deepStrictEqual(
      parseCollectionMetadata(JSON.stringify({type: null})),
      {ok: false, code: 'invalid-type', metadata: null},
    )
  })

  it('keeps only non-empty recognized string fields', () => {
    assert.deepStrictEqual(
      parseCollectionMetadata(
        JSON.stringify({title: '', id: 'x', type: 'games', author: 'A'}),
      ),
      {ok: true, metadata: {id: 'x', type: 'games', author: 'A'}},
    )
  })
})
