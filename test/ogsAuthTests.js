import assert from 'assert'

import {OgsError} from '../src/ogs/errors.js'
import {
  assertLoginInput,
  assertOk,
  extractSetCookie,
  getCookieHeader,
} from '../src/ogs/auth.js'

describe('OGS auth helpers', () => {
  it('validates login input before network requests', () => {
    assert.doesNotThrow(() => assertLoginInput('sente', 'secret'))

    for (let [username, password] of [
      ['', 'secret'],
      ['sente', ''],
      ['x'.repeat(201), 'secret'],
      ['sente', 'x'.repeat(1001)],
    ]) {
      assert.throws(
        () => assertLoginInput(username, password),
        (err) => err instanceof OgsError && err.code === 'invalid-input',
      )
    }
  })

  it('extracts and joins response cookies safely', () => {
    assert.deepStrictEqual(
      extractSetCookie({getSetCookie: () => ['a=1; Path=/', 'b=2; Path=/']}),
      ['a=1; Path=/', 'b=2; Path=/'],
    )
    assert.deepStrictEqual(
      extractSetCookie({get: (name) => (name === 'set-cookie' ? 'a=1' : null)}),
      ['a=1'],
    )
    assert.strictEqual(
      getCookieHeader(['a=1; Path=/', ' b=2 ; Path=/']),
      'a=1; b=2',
    )
  })

  it('maps HTTP failures to stable OGS errors', async () => {
    await assert.doesNotReject(() => assertOk({ok: true}, 'login'))
    await assert.rejects(
      () => assertOk({ok: false, status: 403}, 'login'),
      (err) => err instanceof OgsError && err.code === 'invalid-credentials',
    )
    await assert.rejects(
      () => assertOk({ok: false, status: 500}, 'config'),
      (err) => err instanceof OgsError && err.code === 'network',
    )
  })
})
