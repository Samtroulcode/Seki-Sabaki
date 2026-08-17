import assert from 'assert'

import {
  getLastTsumegoCollection,
  isValidCollection,
  normalizeRelativePath,
  setLastTsumegoCollection,
} from '../src/modules/tsumegocollection.js'

describe('tsumego collection preference', () => {
  it('normalizes relative paths', () => {
    assert.strictEqual(normalizeRelativePath('tsumego/easy'), 'tsumego/easy')
    assert.strictEqual(
      normalizeRelativePath('Tsumego\\My Problems'),
      'Tsumego/My Problems',
    )
    assert.strictEqual(normalizeRelativePath('/tsumego//easy/'), 'tsumego/easy')
    assert.strictEqual(normalizeRelativePath(''), '')
    assert.strictEqual(normalizeRelativePath(null), '')
  })

  it('validates source and relative path', () => {
    assert.strictEqual(
      isValidCollection({source: 'builtin', relativePath: 'tsumego/easy'}),
      true,
    )
    assert.strictEqual(
      isValidCollection({source: 'user', relativePath: 'Tsumego/My Problems'}),
      true,
    )
    assert.strictEqual(
      isValidCollection({source: 'cloud', relativePath: 'x'}),
      false,
    )
    assert.strictEqual(
      isValidCollection({source: 'builtin', relativePath: ''}),
      false,
    )
    assert.strictEqual(
      isValidCollection({source: 'builtin', relativePath: null}),
      false,
    )
    assert.strictEqual(isValidCollection(null), false)
    assert.strictEqual(isValidCollection('builtin'), false)
    assert.strictEqual(
      isValidCollection({source: 'builtin', relativePath: '../escape'}),
      false,
    )
    assert.strictEqual(
      isValidCollection({source: 'builtin', relativePath: 'tsumego/./easy'}),
      false,
    )
  })

  it('returns null when no collection is stored', () => {
    let previousWindow = global.window
    global.window = {
      sabaki: {
        setting: {
          get: () => null,
          set: () => {},
        },
      },
    }

    try {
      assert.strictEqual(getLastTsumegoCollection(), null)
    } finally {
      global.window = previousWindow
    }
  })

  it('returns null for an invalid stored value', () => {
    let previousWindow = global.window
    global.window = {
      sabaki: {
        setting: {
          get: () => ({source: 'cloud', relativePath: 'tsumego/easy'}),
          set: () => {},
        },
      },
    }

    try {
      assert.strictEqual(getLastTsumegoCollection(), null)
    } finally {
      global.window = previousWindow
    }
  })

  it('round-trips a valid collection through settings', () => {
    let stored = null
    let previousWindow = global.window
    global.window = {
      sabaki: {
        setting: {
          get: () => stored,
          set: (key, value) => {
            stored = value
          },
        },
      },
    }

    try {
      assert.strictEqual(
        setLastTsumegoCollection({
          source: 'builtin',
          relativePath: 'tsumego/easy',
        }),
        true,
      )
      assert.deepStrictEqual(getLastTsumegoCollection(), {
        source: 'builtin',
        relativePath: 'tsumego/easy',
      })

      assert.strictEqual(
        setLastTsumegoCollection({
          source: 'user',
          relativePath: 'Tsumego\\My Problems',
        }),
        true,
      )
      assert.deepStrictEqual(getLastTsumegoCollection(), {
        source: 'user',
        relativePath: 'Tsumego/My Problems',
      })
    } finally {
      global.window = previousWindow
    }
  })

  it('refuses to store an invalid collection', () => {
    let stored = null
    let previousWindow = global.window
    global.window = {
      sabaki: {
        setting: {
          get: () => stored,
          set: (key, value) => {
            stored = value
          },
        },
      },
    }

    try {
      assert.strictEqual(
        setLastTsumegoCollection({source: 'cloud', relativePath: 'x'}),
        false,
      )
      assert.strictEqual(
        setLastTsumegoCollection({source: 'builtin', relativePath: '../x'}),
        false,
      )
      assert.strictEqual(stored, null)
    } finally {
      global.window = previousWindow
    }
  })
})
