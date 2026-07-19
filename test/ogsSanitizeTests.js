import assert from 'assert'

import {OgsError} from '../src/ogs/errors.js'
import {
  sanitizeAutomatchEntry,
  sanitizeAutomatchUuid,
  sanitizeBoardSize,
  sanitizeBoolean,
  sanitizeErrorMessage,
  sanitizeGameId,
  sanitizeHandicap,
  sanitizeMoveCount,
  sanitizeNumber,
  sanitizeOptionalGameId,
  sanitizeString,
} from '../src/ogs/sanitize.js'

describe('OGS sanitize helpers', () => {
  it('sanitizes primitive public values', () => {
    assert.strictEqual(sanitizeBoolean(true), true)
    assert.strictEqual(sanitizeBoolean('true'), null)
    assert.strictEqual(sanitizeNumber(3.5), 3.5)
    assert.strictEqual(sanitizeNumber(Infinity), null)
    assert.strictEqual(sanitizeString('abcdef', 3), 'abc')
    assert.strictEqual(sanitizeString(123, 3), null)
  })

  it('sanitizes game IDs and rejects invalid required IDs', () => {
    assert.strictEqual(sanitizeOptionalGameId(123), 123)
    assert.strictEqual(sanitizeOptionalGameId('123'), 123)
    assert.strictEqual(sanitizeOptionalGameId('001'), null)
    assert.strictEqual(
      sanitizeOptionalGameId('https://online-go.com/game/1'),
      null,
    )
    assert.strictEqual(sanitizeGameId('42'), 42)

    assert.throws(
      () => sanitizeGameId('bad'),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )
  })

  it('sanitizes board, handicap, move count, and error messages', () => {
    assert.strictEqual(sanitizeBoardSize(19), 19)
    assert.strictEqual(sanitizeBoardSize(26), null)
    assert.strictEqual(sanitizeHandicap(9), 9)
    assert.strictEqual(sanitizeHandicap(10), null)
    assert.strictEqual(sanitizeMoveCount(3, 0), 3)
    assert.strictEqual(sanitizeMoveCount(-1, 2), 2)
    assert.strictEqual(sanitizeErrorMessage({message: 'bad'}), 'bad')
    assert.strictEqual(sanitizeErrorMessage({error: 'failed'}), 'failed')
  })

  it('sanitizes automatch IDs and entries', () => {
    assert.strictEqual(sanitizeAutomatchUuid('abc-123'), 'abc-123')
    assert.throws(
      () => sanitizeAutomatchUuid('bad id'),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )
    assert.deepStrictEqual(
      sanitizeAutomatchEntry({uuid: 'abc-123', timestamp: 12}),
      {uuid: 'abc-123', timestamp: 12},
    )
    assert.strictEqual(sanitizeAutomatchEntry({uuid: 'bad id'}), null)
  })
})
