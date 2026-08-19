import assert from 'assert'
import {existsSync} from 'fs'
import {join} from 'path'

import {
  analyzeSgfDirectory,
  assertCompatibleAnalyzeSgfPackage,
  buildPkgCommand,
  forkFeatureFiles,
  packagePath,
  pkgCliPath,
  resolveTargets,
  targets,
} from '../scripts/prepare-analyze-sgf-binaries.js'

describe('analyze-sgf packaging dependency', () => {
  it('uses the readable-comment fork package that packaging will compile', () => {
    assert.doesNotThrow(() => assertCompatibleAnalyzeSgfPackage())
    assert.strictEqual(existsSync(packagePath), true)

    for (let file of forkFeatureFiles) {
      assert.strictEqual(existsSync(join(analyzeSgfDirectory, file)), true)
    }
  })

  it('builds a cross-platform pkg invocation without npx shims', () => {
    let command = buildPkgCommand(targets)

    assert.strictEqual(existsSync(pkgCliPath), true)
    assert.strictEqual(command[0], pkgCliPath)
    assert.strictEqual(command[1], packagePath)
    assert.strictEqual(command[2], '--targets')
    assert.ok(command[3].includes('node18-linux-x64'))
    assert.ok(command[3].includes('node18-win-arm64'))
    assert.strictEqual(command[4], '--out-path')
    assert.ok(command.every((arg) => !/npx/.test(arg)))
  })
})

describe('analyze-sgf target selection', () => {
  it('defaults to the current host target', () => {
    let selected = resolveTargets()

    assert.strictEqual(selected.length, 1)
    assert.strictEqual(
      selected[0].resource,
      `${process.platform}-${process.arch}`,
    )
  })

  it('resolves an explicit single target', () => {
    let selected = resolveTargets(['win32-x64'])

    assert.deepStrictEqual(
      selected.map((target) => target.resource),
      ['win32-x64'],
    )
    assert.strictEqual(selected[0].pkg, 'node18-win-x64')
  })

  it('resolves explicit multiple targets', () => {
    let selected = resolveTargets(['linux-x64', 'linux-arm64'])

    assert.deepStrictEqual(
      selected.map((target) => target.resource),
      ['linux-x64', 'linux-arm64'],
    )
  })

  it('rejects unknown targets', () => {
    assert.throws(
      () => resolveTargets(['win32-ia32']),
      /Unknown analyze-sgf resource target: win32-ia32/,
    )
  })

  it('rejects non-array input', () => {
    assert.throws(
      () => resolveTargets('win32-x64'),
      /Expected an array of analyze-sgf resource targets, got string/,
    )
  })

  it('builds the pkg command with only the selected targets', () => {
    let command = buildPkgCommand(
      resolveTargets(['darwin-x64', 'darwin-arm64']),
    )

    assert.deepStrictEqual(command[3].split(','), [
      'node18-macos-x64',
      'node18-macos-arm64',
    ])
  })
})
