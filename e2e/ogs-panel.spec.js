const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')
const {waitForRender} = require('./helpers')

test.describe('OGS mock panel', () => {
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
            rules: {condition: 'required', value: 'japanese'},
            handicap: {condition: 'preferred', value: 'enabled'},
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
          window.__ogsTestState.matchmaking.options = options
          return window.__ogsTestState
        },
        logMockAutomatchRequest: async () => {
          window.__ogsTestState.matchmaking.status = 'mock-logged'
          return window.__ogsTestState
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
        logout: async () => {
          window.__ogsTestSession = null
          window.__ogsTestState.user = null
          return true
        },
      }
    })

    await page.locator('#apprail').getByRole('button', {name: 'OGS'}).click()

    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(page.locator('#ogs-dashboard')).toBeVisible()
    await expect(page.locator('.ogs-dashboard-hero')).toContainText(
      'Online Go Server',
    )
    await expect(page.locator('.ogs-dashboard-nav')).toContainText('Overview')
    await expect(page.locator('.ogs-dashboard-nav')).toContainText('Play')
    await expect(page.locator('.ogs-dashboard-nav')).toContainText('Games')
    await expect(
      page.locator('.ogs-dashboard-nav').getByRole('button', {name: 'Play'}),
    ).toBeDisabled()
    await expect(page.locator('.ogs-dashboard-section-detail')).toHaveCount(0)
    await expect(
      page.locator('#apprail').getByRole('button', {name: 'OGS'}),
    ).toHaveAttribute('aria-current', 'page')

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
    await expect(
      page.locator('.ogs-dashboard-nav').getByRole('button', {name: 'Play'}),
    ).toBeEnabled()
    await expect(page.locator('.ogs-dashboard-status-pill')).toContainText(
      'Authenticated',
    )
    await page
      .locator('.ogs-dashboard-nav')
      .getByRole('button', {name: 'Social'})
      .click()
    await expect(page.locator('.ogs-dashboard-section-detail')).toContainText(
      'Friends, direct chats, invitations, and presence will live here.',
    )
    await expect(
      page.locator('.ogs-dashboard-nav').getByRole('button', {name: 'Social'}),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.ogs-matchmaking')).toBeVisible()
    await page
      .locator('.ogs-matchmaking input[name="boardSizes"][value="9"]')
      .check()
    await page
      .locator('.ogs-matchmaking input[name="speeds"][value="blitz"]')
      .check()
    await page
      .locator('.ogs-matchmaking select[name="timeSystem"]')
      .selectOption('fischer')
    await page.locator('.ogs-matchmaking input[name="lowerRankDiff"]').fill('2')
    await page.locator('.ogs-matchmaking input[name="upperRankDiff"]').fill('4')
    await page
      .locator('.ogs-matchmaking select[name="rules.value"]')
      .selectOption('chinese')
    await page
      .locator('.ogs-matchmaking select[name="handicap.value"]')
      .selectOption('disabled')
    await page.locator('.ogs-matchmaking button').click()
    await expect(page.locator('.ogs-matchmaking')).toContainText(
      'Automatch payload logged.',
    )
    await expect(page.locator('.ogs-online-game')).toBeVisible()
    await expect(page.locator('.ogs-online-game')).toContainText('Active games')
    await expect(page.locator('.ogs-online-game')).toContainText('Fixture Game')
    await expect(page.locator('.ogs-online-game')).toContainText('sekibot')
    await page.locator('.ogs-active-games button').click()
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
    await expect(page.locator('.ogs-game-context-chat input')).toHaveCount(0)
    await expect(page.locator('.gtp-console')).toHaveCount(0)

    await page.locator('#apprail').getByRole('button', {name: 'OGS'}).click()
    await expect(page.locator('.ogs-online-game')).toContainText('Fixture Game')
    await expect(page.locator('.ogs-online-game')).toContainText('19x19')
    await expect(page.locator('.ogs-online-game')).toContainText('opponent')
    await expect(page.locator('.ogs-online-game')).toContainText('good luck')
    await page
      .locator('.ogs-active-games')
      .getByRole('button', {name: 'Open board'})
      .click()
    await page.waitForFunction(
      () => window.__sabaki.state.activeWorkspace === 'board',
    )
    await expect(page.locator('#goban')).toBeVisible()
    await page.locator('#apprail').getByRole('button', {name: 'OGS'}).click()

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

    await page.locator('#apprail').getByRole('button', {name: 'OGS'}).click()
    await page
      .locator('.ogs-online-game')
      .getByRole('button', {name: 'Disconnect game'})
      .click()
    await page.waitForFunction(() => window.__sabaki.state.onlineGameId == null)

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

    await page.locator('.ogs-active-games button').click()
    await page.waitForFunction(() => window.__sabaki.state.onlineGameId === 42)

    await page.locator('#apprail').getByRole('button', {name: 'Board'}).click()

    await expect(page.locator('.ogs-panel')).toHaveCount(0)
    await expect(page.locator('.ogs-game-context-panel')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toHaveCount(0)
    await expect(page.locator('.gtp-console')).toHaveCount(0)
  })

  test('ignores stale OGS move rejection after server confirmation', async ({
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
      window.__ogsTestState = {
        user: {id: '7', username: 'sekibot', rank: '1d'},
        onlineGame,
      }
      window.sabaki.ogs = {
        getState: async () => window.__ogsTestState,
        playMove: async () =>
          new Promise((resolve) => {
            window.__resolveOgsMove = resolve
          }),
      }
      window.__sabaki.showOgsPlayError = async (error) => {
        window.__ogsPlayError = error
      }

      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.submitOgsMove([2, 2])
    })

    await page.waitForFunction(() => window.__sabaki.ogsPendingMove != null)

    await page.evaluate(async () => {
      window.__ogsTestState.onlineGame.moves.push({move: 'cc', moveNumber: 1})
      window.__ogsTestState.onlineGame.moveCount = 1
      window.__ogsTestState.onlineGame.lastMove = 'cc'
      await window.__sabaki.applyOgsGameUpdate(window.__ogsTestState.onlineGame)
      window.__resolveOgsMove({
        ok: false,
        error: {code: 'not-your-turn', message: 'Not your turn.'},
        state: window.__ogsTestState,
      })
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
        window.__ogsPlayError == null &&
        window.__sabaki.ogsPendingMove == null &&
        window.__sabaki.state.onlineGameId === 42 &&
        sequence.length === 2 &&
        sequence[1].B?.[0] === 'cc'
      )
    })
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
      window.__sabaki.setState({
        activeWorkspace: 'board',
        showLeftSidebar: true,
      })
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

  test('explains finished OGS games before detaching the board', async ({
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
        return {response: 0}
      }

      await window.__sabaki.loadOgsGame(onlineGame)
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
    await page.waitForFunction(() => window.__sabaki.state.onlineGameId == null)

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
