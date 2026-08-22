const {expect} = require('@playwright/test')
const path = require('path')
const {test} = require('./fixtures/electron-app')

test.describe('Board tabs', () => {
  test('creates, switches, loads, and closes local board tabs', async ({
    page,
  }) => {
    await expect(page.locator('#apptabs')).toBeVisible()
    await expect(page.locator('.app-board-tab')).toHaveCount(0)

    await page.getByTitle('Home').click()
    await page
      .getByRole('button', {name: /New board/})
      .first()
      .click()
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 1,
    )
    await expect(page.locator('.app-board-tab')).toHaveCount(1)

    await page.locator('.app-board-tab-button').first().click()
    await expect(page.locator('#goban')).toBeVisible()

    await page.evaluate(() => window.__sabaki.clickVertex([3, 3]))
    await page.waitForFunction(
      () =>
        window.__sabaki.state.gameTrees[window.__sabaki.state.gameIndex].root
          .children.length === 1,
    )

    await page.getByTitle('Home').click()
    await page
      .getByRole('button', {name: /New board/})
      .first()
      .click()
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 2,
    )
    await expect(page.locator('.app-board-tab')).toHaveCount(2)
    await expect(page.locator('#goban')).toBeVisible()
    await expect(async () => {
      let childCount = await getCurrentRootChildCount(page)
      expect(childCount).toBe(0)
    }).toPass()

    await page.locator('.app-board-tab-button').first().click()
    await expect(async () => {
      let childCount = await getCurrentRootChildCount(page)
      expect(childCount).toBe(1)
    }).toPass()

    await page.locator('.app-board-tab-button').nth(1).click()
    await expect(async () => {
      let childCount = await getCurrentRootChildCount(page)
      expect(childCount).toBe(0)
    }).toPass()

    let sgfPath = path.resolve(
      __dirname,
      '..',
      'test',
      'sgf',
      'beginner_game.sgf',
    )
    await page.evaluate(async (filename) => {
      await window.__sabaki.openFileInNewBoardTab(filename)
    }, sgfPath)
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 3,
    )
    await expect(page.locator('.app-board-tab')).toHaveCount(3)
    await expect(page.getByTitle('beginner_game.sgf')).toBeVisible()

    await page.evaluate(() => {
      window.sabaki.dialog.showMessageBox = async () => ({response: 1})
    })
    await page.locator('.app-board-tab.selected .app-board-tab-close').click()
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 2,
    )
    await expect(page.locator('.app-board-tab')).toHaveCount(2)
    await expect(page.locator('#goban')).toBeVisible()
  })

  test('prompts for dirty inactive tabs before closing app', async ({page}) => {
    await makeTwoDirtyBoardTabs(page)

    let result = await page.evaluate(async () => {
      let prompts = []
      let originalShowMessageBox = window.sabaki.dialog.showMessageBox

      window.sabaki.dialog.showMessageBox = async (options) => {
        prompts.push(options.message)
        return {response: 1}
      }

      let originalActiveBoardTabId = window.__sabaki.state.activeBoardTabId
      let ok = await window.__sabaki.askForSaveAllBoardTabs()

      window.sabaki.dialog.showMessageBox = originalShowMessageBox

      return {
        ok,
        promptCount: prompts.length,
        restoredActiveBoardTabId: window.__sabaki.state.activeBoardTabId,
        originalActiveBoardTabId,
      }
    })

    expect(result.ok).toBe(true)
    expect(result.promptCount).toBe(2)
    expect(result.restoredActiveBoardTabId).toBe(
      result.originalActiveBoardTabId,
    )
  })

  test('keeps original tab metadata fresh after saving all tabs', async ({
    page,
  }) => {
    await makeTwoDirtyBoardTabs(page)

    let result = await page.evaluate(async () => {
      let originalAskForSave = window.__sabaki.askForSave
      let originalActiveBoardTabId = window.__sabaki.state.activeBoardTabId

      window.__sabaki.askForSave = async function () {
        this.treeHash = this.generateTreeHash()
        this.syncActiveBoardTab({treeHash: this.treeHash})
        return true
      }

      let ok = await window.__sabaki.askForSaveAllBoardTabs()
      window.__sabaki.askForSave = originalAskForSave

      return {
        ok,
        restoredActiveBoardTabId: window.__sabaki.state.activeBoardTabId,
        originalActiveBoardTabId,
        dirtyTabs: window.__sabaki.state.boardTabs.filter(
          (tab) =>
            tab.gameTrees.map((tree) => tree.getHash()).join('-') !==
            tab.treeHash,
        ).length,
      }
    })

    expect(result.ok).toBe(true)
    expect(result.restoredActiveBoardTabId).toBe(
      result.originalActiveBoardTabId,
    )
    expect(result.dirtyTabs).toBe(0)
  })

  test('keeps Home visible when closing the active board tab from Home', async ({
    page,
  }) => {
    await page.getByTitle('Home').click()
    await page
      .getByRole('button', {name: /New board/})
      .first()
      .click()
    await page.getByTitle('Home').click()
    await page
      .getByRole('button', {name: /New board/})
      .first()
      .click()
    await page.getByTitle('Home').click()

    await page.locator('.app-board-tab-close').last().click()
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 1,
    )

    await expect(page.locator('.home-view')).toBeVisible()
  })

  test('can close the final board tab back to Home', async ({page}) => {
    await page.getByTitle('Home').click()
    await page
      .getByRole('button', {name: /New board/})
      .first()
      .click()
    await page.waitForFunction(
      () => window.__sabaki.state.boardTabs.length === 1,
    )
    await page.evaluate(() => window.__sabaki.clickVertex([3, 3]))
    await page.waitForFunction(
      () => window.__sabaki.state.gameTrees[0].root.children.length === 1,
    )
    await page.evaluate(() => {
      window.sabaki.dialog.showMessageBox = async () => ({response: 1})
    })

    await page.locator('.app-board-tab-close').click()
    await page.waitForFunction(
      () =>
        window.__sabaki.state.boardTabs.length === 0 &&
        window.__sabaki.state.activeBoardTabId == null,
    )

    await expect(page.locator('.home-view')).toBeVisible()
    await expect(page.getByTitle('Home')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('.app-board-tab')).toHaveCount(0)
    expect(await getCurrentRootChildCount(page)).toBe(0)
  })
})

async function getCurrentRootChildCount(page) {
  return await page.evaluate(
    () =>
      window.__sabaki.state.gameTrees[window.__sabaki.state.gameIndex].root
        .children.length,
  )
}

async function makeTwoDirtyBoardTabs(page) {
  await page.getByTitle('Home').click()
  await page
    .getByRole('button', {name: /New board/})
    .first()
    .click()
  await page.waitForFunction(() => window.__sabaki.state.boardTabs.length === 1)
  await page.locator('.app-board-tab-button').first().click()
  await page.evaluate(() => window.__sabaki.clickVertex([3, 3]))
  await page.waitForFunction(
    () =>
      window.__sabaki.state.boardTabs[0].gameTrees[0].root.children.length ===
      1,
  )

  await page.getByTitle('Home').click()
  await page
    .getByRole('button', {name: /New board/})
    .first()
    .click()
  await page.waitForFunction(() => window.__sabaki.state.boardTabs.length === 2)
  await page.evaluate(() => window.__sabaki.clickVertex([16, 16]))
  await page.waitForFunction(
    () =>
      window.__sabaki.state.boardTabs[1].gameTrees[0].root.children.length ===
      1,
  )
}
