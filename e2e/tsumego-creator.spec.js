const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')

test.describe('Tsumego Creator', () => {
  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1600, height: 1000})
    await page.getByRole('button', {name: 'Tsumego', exact: true}).click()
    await expect(page.locator('#tsumego-dashboard')).toBeVisible()

    await page.evaluate(() => {
      window.__tsumegoAudioPlays = 0
      Audio.prototype.play = () => {
        window.__tsumegoAudioPlays += 1
        return Promise.resolve()
      }
      window.confirm = () => true
    })
  })

  test('opens the Creator and shows the Goban', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await expect(page.locator('.tsumego-creator')).toBeVisible()
    await expect(page.locator('.tsumego-creator-board #goban')).toBeVisible()

    let gobanBox = await page
      .locator('.tsumego-creator-board #goban')
      .boundingBox()
    expect(gobanBox).not.toBeNull()
    expect(gobanBox.width).toBeGreaterThan(100)
    expect(gobanBox.height).toBeGreaterThan(100)
  })

  test('defaults to a 19x19 board', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await expect(page.locator('.tsumego-creator')).toBeVisible()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/SZ\[19\]/)

    let vertices = await page.locator('.tsumego-creator-board .shudan-vertex')
    expect(await vertices.count()).toBe(19 * 19)
  })

  test('switches to 9x9 and resizes the board', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: '9x9', exact: true})
      .click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/SZ\[9\]/)

    let vertices = await page.locator('.tsumego-creator-board .shudan-vertex')
    expect(await vertices.count()).toBe(9 * 9)
  })

  test('places a black setup stone with the Black tool', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AB\[dd\]/)
    expect(sgf).not.toMatch(';B\[')
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(0)
  })

  test('replaces black by white on the same vertex', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'White stone', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AW\[dd\]/)
    expect(sgf).not.toMatch(/AB\[dd\]/)
  })

  test('erases a setup stone', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'Erase stone', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).not.toMatch(/AB\[dd\]/)
    expect(sgf).not.toMatch(/AW\[dd\]/)
  })

  test('toggles player to move between Black and White', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/PL\[B\]/)

    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'White to move', exact: true})
      .click()

    sgf = await page.locator('.tsumego-creator').getAttribute('data-test-sgf')
    expect(sgf).toMatch(/PL\[W\]/)
  })

  test('stores the problem statement in C', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    let textarea = page.locator('.tsumego-creator-comment')
    await textarea.fill('Black to play and live.')

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/C\[Black to play and live\.\]/)
  })

  test('does not change the global Sabaki game tree', async ({page}) => {
    let globalTreeCount = await page.evaluate(
      () => window.__sabaki.state.gameTrees.length,
    )
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    expect(
      await page.evaluate(() => window.__sabaki.state.gameTrees.length),
    ).toBe(globalTreeCount)
  })
})

async function clickCreatorVertex(page, x, y) {
  let box = await page
    .locator(
      `.tsumego-creator-board .shudan-vertex[data-x="${x}"][data-y="${y}"]`,
    )
    .boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
