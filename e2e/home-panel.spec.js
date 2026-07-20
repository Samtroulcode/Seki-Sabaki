const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')

test.describe('Home panel navigation', () => {
  test('navigates between home, board, OGS, and placeholders', async ({
    page,
  }) => {
    await expect(page.locator('#apprail')).toBeVisible()
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.getByTitle('Home')).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.getByTitle('Board').click()
    await expect(page.locator('#goban')).toBeVisible()
    await expect(page.getByTitle('Board')).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Home' : 'Control+Home',
    )
    await expect(page.locator('#home')).toBeVisible()

    await page.getByRole('button', {name: 'Open OGS'}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(
      page.locator('#apprail').getByRole('button', {name: 'OGS'}),
    ).toHaveAttribute('aria-current', 'page')

    await page.getByTitle('SGF Explorer').click()
    await expect(page.locator('#sgf-explorer')).toBeVisible()
    await expect(page.locator('#sgf-explorer')).toContainText('Folder browsing')

    await page.getByTitle('Analysis').click()
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Analysis Manager',
    )
    await expect(page.locator('#analysis-dashboard')).toContainText(
      'Configure KataGo and an output folder before starting.',
    )
    await expect(
      page.getByRole('button', {name: 'Start analysis'}),
    ).toBeDisabled()
  })
})
