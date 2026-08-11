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
    await expect(
      page.locator('.home-sidebar').getByRole('button', {name: 'Dashboard'}),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#home')).toContainText('Start')
    await expect(page.locator('#home')).toContainText('Continue')
    await expect(page.locator('#home')).toContainText('Status')
    await expect(page.getByRole('button', {name: /New board/})).toHaveCount(2)
    await expect(page.getByRole('button', {name: /Open SGF/})).toHaveCount(1)
    await expect(page.getByRole('button', {name: /Open Library/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Analyze/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Online play/})).toBeVisible()
    await expect(page.locator('#home')).toContainText('No board open')
    await expect(page.locator('#home')).toContainText(
      'No library folder selected',
    )
    await expect(page.locator('#home')).toContainText(
      'No live engines attached',
    )
    await expect(page.locator('#home')).toContainText(
      'No online game on the board',
    )

    await page
      .getByRole('button', {name: /^New board$/})
      .first()
      .click()
    await expect(page.locator('#goban')).toBeVisible()
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
      page.locator('.home-sidebar').getByRole('button', {name: 'OGS'}),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.locator('#apptabs').getByRole('button', {name: 'OGS Overview'}),
    ).toHaveCount(0)

    await page.getByTitle('Home').click()
    await expect(page.locator('#home')).toBeVisible()
    await expect(
      page.locator('.home-sidebar').getByRole('button', {name: 'OGS'}),
    ).toHaveAttribute('aria-current', 'page')
    await page
      .locator('.home-sidebar')
      .getByRole('button', {name: 'Dashboard'})
      .click()
    await page
      .locator('#home')
      .getByRole('button', {name: /Analyze/})
      .click()
    await expect(page.locator('#analysis-dashboard')).toBeVisible()
    await expect(
      page.locator('.home-sidebar').getByRole('button', {name: 'Analysis'}),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.locator('#apptabs').getByRole('button', {name: 'Analysis Setup'}),
    ).toHaveCount(0)
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
