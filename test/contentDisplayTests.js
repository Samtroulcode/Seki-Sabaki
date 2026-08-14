import assert from 'assert'

import {htmlify, isSafeExternalUrl} from '../src/modules/contentdisplayhtml.js'

describe('ContentDisplay', () => {
  it('escapes generated link attributes', () => {
    let html = htmlify('bad" onmouseover="alert(1)@example.com')

    assert.match(html, /href="mailto:[^"]*&quot;[^"]*"/)
    assert.doesNotMatch(html, /href="[^"]*" onmouseover=/)
  })

  it('allows only safe external URL protocols', () => {
    assert.strictEqual(isSafeExternalUrl('https://online-go.com/'), true)
    assert.strictEqual(isSafeExternalUrl('http://online-go.com/'), true)
    assert.strictEqual(isSafeExternalUrl('mailto:user@example.com'), true)
    assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false)
    assert.strictEqual(isSafeExternalUrl('file:///tmp/game.sgf'), false)
  })
})
