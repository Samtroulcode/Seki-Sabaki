import assert from 'assert'

import {
  getAnalyzeSgfExecutableName,
  getAnalyzeSgfResourcePath,
  getAnalyzeSgfStatus,
  resolveAnalyzeSgfPath,
} from '../src/sgfanalysisbinary.js'

describe('SGF analysis binary resolver', () => {
  it('resolves packaged analyzer resource paths per platform and arch', () => {
    assert.strictEqual(
      getAnalyzeSgfResourcePath({
        resourcesPath: '/app/resources',
        platform: 'linux',
        arch: 'x64',
      }),
      '/app/resources/analyze-sgf/linux-x64/analyze-sgf',
    )
    assert.strictEqual(getAnalyzeSgfExecutableName('win32'), 'analyze-sgf.exe')
  })

  it('uses bundled resources in packaged apps and PATH in development', () => {
    assert.strictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: true,
        resourcesPath: '/app/resources',
        platform: 'darwin',
        arch: 'arm64',
        exists: () => false,
      }),
      '/app/resources/analyze-sgf/darwin-arm64/analyze-sgf',
    )

    assert.strictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: false,
        resourcesPath: '/app/resources',
        platform: 'linux',
        arch: 'x64',
        exists: () => false,
      }),
      'analyze-sgf',
    )
  })

  it('reports analyzer availability status', () => {
    assert.strictEqual(
      getAnalyzeSgfStatus({analyzeSgfPath: 'analyze-sgf'}),
      'path',
    )
    assert.strictEqual(
      getAnalyzeSgfStatus({
        analyzeSgfPath: '/app/analyze-sgf',
        exists: () => true,
      }),
      'bundled',
    )
    assert.strictEqual(
      getAnalyzeSgfStatus({
        analyzeSgfPath: '/app/analyze-sgf',
        exists: () => false,
      }),
      'missing',
    )
  })
})
