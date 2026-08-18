const {expect} = require('@playwright/test')
const sgf = require('@sabaki/sgf')
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

  test('shows Setup and Solution mode tabs', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await expect(page.locator('.tsumego-creator-mode-tabs')).toBeVisible()
    await expect(
      page
        .locator('.tsumego-creator-mode-tabs')
        .getByRole('button', {name: 'Setup', exact: true}),
    ).toBeVisible()
    await expect(
      page
        .locator('.tsumego-creator-mode-tabs')
        .getByRole('button', {name: 'Solution', exact: true}),
    ).toBeVisible()
  })

  test('switches to Solution mode and plays the first move from PL', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[dd\]/)
    await expect
      .poll(() => page.evaluate(() => window.__tsumegoAudioPlays))
      .toBeGreaterThan(0)
  })

  test('alternates colors while building a solution line', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await clickCreatorVertex(page, 2, 2)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[aa\];W\[bb\];B\[cc\]/)
  })

  test('creates a variation by returning to a parent and playing a different move', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await clickCreatorVertex(page, 2, 2)

    // Go back to root, replay the first move to navigate to it, then branch.
    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'Root', exact: true})
      .click()
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 3, 3)

    let sgfString = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgfString).toMatch(/;B\[aa\]/)
    expect(sgfString).toMatch(/W\[bb\]/)
    expect(sgfString).toMatch(/W\[dd\]/)

    let rootNodes = sgf.parse(sgfString)
    expect(rootNodes).toHaveLength(1)
    let root = rootNodes[0]
    expect(root.children).toHaveLength(1)
    let baa = root.children[0]
    expect(baa.data.B).toEqual(['aa'])
    expect(baa.children).toHaveLength(2)
    let whiteVertices = baa.children.map((child) => child.data.W?.[0]).sort()
    expect(whiteVertices).toEqual(['bb', 'dd'])
  })

  test('graph wheel does not navigate the global Sabaki document', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    let globalTreePosition = await page.evaluate(
      () => window.__sabaki.state.treePosition,
    )

    await page.locator('.tsumego-creator-graph #graph').evaluate((element) => {
      let event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: 40,
      })
      element.dispatchEvent(event)
      return event.defaultPrevented
    })

    expect(await page.evaluate(() => window.__sabaki.state.treePosition)).toBe(
      globalTreePosition,
    )
  })

  test('returns to Setup without discarding the solution tree', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    await page
      .locator('.tsumego-creator-mode-tabs')
      .getByRole('button', {name: 'Setup', exact: true})
      .click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[aa\]/)
  })

  test('reset the whole draft when changing size after a solution move', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    await page
      .locator('.tsumego-creator-mode-tabs')
      .getByRole('button', {name: 'Setup', exact: true})
      .click()
    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: '9x9', exact: true})
      .click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/SZ\[9\]/)
    expect(sgf).not.toMatch(/;B\[aa\]/)
    expect(sgf).toMatch(/PL\[B\]/)
  })
})

async function enterSolutionMode(page) {
  await page
    .locator('.tsumego-creator-mode-tabs')
    .getByRole('button', {name: 'Solution', exact: true})
    .click()
  await expect(page.locator('.tsumego-creator-graph')).toBeVisible()
}

async function clickCreatorVertex(page, x, y) {
  let box = await page
    .locator(
      `.tsumego-creator-board .shudan-vertex[data-x="${x}"][data-y="${y}"]`,
    )
    .boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
