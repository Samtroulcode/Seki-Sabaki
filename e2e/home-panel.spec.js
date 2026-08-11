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
    await expect(page.locator('#home')).toContainText('Your Go workspace')
    await expect(page.locator('#home')).toContainText('Start')
    await expect(page.locator('#home')).toContainText('Continue')
    await expect(page.locator('#home')).toContainText('Status')
    await expect(page.getByRole('button', {name: /New board/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Open SGF/})).toHaveCount(2)
    await expect(page.getByRole('button', {name: /Analyze/})).toBeVisible()
    await expect(page.getByRole('button', {name: /Online play/})).toBeVisible()
    await expect(page.locator('#home')).toContainText('Local board ready')
    await expect(page.locator('#home')).toContainText(
      'No library folder selected',
    )
    await expect(page.locator('#home')).toContainText(
      'No live engines attached',
    )
    await expect(page.locator('#home')).toContainText(
      'No online game on the board',
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

    await page.getByRole('button', {name: /Online play/}).click()
    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(
      page.locator('#apprail').getByRole('button', {name: 'OGS'}),
    ).toHaveAttribute('aria-current', 'page')

    await page.getByTitle('SGF Explorer').click()
    await expect(page.locator('#sgf-explorer')).toBeVisible()
    await expect(page.locator('#sgf-explorer')).toContainText('Folder browsing')

    await page
      .locator('#apprail')
      .getByRole('button', {name: 'Analysis'})
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
