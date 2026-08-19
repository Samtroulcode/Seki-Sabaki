import assert from 'assert'
import {existsSync, rmSync} from 'fs'
import {join} from 'path'

import {
  analyzeSgfDirectory,
  assertCompatibleAnalyzeSgfPackage,
  buildPkgCommand,
  copySingleTargetOutput,
  forkFeatureFiles,
  packagePath,
  pkgCliPath,
  resolveTargets,
  singleTargetOutputPath,
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

describe('analyze-sgf single-target pkg output', () => {
  it('builds a single-target invocation with exactly the selected pkg target', () => {
    let command = buildPkgCommand(resolveTargets(['win32-x64']))

    assert.strictEqual(command[3], 'node18-win-x64')
  })

  it('uses --output with the deterministic path instead of filename heuristics', () => {
    let target = resolveTargets(['win32-x64'])[0]
    let command = buildPkgCommand([target])

    assert.strictEqual(command[4], '--output')
    assert.strictEqual(command[5], singleTargetOutputPath(target))
    assert.ok(!command.includes('--out-path'))
  })

  it('derives a deterministic Windows output ending in .exe', () => {
    let output = singleTargetOutputPath(resolveTargets(['win32-x64'])[0])

    assert.ok(output.endsWith('analyze-sgf-win32-x64.exe'))
  })

  it('does not add .exe to a Linux single-target output', () => {
    let output = singleTargetOutputPath(resolveTargets(['linux-x64'])[0])

    assert.ok(output.endsWith('analyze-sgf-linux-x64'))
    assert.ok(!output.endsWith('.exe'))
  })

  it('keeps the multi-target --out-path invocation for multiple targets', () => {
    let command = buildPkgCommand(resolveTargets(['linux-x64', 'linux-arm64']))

    assert.strictEqual(command[4], '--out-path')
    assert.deepStrictEqual(command[3].split(','), [
      'node18-linux-x64',
      'node18-linux-arm64',
    ])
  })

  it('fails clearly when pkg did not produce the explicit output file', () => {
    let target = resolveTargets(['win32-arm64'])[0]
    let output = singleTargetOutputPath(target)

    rmSync(output, {force: true})
    assert.throws(
      () => copySingleTargetOutput(target),
      /pkg did not generate an analyze-sgf binary for node18-win-arm64/,
    )
  })

  it('never introduces npx shims', () => {
    for (let resource of ['win32-x64', 'linux-x64']) {
      let command = buildPkgCommand(resolveTargets([resource]))

      assert.strictEqual(command[0], pkgCliPath)
      assert.ok(command.every((arg) => !/npx/.test(arg)))
    }
  })
})
