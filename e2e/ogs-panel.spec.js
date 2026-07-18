const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')
const {waitForRender} = require('./helpers')

test.describe('OGS mock panel', () => {
  test('toggles from engine sidebar and shows mock connection status', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__sabaki.setState({showLeftSidebar: true})
    })
    await waitForRender(page)

    await expect(page.locator('#leftsidebar')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toBeVisible()
    await expect(page.locator('.gtp-console')).toBeVisible()

    await page.evaluate(() => {
      window.__ogsTestSession = null
      window.__ogsPlayedMoves = []
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
            black: {id: 7, username: 'sekibot'},
            white: {id: 8, username: 'opponent'},
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
          window.__ogsTestState.onlineGame = {
            status: 'connected',
            gameId: Number(gameId),
            error: null,
            gameName: 'Fixture Game',
            board: {width: 19, height: 19},
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
            lastMove: 'dd',
            clock: null,
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
        logout: async () => {
          window.__ogsTestSession = null
          window.__ogsTestState.user = null
          return true
        },
      }
    })

    await page.getByTitle('Show OGS Panel').click()

    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toHaveCount(0)
    await expect(page.locator('.gtp-console')).toHaveCount(0)

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
    await expect(page.locator('.ogs-online-game')).toContainText('Fixture Game')
    await expect(page.locator('.ogs-online-game')).toContainText('19x19')
    await expect(page.locator('.ogs-online-game')).toContainText('opponent')
    await expect(page.locator('.ogs-online-game')).toContainText('good luck')
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

    await page.getByTitle('Show OGS Panel').click()

    await expect(page.locator('.ogs-panel')).toHaveCount(0)
    await expect(page.locator('.engine-peer-list')).toBeVisible()
    await expect(page.locator('.gtp-console')).toBeVisible()
  })
})
