import assert from 'assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {create, validateTsumegoWritePath} from '../src/library.js'

function makeApi(root) {
  let values = {'library.root': root}
  let setting = {
    get: (key) => values[key],
    set: (key, value) => (values[key] = value),
  }
  return create(setting, {showOpenDialog: async () => ({filePaths: []})})
}

describe('library saveFile', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-library-write-'))
    mkdirSync(join(directory, 'Tsumego'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  it('saves a file at the Tsumego root with the exact content', () => {
    let api = makeApi(directory)
    let result = api.saveFile('Tsumego/foo.sgf', '(;GM[1]SZ[9])')
    assert.deepStrictEqual(result, {ok: true, relativePath: 'Tsumego/foo.sgf'})
    assert.strictEqual(
      readFileSync(join(directory, 'Tsumego', 'foo.sgf'), 'utf8'),
      '(;GM[1]SZ[9])',
    )
  })

  it('saves a file inside a nested Tsumego folder', () => {
    mkdirSync(join(directory, 'Tsumego', 'My Problems', 'Life and Death'), {
      recursive: true,
    })
    let api = makeApi(directory)
    let result = api.saveFile(
      'Tsumego/My Problems/Life and Death/problem.sgf',
      '(;GM[1]SZ[9])',
    )
    assert.strictEqual(result.ok, true)
    assert.strictEqual(
      existsSync(
        join(
          directory,
          'Tsumego',
          'My Problems',
          'Life and Death',
          'problem.sgf',
        ),
      ),
      true,
    )
  })

  it('creates the Tsumego directory when missing', () => {
    let api = makeApi(directory)
    let result = api.saveFile('Tsumego/foo.sgf', '(;GM[1]SZ[9])')
    assert.strictEqual(result.ok, true)
    assert.strictEqual(existsSync(join(directory, 'Tsumego', 'foo.sgf')), true)
  })

  it('reports an existing file without overwrite and leaves it intact', () => {
    writeFileSync(join(directory, 'Tsumego', 'foo.sgf'), 'old')
    let api = makeApi(directory)
    assert.deepStrictEqual(api.saveFile('Tsumego/foo.sgf', 'new'), {
      ok: false,
      exists: true,
    })
    assert.strictEqual(
      readFileSync(join(directory, 'Tsumego', 'foo.sgf'), 'utf8'),
      'old',
    )
  })

  it('overwrites an existing file when explicitly requested', () => {
    writeFileSync(join(directory, 'Tsumego', 'foo.sgf'), 'old')
    let api = makeApi(directory)
    let result = api.saveFile('Tsumego/foo.sgf', 'new', {overwrite: true})
    assert.strictEqual(result.ok, true)
    assert.strictEqual(
      readFileSync(join(directory, 'Tsumego', 'foo.sgf'), 'utf8'),
      'new',
    )
  })

  it('refuses path traversal', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.saveFile('Tsumego/../Games/foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('../foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('Tsumego/..\\foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('Tsumego/./foo.sgf', 'x').ok, false)
  })

  it('refuses absolute paths', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.saveFile('/tmp/foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('C:\\foo.sgf', 'x').ok, false)
  })

  it('refuses paths outside Tsumego', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.saveFile('Games/foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('tsumego/foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('Tsumego', 'x').ok, false)
  })

  it('refuses non-SGF files and non-string content', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.saveFile('Tsumego/foo.txt', 'x').ok, false)
    assert.strictEqual(api.saveFile('Tsumego/foo.sgf', null).ok, false)
  })

  it('reports not-configured without a library root', () => {
    let values = {'library.root': ''}
    let setting = {
      get: (key) => values[key],
      set: (key, value) => (values[key] = value),
    }
    let api = create(setting, {showOpenDialog: async () => ({filePaths: []})})
    assert.deepStrictEqual(api.saveFile('Tsumego/foo.sgf', 'x'), {
      ok: false,
      code: 'not-configured',
    })
  })

  it('never writes into the built-in library', () => {
    let builtinRoot = join(directory, 'builtin')
    mkdirSync(join(builtinRoot, 'tsumego'), {recursive: true})
    let api = makeApi(directory)
    // The write API only targets the user library; the built-in root is
    // never a valid destination.
    assert.strictEqual(api.saveFile('tsumego/foo.sgf', 'x').ok, false)
    assert.strictEqual(api.saveFile('Tsumego/foo.sgf', 'x').ok, true)
    assert.strictEqual(
      existsSync(join(builtinRoot, 'tsumego', 'foo.sgf')),
      false,
    )
  })
})

describe('library createDirectory', () => {
  let directory

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'seki-library-mkdir-'))
    mkdirSync(join(directory, 'Tsumego'))
  })

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true})
  })

  it('creates a folder inside Tsumego', () => {
    let api = makeApi(directory)
    let result = api.createDirectory('Tsumego/My Problems')
    assert.deepStrictEqual(result, {
      ok: true,
      relativePath: 'Tsumego/My Problems',
    })
    assert.strictEqual(
      existsSync(join(directory, 'Tsumego', 'My Problems')),
      true,
    )
  })

  it('creates nested folders level by level', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.createDirectory('Tsumego/My Problems').ok, true)
    assert.strictEqual(
      api.createDirectory('Tsumego/My Problems/Life and Death').ok,
      true,
    )
    assert.strictEqual(
      existsSync(join(directory, 'Tsumego', 'My Problems', 'Life and Death')),
      true,
    )
  })

  it('reports an existing folder as exists', () => {
    mkdirSync(join(directory, 'Tsumego', 'My Problems'))
    let api = makeApi(directory)
    assert.deepStrictEqual(api.createDirectory('Tsumego/My Problems'), {
      ok: false,
      exists: true,
    })
  })

  it('refuses traversal, absolute paths, and paths outside Tsumego', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.createDirectory('Tsumego/../Games').ok, false)
    assert.strictEqual(api.createDirectory('../foo').ok, false)
    assert.strictEqual(api.createDirectory('/tmp/foo').ok, false)
    assert.strictEqual(api.createDirectory('Games/foo').ok, false)
    assert.strictEqual(api.createDirectory('Tsumego').ok, false)
  })

  it('refuses to create a folder whose parent does not exist', () => {
    let api = makeApi(directory)
    assert.strictEqual(api.createDirectory('Tsumego/Missing/Child').ok, false)
  })
})

describe('validateTsumegoWritePath', () => {
  it('accepts Tsumego paths and rejects escapes', () => {
    assert.strictEqual(validateTsumegoWritePath('Tsumego/foo.sgf').ok, true)
    assert.strictEqual(validateTsumegoWritePath('Tsumego/A/B/foo.sgf').ok, true)
    assert.strictEqual(validateTsumegoWritePath('Games/foo.sgf').ok, false)
    assert.strictEqual(validateTsumegoWritePath('../foo.sgf').ok, false)
    assert.strictEqual(validateTsumegoWritePath('Tsumego/../foo.sgf').ok, false)
    assert.strictEqual(validateTsumegoWritePath('/abs/foo.sgf').ok, false)
    assert.strictEqual(validateTsumegoWritePath('C:\\foo.sgf').ok, false)
    assert.strictEqual(validateTsumegoWritePath('Tsumego').ok, false)
    assert.strictEqual(validateTsumegoWritePath('').ok, false)
    assert.strictEqual(validateTsumegoWritePath('Tsumego\\A\\foo.sgf').ok, true)
  })
})
