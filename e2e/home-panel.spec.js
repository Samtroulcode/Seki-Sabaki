const {expect} = require('@playwright/test')
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
    await expect(page.locator('#home')).toContainText('Board size')
    await expect(page.locator('#home')).toContainText('Explore')
    await expect(page.locator('#home')).not.toContainText('Status')
    await expect(page.locator('#home')).toContainText('Recent OGS games')
    await expect(page.locator('#home')).toContainText(
      'Connect OGS to see your history.',
    )
    await expect(page.getByRole('button', {name: /New board/})).toHaveCount(1)
    await expect(page.getByRole('button', {name: /Open SGF/})).toHaveCount(1)
    await expect(page.getByRole('button', {name: /Library/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Analyze/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Online play/})).toBeVisible()
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
      page.locator('#apptabs').getByRole('button', {name: 'OGS'}),
    ).toHaveCount(0)

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()

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
})
