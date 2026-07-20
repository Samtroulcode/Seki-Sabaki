const assert = require('assert')

const {normalizeExternalUrl, openExternalUrl} = require('../src/shell')

describe('shell helpers', () => {
  it('accepts http and https external URLs', () => {
    assert.strictEqual(
      normalizeExternalUrl('https://github.com/SabakiHQ/Sabaki'),
      'https://github.com/SabakiHQ/Sabaki',
    )
    assert.strictEqual(
      normalizeExternalUrl('http://sabaki.yichuanshen.de'),
      'http://sabaki.yichuanshen.de/',
    )
  })

  it('rejects malformed and non-web external URLs', () => {
    assert.strictEqual(normalizeExternalUrl('not a url'), null)
    assert.strictEqual(normalizeExternalUrl('javascript:alert(1)'), null)
    assert.strictEqual(normalizeExternalUrl('file:///etc/passwd'), null)
    assert.strictEqual(normalizeExternalUrl(null), null)
  })

  it('does not call Electron for rejected URLs', () => {
    let calls = []
    let shell = {openExternal: (url) => calls.push(url)}

    assert.strictEqual(openExternalUrl(shell, 'file:///etc/passwd'), false)
    assert.deepStrictEqual(calls, [])
  })

  it('opens normalized accepted URLs', () => {
    let calls = []
    let shell = {openExternal: (url) => calls.push(url)}

    assert.strictEqual(openExternalUrl(shell, 'https://example.com'), 1)
    assert.deepStrictEqual(calls, ['https://example.com/'])
  })
})
