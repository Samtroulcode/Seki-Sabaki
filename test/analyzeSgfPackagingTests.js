import assert from 'assert'
import {existsSync} from 'fs'
import {join} from 'path'

import {
  analyzeSgfDirectory,
  assertCompatibleAnalyzeSgfPackage,
  forkFeatureFiles,
  packagePath,
} from '../scripts/prepare-analyze-sgf-binaries.js'

describe('analyze-sgf packaging dependency', () => {
  it('uses the readable-comment fork package that packaging will compile', () => {
    assert.doesNotThrow(() => assertCompatibleAnalyzeSgfPackage())
    assert.strictEqual(existsSync(packagePath), true)

    for (let file of forkFeatureFiles) {
      assert.strictEqual(existsSync(join(analyzeSgfDirectory, file)), true)
    }
  })
})
