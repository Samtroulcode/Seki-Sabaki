const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')
const {waitForRender} = require('./helpers')

test.describe('OGS mock panel', () => {
  test('keeps board attachment and online game compatibility state in sync', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__sabaki.setState({onlineGameId: '42'})
    })
    await page.waitForFunction(
      () =>
        window.__sabaki.state.onlineGameId === 42 &&
        window.__sabaki.state.boardAttachment?.type === 'ogs' &&
        window.__sabaki.state.boardAttachment?.gameId === 42,
    )

    await page.evaluate(() => {
      window.__sabaki.setState({boardAttachment: {type: 'local-document'}})
    })
    await page.waitForFunction(
      () =>
        window.__sabaki.state.onlineGameId == null &&
        window.__sabaki.state.boardAttachment?.type === 'local-document',
    )
  })

  test('opens from app rail and shows mock connection status', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__sabaki.setState({
        activeWorkspace: 'board',
        showLeftSidebar: true,
      })
    })
    await waitForRender(page)

    await expect(page.locator('#leftsidebar')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toBeVisible()
    await expect(page.locator('.gtp-console')).toBeVisible()
    await expect(page.getByTitle('Show OGS Panel')).toHaveCount(0)

    await page.evaluate(() => {
      window.__ogsTestSession = null
      window.__ogsPlayedMoves = []
      window.__ogsRemovedStonesCommands = []
      window.__ogsChatMessages = []
      window.__ogsMatchmakingOptions = []
      window.__ogsHistoryCalls = []
      window.__ogsDownloadedGames = []
      window.__ogsTestState = {
        user: null,
        socket: {
          status: 'authenticated',
          authenticated: true,
          error: null,
        },
        matchmaking: {
          status: 'idle',
          options: {
            boardSizes: [19],
            speeds: ['rapid'],
            timeSystem: 'byoyomi',
            lowerRankDiff: 3,
            upperRankDiff: 3,
            rules: {condition: 'preferred', value: 'chinese'},
            handicap: {condition: 'no-preference', value: 'enabled'},
          },
          error: null,
        },
        onlineGame: {
          status: 'idle',
          gameId: null,
          error: null,
          gameName: null,
          board: null,
          phase: null,
          players: null,
          moves: [],
          moveCount: 0,
          lastMove: null,
          clock: null,
          chat: [],
        },
        activeGames: [
          {
            id: 42,
            name: 'Fixture Game',
            board: {width: 19, height: 19},
            phase: 'play',
            moveNumber: 2,
            black: {id: 7, username: 'sekibot', rank: '1d'},
            white: {id: 8, username: 'opponent', rank: '3k'},
          },
        ],
      }
      window.sabaki.ogs = {
        getSession: async () => window.__ogsTestSession,
        getState: async () => window.__ogsTestState,
        login: async (username) => {
          window.__ogsTestSession = {
            id: '7',
            username,
            rank: '1d',
            iconUrl: null,
            online: true,
          }
          window.__ogsTestState.user = window.__ogsTestSession

          return {
            ok: true,
            user: window.__ogsTestSession,
            state: window.__ogsTestState,
          }
        },
        setMatchmakingOptions: async (options) => {
          window.__ogsMatchmakingOptions.push(options)
          window.__ogsTestState.matchmaking.options = options
          return window.__ogsTestState
        },
        startAutomatch: async () => {
          window.__ogsTestState.matchmaking.status = 'searching'
          window.__ogsTestState.matchmaking.payload = {uuid: 'fixture-search'}
          return {ok: true, state: window.__ogsTestState}
        },
        cancelAutomatch: async () => {
          window.__ogsTestState.matchmaking.status = 'idle'
          window.__ogsTestState.matchmaking.payload = null
          return {ok: true, state: window.__ogsTestState}
        },
        connectGame: async (gameId) => {
          let now = Date.now()
          window.__ogsTestState.onlineGame = {
            status: 'connected',
            gameId: Number(gameId),
            error: null,
            gameName: 'Fixture Game',
            board: {width: 19, height: 19},
            handicap: 0,
            komi: 6.5,
            rules: 'chinese',
            ranked: true,
            phase: 'play',
            players: {
              black: {id: 7, username: 'sekibot', rank: '1d'},
              white: {id: 8, username: 'opponent', rank: '3k'},
            },
            moves: [
              {move: 'aa', moveNumber: 1},
              {move: 'bb', moveNumber: 2},
            ],
            moveCount: 2,
            lastMove: 'dd',
            clock: {
              currentPlayer: 7,
              expiration: now + 600000,
              now,
              receivedAt: now,
              lastMove: 2,
              blackTime: {thinkingTime: 600},
              whiteTime: {thinkingTime: 180},
            },
            chat: [{username: 'opponent', body: 'good luck'}],
          }
          return {ok: true, state: window.__ogsTestState}
        },
        disconnectGame: async () => {
          window.__ogsTestState.onlineGame = {status: 'idle', gameId: null}
          return {ok: true, state: window.__ogsTestState}
        },
        playMove: async (gameId, vertex) => {
          window.__ogsPlayedMoves.push({gameId, vertex})
          if (window.__ogsRejectNextMove) {
            window.__ogsRejectNextMove = false
            return {
              ok: false,
              error: {code: 'not-your-turn', message: 'Not your turn.'},
              state: window.__ogsTestState,
            }
          }

          return {ok: true, state: window.__ogsTestState}
        },
        pass: async (gameId) => {
          window.__ogsPlayedMoves.push({gameId, pass: true})
          return {ok: true, state: window.__ogsTestState}
        },
        resign: async (gameId) => {
          window.__ogsPlayedMoves.push({gameId, resign: true})
          return {ok: true, state: window.__ogsTestState}
        },
        setRemovedStones: async (gameId, stones, removed = true) => {
          window.__ogsRemovedStonesCommands.push({
            type: 'set',
            gameId,
            stones,
            removed,
          })
          window.__ogsTestState.onlineGame.removedStones = stones
            .map(
              ([x, y]) =>
                String.fromCharCode(97 + x) + String.fromCharCode(97 + y),
            )
            .join('')
          return {ok: true, state: window.__ogsTestState}
        },
        acceptRemovedStones: async (gameId) => {
          window.__ogsRemovedStonesCommands.push({
            type: 'accept',
            gameId,
            stones: window.__sabaki.state.deadStones,
          })
          return {ok: true, state: window.__ogsTestState}
        },
        sendChat: async (gameId, body) => {
          window.__ogsChatMessages.push({gameId, body})
          window.__ogsTestState.onlineGame.chat.push({
            username: 'sekibot',
            body,
          })
          return {ok: true, state: window.__ogsTestState}
        },
        listGameHistory: async (options) => {
          window.__ogsHistoryCalls.push(options)
          return {
            ok: true,
            history: {
              results: [
                {
                  id: 123,
                  name: 'History Fixture',
                  board: {width: 9, height: 9},
                  result: 'B+R',
                  winner: 7,
                  ended: '2026-08-01T12:00:00Z',
                  black: {id: 7, username: 'sekibot', rank: '1d'},
                  white: {id: 8, username: 'opponent', rank: '3k'},
                },
              ],
              next: null,
              previous: null,
            },
          }
        },
        downloadGameSgf: async (gameId) => {
          window.__ogsDownloadedGames.push(gameId)
          return {
            ok: true,
            sgf: '(;GM[1]FF[4]SZ[9]PB[sekibot]PW[opponent];B[aa];W[bb])',
          }
        },
        logout: async () => {
          window.__ogsTestSession = null
          window.__ogsTestState.user = null
          return true
        },
      }
    })

    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'Online', exact: true}).click()

    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(page.locator('#ogs-dashboard')).toBeVisible()
    await expect(page.locator('.ogs-dashboard-hero')).toContainText(
      'Online Go Server',
    )
    await expect(page.locator('.ogs-dashboard-nav')).toHaveCount(0)
    await expect(page.locator('.ogs-dashboard-section-detail')).toHaveCount(0)
    await expect(
      page.locator('.home-sidebar').getByRole('button', {name: 'OGS'}),
    ).toHaveCount(0)
    await expect(
      page.locator('#apptabs').getByRole('button', {name: 'OGS Overview'}),
    ).toHaveCount(0)

    await page.locator('.ogs-login-form input[name="username"]').fill('sekibot')
    await page.locator('.ogs-login-form input[name="password"]').fill('secret')
    await page.locator('.ogs-login-form button[type="submit"]').click()

    await expect(page.locator('.ogs-status')).toBeVisible()
    await expect(
      page.locator('.ogs-login-form input[name="password"]'),
    ).toHaveCount(0)
    await expect(page.locator('.ogs-status-username')).toHaveText('sekibot')
    await expect(page.locator('.ogs-status')).toContainText('Online')
    await expect(page.locator('.ogs-status')).toContainText('1d')
    await expect(page.locator('.ogs-socket-status')).toContainText(
      'Authenticated',
    )
    await expect(page.locator('.ogs-dashboard-status-pill')).toContainText(
      'Authenticated',
    )
    await expect(page.locator('.ogs-matchmaking')).toBeVisible()
    await expect(page.locator('.ogs-matchmaking h3')).toHaveText('Play')
    await expect(page.locator('.ogs-matchmaking')).toContainText('Board size')
    await expect(page.locator('.ogs-matchmaking')).toContainText('Clock')
    await expect(page.locator('.ogs-matchmaking')).toContainText('Handicap')
    await expect(page.locator('.ogs-matchmaking')).toContainText(
      'Opponent rank',
    )
    await expect(page.locator('.ogs-matchmaking')).not.toContainText('Rule set')

    await page
      .locator('.ogs-matchmaking-board-sizes')
      .getByRole('button', {name: '9x9'})
      .click()
    await page
      .locator('.ogs-matchmaking-board-sizes')
      .getByRole('button', {name: '19x19'})
      .click()
    await expect(
      page
        .locator('.ogs-matchmaking-board-sizes')
        .getByRole('button', {name: '9x9'}),
    ).toHaveClass(/selected/)
    await expect(
      page
        .locator('.ogs-matchmaking-board-sizes')
        .getByRole('button', {name: '9x9'}),
    ).toHaveAttribute('aria-pressed', 'true')
    await page
      .locator('.ogs-matchmaking-time-presets')
      .getByRole('button', {name: '5m + 7s'})
      .click()
    await expect(
      page
        .locator('.ogs-matchmaking-time-presets')
        .getByRole('button', {name: '5m + 7s'}),
    ).toHaveClass(/selected/)
    await expect(
      page
        .locator('.ogs-matchmaking-time-presets')
        .getByRole('button', {name: '5m + 7s'}),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.waitForFunction(
      () =>
        window.__ogsTestState.matchmaking.options.rules.value === 'chinese' &&
        window.__ogsTestState.matchmaking.options.rules.condition ===
          'preferred' &&
        window.__ogsTestState.matchmaking.options.handicap.condition ===
          'no-preference',
    )
    await page.locator('.ogs-matchmaking-select').selectOption('No handicap')
    await page
      .locator('.ogs-matchmaking-rank-diff')
      .getByRole('button', {name: '-'})
      .click()
    await page
      .locator('.ogs-matchmaking-rank-diff')
      .getByRole('button', {name: '+'})
      .click()
    await page.waitForFunction(
      () =>
        window.__ogsTestState.matchmaking.options.boardSizes.length === 1 &&
        window.__ogsTestState.matchmaking.options.boardSizes[0] === 9 &&
        window.__ogsTestState.matchmaking.options.speeds[0] === 'rapid' &&
        window.__ogsTestState.matchmaking.options.timeSystem === 'fischer' &&
        window.__ogsTestState.matchmaking.options.handicap.value ===
          'disabled' &&
        window.__ogsTestState.matchmaking.options.lowerRankDiff === 2 &&
        window.__ogsTestState.matchmaking.options.upperRankDiff === 2,
    )
    await page.getByRole('button', {name: 'Find opponent'}).click()
    await expect(
      page.getByRole('button', {name: 'Cancel search'}),
    ).toBeVisible()
    await page.getByTitle('Home').click()
    await expect(page.locator('.home-matchmaking-toast')).toHaveCount(1)
    await expect(page.locator('.home-matchmaking-toast')).toBeVisible()
    await page.getByRole('button', {name: 'New board'}).click()
    await expect(page.locator('.home-matchmaking-toast')).toHaveCount(1)
    await expect(page.locator('.home-matchmaking-toast')).toBeVisible()
    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await expect(page.locator('.home-matchmaking-toast')).toHaveCount(1)
    await expect(page.locator('.home-matchmaking-toast')).toBeVisible()
    await page.getByRole('button', {name: 'Cancel search'}).click()
    await expect(page.locator('.home-matchmaking-toast')).toHaveCount(0)
    await expect(
      page.getByRole('button', {name: 'Find opponent'}),
    ).toBeVisible()
    await expect(page.locator('.ogs-dashboard-games-card')).toHaveCount(0)
    await page.evaluate(async () => {
      let result = await window.sabaki.ogs.connectGame(42)
      await window.__sabaki.loadOgsGame(result.state.onlineGame)
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex, treePosition} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        tree.root.data.SO?.[0] === 'https://online-go.com/game/42' &&
        sequence.length === 3 &&
        sequence[1].B?.[0] === 'aa' &&
        sequence[2].W?.[0] === 'bb' &&
        treePosition === [...tree.getSequence(tree.root.id)].at(-1).id
      )
    })
    await page.waitForFunction(
      () =>
        window.__sabaki.state.activeWorkspace === 'online-game' &&
        window.__sabaki.state.onlineGameTabs.length === 1 &&
        window.__sabaki.state.boardTabs.length === 1,
    )
    await expect(page.locator('#online-game')).toBeVisible()
    await expect(page.locator('#goban')).toBeVisible()
    await expect(page.locator('.ogs-game-context-panel')).toBeVisible()
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'Fixture Game',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText('#42')
    await expect(page.locator('.ogs-game-context-panel')).toContainText('19x19')
    await expect(page.locator('.ogs-game-context-panel')).toContainText('play')
    await expect(page.locator('.ogs-game-context-panel')).toContainText('6.5')
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'chinese',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'Ranked',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'sekibot',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText('1d')
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'opponent',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText('3k')
    await expect(
      page.locator('.ogs-game-context-player.black .ogs-game-context-clock'),
    ).toContainText(/Clock: 9:5[0-9]|Clock: 10:00/)
    await expect(
      page.locator('.ogs-game-context-player.white .ogs-game-context-clock'),
    ).toContainText('Clock: 3:00')
    await expect(page.locator('.ogs-game-context-chat')).toContainText(
      'good luck',
    )
    await page
      .locator('.ogs-game-context-chat textarea')
      .fill('hello from Sabaki')
    await page.locator('.ogs-game-context-chat button').click()
    await page.waitForFunction(
      () =>
        window.__ogsChatMessages.length === 1 &&
        window.__ogsChatMessages[0].gameId === 42 &&
        window.__ogsChatMessages[0].body === 'hello from Sabaki',
    )
    await expect(page.locator('.ogs-game-context-chat')).toContainText(
      'hello from Sabaki',
    )
    await expect(page.locator('.gtp-console')).toHaveCount(0)

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.locator('.home-resume-details')).toContainText(
      'Fixture Game',
    )
    await expect(page.locator('.home-resume-details')).toContainText('Game #42')
    await page.getByRole('button', {name: 'Continue game'}).click()
    await page.waitForFunction(
      () => window.__sabaki.state.activeWorkspace === 'online-game',
    )
    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(page.locator('.ogs-dashboard-games-card')).toHaveCount(0)
    await page.getByTitle('Fixture Game').click()
    await page.waitForFunction(
      () => window.__sabaki.state.activeWorkspace === 'online-game',
    )
    await expect(page.locator('#goban')).toBeVisible()
    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()

    await page.evaluate(async () => {
      window.__sabaki.setState({
        analyzingEngineSyncerId: 'fake-analyzer',
        analysis: {sign: 1, winrate: 50, scoreLead: 0},
        analysisTreePosition: window.__sabaki.state.treePosition,
      })

      await window.__sabaki.startAnalysis('fake-analyzer')
      window.__sabaki.attachEngines([{path: '/missing/fake-engine', args: []}])
    })
    await page.waitForFunction(
      () =>
        window.__sabaki.state.onlineGameId === 42 &&
        window.__sabaki.state.boardAttachment?.type === 'ogs' &&
        window.__sabaki.state.boardAttachment?.gameId === 42 &&
        window.__sabaki.state.analyzingEngineSyncerId == null &&
        window.__sabaki.state.analysis == null &&
        window.__sabaki.state.attachedEngineSyncers.length === 0,
    )

    await page.evaluate(() => {
      window.__sabaki.clickVertex([2, 2])
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__ogsPlayedMoves.length === 1 &&
        window.__ogsPlayedMoves[0].gameId === 42 &&
        window.__ogsPlayedMoves[0].vertex[0] === 2 &&
        window.__ogsPlayedMoves[0].vertex[1] === 2 &&
        sequence.length === 4 &&
        sequence[3].B?.[0] === 'cc'
      )
    })

    await page.evaluate(() => {
      window.__sabaki.clickVertex([4, 4])
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return window.__ogsPlayedMoves.length === 1 && sequence.length === 4
    })

    await page.evaluate(async () => {
      window.__ogsTestState.onlineGame.moves.push({move: 'cc', moveNumber: 3})
      window.__ogsTestState.onlineGame.moves.push({move: 'dd', moveNumber: 4})
      window.__ogsTestState.onlineGame.moveCount = 4
      window.__ogsTestState.onlineGame.lastMove = 'dd'
      await window.__sabaki.applyOgsGameUpdate(window.__ogsTestState.onlineGame)
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__sabaki.ogsPendingMove == null &&
        sequence.length === 5 &&
        sequence[3].B?.[0] === 'cc' &&
        sequence[4].W?.[0] === 'dd'
      )
    })

    await page.evaluate(() => {
      window.__ogsTestState.user = {
        id: '7',
        username: 'sekibot',
        rank: '1d',
      }
      window.__ogsRejectNextMove = true
      window.__ogsPlayError = null
      window.__sabaki.showOgsPlayError = async (error) => {
        window.__ogsPlayError = error
      }
      window.__sabaki.clickVertex([4, 4])
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__ogsPlayError?.code === 'not-your-turn' &&
        sequence.length === 5 &&
        sequence[3].B?.[0] === 'cc' &&
        sequence[4].W?.[0] === 'dd'
      )
    })

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Fixture Game').click()
    await page
      .locator('.ogs-game-context-panel')
      .getByRole('button', {name: 'Disconnect game'})
      .click()
    await page.waitForFunction(
      () =>
        window.__sabaki.state.onlineGameId == null &&
        window.__sabaki.state.boardAttachment?.type === 'local-document',
    )

    await page.evaluate(() => {
      window.__sabaki.clickVertex([5, 5])
    })
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__ogsPlayedMoves.length === 2 &&
        sequence.length === 6 &&
        sequence[5].B?.[0] === 'ff'
      )
    })

    await page.evaluate(async () => {
      let result = await window.sabaki.ogs.connectGame(42)
      await window.__sabaki.loadOgsGame(result.state.onlineGame)
    })
    await page.waitForFunction(
      () =>
        window.__sabaki.state.onlineGameId === 42 &&
        window.__sabaki.state.boardAttachment?.type === 'ogs' &&
        window.__sabaki.state.boardAttachment?.gameId === 42,
    )

    await page.getByTitle('Fixture Game').click()

    await expect(page.locator('.ogs-panel')).toHaveCount(0)
    await expect(page.locator('.ogs-game-context-panel')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toHaveCount(0)
    await expect(page.locator('.gtp-console')).toHaveCount(0)

    await page.evaluate(() => {
      window.__ogsDisconnectCalls = []
      window.__ogsDisconnectShouldFail = true
      window.sabaki.ogs.disconnectGame = async (gameId) => {
        window.__ogsDisconnectCalls.push(gameId)
        return window.__ogsDisconnectShouldFail
          ? {ok: false, error: {message: 'still connected'}}
          : {ok: true, state: window.__ogsTestState}
      }
    })
    await page.locator('.app-online-game-tab-close').click()
    await page.waitForFunction(
      () =>
        window.__ogsDisconnectCalls.length === 1 &&
        window.__sabaki.state.onlineGameTabs.length === 1,
    )

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.locator('.home-recent-games-pane')).toHaveCount(0)
    await page.getByRole('button', {name: 'Online', exact: true}).click()

    await expect(page.locator('.ogs-history')).toContainText('OGS history')
    await expect(page.locator('.ogs-history-card')).toContainText(
      'History Fixture',
    )
    await expect(page.locator('.ogs-history-card')).toContainText('sekibot')
    await expect(page.locator('.ogs-history-card')).toContainText('opponent')
    await expect(page.locator('.ogs-history-card')).toContainText('B+R')
    await expect(page.locator('.ogs-history-winner')).toHaveText(' · Black')
    await expect(page.locator('.ogs-history-outcome')).toContainText('Black')
    await expect(
      page.locator('.ogs-history-actions button', {hasText: 'Analyze OGS'}),
    ).toBeVisible()
    await expect(
      page.locator('.ogs-history-actions button', {hasText: 'Analyze Seki'}),
    ).toBeVisible()
    await expect(page.locator('.ogs-mini-goban')).toContainText('9x9')
    await expect(page.locator('.ogs-history-card .ogs-mini-stone')).toHaveCount(
      2,
    )
    await page.waitForFunction(
      () => window.__ogsHistoryCalls.at(-1)?.pageSize === 12,
    )

    await page.locator('.ogs-history-card').click()
    await page.waitForFunction(
      () =>
        window.__ogsDownloadedGames.includes(123) &&
        window.__sabaki.state.activeWorkspace === 'board' &&
        window.__sabaki.state.boardTabs.length === 2,
    )
    await expect(page.locator('#goban')).toBeVisible()
  })

  test('opens an online-game tab automatically when automatch finds a game', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__ogsAcknowledgedAutomatchGame = null
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        socket: {status: 'authenticated', authenticated: true, error: null},
        matchmaking: {
          status: 'matched',
          payload: {uuid: 'matched-fixture'},
          matchedGameId: 42,
          options: {
            boardSizes: [19],
            speeds: ['rapid'],
            timeSystem: 'byoyomi',
            lowerRankDiff: 3,
            upperRankDiff: 3,
            rules: {condition: 'required', value: 'japanese'},
            handicap: {condition: 'preferred', value: 'enabled'},
          },
        },
        onlineGame: {
          status: 'connected',
          gameId: 42,
          error: null,
          gameName: 'Automatch Fixture',
          board: {width: 19, height: 19},
          handicap: 0,
          komi: 6.5,
          rules: 'japanese',
          ranked: true,
          phase: 'play',
          players: {
            black: {id: 7, username: 'sekibot'},
            white: {id: 8, username: 'opponent'},
          },
          moves: [{move: 'aa', moveNumber: 1}],
          moveCount: 1,
          lastMove: 'aa',
          clock: null,
          chat: [],
        },
        activeGames: [],
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        acknowledgeAutomatchOpen: async (gameId) => {
          window.__ogsAcknowledgedAutomatchGame = gameId
          window.__ogsTestState.matchmaking.status = 'idle'
          window.__ogsTestState.matchmaking.matchedGameId = null
          return {ok: true, state: window.__ogsTestState}
        },
      }
      window.__sabaki.setState({activeWorkspace: 'online'})
    })

    await page.waitForFunction(
      () =>
        window.__sabaki.state.activeWorkspace === 'online-game' &&
        window.__sabaki.state.onlineGameId === 42 &&
        window.__sabaki.state.onlineGameTabs.length === 1 &&
        window.__sabaki.state.activeOnlineGameTabId ===
          window.__sabaki.state.onlineGameTabs[0].id &&
        window.__ogsAcknowledgedAutomatchGame === 42,
    )
    await expect(page.locator('.app-online-game-tab.selected')).toHaveCount(1)
    await expect(
      page.locator('.app-online-game-tab-button[aria-current="page"]'),
    ).toHaveCount(1)
    await expect(page.locator('#goban')).toBeVisible()
  })

  test('uses Sabaki scoring UI to accept OGS dead stones', async ({page}) => {
    await waitForRender(page)
    await page.waitForFunction(() => window.__sabaki.state.busy === 0)

    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Stone Removal Fixture',
        board: {width: 9, height: 9},
        handicap: 0,
        komi: 6.5,
        rules: 'japanese',
        ranked: false,
        phase: 'stone removal',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [
          {move: 'aa', moveNumber: 1},
          {move: '..', moveNumber: 2},
          {move: '..', moveNumber: 3},
        ],
        moveCount: 3,
        lastMove: '..',
        clock: {stoneRemovalMode: true},
        removedStones: '',
        removedStonesAccepted: [],
        chat: [],
      }

      window.__ogsRemovedStonesCommands = []
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        setRemovedStones: async (gameId, stones, removed = true) => {
          window.__ogsRemovedStonesCommands.push({
            type: 'set',
            gameId,
            stones,
            removed,
          })
          window.__ogsTestState.onlineGame.removedStones = stones
            .map(
              ([x, y]) =>
                String.fromCharCode(97 + x) + String.fromCharCode(97 + y),
            )
            .join('')
          return {ok: true, state: window.__ogsTestState}
        },
        acceptRemovedStones: async (gameId) => {
          window.__ogsRemovedStonesCommands.push({
            type: 'accept',
            gameId,
            stones: window.__sabaki.state.deadStones,
          })
          return {ok: true, state: window.__ogsTestState}
        },
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.enterOgsStoneRemovalMode(onlineGame)
    })

    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'Stone Removal Fixture',
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      'Click stones on the board to mark dead groups.',
    )
    await page.waitForFunction(() => window.__sabaki.state.mode === 'scoring')

    await page.evaluate(() => window.__sabaki.clickVertex([0, 0]))
    await page.waitForFunction(
      () =>
        window.__ogsRemovedStonesCommands.length === 1 &&
        window.__ogsRemovedStonesCommands[0].type === 'set' &&
        window.__ogsRemovedStonesCommands[0].stones.length === 1 &&
        window.__ogsRemovedStonesCommands[0].stones[0][0] === 0 &&
        window.__ogsRemovedStonesCommands[0].stones[0][1] === 0,
    )
    await expect(page.locator('.ogs-game-context-panel')).toContainText(
      '1 marked',
    )

    await page.getByRole('button', {name: 'Accept dead stones'}).click()
    await page.waitForFunction(
      () =>
        window.__ogsRemovedStonesCommands.length === 2 &&
        window.__ogsRemovedStonesCommands[1].type === 'accept' &&
        window.__ogsRemovedStonesCommands[1].stones.length === 1,
    )
  })

  test('syncs server moves to online main line while reviewing', async ({
    page,
  }) => {
    await waitForRender(page)
    await page.waitForFunction(() => window.__sabaki.state.busy === 0)

    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Fixture Game',
        board: {width: 19, height: 19},
        handicap: 0,
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [
          {move: 'aa', moveNumber: 1},
          {move: 'bb', moveNumber: 2},
        ],
        moveCount: 2,
        lastMove: 'bb',
        clock: null,
        chat: [],
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.goToBeginning()

      onlineGame.moves.push({move: 'cc', moveNumber: 3})
      onlineGame.moveCount = 3
      onlineGame.lastMove = 'cc'
      await window.__sabaki.applyOgsGameUpdate(onlineGame)
    })

    await page.waitForFunction(() => {
      let {gameTrees, gameIndex, treePosition} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = window.__sabaki
        .getOgsLineNodes(tree)
        .map((node) => node.data)

      return (
        treePosition === tree.root.id &&
        tree.root.children.length === 1 &&
        sequence.length === 4 &&
        sequence[1].B?.[0] === 'aa' &&
        sequence[2].W?.[0] === 'bb' &&
        sequence[3].B?.[0] === 'cc'
      )
    })
  })

  test('submits reviewed OGS board moves from the live line end', async ({
    page,
  }) => {
    await waitForRender(page)
    await page.waitForFunction(() => window.__sabaki.state.busy === 0)

    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Fixture Game',
        board: {width: 19, height: 19},
        handicap: 0,
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [
          {move: 'aa', moveNumber: 1},
          {move: 'bb', moveNumber: 2},
        ],
        moveCount: 2,
        lastMove: 'bb',
        clock: {currentPlayer: 7, lastMove: 2},
        chat: [],
      }

      window.__ogsPlayedMoves = []
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        playMove: async (gameId, vertex) => {
          window.__ogsPlayedMoves.push({gameId, vertex})
          return {ok: true, state: window.__ogsTestState}
        },
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.goToBeginning()
      await window.__sabaki.submitOgsMove([2, 2])
    })

    await page.waitForFunction(() => {
      let {gameTrees, gameIndex, treePosition} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let line = window.__sabaki.getOgsLineNodes(tree)
      let sequence = line.map((node) => node.data)

      return (
        window.__ogsPlayedMoves.length === 1 &&
        tree.root.children.length === 1 &&
        treePosition === line.at(-1).id &&
        sequence.length === 4 &&
        sequence[1].B?.[0] === 'aa' &&
        sequence[2].W?.[0] === 'bb' &&
        sequence[3].B?.[0] === 'cc'
      )
    })
  })

  test('shows OGS captures from the synchronized Sabaki board', async ({
    page,
  }) => {
    await waitForRender(page)
    await page.waitForFunction(() => window.__sabaki.state.busy === 0)

    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Capture Fixture',
        board: {width: 5, height: 5},
        handicap: 0,
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [
          {move: 'aa', moveNumber: 1},
          {move: 'ba', moveNumber: 2},
          {move: 'cc', moveNumber: 3},
          {move: 'ab', moveNumber: 4},
        ],
        moveCount: 4,
        lastMove: 'ab',
        clock: null,
        chat: [],
      }

      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.goToBeginning()
      window.__sabaki.setState({showLeftSidebar: true})
    })

    await expect(page.locator('.ogs-game-context-panel')).toBeVisible()
    await expect(
      page.locator('.ogs-game-context-player.black .ogs-game-context-captures'),
    ).toHaveText('Captures: 0')
    await expect(
      page.locator('.ogs-game-context-player.white .ogs-game-context-captures'),
    ).toHaveText('Captures: 1')
  })

  test('explains finished OGS games and can open a review board', async ({
    page,
  }) => {
    await waitForRender(page)
    await page.waitForFunction(() => window.__sabaki.state.busy === 0)

    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Finished Fixture',
        board: {width: 9, height: 9},
        handicap: 0,
        phase: 'finished',
        outcome: 'Resignation',
        winner: 7,
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [{move: 'aa', moveNumber: 1}],
        moveCount: 1,
        lastMove: 'aa',
        clock: null,
        chat: [],
      }

      window.__ogsGameEndDialog = null
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
      }
      window.sabaki.dialog.showMessageBox = async (options) => {
        window.__ogsGameEndDialog = options
        return {response: 1}
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      await window.__sabaki.showOgsGameEndInfo(onlineGame)
      window.__sabaki.setState({showLeftSidebar: true})
    })

    await page.waitForFunction(() =>
      window.__ogsGameEndDialog?.message?.includes('has finished'),
    )
    await expect
      .poll(() => page.evaluate(() => window.__ogsGameEndDialog.message))
      .toContain('Winner: Black (sekibot)')
    await expect
      .poll(() => page.evaluate(() => window.__ogsGameEndDialog.message))
      .toContain('Reason: White (opponent) resigned.')
    await page.waitForFunction(
      () =>
        window.__sabaki.state.activeWorkspace === 'board' &&
        window.__sabaki.state.onlineGameId == null &&
        window.__sabaki.state.boardTabs.length === 1 &&
        window.__sabaki.state.onlineGameTabs.length === 1,
    )

    await page.evaluate(async () => {
      window.__ogsGameEndDialog = null
      await window.__sabaki.showOgsGameEndInfo({
        gameId: 43,
        phase: 'finished',
        outcome: 'Resignation',
        winner: null,
        players: null,
        moveCount: 0,
      })
    })
    await expect
      .poll(() => page.evaluate(() => window.__ogsGameEndDialog.message))
      .toContain('Reason: resigned')
    await expect
      .poll(() => page.evaluate(() => window.__ogsGameEndDialog.message))
      .not.toContain('Winner:')
    await expect
      .poll(() => page.evaluate(() => window.__ogsGameEndDialog.message))
      .not.toContain('resigned.')
  })

  test('ignores stale OGS move rejection when confirmation arrives during dialog', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Fixture Game',
        board: {width: 19, height: 19},
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [],
        moveCount: 0,
        lastMove: null,
        clock: null,
        chat: [],
      }

      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        playMove: async () => ({
          ok: false,
          error: {code: 'not-your-turn', message: 'Not your turn.'},
          state: {
            onlineGame: {
              ...onlineGame,
              moves: [],
              moveCount: 0,
              lastMove: null,
            },
          },
        }),
      }
      window.__sabaki.showOgsPlayError = async () =>
        new Promise((resolve) => {
          window.__resolveOgsDialog = resolve
        })

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.submitOgsMove([2, 2])
    })

    await page.waitForFunction(() => window.__resolveOgsDialog != null)

    await page.evaluate(async () => {
      window.__ogsTestState.onlineGame.moves.push({move: 'cc', moveNumber: 1})
      window.__ogsTestState.onlineGame.moveCount = 1
      window.__ogsTestState.onlineGame.lastMove = 'cc'
      await window.__sabaki.applyOgsGameUpdate(window.__ogsTestState.onlineGame)
      window.__resolveOgsDialog()
    })

    await page.waitForFunction(
      () => window.__sabaki.ogsSubmittingMove === false,
    )
    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__sabaki.ogsPendingMove == null &&
        window.__sabaki.state.onlineGameId === 42 &&
        sequence.length === 2 &&
        sequence[1].B?.[0] === 'cc'
      )
    })
  })

  test('clears board-context pending moves after OGS rejects a move', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Fixture Game',
        board: {width: 19, height: 19},
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [],
        moveCount: 0,
        lastMove: null,
        clock: null,
        chat: [],
      }

      window.__ogsPlayedMoves = []
      window.__ogsPlayErrors = []
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        playMove: async (gameId, vertex) => {
          window.__ogsPlayedMoves.push({gameId, vertex})

          if (window.__ogsPlayedMoves.length === 1) {
            window.__ogsTestState.onlineGame = {
              ...onlineGame,
              status: 'error',
              error: 'Illegal move: suicide is not allowed.',
              moves: [],
              moveCount: 0,
              lastMove: null,
            }
          }

          return {ok: true, state: window.__ogsTestState}
        },
      }
      window.__sabaki.showOgsPlayError = async (error) => {
        window.__ogsPlayErrors.push(error)
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.setState({showLeftSidebar: true})
    })

    await expect(page.locator('.ogs-game-context-panel')).toBeVisible()

    await page.evaluate(() => {
      window.__sabaki.clickVertex([2, 2])
    })
    await page.waitForFunction(() => window.__sabaki.ogsPendingMove != null)

    await page.waitForFunction(
      () =>
        window.__sabaki.ogsPendingMove == null &&
        window.__ogsPlayErrors.some(
          (error) => error?.code === 'ogs-game-error',
        ),
    )

    await page.evaluate(() => {
      window.__ogsTestState.onlineGame = {
        ...window.__ogsTestState.onlineGame,
        status: 'connected',
        error: null,
      }
      window.__sabaki.clickVertex([3, 3])
    })
    await page.waitForFunction(
      () =>
        window.__ogsPlayedMoves.length === 2 &&
        window.__ogsPlayedMoves[1].vertex[0] === 3 &&
        window.__ogsPlayedMoves[1].vertex[1] === 3,
    )
  })

  test('ignores stale OGS error state that already confirms pending move', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      let onlineGame = {
        status: 'connected',
        gameId: 42,
        error: null,
        gameName: 'Fixture Game',
        board: {width: 19, height: 19},
        phase: 'play',
        players: {
          black: {id: 7, username: 'sekibot'},
          white: {id: 8, username: 'opponent'},
        },
        moves: [],
        moveCount: 0,
        lastMove: null,
        clock: null,
        chat: [],
      }

      window.__ogsPlayError = null
      window.__sabaki.showOgsPlayError = async (error) => {
        window.__ogsPlayError = error
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.ogsPendingMove = {
        gameId: 42,
        move: 'cc',
        moveNumber: 1,
      }
      await window.__sabaki.makeMove([2, 2], {
        player: 1,
        allowOnlineLocal: true,
        suppressWarnings: true,
      })

      await window.__sabaki.handleOgsGameError({
        ...onlineGame,
        status: 'error',
        error: 'stale rejection',
        moves: [{move: 'cc', moveNumber: 1}],
        moveCount: 1,
        lastMove: 'cc',
      })
    })

    await page.waitForFunction(() => {
      let {gameTrees, gameIndex} = window.__sabaki.state
      let tree = gameTrees[gameIndex]
      let sequence = [...tree.getSequence(tree.root.id)].map(
        (node) => node.data,
      )

      return (
        window.__ogsPlayError == null &&
        window.__sabaki.ogsPendingMove == null &&
        sequence.length === 2 &&
        sequence[1].B?.[0] === 'cc'
      )
    })
  })
})
