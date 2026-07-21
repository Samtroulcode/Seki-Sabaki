import assert from 'assert'
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'

// main.js runs unbundled from the packaged asar, so it must not require from
// src/modules or src/components -- those are renderer code, compiled into
// bundle.js and dropped from the package by the build.files filter. #1044 broke
// this by requiring src/modules/utils from main.js, so the packaged v0.60.1
// crashed on launch with "Cannot find module './modules/utils'" (#1058). The
// source-based e2e can't catch it (it runs from source, not the asar). Pure
// main-process logic belongs at the src root (e.g. src/argv.js) instead. See the
// "Process boundaries" note in CLAUDE.md.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mainSource = readFileSync(join(root, 'src', 'main.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

describe('main-process module boundary', () => {
  it('main.js does not require renderer modules (src/modules, src/components)', () => {
    const crossings = [
      ...mainSource.matchAll(
        /require\(\s*['"]\.\/(modules|components)\/([\w-]+)['"]\s*\)/g,
      ),
    ].map((m) => `./${m[1]}/${m[2]}`)

    assert.deepStrictEqual(
      crossings,
      [],
      `main.js runs unbundled from the asar but requires renderer module(s): ${crossings.join(
        ', ',
      )}. build.files excludes src/modules and src/components, so the packaged app would crash with "Cannot find module". Move that logic to a src-root main-process module (see src/argv.js).`,
    )
  })
})

describe('analyze-sgf packaging', () => {
  it('ships analyze-sgf resources without bundling KataGo', () => {
    assert.deepStrictEqual(packageJson.build.extraResources, [
      {from: 'build/analyze-sgf', to: 'analyze-sgf'},
    ])
    assert.strictEqual(
      packageJson.devDependencies['analyze-sgf'],
      'git+https://github.com/Samtroulcode/analyze-sgf.git#9a9ac836c6bdc16847b2dbb3b8b28dcc0b0bf020',
    )
    assert.strictEqual(packageJson.dependencies.katago, undefined)
  })

  it('prepares analyze-sgf resources for supported platform targets', () => {
    let prepareScript = readFileSync(
      join(root, 'scripts', 'prepare-analyze-sgf-binaries.js'),
      'utf8',
    )

    for (let resource of [
      'linux-x64',
      'linux-arm64',
      'darwin-x64',
      'darwin-arm64',
      'win32-x64',
      'win32-arm64',
    ]) {
      assert.match(prepareScript, new RegExp(`resource: '${resource}'`))
    }
  })

  it('prepares analyze-sgf before packaged builds', () => {
    for (let scriptName of [
      'build',
      'dist:macos',
      'dist:linux',
      'dist:flatpak',
      'dist:win64',
      'dist:win64-portable',
    ]) {
      assert.match(packageJson.scripts[scriptName], /prepare:analyze-sgf/)
    }
  })
})
