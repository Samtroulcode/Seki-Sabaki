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
    let command = buildPkgCommand()

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
