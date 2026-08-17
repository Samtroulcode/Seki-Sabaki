const {expect} = require('@playwright/test')
const {mkdirSync, mkdtempSync, rmSync, writeFileSync} = require('fs')
const {tmpdir} = require('os')
const path = require('path')
const {test} = require('./fixtures/electron-app')

test.describe('Tsumego workspace', () => {
  test('opens and reuses the workspace, then loads a built-in problem', async ({
    page,
  }) => {
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

    let globalTreePosition = await page.evaluate(
      () => window.__sabaki.state.treePosition,
    )
    await clickBoardVertex(page, 0, 0, 19)
    await expect(page.locator('.tsumego-solver-feedback')).toContainText(
      'Incorrect',
    )
    expect(await page.evaluate(() => window.__sabaki.state.treePosition)).toBe(
      globalTreePosition,
    )
    await expect(
      page.getByRole('button', {name: 'Retry', exact: true}),
    ).toBeVisible()
    await page.getByRole('button', {name: 'Retry', exact: true}).click()
    await expect(page.locator('.tsumego-solver-feedback')).toHaveCount(0)

    await dispatchVertex(page, 17, 18)
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
