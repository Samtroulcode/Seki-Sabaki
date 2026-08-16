import assert from 'assert'

import {
  OgsClient,
  OgsError,
  ratingToRank,
  sanitizeUser,
  setupOgsIpcHandlers,
} from '../src/ogs.js'

function response({
  status = 200,
  body,
  text = null,
  bodyStream = null,
  setCookie = null,
  headers = {},
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: bodyStream,
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'set-cookie') return setCookie
        return headers[name.toLowerCase()] ?? null
      },
    },
    json: async () => body,
    text: async () => text,
  }
}

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.sent = []
    FakeWebSocket.instances.push(this)

    setTimeout(() => this.onopen?.(), 0)
  }

  send(message) {
    this.sent.push(message)

    let data = JSON.parse(message)
    if (data[0] === 'authenticate' && Number.isInteger(data[2])) {
      setTimeout(
        () =>
          this.onmessage?.({
            data: JSON.stringify([data[2], {id: 7, username: 'sente'}]),
          }),
        0,
      )
    }
  }

  close() {
    this.onclose?.()
  }

  receive(event, payload) {
    this.onmessage?.({data: JSON.stringify([event, payload])})
  }
}

class FailingWebSocket {
  constructor() {
    setTimeout(() => this.onerror?.(), 0)
  }

  close() {}
}

class RejectingAuthWebSocket extends FakeWebSocket {
  send(message) {
    this.sent.push(message)

    let data = JSON.parse(message)
    if (data[0] === 'authenticate' && Number.isInteger(data[2])) {
      setTimeout(
        () =>
          this.onmessage?.({
            data: JSON.stringify([
              data[2],
              null,
              {code: 'auth', message: 'Authentication failed.'},
            ]),
          }),
        0,
      )
    }
  }
}

class DelayedRejectingAuthWebSocket extends FakeWebSocket {
  send(message) {
    this.sent.push(message)

    let data = JSON.parse(message)
    if (data[0] === 'authenticate' && Number.isInteger(data[2])) {
      setTimeout(
        () =>
          this.onmessage?.({
            data: JSON.stringify([
              data[2],
              null,
              {code: 'auth', message: 'Authentication failed.'},
            ]),
          }),
        20,
      )
    }
  }
}

class DelayedAuthWebSocket extends FakeWebSocket {
  send(message) {
    this.sent.push(message)

    let data = JSON.parse(message)
    if (data[0] === 'authenticate' && Number.isInteger(data[2])) {
      setTimeout(
        () =>
          this.onmessage?.({
            data: JSON.stringify([data[2], {id: 7, username: 'sente'}]),
          }),
        20,
      )
    }
  }
}

