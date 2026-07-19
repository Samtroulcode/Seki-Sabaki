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

function loginFetch(url, options = {}) {
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
      'https://example.com/avatar.png',
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
    assert.strictEqual(client.getState().socket.status, 'authenticated')
    assert.strictEqual(client.getState().socket.authenticated, true)

    let socket = FakeWebSocket.instances[0]
    assert.strictEqual(socket.url, 'wss://online-go.com/')
    assert.strictEqual(JSON.parse(socket.sent[0])[0], 'authenticate')
    assert.strictEqual(JSON.parse(socket.sent[0])[1].jwt, 'jwt-token')
    assert.strictEqual(Number.isInteger(JSON.parse(socket.sent[0])[2]), true)

    client.logout()
    assert.strictEqual(client.getSession(), null)
    assert.strictEqual(client.getState().socket.status, 'disconnected')
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

  it('builds and logs an official automatch payload without sending it', () => {
    let client = new OgsClient({webSocketImpl: FakeWebSocket})
    client.setMatchmakingOptions({
      boardSizes: [9, 13],
      speeds: ['blitz', 'rapid'],
      timeSystem: 'fischer',
      lowerRankDiff: 1,
      upperRankDiff: 2,
      rules: {condition: 'required', value: 'chinese'},
      handicap: {condition: 'preferred', value: 'enabled'},
    })

    let state = client.logMockAutomatchRequest()

    assert.strictEqual(state.matchmaking.status, 'mock-logged')
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
    assert.strictEqual(socket.sent.length, sentCount)
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
