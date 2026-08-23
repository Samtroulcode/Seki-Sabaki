const {expect} = require('@playwright/test')
const {mkdirSync, mkdtempSync, rmSync, writeFileSync} = require('fs')
const {tmpdir} = require('os')
const path = require('path')
const {test} = require('./fixtures/electron-app')

test.describe('Home workspace', () => {
  test('renders persistent destinations outside the activity tabs', async ({
    page,
  }) => {
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.locator('#appsidebar')).toBeVisible()
    await expect(page.getByTitle('Home')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('.home-identity')).toContainText('Seki')
    await expect(page.locator('.home-identity')).toContainText(
      'Your Go workspace',
    )
    await expect
      .poll(() =>
        page
          .locator('#home')
          .evaluate((home) => getComputedStyle(home).backgroundImage),
      )
      .toBe('none')
    await expect(page.locator('.home-hero')).toHaveCount(0)
    await expect(page.locator('.home-navbar')).toHaveCount(0)
    await expect(page.locator('.home-online-pane')).toHaveCount(0)
    await expect(page.locator('.home-recent-games-pane')).toHaveCount(0)
    await expect(page.locator('.home-library-pane')).toHaveCount(0)

    await expect(page.getByRole('button', {name: 'New board'})).toBeVisible()
    await expect(
      page.getByRole('button', {name: 'Browse Library'}),
    ).toBeVisible()
    await expect(
      page.locator('#home').getByRole('button', {name: 'Online'}),
    ).toHaveCount(0)
    await expect(page.locator('#apptabs .app-home-tab')).toHaveCount(0)
    await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
    await expect(
      page.getByRole('heading', {name: 'Continue', exact: true}),
    ).toHaveCount(0)
    await expect(page.locator('.home-work-section > h2')).toHaveText([
      'Start',
      'Quick overview',
      'Study',
    ])

    let destinations = [
      ['Online', '#ogs-dashboard', 'ogs'],
      ['Analysis', '#analysis-dashboard', 'analysis'],
      ['Library', '#library-dashboard', 'library'],
      ['Tsumego', '#tsumego-dashboard', 'tsumego'],
    ]
    for (let [name, selector, type] of destinations) {
      await page.getByTitle('Home').click()
      await page.getByRole('button', {name, exact: true}).click()
      await expect(page.locator(selector)).toBeVisible()
      await expect(
        page.locator(`.app-sidebar-button.type-${type}`),
      ).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
      await expect
        .poll(() =>
          page.evaluate(
            (workspaceType) =>
              window.__sabaki.state.workspaceTabs.filter(
                (tab) => tab.type === workspaceType,
              ).length,
            type,
          ),
        )
        .toBe(1)
      await page.getByTitle('Home').click()
      await page.getByRole('button', {name, exact: true}).click()
      await expect
        .poll(() =>
          page.evaluate(
            (workspaceType) =>
              window.__sabaki.state.workspaceTabs.filter(
                (tab) => tab.type === workspaceType,
              ).length,
            type,
          ),
        )
        .toBe(1)
    }
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__sabaki.state.activityTabOrder.every(
            (key) => !key.startsWith('workspace:'),
          ),
        ),
      )
      .toBe(true)
  })

  test('keeps board-size selection and creates the selected board', async ({
    page,
  }) => {
    let sizes = page.locator('.home-size-options')
    await expect(sizes.getByRole('button', {name: '19×19'})).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sizes.getByRole('button', {name: '9×9'}).click()
    await expect(sizes.getByRole('button', {name: '9×9'})).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', {name: 'New board'}).click()
    await expect(page.locator('#goban')).toBeVisible()
    await page.waitForFunction(
      () => window.__sabaki.state.gameTrees[0].root.data.SZ?.[0] === '9',
    )
  })

  test('sidebar navigation preserves activities and Settings opens globally', async ({
    page,
  }) => {
    await page.getByRole('button', {name: 'New board'}).click()
    let boardId = await page.evaluate(
      () => window.__sabaki.state.activeBoardTabId,
    )
    await page.evaluate((id) => {
      window.__sabaki.setState({
        activityTabOrder: ['workspace:stale', `board:${id}`, `board:${id}`],
      })
    }, boardId)
    await expect
      .poll(() => page.evaluate(() => window.__sabaki.state.activityTabOrder))
      .toEqual([`board:${boardId}`])
    await expect(page.locator('.app-board-tab')).toHaveCount(1)
    await expect(page.locator('#appsidebar [aria-current="page"]')).toHaveCount(
      0,
    )

    await page.getByRole('button', {name: 'Library', exact: true}).click()
    await expect(page.locator('#library-dashboard')).toBeVisible()
    await expect(page.locator('.app-board-tab')).toHaveCount(1)
    await expect(
      page.locator('.app-sidebar-button.type-library'),
    ).toHaveAttribute('aria-current', 'page')

    await page.locator('.app-board-tab-button').click()
    await page.waitForFunction(
      (id) =>
        window.__sabaki.state.activeWorkspace === 'board' &&
        window.__sabaki.state.activeBoardTabId === id,
      boardId,
    )
    await expect(page.locator('#appsidebar [aria-current="page"]')).toHaveCount(
      0,
    )

    await page.getByRole('button', {name: 'Settings'}).click()
    await expect(page.locator('#preferences.show')).toBeVisible()
    await expect(page.getByRole('button', {name: 'Settings'})).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect
      .poll(() =>
        page.evaluate(() => ({
          activeWorkspace: window.__sabaki.state.activeWorkspace,
          boardTabs: window.__sabaki.state.boardTabs.length,
          workspaceTabs: window.__sabaki.state.workspaceTabs.length,
        })),
      )
      .toEqual({activeWorkspace: 'board', boardTabs: 1, workspaceTabs: 1})
    await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
  })

  test('resumes the preferred existing board tab', async ({page}) => {
    await page.getByRole('button', {name: 'New board'}).click()
    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'New board'}).click()

    let targetId = await page.evaluate(() => {
      let [target] = window.__sabaki.state.boardTabs
      window.__sabaki.switchBoardTab(target.id)
      return target.id
    })
    await page.getByTitle('Home').click()

    await expect(
      page.getByRole('heading', {name: 'Continue', exact: true}),
    ).toBeVisible()
    await expect(page.locator('.home-resume-details')).toContainText(
      'Untitled Board',
    )
    await page.getByRole('button', {name: 'Continue board'}).click()
    await page.waitForFunction(
      (id) =>
        window.__sabaki.state.activeWorkspace === 'board' &&
        window.__sabaki.state.activeBoardTabId === id,
      targetId,
    )
  })

  test('resumes an online-game tab before an existing board', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      await window.__sabaki.createNewBoardTab()
      await window.__sabaki.loadOgsGame({
        gameId: 42,
        gameName: 'Resume Fixture',
        board: {width: 9, height: 9},
        handicap: 0,
        komi: 6.5,
        rules: 'chinese',
        ranked: false,
        phase: 'play',
        players: {
          black: {id: 7, username: 'black'},
          white: {id: 8, username: 'white'},
        },
        moves: [],
        moveCount: 0,
      })
      window.__sabaki.setState({
        activeWorkspace: 'home',
        homeSection: 'dashboard',
      })
    })

    await expect(page.locator('.home-resume-details')).toContainText(
      'Resume Fixture',
    )
    await expect(page.locator('.home-resume-details')).toContainText('Game #42')
    await page.getByRole('button', {name: 'Continue game'}).click()
    await page.waitForFunction(
      () =>
        window.__sabaki.state.activeWorkspace === 'online-game' &&
        window.__sabaki.state.onlineGameId === 42 &&
        window.__sabaki.state.activeOnlineGameTabId != null,
    )
    await expect(page.locator('#online-game')).toBeVisible()
  })

  test('closing hidden activities preserves the selected destination', async ({
    page,
  }) => {
    await page.evaluate(async (onlineGame) => {
      await window.__sabaki.createNewBoardTab()
      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.openWorkspaceTab('analysis')

      let onlineId = window.__sabaki.state.activeOnlineGameTabId
      window.__sabaki.closeOnlineGameTab(onlineId)
    }, createOnlineGameFixture(42))
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await expect(page.locator('.app-online-game-tab')).toHaveCount(0)
    await expect(page.locator('.app-board-tab')).toHaveCount(1)

    await page.evaluate(async () => {
      let boardId = window.__sabaki.state.activeBoardTabId
      await window.__sabaki.closeBoardTab(boardId)
    })
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await expect(page.locator('.app-board-tab')).toHaveCount(0)
  })

  test('closing a visible activity activates its cross-type neighbor', async ({
    page,
  }) => {
    await page.evaluate(async (onlineGame) => {
      await window.__sabaki.createNewBoardTab()
      await window.__sabaki.loadOgsGame(onlineGame)
      window.__sabaki.setState({activityTabOrder: ['workspace:stale']})
    }, createOnlineGameFixture(42))
    await expect
      .poll(() => page.evaluate(() => window.__sabaki.state.activityTabOrder))
      .toEqual([
        await page.evaluate(
          () => `board:${window.__sabaki.state.activeBoardTabId}`,
        ),
        await page.evaluate(
          () => `online-game:${window.__sabaki.state.activeOnlineGameTabId}`,
        ),
      ])
    await page.evaluate(() => {
      window.__sabaki.closeOnlineGameTab(
        window.__sabaki.state.activeOnlineGameTabId,
      )
    })
    await expect
      .poll(() => page.evaluate(() => window.__sabaki.state.activeWorkspace))
      .toBe('board')
    await expect(page.locator('#main')).toBeVisible()

    await page.evaluate(async (onlineGame) => {
      await window.__sabaki.loadOgsGame(onlineGame)
      let boardId = window.__sabaki.state.activeBoardTabId
      window.__sabaki.switchBoardTab(boardId)
      await window.__sabaki.closeBoardTab(boardId)
    }, createOnlineGameFixture(43))
    await expect(page.locator('#online-game')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => window.__sabaki.state.onlineGameId))
      .toBe(43)
  })

  test('preserves targeted Library routing without a workspace tab', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('library', {
        libraryRequest: {source: 'builtin', currentPath: 'games'},
      })
    })
    await expect(page.locator('#library-dashboard')).toBeVisible()
    await expect(page.locator('.library-browser-toolbar h2')).toHaveText(
      'Built-in',
    )
    await expect(page.locator('.library-current-path')).toHaveText('games')
    await expect(
      page.locator('.app-sidebar-button.type-library'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
    let tabId = await page.evaluate(
      () =>
        window.__sabaki.state.workspaceTabs.find(
          (tab) => tab.type === 'library',
        )?.id,
    )

    await page.getByRole('button', {name: 'Analysis', exact: true}).click()
    await page.getByRole('button', {name: 'Library', exact: true}).click()
    await expect(page.locator('#library-dashboard')).toBeVisible()
    await expect(page.locator('.library-browser-toolbar h2')).toHaveText(
      'Built-in',
    )
    await expect(page.locator('.library-current-path')).toHaveText('games')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__sabaki.state.workspaceTabs.find(
              (tab) => tab.type === 'library',
            )?.id,
        ),
      )
      .toBe(tabId)

    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'Browse Library'}).click()
    await expect(page.locator('.library-setup-card')).toContainText(
      'Choose your Library folder',
    )
    await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
    let firstResetId = await page.evaluate(
      () =>
        window.__sabaki.state.workspaceTabs.find(
          (tab) => tab.type === 'library',
        )?.libraryRequest?.requestId,
    )
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('library', {libraryRequest: null})
    })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__sabaki.state.workspaceTabs.find(
              (tab) => tab.type === 'library',
            )?.libraryRequest?.requestId,
        ),
      )
      .toBe(firstResetId + 1)
  })

  test('browses a configured My Library folder', async ({page}) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-library-e2e-'))
    let games = path.join(root, 'Games')
    mkdirSync(games)
    writeFileSync(path.join(games, 'fixture.sgf'), '(;GM[1]SZ[9];B[aa])')

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Browse Library'}).click()
      await expect(page.locator('.library-browser-toolbar h2')).toHaveText(
        'My Library',
      )
      await expect(page.locator('.library-entry-directory')).toContainText(
        'Games',
      )
      await page.locator('.library-entry-directory').click()
      await expect(page.locator('.library-current-path')).toHaveText('Games')
      await page.getByRole('button', {name: 'Analysis', exact: true}).click()
      await expect(page.locator('#analysis-dashboard')).toBeVisible()
      await page.getByRole('button', {name: 'Library', exact: true}).click()
      await expect(page.locator('.library-current-path')).toHaveText('Games')
      await page.locator('.library-entry-file').click()
      await expect(page.locator('#goban')).toBeVisible()
      await expect(
        page.locator(
          '.app-board-tab-button[title="fixture.sgf"][aria-current="page"]',
        ),
      ).toHaveCount(1)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('fetches OGS history when returning Home', async ({page}) => {
    await page.evaluate(() => {
      window.__homeHistoryCalls = []
      let user = {id: '7', username: 'sekibot', rank: '1d'}
      let state = {
        user,
        socket: {status: 'authenticated', authenticated: true, error: null},
        matchmaking: {status: 'idle', options: {}},
        onlineGame: {status: 'idle', gameId: null},
        activeGames: [],
      }
      window.sabaki.ogs = {
        getSession: async () => user,
        getState: async () => state,
        listGameHistory: async (options) => {
          window.__homeHistoryCalls.push(options)
          return {
            ok: true,
            history: {results: [], next: null, previous: null},
          }
        },
        listFriends: async () => ({ok: true, friends: []}),
        getPlayerProfile: async () => ({ok: true, profile: null}),
      }
    })

    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await page.waitForFunction(() =>
      window.__homeHistoryCalls.some((call) => call.pageSize === 12),
    )
    let before = await page.evaluate(() => window.__homeHistoryCalls.length)

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await page.waitForTimeout(300)
    let calls = await page.evaluate(() => window.__homeHistoryCalls)
    // HomeOgsCard now fetches history on mount (pageSize 12)
    expect(calls).toHaveLength(before + 1)
    expect(calls.some((call) => call.pageSize === 12)).toBe(true)
  })

  test('remains usable at 800x600', async ({page, electronApp}) => {
    const browserWindow = await electronApp.browserWindow(page)
    await browserWindow.evaluate((win) => win.setContentSize(800, 600))
    await expect(async () => {
      const size = await browserWindow.evaluate((win) => win.getContentSize())
      expect(size).toEqual([800, 600])
    }).toPass({timeout: 5000})

    await expect(page.getByRole('button', {name: 'New board'})).toBeVisible()
    await expect(
      page.getByRole('button', {name: 'Browse Library'}),
    ).toBeVisible()
    await expect(page.locator('#appsidebar')).toBeVisible()
    let home = page.locator('#home')
    await expect(
      page.getByRole('button', {name: 'Tsumego', exact: true}),
    ).toBeVisible()
    await page.locator('.home-card-tsumego').scrollIntoViewIfNeeded()
    await expect(page.locator('.home-card-tsumego')).toBeVisible()

    let overflow = await home.evaluate((element) => ({
      horizontal: element.scrollWidth > element.clientWidth,
    }))
    expect(overflow.horizontal).toBe(false)

    await page.getByRole('button', {name: 'Analysis', exact: true}).click()
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    let analysisLayout = await page.evaluate(() => {
      let content = document.querySelector('#appcontent')
      let cards = [...document.querySelectorAll('.analysis-dashboard-card')]
      return {
        horizontal: content.scrollWidth > content.clientWidth,
        cardLefts: cards.map((card) => card.getBoundingClientRect().left),
      }
    })
    expect(analysisLayout.horizontal).toBe(false)
    expect(new Set(analysisLayout.cardLefts.map(Math.round)).size).toBe(1)

    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'New board'}).click()
    await expect(page.locator('.app-board-tab')).toBeVisible()
    await expect(page.locator('#goban')).toBeVisible()
    let geometry = await page.evaluate(() => {
      let sidebar = document
        .querySelector('#appsidebar')
        .getBoundingClientRect()
      let tabs = document.querySelector('#apptabs').getBoundingClientRect()
      let goban = document.querySelector('#goban').getBoundingClientRect()
      return {
        sidebarRight: sidebar.right,
        tabsLeft: tabs.left,
        gobanWidth: goban.width,
        gobanHeight: goban.height,
      }
    })
    expect(geometry.tabsLeft).toBeGreaterThanOrEqual(geometry.sidebarRight)
    expect(geometry.gobanWidth).toBeGreaterThan(100)
    expect(geometry.gobanHeight).toBeGreaterThan(100)
  })

  test('keeps Board usable when resized down to 800x600 while active', async ({
    page,
    electronApp,
  }) => {
    const browserWindow = await electronApp.browserWindow(page)
    await browserWindow.evaluate((win) => win.setContentSize(1200, 800))
    await expect(async () => {
      const size = await browserWindow.evaluate((win) => win.getContentSize())
      expect(size).toEqual([1200, 800])
    }).toPass({timeout: 5000})

    await page.evaluate(() => {
      window.__sabaki.setState({
        showLeftSidebar: true,
        showGameGraph: true,
      })
    })
    await page.getByRole('button', {name: 'New board'}).click()
    await expect(page.locator('#leftsidebar')).toBeVisible()
    await expect(page.locator('#sidebar')).toBeVisible()

    await browserWindow.evaluate((win) => win.setContentSize(800, 600))
    await expect(async () => {
      const size = await browserWindow.evaluate((win) => win.getContentSize())
      expect(size).toEqual([800, 600])
    }).toPass({timeout: 5000})
    await expect(page.locator('#leftsidebar')).toBeVisible()
    await expect(page.locator('#sidebar')).toBeVisible()
    await expect
      .poll(() =>
        page.locator('#goban').evaluate((goban) => {
          let {width, height} = goban.getBoundingClientRect()
          return Math.min(width, height)
        }),
      )
      .toBeGreaterThan(100)
  })

  test('Tsumego continuation falls back to built-in easy', async ({page}) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await expect(card).toContainText('0 / 140 solved')
    await expect(card.getByRole('button', {name: 'Continue'})).toBeVisible()
    await expect(
      card.getByRole('button', {name: 'Browse Tsumego'}),
    ).toBeVisible()
    await expect(card).not.toContainText('Black to play')
    await expect(card).not.toContainText('0%')
  })

  test('Tsumego continuation uses a remembered user collection', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-home-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '001.sgf'),
      '(;GM[1]SZ[9]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))',
    )

    try {
      await page.evaluate(async (libraryRoot) => {
        window.sabaki.setting.set('library.root', libraryRoot)
        window.sabaki.setting.set('tsumego.last_collection', {
          source: 'user',
          relativePath: 'Tsumego/User Set',
        })
      }, root)
      await page.getByRole('button', {name: 'Online', exact: true}).click()
      await page.getByTitle('Home').click()

      let card = page.locator('.home-card-tsumego')
      await expect(card).toContainText('User Set')
      await expect(card).toContainText('0 / 1 solved')
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('Tsumego continuation falls back when the remembered collection is stale', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.setting.set('tsumego.last_collection', {
        source: 'builtin',
        relativePath: 'tsumego/does-not-exist',
      })
    })
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await card.getByRole('button', {name: 'Continue'}).click()
    await expect(page.locator('.tsumego-problem-filename')).toHaveText(
      'ggg-easy-01.sgf',
    )
  })

  test('Tsumego continuation targets the first unfinished problem', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.tsumegoProgress.getAll = async () => ({
        version: 1,
        problems: {
          'builtin:tsumego/easy/ggg-easy-01.sgf': {completed: true},
          'builtin:tsumego/easy/ggg-easy-02.sgf': {completed: true},
        },
      })
    })
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('2 / 140 solved')
    await card.getByRole('button', {name: 'Continue'}).click()
    await expect(page.locator('.tsumego-solver')).toBeVisible()
    await expect(page.locator('.tsumego-problem-filename')).toHaveText(
      'ggg-easy-03.sgf',
    )
  })

  test('Tsumego continuation shows Review for a complete collection', async ({
    page,
  }) => {
    await page.evaluate(() => {
      let problems = {}
      for (let i = 1; i <= 140; i++) {
        let name = `ggg-easy-${String(i).padStart(2, '0')}.sgf`
        problems[`builtin:tsumego/easy/${name}`] = {completed: true}
      }
      window.sabaki.tsumegoProgress.getAll = async () => ({
        version: 1,
        problems,
      })
    })
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('140 / 140 solved')
    await expect(card.getByRole('button', {name: 'Review'})).toBeVisible()
  })

  test('Tsumego preview stays at the initial problem position', async ({
    page,
  }) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await expect(
      card.locator('.home-tsumego-goban .ogs-mini-stone'),
    ).toHaveCount(16)
  })

  test('Tsumego Browse opens the displayed collection', async ({page}) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await card.getByRole('button', {name: 'Browse Tsumego'}).click()
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')
  })

  test('Tsumego continuation has a clean unavailable fallback', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.library.listBuiltin = async () => ({
        ok: false,
        code: 'read-failed',
        entries: [],
      })
    })
    await page.getByRole('button', {name: 'Online', exact: true}).click()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('No Tsumego available')
    await expect(
      card.getByRole('button', {name: 'Browse Tsumego'}),
    ).toBeVisible()
  })

  test('keeps the native menu mounted across Home and Board', async ({
    page,
    electronApp,
  }) => {
    let menuIsNonNull = () =>
      electronApp.evaluate(({Menu}) => Menu.getApplicationMenu() != null)
    await expect.poll(menuIsNonNull).toBe(true)
    await page.getByRole('button', {name: 'New board'}).click()
    await expect(page.locator('#goban')).toBeVisible()
    await expect.poll(menuIsNonNull).toBe(true)
    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await expect.poll(menuIsNonNull).toBe(true)
  })
})

function createOnlineGameFixture(gameId) {
  return {
    gameId,
    gameName: `Activity ${gameId}`,
    board: {width: 9, height: 9},
    handicap: 0,
    komi: 6.5,
    rules: 'chinese',
    ranked: false,
    phase: 'play',
    players: {
      black: {id: 7, username: 'black'},
      white: {id: 8, username: 'white'},
    },
    moves: [],
    moveCount: 0,
  }
}
