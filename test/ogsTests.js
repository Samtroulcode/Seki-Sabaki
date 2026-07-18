import assert from 'assert'

import {
  OgsClient,
  OgsError,
  ratingToRank,
  sanitizeUser,
  setupOgsIpcHandlers,
} from '../src/ogs.js'

function response({status = 200, body, setCookie = null}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === 'set-cookie' ? setCookie : null),
    },
    json: async () => body,
  }
}

describe('OGS client', () => {
  it('converts OGS ratings to ranks', () => {
    assert.strictEqual(ratingToRank(100), '30k')
    assert.strictEqual(ratingToRank(525), '30k')
    assert.strictEqual(ratingToRank(1500), '6k')
    assert.strictEqual(ratingToRank(1900), '1d')
    assert.strictEqual(ratingToRank(null), null)
  })

  it('sanitizes public user data', () => {
    assert.deepStrictEqual(
      sanitizeUser('https://beta.online-go.com', {
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
        iconUrl: 'https://beta.online-go.com/user/icon.png',
        online: true,
      },
    )
  })

  it('rejects non-OGS avatar URLs', () => {
    for (let icon of [
      'https://example.com/avatar.png',
      'http://beta.online-go.com/avatar.png',
      'file:///tmp/avatar.png',
      'data:image/svg+xml,avatar',
      'javascript:alert(1)',
      '//example.com/avatar.png',
    ]) {
      assert.strictEqual(
        sanitizeUser('https://beta.online-go.com', {
          username: 'sente',
          icon,
          ratings: {overall: {rating: 1900}},
        }).iconUrl,
        null,
      )
    }
  })

  it('logs in via CSRF protected OGS endpoints and exposes no token', async () => {
    let calls = []
    let client = new OgsClient({
      fetchImpl: async (url, options = {}) => {
        calls.push({url, options})

        if (url.endsWith('/api/v1/ui/config')) {
          return response({
            body: {csrf_token: 'csrf'},
            setCookie: 'csrftoken=csrf; Path=/',
          })
        }

        return response({
          body: {
            user_jwt: 'jwt-token',
            user: {
              id: 7,
              username: 'sente',
              ratings: {overall: {rating: 1900}},
            },
          },
        })
      },
    })

    let user = await client.login({username: ' sente ', password: 'secret'})

    assert.strictEqual(calls.length, 2)
    assert.strictEqual(calls[0].options.redirect, 'error')
    assert.strictEqual(calls[1].options.method, 'POST')
    assert.strictEqual(calls[1].options.redirect, 'error')
    assert.strictEqual(calls[1].options.headers['X-CSRFToken'], 'csrf')
    assert.strictEqual(calls[1].options.headers.Cookie, 'csrftoken=csrf')
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), {
      username: 'sente',
      password: 'secret',
    })
    assert.deepStrictEqual(user, client.getSession())
    assert.strictEqual(user.jwtToken, undefined)

    client.logout()
    assert.strictEqual(client.getSession(), null)
  })

  it('serializes IPC login errors without throwing raw errors', async () => {
    let handlers = {}
    let ipcMain = {
      handle: (name, handler) => {
        handlers[name] = handler
      },
    }
    let client = new OgsClient({fetchImpl: async () => response({body: {}})})

    setupOgsIpcHandlers(ipcMain, client)

    assert.deepStrictEqual(await handlers['ogs:getSession'](), null)

    let result = await handlers['ogs:login']({}, {username: '', password: ''})
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error.code, 'invalid-input')
  })

  it('maps login failures to invalid credentials', async () => {
    let client = new OgsClient({
      fetchImpl: async (url) => {
        if (url.endsWith('/api/v1/ui/config')) {
          return response({body: {csrf_token: 'csrf'}})
        }

        return response({status: 403, body: {}})
      },
    })

    await assert.rejects(
      () => client.login({username: 'bad', password: 'bad'}),
      (err) => err instanceof OgsError && err.code === 'invalid-credentials',
    )
  })
})
