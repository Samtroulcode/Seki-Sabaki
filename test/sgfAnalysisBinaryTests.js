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

  it('uses bundled resources in packaged apps and local package in development', () => {
    assert.deepStrictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: true,
        resourcesPath: '/app/resources',
        platform: 'darwin',
        arch: 'arm64',
        exists: () => false,
      }),
      {
        path: '/app/resources/analyze-sgf/darwin-arm64/analyze-sgf',
        status: 'bundled',
        args: [],
      },
    )

    assert.deepStrictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: false,
        resourcesPath: '/app/resources',
        appPath: '/repo',
        platform: 'linux',
        arch: 'x64',
        exists: (path) => path === '/repo/node_modules/.bin/analyze-sgf',
      }),
      {path: '/repo/node_modules/.bin/analyze-sgf', status: 'local', args: []},
    )
  })

  it('falls back to PATH only when packaged and local analyzers are missing', () => {
    assert.deepStrictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: false,
        resourcesPath: '/app/resources',
        appPath: '/repo',
        platform: 'linux',
        arch: 'x64',
        exists: () => false,
      }),
      {path: 'analyze-sgf', status: 'path', args: []},
    )
  })

  it('uses node to run the local package on Windows without shell:true', () => {
    assert.deepStrictEqual(
      resolveAnalyzeSgfPath({
        isPackaged: false,
        appPath: 'C:\\repo',
        platform: 'win32',
        arch: 'x64',
        exists: (path) =>
          path.endsWith('node_modules/analyze-sgf/src/index.js'),
      }),
      {
        path: process.execPath,
        status: 'local',
        args: ['C:\\repo/node_modules/analyze-sgf/src/index.js'],
      },
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
      'local',
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
