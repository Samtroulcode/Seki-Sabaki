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
      page.locator('.app-workspace-tab.type-tsumego.selected'),
    ).toHaveCount(1)
    await expect(page.locator('.tsumego-source-tabs')).toContainText('Built-in')

    await page.getByTitle('Home').click()
    await page
      .locator('.home-navbar')
      .getByRole('button', {name: 'Tsumego', exact: true})
      .click()
    await expect(page.locator('.app-workspace-tab.type-tsumego')).toHaveCount(1)

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
    expect(autoReplyElapsed).toBeGreaterThanOrEqual(850)
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
    await expect(page.locator('.app-workspace-tab.type-tsumego')).toHaveCount(1)

    await page.getByTitle('Home').click()
    await page.evaluate(() => {
      window.__sabaki.openWorkspaceTab('tsumego', {
        tsumegoRequest: {source: 'builtin', relativePath: 'tsumego/easy'},
      })
    })
    await expect(page.locator('.app-workspace-tab.type-tsumego')).toHaveCount(1)
    await expect(page.locator('.tsumego-breadcrumb')).toContainText('easy')
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
