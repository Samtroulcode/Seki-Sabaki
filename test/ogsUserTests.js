import assert from 'assert'

import {OgsError} from '../src/ogs/errors.js'
import {
  resolveOgsUrl,
  sanitizeFriends,
  sanitizePlayer,
  sanitizeUser,
} from '../src/ogs/users.js'

describe('OGS user helpers', () => {
  it('resolves OGS avatar URLs using upstream-compatible HTTPS rules', () => {
    assert.strictEqual(
      resolveOgsUrl('https://online-go.com', '/user/icon.png'),
      'https://online-go.com/user/icon.png',
    )

    assert.strictEqual(
      resolveOgsUrl('https://online-go.com', 'https://example.com/avatar.png'),
      'https://example.com/avatar.png',
    )

    for (let value of [
      'http://online-go.com/avatar.png',
      'file:///tmp/avatar.png',
      'data:image/svg+xml,avatar',
      'javascript:alert(1)',
      '//example.com/avatar.png',
    ]) {
      assert.strictEqual(resolveOgsUrl('https://online-go.com', value), null)
    }
  })

  it('also allows the OGS avatar upload subdomain', () => {
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.online-go.com/avatar-1.png',
      ),
      'https://user-uploads.online-go.com/avatar-1.png',
    )

    // External https avatars used by real OGS accounts are preserved as-is.
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.evil.example/avatar-1.png',
      ),
      'https://user-uploads.evil.example/avatar-1.png',
    )

    // Non-HTTPS variants must still be rejected.
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'http://user-uploads.online-go.com/avatar-1.png',
      ),
      null,
    )

    // Userinfo tricks are still rejected even under the more permissive https
    // policy for external avatars.
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.online-go.com@evil.example/avatar-1.png',
      ),
      null,
    )
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

  it('sanitizes OGS friends and marks presence as unknown', () => {
    assert.deepStrictEqual(
      sanitizeFriends(
        [
          {
            id: 7,
            username: 'sente',
            icon: 'https://user-uploads.online-go.com/avatar-7.png',
            ranking: 30,
          },
          {username: 'no-id-friend'},
          null,
        ],
        'https://online-go.com',
      ),
      [
        {
          id: 7,
          username: 'sente',
          rank: '1d',
          rating: null,
          iconUrl: 'https://user-uploads.online-go.com/avatar-7.png',
          online: null,
        },
      ],
    )

    assert.deepStrictEqual(sanitizeFriends(null, 'https://online-go.com'), [])
    assert.deepStrictEqual(
      sanitizeFriends('not-an-array', 'https://online-go.com'),
      [],
    )
  })
})
