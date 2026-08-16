import assert from 'assert'

import {OgsError} from '../src/ogs/errors.js'
import {
  resolveOgsUrl,
  sanitizeFriends,
  sanitizePlayer,
  sanitizeUser,
} from '../src/ogs/users.js'

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

  it('also allows the OGS avatar upload subdomain', () => {
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.online-go.com/avatar-1.png',
      ),
      'https://user-uploads.online-go.com/avatar-1.png',
    )

    // A different upload host (e.g. an unrelated third-party domain) must
    // still be rejected, only the exact expected subdomain is whitelisted.
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.evil.example/avatar-1.png',
      ),
      null,
    )

    // A homograph/suffix trick where the expected host is only a prefix of
    // an attacker-controlled domain must be rejected (origin comparison is
    // exact, not a `startsWith` check).
    assert.strictEqual(
      resolveOgsUrl(
        'https://online-go.com',
        'https://user-uploads.online-go.com.evil.example/avatar-1.png',
      ),
      null,
    )

    // A userinfo trick where the expected host appears before an `@` must
    // resolve to the real (attacker) hostname and be rejected.
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
