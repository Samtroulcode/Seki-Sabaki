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
    await page.locator('.tsumego-entry-directory').first().click()
    await expect(page.locator('.tsumego-entry-file').first()).toBeVisible()
    await page
      .locator('.tsumego-entry-file')
      .filter({hasText: 'ggg-easy-01.sgf'})
      .click()
    await expect(page.locator('.tsumego-solver')).toBeVisible()
    await expect(page.locator('.tsumego-solver-board #goban')).toBeVisible()
    await expect(page.locator('.tsumego-player-to-move')).toBeVisible()
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
