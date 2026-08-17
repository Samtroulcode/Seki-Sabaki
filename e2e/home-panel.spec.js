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

  test('shows the configured User Library in the Home mini-library', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-home-library-e2e-'))
    let games = path.join(root, 'Games')
    mkdirSync(games)
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
      await expect(pane).toContainText('My Library')
      await expect(pane).toContainText('Games')
      await expect(pane).toContainText('study.sgf')
      await expect(pane).toContainText('game.sgf')
      await expect(pane.locator('.home-library-entry-directory')).toHaveCount(1)
      await expect(pane.locator('.home-library-entry-file')).toHaveCount(2)
      await expect(
        pane
          .locator('.home-library-entry-directory .home-library-entry-icon')
          .first(),
      ).toHaveAttribute('src', /file-directory-16\.svg/)
      await expect(
        pane
          .locator('.home-library-entry-file .home-library-entry-icon')
          .first(),
      ).toHaveAttribute('src', /file-16\.svg/)
      await expect(pane.locator('.ogs-mini-goban')).toHaveCount(0)

      // A folder click hands off to the Library workspace.
      await pane.locator('.home-library-entry-directory').click()
      await expect(page.locator('#library-dashboard')).toBeVisible()

      // A file click opens the SGF in a board tab.
      await page.getByTitle('Home').click()
      await page.locator('.home-library-entry-file').first().click()
      await expect(page.locator('#goban')).toBeVisible()
      await expect(
        page.locator(
          '.app-board-tab-button[title="game.sgf"][aria-current="page"]',
        ),
      ).toHaveAttribute('aria-current', 'page')
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('falls back to the built-in Library when no User Library is configured', async ({
    page,
  }) => {
    let pane = page.locator('.home-library-pane')
    await expect(pane).toContainText('Pro Games')
    await expect(pane).toContainText('Go Seigen SGF Pack')
    await expect(
      pane
        .locator('.home-library-entry-directory .home-library-entry-icon')
        .first(),
    ).toHaveAttribute('src', /file-directory-16\.svg/)
    await expect(pane.locator('.ogs-mini-goban')).toHaveCount(0)

    await pane.getByRole('button', {name: 'Open Library'}).click()
    await expect(page.locator('#library-dashboard')).toBeVisible()
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
})
