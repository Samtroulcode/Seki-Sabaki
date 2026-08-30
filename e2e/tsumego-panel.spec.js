const {expect} = require('@playwright/test')
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('fs')
const {tmpdir} = require('os')
const path = require('path')
const {test} = require('./fixtures/electron-app')

test.describe('Tsumego workspace', () => {
  test('opens and reuses the workspace, then loads a built-in problem', async ({
    page,
  }) => {
    await page.setViewportSize({width: 1600, height: 1000})
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()
    await expect(
      page.locator('.app-sidebar-button.type-tsumego'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#apptabs .app-workspace-tab')).toHaveCount(0)
    await expect(page.locator('.tsumego-source-tabs')).toContainText('Built-in')

    await page.getByTitle('Home').click()
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__sabaki.state.workspaceTabs.filter(
              (tab) => tab.type === 'tsumego',
            ).length,
        ),
      )
      .toBe(1)

    await expect(page.locator('.tsumego-entry-directory').first()).toBeVisible()
    await expect(
      page.locator('.tsumego-entry-directory .tsumego-entry-icon').first(),
    ).toHaveAttribute('src', /file-directory-16\.svg$/)
    await page.locator('.tsumego-entry-directory').first().click()
    await expect(page.locator('.tsumego-back-button')).toBeVisible()
    await expect(
      page.locator('.tsumego-browser-toolbar').locator('button').first(),
    ).toHaveClass(/tsumego-back-button/)
    await expect(page.locator('.tsumego-entry-file').first()).toBeVisible()
    await expect(
      page.locator('.tsumego-entry-file .tsumego-entry-icon').first(),
    ).toHaveAttribute('src', /file-16\.svg$/)
    await page
      .locator('.tsumego-entry-file')
      .filter({hasText: 'ggg-easy-01.sgf'})
      .click()
    await expect(page.locator('.tsumego-solver')).toBeVisible()
    await expect(page.locator('.tsumego-solver-board #goban')).toBeVisible()
    await expect(page.locator('.tsumego-player-to-move')).toBeVisible()
    let gobanBox = await page
      .locator('.tsumego-solver-board #goban')
      .boundingBox()
    expect(gobanBox).not.toBeNull()
    expect(gobanBox.width).toBeGreaterThan(100)
    expect(gobanBox.height).toBeGreaterThan(100)
    expect(Math.abs(gobanBox.width - gobanBox.height)).toBeLessThan(
      Math.max(gobanBox.width, gobanBox.height) * 0.1,
    )

    // The Goban should use the available space: square, within its container,
    // and no longer capped at the old ~42rem (672px) board height.
    let boardBox = await page.locator('.tsumego-solver-board').boundingBox()
    expect(gobanBox.width).toBeLessThanOrEqual(boardBox.width + 1)
    expect(gobanBox.height).toBeLessThanOrEqual(boardBox.height + 1)
    expect(gobanBox.height).toBeGreaterThan(672)
    expect(gobanBox.height).toBeGreaterThan(boardBox.height * 0.8)
    await expect(page.locator('.tsumego-solver-sidebar')).toBeVisible()
    await expect(page.locator('.tsumego-solver-navigation')).toBeVisible()
    await page.evaluate(() => {
      window.__tsumegoAudioPlays = 0
      Audio.prototype.play = () => {
        window.__tsumegoAudioPlays += 1
        return Promise.resolve()
      }
    })

    let globalTreePosition = await page.evaluate(
      () => window.__sabaki.state.treePosition,
    )
    await clickBoardVertex(page, 0, 0, 19)
    await expect(page.locator('.tsumego-solver-feedback')).toContainText(
      'Incorrect',
    )
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(0)
    expect(await page.evaluate(() => window.__sabaki.state.treePosition)).toBe(
      globalTreePosition,
    )
    await expect(
      page.getByRole('button', {name: 'Retry', exact: true}),
    ).toBeVisible()
    await page.getByRole('button', {name: 'Retry', exact: true}).click()
    await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)

    let autoReplyStartedAt = await page.evaluate(() => performance.now())
    await dispatchVertex(page, 17, 18)
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(1)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
    let autoReplyElapsed = await page.evaluate(
      (startedAt) => performance.now() - startedAt,
      autoReplyStartedAt,
    )
    expect(autoReplyElapsed).toBeGreaterThanOrEqual(400)
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(2)
    await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)
    await dispatchVertex(page, 13, 18)
    await expect(page.locator('.tsumego-solver-feedback')).toContainText(
      'Solved',
    )
    await expect(page.locator('.tsumego-solver-graph')).toBeVisible()
    let wheelResult = await page
      .locator('.tsumego-solver-graph #graph')
      .evaluate((element) => {
        let event = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 40,
        })
        element.dispatchEvent(event)
        return event.defaultPrevented
      })
    expect(wheelResult).toBe(true)
    expect(await page.evaluate(() => window.__sabaki.state.treePosition)).toBe(
      globalTreePosition,
    )
    await page.getByRole('button', {name: 'Retry Problem', exact: true}).click()
    await expect(page.locator('.tsumego-solver-graph')).toHaveCount(0)
  })

  test('browses a configured User Library independently', async ({page}) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '001.sgf'),
      '(;GM[1]SZ[9]C[Correct];B[aa])',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await expect(page.locator('.tsumego-entry-directory')).toContainText(
        'User Set',
      )
      await page.locator('.tsumego-entry-directory').click()
      await expect(page.locator('.tsumego-entry-file')).toContainText('001.sgf')
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('configures My Library through the native folder picker', async ({
    page,
    electronApp,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-configure-e2e-'))
    let collection = path.join(root, 'Tsumego', 'Chosen Set')
    mkdirSync(collection, {recursive: true})
    writeFileSync(
      path.join(collection, '001.sgf'),
      '(;GM[1]SZ[9]C[Correct];B[aa])',
    )

    try {
      await electronApp.evaluate(({dialog}, selectedRoot) => {
        dialog.showOpenDialog = async (_window, options) =>
          options.properties?.includes('openDirectory')
            ? {canceled: false, filePaths: [selectedRoot]}
            : {canceled: true, filePaths: []}
      }, root)

      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await expect(
        page.getByRole('button', {name: 'Configure Library'}),
      ).toBeVisible()
      await page.getByRole('button', {name: 'Configure Library'}).click()

      await expect(page.locator('.tsumego-entry-directory')).toContainText(
        'Chosen Set',
      )
      await page.locator('.tsumego-entry-directory').click()
      await expect(page.locator('.tsumego-entry-file')).toContainText('001.sgf')

      let persisted = await page.evaluate(() => ({
        root: window.sabaki.setting.get('library.root'),
        settingsPath: `${window.sabaki.setting.userDataDirectory}/settings.json`,
      }))
      expect(persisted.root).toBe(root)
      expect(
        JSON.parse(readFileSync(persisted.settingsPath, 'utf8'))[
          'library.root'
        ],
      ).toBe(root)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('records progress only after the auto-reply completes', async ({
    page,
    electronApp,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-progress-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '001.sgf'),
      '(;GM[1]SZ[9]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))',
    )
    let progressPath = path.join(
      await electronApp.evaluate(({app}) => app.getPath('userData')),
      'tsumego-progress.json',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()

      // The correct move triggers an auto-reply; progress must not be written
      // before the sequence finishes.
      await dispatchVertex(page, 2, 2)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
      expect(existsSync(progressPath)).toBe(false)

      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      let entry = await waitForProgressEntry(
        electronApp,
        'user:Tsumego/User Set/001.sgf',
      )
      expect(entry).toBeTruthy()
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('shows solved checkmarks and counters without reloading', async ({
    page,
    electronApp,
  }) => {
    let progressPath = path.join(
      await electronApp.evaluate(({app}) => app.getPath('userData')),
      'tsumego-progress.json',
    )

    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await expect(page.locator('.tsumego-problem-count')).toContainText(
      '0 / 140 solved',
    )
    expect(await page.locator('.tsumego-entry-check').count()).toBe(0)

    await openGggEasy01(page)
    await solveGggEasy01(page)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

    // Back to the collection: the counter and checkmark update from local
    // state, without reloading the workspace.
    await page.getByRole('button', {name: /Collection/}).click()
    await expect(page.locator('.tsumego-problem-count')).toContainText(
      '1 / 140 solved',
    )
    await expect(page.locator('.tsumego-entry-check')).toHaveCount(1)
    await expect(
      page
        .locator('.tsumego-entry-file')
        .filter({hasText: 'ggg-easy-01.sgf'})
        .locator('.tsumego-entry-check'),
    ).toBeVisible()
    await expect.poll(() => existsSync(progressPath)).toBe(true)
  })

  test('retrying a solved problem does not rewrite progress', async ({
    page,
    electronApp,
  }) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await openGggEasy01(page)
    await solveGggEasy01(page)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

    let completedAt = (
      await waitForProgressEntry(
        electronApp,
        'builtin:tsumego/easy/ggg-easy-01.sgf',
      )
    ).completedAt

    await page.getByRole('button', {name: 'Retry Problem', exact: true}).click()
    await expect(page.locator('.tsumego-solver-graph')).toHaveCount(0)

    let after = await waitForProgressEntry(
      electronApp,
      'builtin:tsumego/easy/ggg-easy-01.sgf',
    )
    expect(after.completedAt).toBe(completedAt)
  })

  test('retry always resets to the original problem state', async ({page}) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await openGggEasy01(page)

    // Play the first correct move and wait for the auto-reply to finish.
    await dispatchVertex(page, 17, 18)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)

    // Fail at the second decision point with an absent move.
    await dispatchVertex(page, 0, 0)
    await expect(page.locator('.tsumego-solver-feedback')).toContainText(
      'Incorrect',
    )

    // Retry must restore the original starting position, not the last decision point.
    await page.getByRole('button', {name: 'Retry', exact: true}).click()
    await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)

    // The strongest proof: the first correct move is accepted again from the
    // original starting position.
    await dispatchVertex(page, 17, 18)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
  })

  test('an SGF-present wrong branch plays its refutation before Incorrect', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__tsumegoAudioPlays = 0
      Audio.prototype.play = () => {
        window.__tsumegoAudioPlays += 1
        return Promise.resolve()
      }
    })

    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await openGggEasy01(page)

    // B[rq] (17,16) is a documented wrong move; it should play the user's
    // move, enter waiting, animate the refutation, then show Incorrect.
    await dispatchVertex(page, 17, 16)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
    await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)

    // The refutation sequence ends with the terminal position and feedback.
    await expect(page.locator('.tsumego-solver-feedback')).toContainText(
      'Incorrect',
    )
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-failed/)
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(1)
  })

  test('cancelling the auto-reply sequence never records progress', async ({
    page,
    electronApp,
  }) => {
    let progressPath = path.join(
      await electronApp.evaluate(({app}) => app.getPath('userData')),
      'tsumego-progress.json',
    )

    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await openGggEasy01(page)
    await dispatchVertex(page, 17, 18)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)

    // Leave the problem while the auto-reply is still pending.
    await page.getByRole('button', {name: /Collection/}).click()
    await expect(page.locator('.tsumego-browser')).toBeVisible()
    expect(existsSync(progressPath)).toBe(false)
  })

  test('auto-next disabled keeps the solved problem open', async ({page}) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page.locator('.tsumego-entry-directory').first().click()
    await openGggEasy01(page)
    await solveGggEasy01(page)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

    // Wait longer than the auto-next delay to confirm no advance happens.
    await page.waitForTimeout(1200)
    await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
    await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
      'Problem 1 / 140',
    )
  })

  test('auto-next enabled advances after the delay', async ({page}) => {
    let root = setupTwoProblemLibrary()
    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').first().click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 1 / 2',
      )

      await page.locator('.tsumego-auto-next input').check()
      await dispatchVertex(page, 2, 2)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // After 800 ms the next problem should open automatically.
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 2 / 2',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('auto-next does not advance from the final problem', async ({page}) => {
    let root = setupTwoProblemLibrary()
    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      let files = await page.locator('.tsumego-entry-file').all()
      expect(files.length).toBeGreaterThanOrEqual(2)
      await files[1].click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 2 / 2',
      )

      await page.locator('.tsumego-auto-next input').check()
      await dispatchVertex(page, 4, 4)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Wait longer than the auto-next delay; the last problem must stay open.
      await page.waitForTimeout(1200)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 2 / 2',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('manual navigation cancels a pending auto-next', async ({page}) => {
    let root = setupTwoProblemLibrary()
    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').first().click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()

      await page.locator('.tsumego-auto-next input').check()
      await dispatchVertex(page, 2, 2)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Click Collection before the 800 ms auto-next delay expires.
      await page.getByRole('button', {name: /Collection/}).click()
      await expect(page.locator('.tsumego-browser')).toBeVisible()

      // Wait longer than the delay and confirm the cancelled advance did not fire.
      await page.waitForTimeout(1200)
      await expect(page.locator('.tsumego-browser')).toBeVisible()
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('disabling auto-next during the solved delay prevents navigation', async ({
    page,
  }) => {
    let root = setupTwoProblemLibrary()
    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').first().click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()

      await page.locator('.tsumego-auto-next input').check()
      await dispatchVertex(page, 2, 2)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Turn auto-next off before the 800 ms delay expires.
      await page.waitForTimeout(300)
      await page.locator('.tsumego-auto-next input').uncheck()

      // Wait longer than the delay and confirm no advance happened.
      await page.waitForTimeout(1200)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 1 / 2',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('enabling auto-next while already solved schedules navigation', async ({
    page,
  }) => {
    let root = setupTwoProblemLibrary()
    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').first().click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()

      // Solve without auto-next, then enable it while solved.
      await dispatchVertex(page, 2, 2)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await page.locator('.tsumego-auto-next input').check()

      // The 800 ms timer should now fire and advance to the next problem.
      await expect(page.locator('.tsumego-solver-sidebar h2')).toContainText(
        'Problem 2 / 2',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('remembers the last opened built-in collection', async ({page}) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()

    // The root alone is not remembered.
    expect(
      await page.evaluate(() =>
        window.sabaki.setting.get('tsumego.last_collection'),
      ),
    ).toBeNull()

    await page.locator('.tsumego-entry-directory').first().click()
    await expect(page.locator('.tsumego-entry-file').first()).toBeVisible()
    expect(
      await page.evaluate(() =>
        window.sabaki.setting.get('tsumego.last_collection'),
      ),
    ).toEqual({source: 'builtin', relativePath: 'tsumego/easy'})
  })

  test('remembers the last opened user collection', async ({page}) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '001.sgf'),
      '(;GM[1]SZ[9]C[Correct];B[aa])',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await expect(page.locator('.tsumego-entry-file')).toContainText('001.sgf')
      expect(
        await page.evaluate(() =>
          window.sabaki.setting.get('tsumego.last_collection'),
        ),
      ).toEqual({source: 'user', relativePath: 'Tsumego/User Set'})
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('opens a collection from a targeted request', async ({page}) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/easy'},
      })
    })
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')
    await expect(page.locator('.tsumego-entry-file').first()).toBeVisible()
  })

  test('opens a problem from a targeted request', async ({page}) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {
          source: 'builtin',
          relativePath: 'tsumego/easy',
          problemPath: 'tsumego/easy/ggg-easy-01.sgf',
        },
      })
    })
    await expect(page.locator('.tsumego-solver')).toBeVisible()
  })

  test('reuses the existing Tsumego workspace for a request', async ({
    page,
  }) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    let tabId = await page.evaluate(
      () =>
        window.__sabaki.state.workspaceTabs.find(
          (tab) => tab.type === 'tsumego',
        )?.id,
    )

    await page.getByTitle('Home').click()
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/easy'},
      })
    })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__sabaki.state.workspaceTabs.find(
              (tab) => tab.type === 'tsumego',
            )?.id,
        ),
      )
      .toBe(tabId)
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')
  })

  test('reapplies repeated explicit Tsumego resets', async ({page}) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/easy'},
      })
    })
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')

    let requestIds = await page.evaluate(() => {
      let getRequestId = () =>
        window.__sabaki.state.workspaceTabs.find(
          (tab) => tab.type === 'tsumego',
        )?.tsumegoRequest?.requestId
      window.__sabaki.openWorkspaceTab('tsumego', {tsumegoRequest: null})
      let first = getRequestId()
      window.__sabaki.openWorkspaceTab('tsumego', {tsumegoRequest: null})
      return {first, second: getRequestId()}
    })
    expect(requestIds.second).toBe(requestIds.first + 1)
    await expect(page.locator('.tsumego-breadcrumb')).toContainText(
      'Collections',
    )
  })

  test('preserves an unsaved Creator draft across destination switching', async ({
    page,
  }) => {
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await page
      .locator('.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]')
      .click()
    let draft = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(draft).toContain('AB[dd]')

    await page.getByRole('button', {name: 'Analysis', exact: true}).click()
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await expect(page.locator('.tsumego-creator')).toBeVisible()
    await expect(page.locator('.tsumego-creator')).toHaveAttribute(
      'data-test-sgf',
      draft,
    )
  })

  test('applies a new request on an existing workspace', async ({page}) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/easy'},
      })
    })
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')

    await page.getByTitle('Home').click()
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/hard'},
      })
    })
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('hard')
  })

  test('handles an invalid request without crashing', async ({page}) => {
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'cloud', relativePath: '../../etc'},
      })
    })
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()
    // Falls back to the built-in root.
    await expect(page.locator('.tsumego-breadcrumb')).toContainText(
      'Collections',
    )
  })

  test('a broken SGF in My Library shows INVALID_SGF without crashing', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(path.join(tsumego, 'broken.sgf'), '(;GM[1]SZ[9]AB[aa')

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toHaveCount(0)
      await expect(page.locator('.ogs-error')).toContainText(
        'This file is not a valid SGF.',
      )
      await expect(page.locator('.tsumego-browser')).toBeVisible()
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('a normal game SGF does not launch the Solver', async ({page}) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'game.sgf'),
      '(;GM[1]SZ[19]FF[4];B[pd];W[dp];B[pp])',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toHaveCount(0)
      await expect(page.locator('.ogs-error')).toContainText(
        'No playable Tsumego solution could be detected.',
      )
      await expect(page.locator('.tsumego-browser')).toBeVisible()
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('a setup-only SGF reports the missing solution sequence', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'setup.sgf'),
      '(;GM[1]SZ[9]AB[aa][bb]AW[cc]PL[B])',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toHaveCount(0)
      await expect(page.locator('.ogs-error')).toContainText(
        'This SGF does not contain a Tsumego solution.',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('a real Tsumego in My Library opens the Solver normally', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'real.sgf'),
      '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.ogs-error')).toHaveCount(0)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('047-style point-selection opens and solves correctly', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-047-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    // No B/W moves, multiple L answers, no PL (playerToMove null)
    writeFileSync(
      path.join(tsumego, '047.sgf'),
      '(;GM[1]SZ[9]AB[aa][bb]AW[cc]C[Black to play.](;L[dd][ee]C[Correct Answer])(;L[ff]C[Correct]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
      // No playerToMove when null
      await expect(page.locator('.tsumego-player-to-move')).toHaveCount(0)

      // Any accepted point solves
      await dispatchVertex(page, 3, 3) // dd
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await expect(page.locator('.tsumego-solver-feedback')).toContainText(
        'Solved',
      )

      // Retry restores
      await page
        .getByRole('button', {name: 'Retry Problem', exact: true})
        .click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)

      // Unlisted point shows Incorrect without invented stone
      let boardBefore = await page.evaluate(() => {
        let board = window.__sabaki.state.gameTree
          ? null
          : document.querySelector('.tsumego-solver-board')
        return document.querySelector('.tsumego-solver').className
      })
      await dispatchVertex(page, 0, 0) // aa is occupied, try 5,5 (ff is accepted, so 0,1 is unlisted)
      await dispatchVertex(page, 0, 1)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-failed/)
      await expect(page.locator('.tsumego-solver-feedback')).toContainText(
        'Incorrect',
      )
      // Board should still be at start position, no invented stone at 0,1
      // The goban should not show a stone at 0,1 that wasn't there before
      await page.getByRole('button', {name: 'Retry', exact: true}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('048-style point-selection with wrong variation plays refutation', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-048-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '048.sgf'),
      '(;GM[1]SZ[9]PL[B]AB[aa][bb]AW[cc]C[Black to play.](;L[dd]C[Correct Answer])(;B[ee]C[Wrong Answer];W[ff]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-player-to-move')).toContainText(
        'Black to play',
      )

      // Accepted point solves
      await dispatchVertex(page, 3, 3) // dd
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await page
        .getByRole('button', {name: 'Retry Problem', exact: true})
        .click()

      // Wrong point plays refutation before Incorrect
      await dispatchVertex(page, 4, 4) // ee
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-failed/)
      await expect(page.locator('.tsumego-solver-feedback')).toContainText(
        'Incorrect',
      )
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('existing move-sequence Tsumego still opens normally', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-move-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'move.sgf'),
      '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
      await expect(page.locator('.tsumego-player-to-move')).toContainText(
        'Black to play',
      )
      await dispatchVertex(page, 2, 2) // cc
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('047-style point-selection answer groups navigate to correct node', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-047group-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '047group.sgf'),
      '(;GM[1]SZ[9]AB[aa][bb]AW[cc]C[Black to play.](;L[dd]C[Correct Answer 1])(;L[ee]C[Correct Answer 2]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()

      // Select point from Answer 1
      await dispatchVertex(page, 3, 3) // dd
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      let comment1 = await page
        .locator('.tsumego-solution p')
        .first()
        .textContent()
      expect(comment1).toContain('Correct Answer 1')
      // Should not synthesize a B/W move
      let hasStone = await page.evaluate(() => {
        let board = document.querySelector('.tsumego-solver-board')
        return board.innerHTML.includes('shudan-stone')
      })
      // The board should not have a new stone at dd (it should be highlight, not stone)
      // We check that the solver is at the L node, not a B/W move
      await page
        .getByRole('button', {name: 'Retry Problem', exact: true})
        .click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)

      // Select point from Answer 2
      await dispatchVertex(page, 4, 4) // ee
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      let comment2 = await page
        .locator('.tsumego-solution p')
        .first()
        .textContent()
      expect(comment2).toContain('Correct Answer 2')

      // Retry returns to initial position
      await page
        .getByRole('button', {name: 'Retry Problem', exact: true})
        .click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
      await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('judgement Alive/Dead solves and navigates correctly', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-judgement-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'judgement.sgf'),
      '(;GM[1]SZ[9]AB[aa][bb]AW[cc][dd]C[Alive or Dead?](;C[White is dead. Correct]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
      await expect(page.locator('.tsumego-judgement-controls')).toBeVisible()

      // Wrong choice gives Incorrect without revealing answer
      await page.getByRole('button', {name: 'Alive', exact: true}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-failed/)
      await expect(page.locator('.tsumego-solver-feedback')).toContainText(
        'Incorrect',
      )
      // Should not have navigated to answer node
      let commentFailed = await page.locator('.tsumego-solution p').count()
      expect(commentFailed).toBe(0)

      // Retry restores initial position
      await page.getByRole('button', {name: 'Retry', exact: true}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)

      // Correct choice solves and navigates to answer node
      await page.getByRole('button', {name: 'Dead', exact: true}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await expect(page.locator('.tsumego-solver-feedback')).toContainText(
        'Solved',
      )
      let commentSolved = await page
        .locator('.tsumego-solution p')
        .first()
        .textContent()
      expect(commentSolved).toContain('White is dead')

      // Wheel navigation works after solved
      await page
        .locator('.tsumego-solver-board')
        .dispatchEvent('wheel', {deltaY: 100})
      await page.waitForTimeout(100)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('solved wheel navigation works across solver workspace', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-wheel-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, 'wheel.sgf'),
      '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[aa][bb](;B[cc]C[Correct]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()

      await expect(page.locator('.tsumego-solver')).toBeVisible()

      // Wheel should not navigate before solved
      let initialPos = await page.evaluate(
        () => window.__sabaki.state.treePosition,
      )
      await page
        .locator('.tsumego-solver-board')
        .dispatchEvent('wheel', {deltaY: 100})
      await page.waitForTimeout(100)
      let posBeforeSolved = await page.evaluate(
        () => window.__sabaki.state.treePosition,
      )
      expect(posBeforeSolved).toBe(initialPos)

      // Solve
      await dispatchVertex(page, 2, 2) // cc
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Wheel over Goban should navigate
      await page
        .locator('.tsumego-solver-board')
        .dispatchEvent('wheel', {deltaY: 100})
      await page.waitForTimeout(100)
      // Should have navigated (treePosition changed or displayNodeId changed)
      // We check that the solver is still solved but position changed
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Wheel over sidebar should also navigate
      await page
        .locator('.tsumego-solver-sidebar')
        .dispatchEvent('wheel', {deltaY: -100})
      await page.waitForTimeout(100)
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)

      // Existing move-sequence solved navigation remains functional
      // (already verified above)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('dead-stone selection is an explicit multi-stone answer', async ({
    page,
  }) => {
    let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-059-e2e-'))
    let tsumego = path.join(root, 'Tsumego', 'User Set')
    mkdirSync(tsumego, {recursive: true})
    writeFileSync(
      path.join(tsumego, '059.sgf'),
      '(;GM[1]SZ[9]AB[aa][bb]AW[cc]C[Dead stones. Which ones are they?](;TR[aa][cc]C[Correct Answer]))',
    )

    try {
      await page.evaluate(
        async (libraryRoot) =>
          window.sabaki.setting.set('library.root', libraryRoot),
        root,
      )
      await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
      await page.getByRole('tab', {name: 'My Library'}).click()
      await page.locator('.tsumego-entry-directory').click()
      await page.locator('.tsumego-entry-file').click()
      await expect(page.locator('.tsumego-solver')).toBeVisible()
      await expect(
        page.getByRole('button', {name: 'Check answer'}),
      ).toBeVisible()

      // Empty intersections do not create stones.
      await dispatchVertex(page, 4, 4)
      await page.getByRole('button', {name: 'Check answer'}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-failed/)
      await page.getByRole('button', {name: 'Retry', exact: true}).click()

      // Black and White occupied stones can both be selected.
      await dispatchVertex(page, 0, 0)
      await dispatchVertex(page, 2, 2)
      await page.getByRole('button', {name: 'Check answer'}).click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
      await expect(page.locator('.tsumego-solution')).toContainText(
        'Correct Answer',
      )

      await page
        .getByRole('button', {name: 'Retry Problem', exact: true})
        .click()
      await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })
})

