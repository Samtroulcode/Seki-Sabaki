const {expect} = require('@playwright/test')
const {mkdirSync, mkdtempSync, rmSync, writeFileSync} = require('fs')
const {tmpdir} = require('os')
const path = require('path')
const {test} = require('./fixtures/electron-app')

test.describe('Home panel navigation', () => {
  test('navigates between home, board, OGS, and placeholders', async ({
    page,
  }) => {
    await expect(page.locator('#apptabs')).toBeVisible()
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.getByTitle('Home')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('#home')).toContainText('Your Go workspace')
    await expect(page.locator('.home-sidebar')).toHaveCount(0)
    await expect(page.locator('#home')).toContainText('Connect account')
    await expect(page.locator('#home')).not.toContainText('Status')
    await expect(page.locator('#home')).toContainText('Recent games')
    await expect(page.locator('#home')).toContainText(
      'Connect OGS to see your history.',
    )
    await expect(page.getByRole('button', {name: /New board/})).toHaveCount(1)
    await expect(page.getByRole('button', {name: /Open SGF/})).toHaveCount(1)
    await expect(
      page.getByRole('button', {name: 'Library', exact: true}),
    ).toBeVisible()
    await expect(page.getByRole('button', {name: /Analyze/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Online play/})).toBeVisible()
    await expect(
      page.locator('.home-board-preview .ogs-mini-goban'),
    ).toBeVisible()
    await expect(
      page.locator('.home-board-sizes').getByRole('button', {name: '19x19'}),
    ).toHaveAttribute('aria-pressed', 'true')
    await page
      .locator('.home-board-sizes')
      .getByRole('button', {name: '13x13'})
      .click()
    await expect(
      page.locator('.home-board-sizes').getByRole('button', {name: '13x13'}),
    ).toHaveAttribute('aria-pressed', 'true')

    await page
      .locator('.home-board-sizes')
      .getByRole('button', {name: '9x9'})
      .click()
    await page.getByRole('button', {name: /^New board/}).click()
    await expect(page.locator('#goban')).toBeVisible()
    await page.waitForFunction(
      () => window.__sabaki.state.gameTrees[0].root.data.SZ?.[0] === '9',
    )
    await expect(page.getByTitle('Untitled Board')).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Home' : 'Control+Home',
    )
    await expect(page.locator('#home')).toBeVisible()

    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(
      page.locator('.app-workspace-tab.type-ogs .app-workspace-tab-button'),
    ).toHaveCount(1)
    await expect(
      page.locator('.app-workspace-tab.type-ogs.selected'),
    ).toHaveCount(1)
    await expect(
      page.locator('.app-activity-tabs > .app-board-tab'),
    ).toHaveCount(1)

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()

    await page.getByRole('button', {name: 'Library', exact: true}).click()
    await expect(page.locator('#library-dashboard')).toBeVisible()
    await expect(page.locator('.library-setup-card')).toContainText(
      'Choose your Library folder',
    )
    await expect(
      page.locator('.app-workspace-tab.type-library.selected'),
    ).toHaveCount(1)
    let tabClasses = await page
      .locator('.app-activity-tabs > div')
      .evaluateAll((tabs) => tabs.map((tab) => tab.className))
    expect(tabClasses).toEqual([
      'app-board-tab',
      'app-workspace-tab type-ogs',
      'app-workspace-tab type-library selected',
    ])
    await page
      .locator('.app-workspace-tab.type-library .app-workspace-tab-close')
      .click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(
      page.locator('.app-workspace-tab.type-ogs.selected'),
    ).toHaveCount(1)
    await page.getByTitle('Home').click()

    await page
      .locator('#home')
      .getByRole('button', {name: /Analyze/})
      .click()
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Analysis Manager',
    )
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Configure KataGo, model, config, and output folder before starting.',
    )
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'SGF analyzer:',
    )
    await expect(
      page.locator('#analysis-dashboard input[name="analyzeSgfPath"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('#analysis-dashboard input[name="katagoArguments"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('#analysis-dashboard input[name="katagoModelPath"]'),
    ).toBeVisible()
    await expect(
      page.locator('#analysis-dashboard input[name="katagoConfigPath"]'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {name: 'Choose KataGo...'}),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {name: 'Choose model...'}),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {name: 'Choose config...'}),
    ).toBeVisible()
    await expect(
      page.locator('#analysis-dashboard input[name="maxVisits"]'),
    ).toBeVisible()
    await expect(
      page.locator('#analysis-dashboard input[name="maxVisits"]'),
    ).toHaveValue('1600')
    await expect(
      page.locator(
        '#analysis-dashboard input[name="inferGameSettingsFromSgf"]',
      ),
    ).toBeChecked()
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Use rules and komi from the SGF when available',
    )
    await expect(
      page.locator('#analysis-dashboard select[name="language"]'),
    ).toHaveValue('fr')
    await expect(
      page.getByRole('button', {name: 'Start analysis'}),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', {name: 'Apply settings'}),
    ).toBeDisabled()

    await page.locator('input[name="katagoPath"]').fill('/tmp/katago')
    await expect(
      page.getByRole('button', {name: 'Apply settings'}),
    ).toBeEnabled()
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Apply settings before starting analysis.',
    )
  })

  test('shows both Library sections with folder cards in the Home mini-library', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-home-library-e2e-'))
    for (let name of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']) {
      mkdirSync(path.join(root, name))
    }
    writeFileSync(path.join(root, 'study.sgf'), '(;GM[1]SZ[9];B[aa])')
    writeFileSync(path.join(root, 'game.sgf'), '(;GM[1]SZ[9];W[bb])')

    try {
      // Leave Home first so the mini-library mounts after the root is set.
      await page.getByRole('button', {name: /Online play/}).click()
      await expect(page.locator('.ogs-panel')).toBeVisible()

      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByTitle('Home').click()

      let pane = page.locator('.home-library-pane')
      await expect(pane.locator('.home-library-section')).toHaveCount(2)
      await expect(pane.locator('.home-library-section').first()).toContainText(
        'My Library',
      )
      await expect(pane.locator('.home-library-section').nth(1)).toContainText(
        'Built-in',
      )

      // User section: at most 4 folders, no SGF files.
      let userSection = pane.locator('.home-library-section').first()
      await expect(
        userSection.locator('.home-library-folder-card'),
      ).toHaveCount(4)
      await expect(userSection).toContainText('Alpha')
      await expect(userSection).toContainText('Epsilon')
      await expect(userSection).not.toContainText('Gamma')
      await expect(userSection).not.toContainText('study.sgf')
      await expect(userSection).not.toContainText('game.sgf')

      // Built-in section: at most 4 folders.
      let builtinSection = pane.locator('.home-library-section').nth(1)
      await expect(
        builtinSection.locator('.home-library-folder-card'),
      ).toHaveCount(4)
      await expect(
        builtinSection.locator('.home-library-folder-card', {
          hasText: 'Go Seigen SGF Pack',
        }),
      ).toBeVisible()

      // Real folder icons, no mini gobans, no file rows.
      await expect(
        pane.locator('.home-library-folder-icon').first(),
      ).toHaveAttribute('src', /file-directory/)
      await expect(pane.locator('.ogs-mini-goban')).toHaveCount(0)
      await expect(pane.locator('.home-library-entry-file')).toHaveCount(0)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('opens the Library workspace at the User source from a Home folder card', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-home-library-e2e-'))
    let games = path.join(root, 'Games')
    mkdirSync(games)
    writeFileSync(path.join(games, 'fixture.sgf'), '(;GM[1]SZ[9];B[aa])')

    try {
      await page.getByRole('button', {name: /Online play/}).click()
      await expect(page.locator('.ogs-panel')).toBeVisible()

      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByTitle('Home').click()

      let userSection = page
        .locator('.home-library-pane .home-library-section')
        .first()
      await expect(
        userSection.locator('.home-library-folder-card'),
      ).toContainText('Games')
      await userSection.locator('.home-library-folder-card').click()

      // Library workspace opens at the User source, inside Games.
      await expect(page.locator('#library-dashboard')).toBeVisible()
      await expect(page.locator('.library-browser-toolbar h2')).toContainText(
        'My Library',
      )
      await expect(page.locator('.library-current-path')).toContainText('Games')
      await expect(page.locator('.library-entry-file')).toContainText(
        'fixture.sgf',
      )

      // Up navigation stays in the User source.
      await page.getByRole('button', {name: 'Up one folder'}).click()
      await expect(page.locator('.library-browser-toolbar h2')).toContainText(
        'My Library',
      )
      await expect(page.locator('.library-current-path')).toContainText(
        'Library root',
      )
      await expect(page.locator('.library-entry-directory')).toContainText(
        'Games',
      )

      // A User SGF opens through the board workflow.
      await page.locator('.library-entry-directory').click()
      await page.locator('.library-entry-file').click()
      await expect(page.locator('#goban')).toBeVisible()
      await expect(
        page.locator(
          '.app-board-tab-button[title="fixture.sgf"][aria-current="page"]',
        ),
      ).toHaveAttribute('aria-current', 'page')
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('opens the Library workspace at the Built-in source from a Home folder card', async ({
    page,
  }) => {
    let pane = page.locator('.home-library-pane')
    let builtinSection = pane.locator('.home-library-section').nth(1)
    await expect(
      builtinSection.locator('.home-library-folder-card', {
        hasText: 'Go Seigen SGF Pack',
      }),
    ).toBeVisible()
    await builtinSection
      .locator('.home-library-folder-card', {hasText: 'Go Seigen SGF Pack'})
      .click()

    // Library workspace opens at the Built-in source, inside the collection.
    await expect(page.locator('#library-dashboard')).toBeVisible()
    await expect(page.locator('.library-browser-toolbar h2')).toContainText(
      'Built-in',
    )
    await expect(page.locator('.library-current-path')).toContainText(
      'games/Go Seigen SGF Pack',
    )
    await expect(page.locator('.library-entry-file').first()).toBeVisible()

    // Built-in exposes no change-root action.
    await expect(page.getByRole('button', {name: 'Change folder'})).toHaveCount(
      0,
    )

    // Up navigation stays in the Built-in source.
    await page.getByRole('button', {name: 'Up one folder'}).click()
    await expect(page.locator('.library-browser-toolbar h2')).toContainText(
      'Built-in',
    )
    await expect(page.locator('.library-current-path')).toHaveText('games')

    // A Built-in SGF opens through the board workflow.
    await page
      .locator('.library-entry-directory', {hasText: 'Go Seigen SGF Pack'})
      .click()
    await page.locator('.library-entry-file').first().click()
    await expect(page.locator('#goban')).toBeVisible()
  })

  test('browses a configured Library folder', async ({page}) => {
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
      await page.getByRole('button', {name: 'Library', exact: true}).click()
      await expect(page.locator('.library-entry-directory')).toContainText(
        'Games',
      )
      await page.locator('.library-entry-directory').click()
      await expect(page.locator('.library-entry-file')).toContainText(
        'fixture.sgf',
      )
      await page.getByRole('button', {name: 'Up one folder'}).click()
      await expect(page.locator('.library-entry-directory')).toContainText(
        'Games',
      )
      await page.evaluate(() => {
        window.__libraryList = window.sabaki.library.list
        window.sabaki.library.list = async () => ({
          ok: false,
          code: 'read-failed',
          entries: [],
        })
      })
      await page.locator('.library-entry-directory').click()
      await expect(page.locator('.ogs-error')).toContainText(
        'Unable to read this Library folder.',
      )
      await page.evaluate(() => {
        window.sabaki.library.list = window.__libraryList
      })
      await page.getByRole('button', {name: 'Up one folder'}).click()
      await page.locator('.library-entry-directory').click()
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

  test('Continue Tsumego falls back to builtin easy when nothing is remembered', async ({
    page,
  }) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toBeVisible()
    await expect(card).toContainText('GoGameGuru — Easy')
    await expect(card).toContainText('Built-in')
    await expect(card).toContainText('Problem 1 / 140')
    await expect(card).toContainText('0 / 140 solved')
    await expect(card).toContainText('0%')
    await expect(card.getByRole('button', {name: 'Continue'})).toBeVisible()
    await expect(
      card.getByRole('button', {name: 'Browse Tsumego'}),
    ).toBeVisible()
  })

  test('Continue Tsumego uses the remembered builtin collection', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.setting.set('tsumego.last_collection', {
        source: 'builtin',
        relativePath: 'tsumego/hard',
      })
    })
    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Hard')
    await expect(card).toContainText('Built-in')
  })

  test('Continue Tsumego uses the remembered user collection when configured', async ({
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
      await page.getByRole('button', {name: /Online play/}).click()
      await expect(page.locator('.ogs-panel')).toBeVisible()
      await page.getByTitle('Home').click()

      let card = page.locator('.home-card-tsumego')
      await expect(card).toContainText('User Set')
      await expect(card).toContainText('My Library')
      await expect(card).toContainText('Problem 1 / 1')
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('Continue Tsumego falls back to easy when the remembered collection is stale', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.setting.set('tsumego.last_collection', {
        source: 'builtin',
        relativePath: 'tsumego/does-not-exist',
      })
    })
    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
  })

  test('Continue Tsumego picks the first unfinished problem', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.tsumegoProgress.getAll = async () => ({
        version: 1,
        problems: {
          'builtin:tsumego/easy/ggg-easy-01.sgf': {
            completed: true,
            completedAt: 'x',
          },
          'builtin:tsumego/easy/ggg-easy-02.sgf': {
            completed: true,
            completedAt: 'x',
          },
        },
      })
    })
    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('Problem 3 / 140')
    await expect(card).toContainText('2 / 140 solved')
  })

  test('Continue Tsumego marks a complete collection and shows Review', async ({
    page,
  }) => {
    await page.evaluate(() => {
      let problems = {}
      for (let i = 1; i <= 140; i++) {
        let name = `ggg-easy-${String(i).padStart(2, '0')}.sgf`
        problems[`builtin:tsumego/easy/${name}`] = {
          completed: true,
          completedAt: 'x',
        }
      }
      window.sabaki.tsumegoProgress.getAll = async () => ({
        version: 1,
        problems,
      })
    })
    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('Collection complete')
    await expect(card).toContainText('140 / 140 solved')
    await expect(card).toContainText('100%')
    await expect(card.getByRole('button', {name: 'Review'})).toBeVisible()
  })

  test('Continue Tsumego preview shows the initial position, not the solution', async ({
    page,
  }) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    // ggg-easy-01 has 16 setup stones at the start position; the solved line
    // would add more. Asserting the initial count proves the preview is built
    // from problem.startNodeId, not the final SGF node.
    await expect(
      card.locator('.home-tsumego-goban .ogs-mini-stone'),
    ).toHaveCount(16)
    await expect(card).toContainText('Black to play')
  })

  test('Continue Tsumego opens the displayed problem', async ({page}) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await card.getByRole('button', {name: 'Continue'}).click()
    await expect(page.locator('.tsumego-solver')).toBeVisible()
    await expect(page.locator('.app-workspace-tab.type-tsumego')).toHaveCount(1)
  })

  test('Continue Tsumego Browse opens the collection', async ({page}) => {
    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('GoGameGuru — Easy')
    await card.getByRole('button', {name: 'Browse Tsumego'}).click()
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')
  })

  test('Continue Tsumego shows a clean error when no Tsumego is available', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.sabaki.library.listBuiltin = async () => ({
        ok: false,
        code: 'read-failed',
        entries: [],
      })
    })
    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await page.getByTitle('Home').click()

    let card = page.locator('.home-card-tsumego')
    await expect(card).toContainText('No Tsumego available')
    await expect(
      card.getByRole('button', {name: 'Browse Tsumego'}),
    ).toBeVisible()
  })
})
