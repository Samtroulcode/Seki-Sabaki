import assert from 'assert'

import {OgsError} from '../src/ogs/errors.js'
import {resolveOgsUrl, sanitizePlayer, sanitizeUser} from '../src/ogs/users.js'

describe('OGS user helpers', () => {
  it('resolves only same-origin HTTPS OGS URLs', () => {
    assert.strictEqual(
      resolveOgsUrl('https://online-go.com', '/user/icon.png'),
      'https://online-go.com/user/icon.png',
    )

    for (let value of [
      'https://example.com/avatar.png',
      'http://online-go.com/avatar.png',
      'file:///tmp/avatar.png',
      'data:image/svg+xml,avatar',
      'javascript:alert(1)',
      '//example.com/avatar.png',
    ]) {
      assert.strictEqual(resolveOgsUrl('https://online-go.com', value), null)
    }
  })

  it('sanitizes public login users', () => {
    assert.deepStrictEqual(
      sanitizeUser('https://online-go.com', {
        id: 123,
        username: 'sente',
        icon: '/user/icon.png',
        ratings: {overall: {rating: 1900}},
      }),
      {
        id: '123',
        username: 'sente',
        rank: '1d',
        rating: 1900,
        iconUrl: 'https://online-go.com/user/icon.png',
        online: true,
      },
    )

    assert.throws(
      () => sanitizeUser('https://online-go.com', null),
      (err) => err instanceof OgsError && err.code === 'invalid-response',
    )
  })

  it('sanitizes in-game players', () => {
    assert.deepStrictEqual(
      sanitizePlayer(
        {
          id: '7',
          username: 'sente',
          icon: '/avatar.png',
          ranking: 30,
          rating: 1900,
        },
        'https://online-go.com',
      ),
      {
        id: 7,
        username: 'sente',
        rank: '1d',
        rating: 1900,
        iconUrl: 'https://online-go.com/avatar.png',
      },
    )
  })
})
