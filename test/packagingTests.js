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
      {from: 'resources/library', to: 'library'},
    ])
    assert.strictEqual(
      packageJson.devDependencies['analyze-sgf'],
      'git+https://github.com/Samtroulcode/analyze-sgf.git#8c05132107bb1a1b27d915ab79d5fdaeb3da9125',
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
      'dist:macos:unsigned',
      'dist:linux',
      'dist:linux:arm64',
      'dist:linux:all',
      'dist:flatpak',
      'dist:win64',
      'dist:win64-portable',
    ]) {
      assert.match(packageJson.scripts[scriptName], /prepare:analyze-sgf/)
    }
  })

  it('scopes analyze-sgf preparation to the packaged targets', () => {
    let expected = {
      'dist:linux': ['linux-x64'],
      'dist:linux:arm64': ['linux-arm64'],
      'dist:linux:all': ['linux-x64', 'linux-arm64'],
      'dist:macos': ['darwin-x64', 'darwin-arm64'],
      'dist:macos:unsigned': ['darwin-x64', 'darwin-arm64'],
      'dist:win64': ['win32-x64'],
      'dist:win64-portable': ['win32-x64'],
    }

    for (let [scriptName, targets] of Object.entries(expected)) {
      let script = packageJson.scripts[scriptName]
      let match = script.match(/prepare:analyze-sgf\s+([^&]+)/)

      assert.ok(match, `${scriptName} should pass explicit analyze-sgf targets`)
      assert.deepStrictEqual(
        match[1].trim().split(/\s+/),
        targets,
        `${scriptName} should prepare exactly ${targets.join(', ')}`,
      )
    }

    // build and dist:flatpak use the host-default target (no explicit args).
    for (let scriptName of ['build', 'dist:flatpak']) {
      assert.ok(
        !/prepare:analyze-sgf\s+(linux|darwin|win32)-/.test(
          packageJson.scripts[scriptName],
        ),
        `${scriptName} should use the host-default analyze-sgf target`,
      )
    }
  })
})