function loginFetch(url, options = {}) {
  if (url.endsWith('/api/v1/ui/config')) {
    return response({
      body: {csrf_token: 'csrf'},
      setCookie: 'csrftoken=csrf; Path=/',
    })
  }

  if (url.endsWith('/api/v1/players/7/')) {
    return response({
      body: {
        id: 7,
        username: 'sente',
        icon: 'https://user-uploads.online-go.com/avatar-7.png',
      },
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
    assert.deepStrictEqual(
      sanitizeUser('https://online-go.com', {
        id: 124,
        username: 'gote',
        ranking: 27,
      }),
      {
        id: '124',
        username: 'gote',
        rank: '3k',
        rating: null,
        iconUrl: null,
        online: true,
      },
    )
  })

  it('rejects non-OGS avatar URLs', () => {
    for (let icon of [
      'http://online-go.com/avatar.png',
      'file:///tmp/avatar.png',
      'data:image/svg+xml,avatar',
      'javascript:alert(1)',
      '//example.com/avatar.png',
    ]) {
      assert.strictEqual(
        sanitizeUser('https://online-go.com', {
          username: 'sente',
          icon,
          ratings: {overall: {rating: 1900}},
        }).iconUrl,
        null,
      )
    }

    assert.strictEqual(
      sanitizeUser('https://online-go.com', {
        username: 'sente',
        icon: 'https://example.com/avatar.png',
        ratings: {overall: {rating: 1900}},
      }).iconUrl,
      'https://example.com/avatar.png',
    )
  })

  it('logs in via CSRF protected OGS endpoints and exposes no token', async () => {
    let calls = []
    FakeWebSocket.instances = []
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        calls.push({url, options})
        return loginFetch(url, options)
      },
    })

    let user = await client.login({username: ' sente ', password: 'secret'})

    assert.strictEqual(calls.length, 3)
    assert.strictEqual(calls[0].options.redirect, 'error')
    assert.strictEqual(calls[1].options.method, 'POST')
    assert.strictEqual(calls[1].options.redirect, 'error')
    assert.strictEqual(calls[1].options.headers['X-CSRFToken'], 'csrf')
    assert.strictEqual(calls[1].options.headers.Cookie, 'csrftoken=csrf')
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), {
      username: 'sente',
      password: 'secret',
    })
    assert.ok(calls[2].url.endsWith('/api/v1/players/7/'))
    assert.deepStrictEqual(user, client.getSession())
    assert.strictEqual(user.jwtToken, undefined)
    assert.strictEqual(
      user.iconUrl,
      'https://user-uploads.online-go.com/avatar-7.png',
    )
    assert.strictEqual(client.getState().socket.status, 'authenticated')
    assert.strictEqual(client.getState().socket.authenticated, true)

    let socket = FakeWebSocket.instances[0]
    assert.strictEqual(socket.url, 'wss://online-go.com/')
    assert.strictEqual(JSON.parse(socket.sent[0])[0], 'authenticate')
    assert.strictEqual(JSON.parse(socket.sent[0])[1].jwt, 'jwt-token')
    assert.strictEqual(Number.isInteger(JSON.parse(socket.sent[0])[2]), true)

    client.logout()
    assert.strictEqual(client.getSession(), null)
    assert.deepStrictEqual(client.getState().network, {
      latency: null,
      drift: null,
      updatedAt: null,
    })
    assert.strictEqual(client.getState().socket.status, 'disconnected')
  })

  it('loads logged-in player game history without exposing tokens', async () => {
    let calls = []
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        calls.push({url, options})
        if (url.includes('/game_history/')) {
          return response({
            body: {
              count: 1,
              next: null,
              previous: null,
              results: [
                {
                  id: 12345,
                  name: 'Friendly Match',
                  result: 'B+R',
                  ended: '2026-08-14T12:00:00Z',
                  width: 19,
                  height: 19,
                  black: 7,
                  white: 8,
                  players: {
                    black: {id: 7, username: 'sente', rank: '1d'},
                    white: {id: 8, username: 'gote', rank: '2k'},
                  },
                },
              ],
            },
          })
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})
    let history = await client.listGameHistory({pageSize: 500, page: -1})

    assert.strictEqual(
      calls.at(-1).url,
      'https://online-go.com/api/v1/players/7/game_history/?page=1&page_size=50',
    )
    assert.strictEqual(calls.at(-1).options.headers.Authorization, undefined)
    assert.deepStrictEqual(history.results, [
      {
        id: 12345,
        name: 'Friendly Match',
        result: 'B+R',
        winner: null,
        ended: '2026-08-14T12:00:00Z',
        board: {width: 19, height: 19},
        black: {id: 7, username: 'sente', rank: '1d'},
        white: {id: 8, username: 'gote', rank: '2k'},
      },
    ])
  })

  it('loads OGS friends using the login session cookie and monitors presence', async () => {
    FakeWebSocket.instances = []
    let calls = []
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        calls.push({url, options})

        if (url.endsWith('/api/v1/ui/friends')) {
          return response({
            body: {
              friends: [
                {
                  id: 8,
                  username: 'gote',
                  icon: 'https://user-uploads.online-go.com/avatar-8.png',
                  ranking: 15,
                },
              ],
              friend_requests: [],
              friend_requests_sent: [],
            },
          })
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})

    let friends = await client.listFriends()

    assert.deepStrictEqual(friends, [
      {
        id: 8,
        username: 'gote',
        rank: '15k',
        rating: null,
        iconUrl: 'https://user-uploads.online-go.com/avatar-8.png',
        online: null,
      },
    ])
    assert.deepStrictEqual(client.getState().friends, friends)

    let friendsCall = calls.find((call) => call.url.endsWith('/ui/friends'))
    assert.strictEqual(friendsCall.options.headers.Cookie, 'csrftoken=csrf')

    let socket = FakeWebSocket.instances[0]
    let monitorMessage = socket.sent
      .map((message) => JSON.parse(message))
      .find((message) => message[0] === 'user/monitor')

    assert.deepStrictEqual(monitorMessage[1], {user_ids: [8]})

    socket.receive('user/state', {8: true})

    assert.deepStrictEqual(client.getState().friends, [
      {...friends[0], online: true},
    ])

    socket.receive('user/state', {8: false})

    assert.deepStrictEqual(client.getState().friends, [
      {...friends[0], online: false},
    ])
  })

  it('rejects listing OGS friends without an authenticated session', async () => {
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async () => {
        throw new Error('fetch should not be called')
      },
    })

    await assert.rejects(
      () => client.listFriends(),
      (err) => err instanceof OgsError && err.code === 'not-authenticated',
    )
  })

  it('caps sanitized OGS game history to the requested page size', async () => {
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        if (url.includes('/game_history/')) {
          return response({
            body: {
              count: 3,
              next: null,
              previous: null,
              results: [
                {id: 1, name: 'One', width: 19, height: 19},
                {id: 2, name: 'Two', width: 19, height: 19},
                {id: 3, name: 'Three', width: 19, height: 19},
              ],
            },
          })
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})
    let history = await client.listGameHistory({pageSize: 2})

    assert.deepStrictEqual(
      history.results.map((game) => game.id),
      [1, 2],
    )
  })

  it('downloads logged-in OGS game SGF', async () => {
    let calls = []
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        calls.push({url, options})
        if (url.endsWith('/api/v1/games/12345/sgf')) {
          return response({text: '(;FF[4]GM[1]SZ[19])'})
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})
    let sgf = await client.downloadGameSgf({gameId: 12345})

    assert.strictEqual(sgf, '(;FF[4]GM[1]SZ[19])')
    assert.strictEqual(
      calls.at(-1).url,
      'https://online-go.com/api/v1/games/12345/sgf',
    )
    assert.strictEqual(calls.at(-1).options.headers.Authorization, undefined)
  })

  it('rejects oversized OGS game SGF downloads', async () => {
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/api/v1/games/12345/sgf')) {
          return response({
            text: '(;FF[4])',
            headers: {'content-length': String(6 * 1024 * 1024)},
          })
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})

    await assert.rejects(
      () => client.downloadGameSgf({gameId: 12345}),
      (err) => err instanceof OgsError && err.code === 'invalid-response',
    )
  })

  it('rejects oversized streamed OGS game SGF downloads', async () => {
    let chunk = new Uint8Array(1024 * 1024)
    let remainingChunks = 6
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/api/v1/games/12345/sgf')) {
          return response({
            bodyStream: {
              getReader: () => ({
                read: async () => {
                  if (remainingChunks-- <= 0) return {done: true}
                  return {done: false, value: chunk}
                },
                cancel: async () => {},
                releaseLock: () => {},
              }),
            },
          })
        }

        return loginFetch(url, options)
      },
    })

    await client.login({username: 'sente', password: 'secret'})

    await assert.rejects(
      () => client.downloadGameSgf({gameId: 12345}),
      (err) => err instanceof OgsError && err.code === 'invalid-response',
    )
  })

  it('persists OGS session tokens without exposing them publicly', async () => {
    let savedSession = null
    let clearCount = 0
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => 1234,
      credentialStore: {
        saveSession: (session) => {
          savedSession = session
          return true
        },
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    await client.login({username: 'sente', password: 'secret'})

    assert.strictEqual(clearCount, 0)
    assert.strictEqual(savedSession.serverUrl, 'https://online-go.com')
    assert.strictEqual(savedSession.jwtToken, 'jwt-token')
    assert.strictEqual(savedSession.cookieHeader, 'csrftoken=csrf')
    assert.strictEqual(savedSession.user.username, 'sente')
    assert.strictEqual(savedSession.createdAt, 1234)
    assert.strictEqual(client.getSession().jwtToken, undefined)
    assert.strictEqual(client.getState().user.jwtToken, undefined)

    client.logout()
    assert.strictEqual(clearCount, 1)
  })

  it('restores persisted OGS sessions in the main process', async () => {
    FakeWebSocket.instances = []
    let user = {
      id: '7',
      username: 'sente',
      rank: '1d',
      rating: null,
      iconUrl: null,
      online: true,
    }
    let client = new OgsClient({
      fetchImpl: async (url) => {
        if (url.endsWith('/api/v1/players/7/')) {
          return response({
            body: {
              id: 7,
              username: 'sente',
              icon: 'https://secure.gravatar.com/avatar/abc123?s=128',
            },
          })
        }

        return response({status: 404, body: {}})
      },
      webSocketImpl: FakeWebSocket,
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stored-jwt',
          cookieHeader: 'sessionid=stored-cookie; csrftoken=csrf',
          user,
        }),
        clearSession: () => true,
      },
    })

    let state = await client.restoreStoredSession()

    let expectedUser = {
      ...user,
      iconUrl: 'https://secure.gravatar.com/avatar/abc123?s=128',
    }

    assert.deepStrictEqual(client.getSession(), expectedUser)
    assert.deepStrictEqual(state.user, expectedUser)
    assert.strictEqual(state.socket.status, 'authenticated')
    assert.strictEqual(
      JSON.parse(FakeWebSocket.instances[0].sent[0])[1].jwt,
      'stored-jwt',
    )
    assert.strictEqual(
      client.session.cookieHeader,
      'sessionid=stored-cookie; csrftoken=csrf',
    )
  })

  it('loads OGS friends after restoring a persisted session cookie', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/api/v1/ui/friends')) {
          assert.strictEqual(
            options.headers.Cookie,
            'sessionid=stored-cookie; csrftoken=csrf',
          )

          return response({
            body: {
              friends: [{id: 8, username: 'gote', ranking: 15}],
              friend_requests: [],
              friend_requests_sent: [],
            },
          })
        }

        return response({status: 404, body: {}})
      },
      webSocketImpl: FakeWebSocket,
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stored-jwt',
          cookieHeader: 'sessionid=stored-cookie; csrftoken=csrf',
          user: {id: '7', username: 'sente', rank: '1d', iconUrl: null},
        }),
        clearSession: () => true,
      },
    })

    await client.restoreStoredSession()
    let friends = await client.listFriends()

    assert.deepStrictEqual(friends, [
      {
        id: 8,
        username: 'gote',
        rank: '15k',
        rating: null,
        iconUrl: null,
        online: null,
      },
    ])
  })

  it('ignores stale restore failures after a manual login starts', async () => {
    FakeWebSocket.instances = []
    let socketCount = 0
    let clearCount = 0
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: class {
        constructor(url) {
          socketCount++
          return socketCount === 1
            ? new DelayedRejectingAuthWebSocket(url)
            : new FakeWebSocket(url)
        }
      },
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stale-jwt',
          user: {id: '7', username: 'sente'},
        }),
        saveSession: () => true,
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    let restorePromise = client.restoreStoredSession()
    await client.login({username: 'sente', password: 'secret'})
    await restorePromise

    assert.strictEqual(client.getSession().username, 'sente')
    assert.strictEqual(client.getState().socket.status, 'authenticated')
    assert.strictEqual(clearCount, 0)
  })

  it('ignores stale restore successes after a manual login starts', async () => {
    FakeWebSocket.instances = []
    let socketCount = 0
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: class {
        constructor(url) {
          socketCount++
          return socketCount === 1
            ? new DelayedAuthWebSocket(url)
            : new FakeWebSocket(url)
        }
      },
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stale-jwt',
          user: {id: '7', username: 'old-user'},
        }),
        saveSession: () => true,
        clearSession: () => true,
      },
    })

    let restorePromise = client.restoreStoredSession()
    await client.login({username: 'sente', password: 'secret'})
    await restorePromise

    assert.strictEqual(client.getSession().username, 'sente')
    assert.strictEqual(client.getState().socket.status, 'authenticated')
    assert.strictEqual(
      JSON.parse(FakeWebSocket.instances.at(-1).sent[0])[1].jwt,
      'jwt-token',
    )
  })

  it('reuses an in-flight OGS session restore', async () => {
    FakeWebSocket.instances = []
    let clearCount = 0
    let client = new OgsClient({
      webSocketImpl: DelayedAuthWebSocket,
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stored-jwt',
          user: {id: '7', username: 'sente'},
        }),
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    let [firstState, secondState] = await Promise.all([
      client.restoreStoredSession(),
      client.restoreStoredSession(),
    ])

    assert.strictEqual(FakeWebSocket.instances.length, 1)
    assert.strictEqual(clearCount, 0)
    assert.strictEqual(firstState.user.username, 'sente')
    assert.deepStrictEqual(secondState, firstState)
    assert.strictEqual(client.getState().socket.status, 'authenticated')
  })

  it('clears persisted sessions with malformed stored users', async () => {
    FakeWebSocket.instances = []
    let clearCount = 0
    let client = new OgsClient({
      webSocketImpl: FakeWebSocket,
      credentialStore: {
        loadSession: () => ({
          serverUrl: 'https://online-go.com',
          jwtToken: 'stored-jwt',
          user: 'invalid-user',
        }),
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    let state = await client.restoreStoredSession()

    assert.strictEqual(state.user, null)
    assert.strictEqual(clearCount, 1)
    assert.strictEqual(FakeWebSocket.instances.length, 0)
  })

  it('keeps persisted sessions when manual relogin fails', async () => {
    let clearCount = 0
    let client = new OgsClient({
      fetchImpl: async (url) => {
        if (url.endsWith('/api/v1/ui/config')) {
          return response({body: {csrf_token: 'csrf'}})
        }

        return response({status: 403, body: {}})
      },
      credentialStore: {
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    await assert.rejects(
      () => client.login({username: 'bad', password: 'bad'}),
      (err) => err instanceof OgsError && err.code === 'invalid-credentials',
    )
    assert.strictEqual(clearCount, 0)
  })

  it('clears stale persisted sessions when saving a successful login fails', async () => {
    let clearCount = 0
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      credentialStore: {
        saveSession: () => false,
        clearSession: () => {
          clearCount++
          return true
        },
      },
    })

    await client.login({username: 'sente', password: 'secret'})

    assert.strictEqual(client.getSession().username, 'sente')
    assert.strictEqual(clearCount, 1)
  })

  it('tracks OGS network latency, drift, and reports game latency', async () => {
    FakeWebSocket.instances = []
    let times = [1000, 1100, 1120, 2000]
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => times.shift(),
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]

    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'net/ping',
      {client: 1000, latency: 0, drift: 0},
    ])

    client.connectGame({gameId: 12345})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-2)), [
      'net/ping',
      {client: 1100, latency: 0, drift: 0},
    ])
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/connect',
      {game_id: 12345, chat: true},
    ])
    socket.receive('net/pong', {client: 1000, server: 1040})

    assert.deepStrictEqual(client.getState().network, {
      latency: 120,
      drift: 20,
      updatedAt: 1120,
    })
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/latency',
      {game_id: 12345, latency: 120},
    ])

    client.sendNetworkPing()
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'net/ping',
      {client: 2000, latency: 120, drift: 20},
    ])
  })

  it('ignores invalid network latency payloads', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => 2000,
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]
    let sentCount = socket.sent.length

    socket.receive('net/pong', {client: 'bad', server: 1000})
    socket.receive('net/pong', {client: 1000, server: 'bad'})
    socket.receive('net/pong', {client: 1, server: 1000})
    socket.receive('net/pong', {client: 2001, server: 1000})

    assert.deepStrictEqual(client.getState().network, {
      latency: null,
      drift: null,
      updatedAt: null,
    })
    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('ignores stale network pong measurements', async () => {
    FakeWebSocket.instances = []
    let times = [1000, 1100, 1110, 1200]
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => times.shift(),
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})
    let socket = FakeWebSocket.instances[0]

    socket.receive('net/pong', {client: 1100, server: 1060})
    assert.deepStrictEqual(client.getState().network, {
      latency: 10,
      drift: 45,
      updatedAt: 1110,
    })

    let sentCount = socket.sent.length
    socket.receive('net/pong', {client: 1000, server: 980})

    assert.deepStrictEqual(client.getState().network, {
      latency: 10,
      drift: 45,
      updatedAt: 1110,
    })
    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('ignores duplicate network pong measurements', async () => {
    FakeWebSocket.instances = []
    let times = [1000, 1010, 1200]
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => times.shift(),
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]

    socket.receive('net/pong', {client: 1000, server: 1005})
    assert.deepStrictEqual(client.getState().network, {
      latency: 10,
      drift: 0,
      updatedAt: 1010,
    })

    let sentCount = socket.sent.length
    socket.receive('net/pong', {client: 1000, server: 1005})

    assert.deepStrictEqual(client.getState().network, {
      latency: 10,
      drift: 0,
      updatedAt: 1010,
    })
    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('keeps OGS network ping identifiers monotonic', async () => {
    FakeWebSocket.instances = []
    let times = [1000, 1000, 1000]
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
      now: () => times.shift(),
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]

    client.connectGame({gameId: 12345})
    client.sendNetworkPing()

    assert.deepStrictEqual(
      socket.sent
        .map((message) => JSON.parse(message))
        .filter(([event]) => event === 'net/ping')
        .map(([, payload]) => payload.client),
      [1000, 1001, 1002],
    )
  })

  it('stores OGS game latency per player', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})
    let socket = FakeWebSocket.instances[0]

    socket.receive('game/12345/latency', {player_id: 7, latency: 80})
    socket.receive('game/12345/latency', {player_id: 8, latency: -1})
    socket.receive('game/99999/latency', {player_id: 8, latency: 120})

    assert.deepStrictEqual(client.getState().onlineGame.latencies, {7: 80})
  })

  it('does not keep a session after socket login failure', async () => {
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FailingWebSocket,
    })

    await assert.rejects(
      () => client.login({username: 'sente', password: 'secret'}),
      (err) => err instanceof OgsError && err.code === 'network',
    )

    assert.strictEqual(client.getSession(), null)
    assert.strictEqual(client.getState().user, null)
    assert.strictEqual(client.getState().socket.status, 'error')
  })

  it('does not keep a session after socket auth rejection', async () => {
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: RejectingAuthWebSocket,
    })

    await assert.rejects(
      () => client.login({username: 'sente', password: 'secret'}),
      (err) => err instanceof OgsError && err.code === 'socket-request-failed',
    )

    assert.strictEqual(client.getSession(), null)
    assert.strictEqual(client.getState().user, null)
    assert.strictEqual(client.getState().socket.status, 'error')
  })

  it('clears an existing session before a failed relogin', async () => {
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    assert.notStrictEqual(client.getSession(), null)

    client.socket.WebSocketImpl = FailingWebSocket

    await assert.rejects(
      () => client.login({username: 'sente', password: 'secret'}),
      (err) => err instanceof OgsError && err.code === 'network',
    )

    assert.strictEqual(client.getSession(), null)
    assert.strictEqual(client.getState().user, null)
  })

  it('sanitizes matchmaking options', () => {
    let client = new OgsClient({webSocketImpl: FakeWebSocket})
    let state = client.setMatchmakingOptions({
      boardSizes: [9, 19, 99],
      speeds: ['blitz', 'bad'],
      timeSystem: 'fischer',
      lowerRankDiff: 20,
      upperRankDiff: 2,
      rules: {condition: 'preferred', value: 'aga'},
      handicap: {condition: 'required', value: 'disabled'},
    })

    assert.deepStrictEqual(state.matchmaking.options, {
      boardSizes: [9, 19],
      speeds: ['blitz'],
      timeSystem: 'fischer',
      lowerRankDiff: 9,
      upperRankDiff: 2,
      rules: {condition: 'preferred', value: 'aga'},
      handicap: {condition: 'required', value: 'disabled'},
    })

    assert.deepStrictEqual(
      client.setMatchmakingOptions(null).matchmaking.options,
      {
        boardSizes: [19],
        speeds: ['rapid'],
        timeSystem: 'byoyomi',
        lowerRankDiff: 3,
        upperRankDiff: 3,
        rules: {condition: 'required', value: 'japanese'},
        handicap: {condition: 'preferred', value: 'enabled'},
      },
    )
  })

  it('starts, cancels, and handles OGS automatch', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.setMatchmakingOptions({
      boardSizes: [9, 13],
      speeds: ['blitz', 'rapid'],
      timeSystem: 'fischer',
      lowerRankDiff: 1,
      upperRankDiff: 2,
      rules: {condition: 'required', value: 'chinese'},
      handicap: {condition: 'preferred', value: 'enabled'},
    })

    let state = client.startAutomatch()
    let socket = FakeWebSocket.instances[0]

    assert.strictEqual(state.matchmaking.status, 'searching')
    assert.strictEqual(typeof state.matchmaking.payload.uuid, 'string')
    assert.strictEqual(typeof state.matchmaking.payload.timestamp, 'number')
    assert.deepStrictEqual(state.matchmaking.payload.size_speed_options, [
      {size: '9x9', speed: 'blitz', system: 'fischer'},
      {size: '9x9', speed: 'rapid', system: 'fischer'},
      {size: '13x13', speed: 'blitz', system: 'fischer'},
      {size: '13x13', speed: 'rapid', system: 'fischer'},
    ])
    assert.strictEqual(state.matchmaking.payload.lower_rank_diff, 1)
    assert.strictEqual(state.matchmaking.payload.upper_rank_diff, 2)
    assert.deepStrictEqual(state.matchmaking.payload.rules, {
      condition: 'required',
      value: 'chinese',
    })
    assert.deepStrictEqual(state.matchmaking.payload.handicap, {
      condition: 'preferred',
      value: 'enabled',
    })
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'automatch/find_match',
      state.matchmaking.payload,
    ])
    let sentCount = socket.sent.length
    assert.throws(
      () => client.startAutomatch(),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.strictEqual(socket.sent.length, sentCount)
    assert.throws(
      () => client.setMatchmakingOptions({boardSizes: [19]}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.deepStrictEqual(
      client.getState().matchmaking.payload,
      state.matchmaking.payload,
    )

    let uuid = state.matchmaking.payload.uuid

    state = client.cancelAutomatch({uuid: 'not-owned'})
    assert.strictEqual(state.matchmaking.status, 'idle')
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'automatch/cancel',
      {uuid},
    ])
    socket.receive('automatch/entry', {uuid, timestamp: 123})
    state = client.getState()
    assert.strictEqual(state.matchmaking.status, 'idle')
    socket.receive('automatch/start', {uuid, game_id: 99999})
    state = client.getState()
    assert.strictEqual(state.onlineGame.gameId, null)

    client.startAutomatch()
    uuid = client.getState().matchmaking.payload.uuid
    let localPayload = client.getState().matchmaking.payload
    socket.receive('automatch/entry', {
      uuid,
      size_speed_options: [{size: '19x19', speed: 'live', system: 'byoyomi'}],
      lower_rank_diff: 9,
      upper_rank_diff: 9,
      timestamp: 456,
    })
    state = client.getState()
    assert.deepStrictEqual(state.matchmaking.payload, {
      ...localPayload,
      timestamp: 456,
    })
    socket.receive('automatch/entry', {uuid: 'foreign-search', timestamp: 789})
    socket.receive('automatch/start', {uuid: 'foreign-search', game_id: 99999})
    state = client.getState()
    assert.strictEqual(state.matchmaking.status, 'searching')
    assert.strictEqual(state.matchmaking.payload.uuid, uuid)
    assert.strictEqual(state.onlineGame.gameId, null)
    socket.receive('automatch/start', {uuid: 'stale-search', game_id: 99999})
    state = client.getState()
    assert.strictEqual(state.matchmaking.status, 'searching')
    assert.strictEqual(state.onlineGame.gameId, null)

    socket.receive('automatch/start', {uuid, game_id: 12345})
    state = client.getState()
    assert.strictEqual(state.matchmaking.status, 'matched')
    assert.strictEqual(state.matchmaking.matchedGameId, 12345)
    assert.strictEqual(state.onlineGame.status, 'connecting')
    assert.strictEqual(state.onlineGame.gameId, 12345)
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/connect',
      {game_id: 12345, chat: true},
    ])
    socket.receive('automatch/cancel', {uuid})
    state = client.getState()
    assert.strictEqual(state.matchmaking.status, 'matched')
    assert.strictEqual(state.matchmaking.matchedGameId, 12345)
    sentCount = socket.sent.length
    assert.throws(
      () => client.cancelAutomatch(),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.strictEqual(socket.sent.length, sentCount)

    state = client.acknowledgeAutomatchOpen({gameId: 12345})
    assert.strictEqual(state.matchmaking.status, 'idle')
    assert.strictEqual(state.matchmaking.matchedGameId, null)

    state = client.setMatchmakingOptions({boardSizes: [19]})
    assert.strictEqual(state.matchmaking.status, 'idle')
    assert.strictEqual(state.matchmaking.payload, null)
  })

  it('connects to an OGS game and stores sanitized pushed game events', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    FakeWebSocket.instances[0].receive('active_game', {
      id: 12345,
      name: 'Friendly game',
      width: 19,
      height: 19,
      phase: 'play',
      move_number: 2,
      player_to_move: 7,
      clock_expiration: 1784381000000,
      ranked: true,
      rules: 'japanese',
      handicap: 0,
      komi: 6.5,
      time_per_move: 300,
      time_control: {system: 'fischer', speed: 'rapid', time_per_move: 300},
      black: {id: 7, username: 'sente', ratings: {overall: {rating: 1500}}},
      white: {id: 8, username: 'gote', ranking: 27},
      jwt: 'must-not-leak',
    })

    let state = client.getState()
    assert.deepStrictEqual(state.activeGames, [
      {
        id: 12345,
        name: 'Friendly game',
        board: {width: 19, height: 19},
        phase: 'play',
        ranked: true,
        rules: 'japanese',
        handicap: 0,
        komi: 6.5,
        timePerMove: 300,
        timeControl: {
          system: 'fischer',
          speed: 'rapid',
          timePerMove: 300,
          mainTime: null,
          periodTime: null,
          periods: null,
        },
        moveNumber: 2,
        playerToMove: 7,
        clockExpiration: 1784381000000,
        black: {
          id: 7,
          username: 'sente',
          rank: '6k',
          rating: 1500,
          iconUrl: null,
        },
        white: {
          id: 8,
          username: 'gote',
          rank: '3k',
          rating: null,
          iconUrl: null,
        },
      },
    ])
    assert.strictEqual(JSON.stringify(state).includes('must-not-leak'), false)

    state = client.connectGame({gameId: '12345'})
    let socket = FakeWebSocket.instances[0]

    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/connect',
      {game_id: 12345, chat: true},
    ])
    assert.strictEqual(state.onlineGame.status, 'connecting')
    assert.strictEqual(state.onlineGame.gameId, 12345)

    socket.receive('game/12345/gamedata', {
      game_name: 'Friendly game',
      width: 19,
      height: 19,
      handicap: 0,
      komi: 6.5,
      rules: 'chinese',
      ranked: true,
      time_per_move: 30,
      time_control: {
        system: 'byoyomi',
        speed: 'live',
        main_time: 600,
        period_time: 30,
        periods: 5,
      },
      phase: 'play',
      players: {
        black: {
          id: 7,
          username: 'sente',
          ratings: {overall: {rating: 1500}},
          icon: '/user/icon/sente.png',
        },
        white: {id: 8, username: 'gote', rank: 27},
      },
      moves: 'aabb',
    })
    socket.receive('game/12345/move', {move_number: 3, move: [2, 2, 1000]})
    socket.receive('game/12345/clock', {
      game_id: 12345,
      title: 'Byo-Yomi',
      black_player_id: 7,
      white_player_id: 8,
      current_player: 8,
      expiration: 1784381000000,
      now: 1784380940000,
      last_move: 3,
      black_time: {thinking_time: 120, skip_bonus: true},
      white_time: {
        thinking_time: 60,
        period_time: 30,
        period_time_left: 20,
        periods: 5,
      },
      jwt: 'must-not-leak',
    })
    socket.receive('game/12345/chat', {
      channel: 'main',
      line: {
        username: 'gote',
        body: 'hello',
        move_number: 3,
        date: 1784381000000,
      },
    })
    socket.receive('game/12345/phase', {phase: 'stone removal'})
    socket.receive('game/12345/removed_stones', {
      removed: true,
      stones: 'babb',
      all_removed: 'aabb',
    })
    socket.receive('game/12345/removed_stones_accepted', {
      player_id: 7,
      stones: 'babb',
      strict_seki_mode: false,
      phase: 'stone removal',
    })
    socket.receive('game/99999/move', {move_number: 99, move: 'dd'})

    state = client.getState()

    assert.strictEqual(state.onlineGame.status, 'connected')
    assert.strictEqual(state.onlineGame.gameName, 'Friendly game')
    assert.deepStrictEqual(state.onlineGame.board, {width: 19, height: 19})
    assert.strictEqual(state.onlineGame.handicap, 0)
    assert.strictEqual(state.onlineGame.komi, 6.5)
    assert.strictEqual(state.onlineGame.rules, 'chinese')
    assert.strictEqual(state.onlineGame.ranked, true)
    assert.deepStrictEqual(state.onlineGame.timeControl, {
      system: 'byoyomi',
      speed: 'live',
      timePerMove: null,
      mainTime: 600,
      periodTime: 30,
      periods: 5,
    })
    assert.strictEqual(state.onlineGame.timePerMove, 30)
    assert.strictEqual(state.onlineGame.players.black.username, 'sente')
    assert.strictEqual(state.onlineGame.players.black.rank, '6k')
    assert.strictEqual(state.onlineGame.players.black.rating, 1500)
    assert.strictEqual(
      state.onlineGame.players.black.iconUrl,
      'https://online-go.com/user/icon/sente.png',
    )
    assert.strictEqual(state.onlineGame.players.white.username, 'gote')
    assert.strictEqual(state.onlineGame.players.white.rank, '3k')
    assert.strictEqual(state.onlineGame.phase, 'stone removal')
    assert.strictEqual(state.onlineGame.removedStones, 'babb')
    assert.deepStrictEqual(state.onlineGame.removedStonesAccepted, [7])

    socket.receive('game/12345/removed_stones', {strict_seki_mode: true})
    state = client.getState()
    assert.strictEqual(state.onlineGame.removedStones, 'babb')

    socket.receive('game/12345/removed_stones_accepted', {
      player_id: 0,
      stones: 'babb',
      strict_seki_mode: true,
      phase: 'stone removal',
    })
    state = client.getState()
    assert.deepStrictEqual(state.onlineGame.removedStonesAccepted, [7, 8])

    socket.receive('game/12345/removed_stones', {
      removed: false,
      stones: 'babb',
      all_removed: '',
    })
    state = client.getState()
    assert.strictEqual(state.onlineGame.removedStones, '')

    socket.receive('game/12345/removed_stones', {
      removed: true,
      all_removed: 'babb'.repeat(200),
    })
    state = client.getState()
    assert.strictEqual(state.onlineGame.removedStones, 'babb')

    assert.strictEqual(state.onlineGame.moveCount, 3)
    assert.strictEqual(state.onlineGame.lastMove, 'cc')
    assert.deepStrictEqual(state.onlineGame.moves, [
      {move: 'aa', moveNumber: 1},
      {move: 'bb', moveNumber: 2},
      {move: 'cc', moveNumber: 3},
    ])
    assert.strictEqual(state.onlineGame.clock.gameId, 12345)
    assert.strictEqual(state.onlineGame.clock.title, 'Byo-Yomi')
    assert.strictEqual(state.onlineGame.clock.blackPlayerId, 7)
    assert.strictEqual(state.onlineGame.clock.whitePlayerId, 8)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.expiration, 1784381000000)
    assert.strictEqual(state.onlineGame.clock.now, 1784380940000)
    assert.strictEqual(state.onlineGame.clock.lastMove, 3)
    assert.deepStrictEqual(state.onlineGame.clock.blackTime, {
      thinkingTime: 120,
      periodTime: null,
      periodTimeLeft: null,
      periods: null,
      blockTime: null,
      movesLeft: null,
      skipBonus: true,
    })
    assert.deepStrictEqual(state.onlineGame.clock.whiteTime, {
      thinkingTime: 60,
      periodTime: 30,
      periodTimeLeft: 20,
      periods: 5,
      blockTime: null,
      movesLeft: null,
      skipBonus: false,
    })
    assert.strictEqual(Number.isFinite(state.onlineGame.clock.receivedAt), true)
    assert.deepStrictEqual(state.onlineGame.chat, [
      {
        channel: 'main',
        username: 'gote',
        body: 'hello',
        moveNumber: 3,
        date: 1784381000000,
      },
    ])
    assert.strictEqual(JSON.stringify(state).includes('must-not-leak'), false)

    socket.receive('game/12345/data', {
      phase: 'finished',
      outcome: 'Resignation',
      winner: 7,
    })
    state = client.getState()
    assert.strictEqual(state.onlineGame.phase, 'finished')
    assert.strictEqual(state.onlineGame.outcome, 'Resignation')
    assert.strictEqual(state.onlineGame.winner, 7)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.lastMove, 3)
    assert.deepStrictEqual(state.onlineGame.board, {width: 19, height: 19})
    assert.deepStrictEqual(state.onlineGame.moves, [
      {move: 'aa', moveNumber: 1},
      {move: 'bb', moveNumber: 2},
      {move: 'cc', moveNumber: 3},
    ])

    socket.receive('game/12345/move', {move_number: 3, move: 'dd'})
    state = client.getState()
    assert.deepStrictEqual(state.onlineGame.moves.at(-1), {
      move: 'dd',
      moveNumber: 3,
    })
    assert.strictEqual(state.onlineGame.moves.length, 3)

    socket.receive('game/12345/gamedata', {
      game_name: 'Friendly game',
      width: 9,
      height: 9,
      moves: [[0, 0, 1000], {x: 1, y: 1}, [9, 9, 1000], '..'],
    })
    state = client.getState()
    assert.deepStrictEqual(state.onlineGame.moves, [
      {move: 'aa', moveNumber: 1},
      {move: 'bb', moveNumber: 2},
      {move: '..', moveNumber: 3},
    ])
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.lastMove, 3)

    socket.receive('game/12345/reset-chats')
    assert.deepStrictEqual(client.getState().onlineGame.chat, [])

    socket.receive('game/12345/error', {message: 'Game unavailable.'})
    assert.strictEqual(client.getState().onlineGame.status, 'error')
    assert.strictEqual(client.getState().onlineGame.error, 'Game unavailable.')

    state = client.disconnectGame({gameId: 12345})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/disconnect',
      {game_id: 12345},
    ])
    assert.strictEqual(state.onlineGame.status, 'idle')
    assert.strictEqual(state.onlineGame.gameId, null)
  })

  it('enriches incomplete online-game players from their OGS profiles', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/api/v1/players/7/')) return loginFetch(url, options)
        if (url.endsWith('/api/v1/players/8/')) {
          return response({
            body: {
              id: 8,
              username: 'gote',
              ranking: 27,
              icon: 'https://user-uploads.online-go.com/gote.png',
            },
          })
        }

        return loginFetch(url, options)
      },
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]
    client.connectGame({gameId: 12345})
    socket.receive('game/12345/gamedata', {
      game_name: 'Profile game',
      width: 19,
      height: 19,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente', rank: '1d'},
        white: {id: 8, username: 'gote'},
      },
      moves: '',
    })

    await new Promise((resolve) => setImmediate(resolve))
    let player = client.getState().onlineGame.players.white

    assert.strictEqual(player.rank, '3k')
    assert.strictEqual(
      player.iconUrl,
      'https://user-uploads.online-go.com/gote.png',
    )
  })

  it('finishes an OGS game from a gameEnded notification', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]
    client.connectGame({gameId: 12345})
    socket.receive('game/12345/gamedata', {
      game_name: 'Finished game',
      width: 19,
      height: 19,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: '',
    })
    socket.receive('notification', {
      type: 'gameEnded',
      game_id: 12345,
      winner: 7,
      outcome: '5.5 points',
    })

    let state = client.getState()
    assert.strictEqual(state.onlineGame.phase, 'finished')
    assert.strictEqual(state.onlineGame.winner, 7)
    assert.strictEqual(state.onlineGame.outcome, '5.5 points')
  })

  it('rejects invalid game IDs before sending game commands', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]
    let sentCount = socket.sent.length

    assert.throws(
      () => client.connectGame({gameId: 'https://online-go.com/game/1'}),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )

    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('sends validated OGS move, pass, and resign commands', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      game_name: 'Friendly game',
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: [],
    })
    socket.receive('game/12345/clock', {current_player: 7, last_move: 0})

    client.playMove({gameId: 12345, x: 2, y: 3})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/move',
      {game_id: 12345, move: 'cd'},
    ])
    assert.throws(
      () => client.playMove({gameId: 12345, x: 3, y: 3}),
      (err) => err instanceof OgsError && err.code === 'move-pending',
    )

    socket.receive('game/12345/move', {move_number: 1, move: 'cd'})
    socket.receive('game/12345/clock', {current_player: 8, last_move: 1})
    assert.throws(
      () => client.playMove({gameId: 12345, x: 3, y: 3}),
      (err) => err instanceof OgsError && err.code === 'not-your-turn',
    )

    socket.receive('game/12345/move', {move_number: 2, move: 'dd'})
    client.sendChat({gameId: 12345, body: ' hello '})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/chat',
      {game_id: 12345, type: 'main', move_number: 2, body: 'hello'},
    ])
    assert.throws(
      () => client.sendChat({gameId: 12345, body: '   '}),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )
    assert.throws(
      () => client.sendChat({gameId: 12345, body: 'x'.repeat(1001)}),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )

    client.pass({gameId: 12345})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/move',
      {game_id: 12345, move: '..'},
    ])

    client.resign({gameId: 12345})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/resign',
      {game_id: 12345},
    ])

    assert.throws(
      () => client.playMove({gameId: 12345, x: 9, y: 0}),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )
  })

  it('sends validated OGS stone removal commands', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      game_name: 'Friendly game',
      width: 9,
      height: 9,
      phase: 'stone removal',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: ['aa', '..', '..'],
    })

    client.setRemovedStones({
      gameId: 12345,
      stones: [
        [1, 0],
        [1, 1],
      ],
    })
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/removed_stones/set',
      {game_id: 12345, removed: true, stones: 'babb'},
    ])
    assert.strictEqual(client.getState().onlineGame.removedStones, 'babb')

    client.acceptRemovedStones({gameId: 12345})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/removed_stones/accept',
      {game_id: 12345, stones: 'babb', strict_seki_mode: false},
    ])

    assert.throws(
      () => client.setRemovedStones({gameId: 12345, stones: [[9, 0]]}),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )
    assert.throws(
      () =>
        client.setRemovedStones({
          gameId: 12345,
          stones: [[1, 0]],
          removed: 'yes',
        }),
      (err) => err instanceof OgsError && err.code === 'invalid-input',
    )

    socket.receive('game/12345/phase', {phase: 'play'})
    assert.throws(
      () => client.acceptRemovedStones({gameId: 12345, stones: []}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
  })

  it('rejects OGS moves before board size is known', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    let sentCount = socket.sent.length

    assert.throws(
      () => client.playMove({gameId: 12345, x: 2, y: 3}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.throws(
      () => client.sendChat({gameId: 12345, body: 'hello'}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('buffers future OGS clock updates until matching moves arrive', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: 'aabb',
    })
    socket.receive('game/12345/clock', {
      current_player: 7,
      last_move: 2,
      black_time: {thinking_time: 60},
      white_time: {thinking_time: 50},
    })
    socket.receive('game/12345/clock', {
      current_player: 8,
      last_move: 1,
      black_time: {thinking_time: 59},
      white_time: {thinking_time: 49},
    })

    let state = client.getState()
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, 2)

    socket.receive('game/12345/clock', {
      current_player: 8,
      last_move: 3,
      black_time: {thinking_time: 58},
      white_time: {thinking_time: 50},
    })
    socket.receive('game/12345/clock', {
      current_player: 7,
      last_move: 2,
      black_time: {thinking_time: 57},
      white_time: {thinking_time: 48},
    })

    state = client.getState()
    assert.strictEqual(state.onlineGame.moveCount, 2)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, 2)

    socket.receive('game/12345/move', {move_number: 3, move: 'cc'})
    state = client.getState()
    assert.strictEqual(state.onlineGame.moveCount, 3)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.lastMove, 3)
  })

  it('uses OGS gamedata clocks before the first clock event is current', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 13,
      height: 13,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: '',
      clock: {
        game_id: 12345,
        title: 'Byo-Yomi',
        black_player_id: 7,
        white_player_id: 8,
        current_player: 7,
        expiration: 1784522520000,
        now: 1784522460000,
        last_move: 0,
        black_time: {thinking_time: 600},
        white_time: {thinking_time: 600},
      },
    })

    let state = client.getState()
    assert.strictEqual(state.onlineGame.moveCount, 0)
    assert.strictEqual(state.onlineGame.clock.gameId, 12345)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, 0)
    assert.strictEqual(state.onlineGame.clock.blackTime.thinkingTime, 600)

    socket.receive('game/12345/data', {
      clock: {
        current_player: 8,
        last_move: 1,
        black_time: {thinking_time: 590},
        white_time: {thinking_time: 600},
      },
    })

    state = client.getState()
    assert.strictEqual(state.onlineGame.moveCount, 0)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, 0)

    socket.receive('game/12345/move', {move_number: 1, move: 'aa'})
    state = client.getState()
    assert.strictEqual(state.onlineGame.moveCount, 1)
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.lastMove, 1)
  })

  it('keeps separate buffered OGS clocks for later moves', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: 'aabb',
    })
    socket.receive('game/12345/clock', {current_player: 7, last_move: 2})
    socket.receive('game/12345/clock', {current_player: 7, last_move: 4})
    socket.receive('game/12345/clock', {current_player: 8, last_move: 3})

    socket.receive('game/12345/move', {move_number: 3, move: 'cc'})
    let state = client.getState()
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 8)
    assert.strictEqual(state.onlineGame.clock.lastMove, 3)

    socket.receive('game/12345/move', {move_number: 4, move: 'dd'})
    state = client.getState()
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, 4)
  })

  it('accepts OGS clock updates without move sequence markers', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: 'aabb',
    })
    socket.receive('game/12345/clock', {current_player: 7})

    let state = client.getState()
    assert.strictEqual(state.onlineGame.clock.currentPlayer, 7)
    assert.strictEqual(state.onlineGame.clock.lastMove, null)
  })

  it('clears pending OGS moves when the game reports an error', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: [],
    })
    socket.receive('game/12345/clock', {current_player: 7, last_move: 0})

    client.playMove({gameId: 12345, x: 2, y: 3})
    assert.strictEqual(client.getState().onlineGame.pendingMove, true)

    socket.receive('game/12345/error', {message: 'Rejected move.'})
    assert.strictEqual(client.getState().onlineGame.pendingMove, false)
  })

  it('rejects OGS game commands when player IDs are unknown', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    client.connectGame({gameId: 12345})

    let socket = FakeWebSocket.instances[0]
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {black: {username: 'sente'}, white: {username: 'gote'}},
      moves: [],
    })

    let sentCount = socket.sent.length

    assert.throws(
      () => client.playMove({gameId: 12345, x: 2, y: 3}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.throws(
      () => client.resign({gameId: 12345}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.throws(
      () => client.sendChat({gameId: 12345, body: 'hello'}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.strictEqual(socket.sent.length, sentCount)

    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 8, username: 'gote'},
        white: {id: 9, username: 'other'},
      },
      moves: [],
    })
    assert.throws(
      () => client.sendChat({gameId: 12345, body: 'hello'}),
      (err) => err instanceof OgsError && err.code === 'invalid-state',
    )
    assert.strictEqual(socket.sent.length, sentCount)
  })

  it('ignores stale active-game turn data when history gives turn', async () => {
    FakeWebSocket.instances = []
    let client = new OgsClient({
      fetchImpl: loginFetch,
      webSocketImpl: FakeWebSocket,
    })

    await client.login({username: 'sente', password: 'secret'})
    let socket = FakeWebSocket.instances[0]

    socket.receive('active_game', {
      id: 12345,
      width: 9,
      height: 9,
      phase: 'play',
      player_to_move: 8,
      black: {id: 7, username: 'sente'},
      white: {id: 8, username: 'gote'},
    })
    client.connectGame({gameId: 12345})
    socket.receive('game/12345/gamedata', {
      width: 9,
      height: 9,
      phase: 'play',
      players: {
        black: {id: 7, username: 'sente'},
        white: {id: 8, username: 'gote'},
      },
      moves: 'aabb',
    })
    socket.receive('game/12345/clock', {current_player: 8, last_move: 1})

    client.playMove({gameId: 12345, x: 2, y: 2})
    assert.deepStrictEqual(JSON.parse(socket.sent.at(-1)), [
      'game/move',
      {game_id: 12345, move: 'cc'},
    ])
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

  it('forwards public OGS state changes through IPC setup callback', async () => {
    let handlers = {}
    let sentStates = []
    let ipcMain = {
      handle: (name, handler) => {
        handlers[name] = handler
      },
    }
    let publicState = {
      user: {id: 1, username: 'Seki'},
      socket: {status: 'authenticated'},
      matchmaking: {status: 'idle'},
      onlineGame: null,
      activeGames: [],
    }
    let client = {
      getSession: () => publicState.user,
      getState: () => publicState,
      logout: () => true,
      setMatchmakingOptions: () => publicState,
      startAutomatch: () => publicState,
      cancelAutomatch: () => publicState,
      acknowledgeAutomatchOpen: () => publicState,
      connectGame: () => publicState,
      disconnectGame: () => publicState,
      playMove: () => publicState,
      pass: () => publicState,
      resign: () => publicState,
      setRemovedStones: () => publicState,
      acceptRemovedStones: () => publicState,
      sendChat: () => publicState,
      login: async () => publicState.user,
    }

    setupOgsIpcHandlers(ipcMain, client, {
      sendStateChange: (state) => sentStates.push(state),
    })

    client.onStateChange(publicState)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepStrictEqual(sentStates, [publicState])
  })

  it('coalesces OGS state-change IPC notifications in one tick', async () => {
    let handlers = {}
    let sentStates = []
    let ipcMain = {
      handle: (name, handler) => {
        handlers[name] = handler
      },
    }
    let firstState = {user: {id: 1, username: 'First'}}
    let lastState = {user: {id: 2, username: 'Last'}}
    let client = {
      getSession: () => null,
      getState: () => lastState,
      logout: () => true,
      setMatchmakingOptions: () => lastState,
      startAutomatch: () => lastState,
      cancelAutomatch: () => lastState,
      acknowledgeAutomatchOpen: () => lastState,
      connectGame: () => lastState,
      disconnectGame: () => lastState,
      playMove: () => lastState,
      pass: () => lastState,
      resign: () => lastState,
      setRemovedStones: () => lastState,
      acceptRemovedStones: () => lastState,
      sendChat: () => lastState,
      login: async () => lastState.user,
    }

    setupOgsIpcHandlers(ipcMain, client, {
      sendStateChange: (state) => sentStates.push(state),
    })

    client.onStateChange(firstState)
    client.onStateChange(lastState)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepStrictEqual(sentStates, [lastState])
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