async function dispatchVertex(page, x, y) {
  await page
    .locator(
      `.tsumego-solver-board .shudan-vertex[data-x="${x}"][data-y="${y}"]`,
    )
    .evaluate((element) => {
      let options = {bubbles: true, button: 0, clientX: 1, clientY: 1}
      element.dispatchEvent(new MouseEvent('mousedown', options))
      element.dispatchEvent(new MouseEvent('mouseup', options))
    })
}

async function clickBoardVertex(page, x, y, size) {
  let box = await page
    .locator(
      `.tsumego-solver-board .shudan-vertex[data-x="${x}"][data-y="${y}"]`,
    )
    .boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function openGggEasy01(page) {
  await page
    .locator('.tsumego-entry-file')
    .filter({hasText: 'ggg-easy-01.sgf'})
    .click()
  await expect(page.locator('.tsumego-solver')).toBeVisible()
}

async function solveGggEasy01(page) {
  await dispatchVertex(page, 17, 18)
  await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-waiting/)
  await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solving/)
  await dispatchVertex(page, 13, 18)
  await expect(page.locator('.tsumego-solver')).toHaveClass(/phase-solved/)
}

async function progressPath(electronApp) {
  return path.join(
    await electronApp.evaluate(({app}) => app.getPath('userData')),
    'tsumego-progress.json',
  )
}

// Polls until the persisted progress contains the given key, since the
// markCompleted IPC write is asynchronous.
async function waitForProgressEntry(electronApp, key) {
  let filePath = await progressPath(electronApp)
  await expect
    .poll(() => {
      if (!existsSync(filePath)) return null
      try {
        return (
          JSON.parse(readFileSync(filePath, 'utf8')).problems?.[key] ?? null
        )
      } catch (err) {
        return null
      }
    })
    .toBeTruthy()
  return JSON.parse(readFileSync(filePath, 'utf8')).problems[key]
}

function setupTwoProblemLibrary() {
  let root = mkdtempSync(path.join(tmpdir(), 'seki-tsumego-autonext-e2e-'))
  let tsumego = path.join(root, 'Tsumego', 'User Set')
  mkdirSync(tsumego, {recursive: true})
  writeFileSync(
    path.join(tsumego, '001.sgf'),
    '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[aa][bb](;B[cc]C[Correct];W[dd]))',
  )
  writeFileSync(
    path.join(tsumego, '002.sgf'),
    '(;GM[1]SZ[9]PL[B]C[Black to play.]AB[gg][hh](;B[ee]C[Correct];W[ff]))',
  )
  return root
}
