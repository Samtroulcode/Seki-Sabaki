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

  test('places a white setup stone as the first action', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await toolbarFrom(page)
      .getByRole('button', {name: 'Place White', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AW\[dd\]/)
    expect(sgf).not.toMatch(/AB\[dd\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).toHaveClass(/shudan-sign_-1/)
    await expect(vertex).not.toHaveClass(/shudan-sign_1/)
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

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).toHaveClass(/shudan-sign_1/)
  })

  test('player-to-move buttons do not change the active stone tool', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()

    let creator = page.locator('.tsumego-creator')
    await expect(creator).toHaveAttribute('data-test-current-tool', 'B')

    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'White to play', exact: true})
      .click()
    await expect(creator).toHaveAttribute('data-test-current-tool', 'B')

    await toolbarFrom(page)
      .getByRole('button', {name: 'Place White', exact: true})
      .click()
    await expect(creator).toHaveAttribute('data-test-current-tool', 'W')

    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'Black to play', exact: true})
      .click()
    await expect(creator).toHaveAttribute('data-test-current-tool', 'W')
  })

  test('replaces black by white on the same vertex', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await toolbarFrom(page)
      .getByRole('button', {name: 'Place White', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AW\[dd\]/)
    expect(sgf).not.toMatch(/AB\[dd\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).toHaveClass(/shudan-sign_-1/)
    await expect(vertex).not.toHaveClass(/shudan-sign_1/)
  })

  test('places white stone on a different vertex after black', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await toolbarFrom(page)
      .getByRole('button', {name: 'Place White', exact: true})
      .click()
    await clickCreatorVertex(page, 4, 4)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AB\[dd\]/)
    expect(sgf).toMatch(/AW\[ee\]/)

    let blackVertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    let whiteVertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="4"][data-y="4"]',
    )
    await expect(blackVertex).toHaveClass(/shudan-sign_1/)
    await expect(whiteVertex).toHaveClass(/shudan-sign_-1/)

    let blackStone = blackVertex.locator('.shudan-stone-image')
    let whiteStone = whiteVertex.locator('.shudan-stone-image')
    await expect(blackStone).toHaveClass(/shudan-sign_1/)
    await expect(whiteStone).toHaveClass(/shudan-sign_-1/)

    let blackBackground = await blackStone.evaluate(
      (el) => window.getComputedStyle(el).backgroundImage,
    )
    let whiteBackground = await whiteStone.evaluate(
      (el) => window.getComputedStyle(el).backgroundImage,
    )
    expect(blackBackground).not.toBe('none')
    expect(whiteBackground).not.toBe('none')
    expect(blackBackground).not.toBe(whiteBackground)
  })

  test('places white stone after switching back from Solution mode', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    await page
      .locator('.tsumego-creator-mode-tabs')
      .getByRole('button', {name: 'Solution', exact: true})
      .click()
    await clickCreatorVertex(page, 4, 4)

    await page
      .locator('.tsumego-creator-mode-tabs')
      .getByRole('button', {name: 'Setup', exact: true})
      .click()
    await toolbarFrom(page)
      .getByRole('button', {name: 'Place White', exact: true})
      .click()
    await clickCreatorVertex(page, 5, 5)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/AW\[ff\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="5"][data-y="5"]',
    )
    await expect(vertex).toHaveClass(/shudan-sign_-1/)
  })

  test('erases a setup stone', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await toolbarFrom(page)
      .getByRole('button', {name: 'Erase', exact: true})
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
      .getByRole('button', {name: 'White to play', exact: true})
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

  test('selects a solution node and marks it Correct', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    await page
      .locator('.tsumego-creator-sidebar')
      .getByRole('button', {name: 'Correct', exact: true})
      .click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[aa\].*C\[Correct\]/)
  })

  test('Wrong replaces Correct on the same node', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.getByRole('button', {name: 'Correct', exact: true}).click()
    await sidebar.getByRole('button', {name: 'Wrong', exact: true}).click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[aa\].*C\[Wrong\]/)
    expect(sgf).not.toMatch(/C\[Correct\]/)
  })

  test('Clear removes only the marker and keeps the human comment', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.locator('[data-test-node-comment]').fill('Black lives.')
    await sidebar.getByRole('button', {name: 'Correct', exact: true}).click()
    await sidebar.getByRole('button', {name: 'Clear', exact: true}).click()

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/C\[Black lives\.\]/)
    expect(sgf).not.toMatch(/C\[Correct/)
    expect(sgf).not.toMatch(/C\[Wrong/)
  })

  test('human comment textarea does not show the Correct marker', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.locator('[data-test-node-comment]').fill('Black lives.')
    await sidebar.getByRole('button', {name: 'Correct', exact: true}).click()

    let value = await sidebar.locator('[data-test-node-comment]').inputValue()
    expect(value).toBe('Black lives.')
  })

  test('selecting another node updates Result and Comment', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.locator('[data-test-node-comment]').fill('Second move note.')
    await sidebar.getByRole('button', {name: 'Wrong', exact: true}).click()

    await sidebar.getByRole('button', {name: 'Root', exact: true}).click()
    await expect(
      sidebar.getByRole('button', {name: 'Correct', exact: true}),
    ).toBeDisabled()
    await expect(sidebar.locator('[data-test-node-comment]')).toHaveCount(0)

    // Replay to the first move and verify the first move has no annotation.
    await clickCreatorVertex(page, 0, 0)
    await expect(sidebar.locator('.result-correct')).not.toHaveClass(/selected/)
    await expect(sidebar.locator('.result-wrong')).not.toHaveClass(/selected/)

    // Select the second move via graph node click if possible, otherwise replay.
    await clickCreatorVertex(page, 1, 1)
    await expect(sidebar.locator('.result-wrong.selected')).toBeVisible()
    expect(await sidebar.locator('[data-test-node-comment]').inputValue()).toBe(
      'Second move note.',
    )
  })

  test('shows Problem valid after a recognized solution', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await clickCreatorVertex(page, 2, 2)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.getByRole('button', {name: 'Correct', exact: true}).click()

    await expect(
      sidebar.locator('[data-test-validation="valid"]'),
    ).toBeVisible()
  })

  test('shows Incomplete problem before a marker', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await expect(
      sidebar.locator('[data-test-validation="invalid"]'),
    ).toBeVisible()
  })

  test('Delete Branch is disabled on the root', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await expect(
      sidebarFrom(page).getByRole('button', {
        name: 'Delete Branch',
        exact: true,
      }),
    ).toBeDisabled()
  })

  test('deletes the selected branch and its descendants after confirmation', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await clickCreatorVertex(page, 2, 2)

    // Go back to the second move and delete it.
    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.getByRole('button', {name: 'Root', exact: true}).click()
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    await sidebar
      .getByRole('button', {name: 'Delete Branch', exact: true})
      .click()

    let sgfString = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgfString).toMatch(/;B\[aa\]/)
    expect(sgfString).not.toMatch(/W\[bb\]/)
    expect(sgfString).not.toMatch(/B\[cc\]/)

    // After deletion, selection moves to the parent (B[aa]); White plays next.
    await expect(page.locator('.tsumego-creator-player-to-move')).toHaveText(
      'White to play',
    )
  })

  test('keeps sibling variations when deleting a branch', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    // Build: B[aa] -> W[bb] -> B[cc] and B[aa] -> W[dd].
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await clickCreatorVertex(page, 2, 2)
    await sidebarFrom(page)
      .getByRole('button', {name: 'Root', exact: true})
      .click()
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 3, 3)

    // Delete W[bb] branch.
    await sidebarFrom(page)
      .getByRole('button', {name: 'Root', exact: true})
      .click()
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)
    await sidebarFrom(page)
      .getByRole('button', {name: 'Delete Branch', exact: true})
      .click()

    let sgfString = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    let rootNodes = sgf.parse(sgfString)
    let baa = rootNodes[0].children[0]
    expect(baa.data.B).toEqual(['aa'])
    expect(baa.children).toHaveLength(1)
    expect(baa.children[0].data.W).toEqual(['dd'])
  })

  test('cancelling Delete Branch leaves the draft unchanged', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await page.evaluate(() => {
      window.confirm = () => false
    })

    await clickCreatorVertex(page, 0, 0)
    let before = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')

    await sidebarFrom(page)
      .getByRole('button', {name: 'Delete Branch', exact: true})
      .click()

    let after = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(after).toBe(before)
  })

  test('deleting a branch marks the draft dirty', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    await sidebarFrom(page)
      .getByRole('button', {name: 'Delete Branch', exact: true})
      .click()

    // If the draft is dirty, clicking Back calls confirm. Make confirm return
    // false so we stay on the creator; if dirty were false we would leave.
    await page.evaluate(() => {
      window.confirm = () => false
    })

    await page
      .locator('.tsumego-creator-navigation')
      .getByRole('button', {name: 'Back'})
      .click()

    await expect(page.locator('.tsumego-creator')).toBeVisible()
  })

  test('shows the tool toolbar under the Goban with Place Black selected', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()

    let toolbar = page.locator('.tsumego-creator-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Place Black', exact: true}),
    ).toHaveClass(/selected/)
    await expect(
      toolbar.getByRole('button', {name: 'Place White', exact: true}),
    ).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Erase', exact: true}),
    ).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Triangle Tool', exact: true}),
    ).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Square Tool', exact: true}),
    ).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Circle Tool', exact: true}),
    ).toBeVisible()
    await expect(
      toolbar.getByRole('button', {name: 'Cross Tool', exact: true}),
    ).toBeVisible()
  })

  test('Triangle tool renders a marker on a vertex', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/TR\[dd\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).toHaveClass(/shudan-marker_triangle/)
  })

  test('Triangle tool removes the marker on a second click', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).not.toMatch(/TR\[dd\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).not.toHaveClass(/shudan-marker_triangle/)
  })

  test('Square tool replaces Triangle on the same vertex', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    await toolbarFrom(page)
      .getByRole('button', {name: 'Square Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/SQ\[dd\]/)
    expect(sgf).not.toMatch(/TR\[dd\]/)

    let vertex = page.locator(
      '.tsumego-creator-board .shudan-vertex[data-x="3"][data-y="3"]',
    )
    await expect(vertex).toHaveClass(/shudan-marker_square/)
    await expect(vertex).not.toHaveClass(/shudan-marker_triangle/)
  })

  test('entering Solution selects the Move tool', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await expect(page.locator('.tsumego-creator')).toHaveAttribute(
      'data-test-current-tool',
      'move',
    )
    await expect(
      toolbarFrom(page).getByRole('button', {name: 'Move', exact: true}),
    ).toHaveClass(/selected/)
  })

  test('markup click in Solution does not create a move', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    let rootId = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-current-node-id')

    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)

    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).toMatch(/TR\[dd\]/)
    expect(sgf).not.toMatch(/;B\[/)

    await expect(page.locator('.tsumego-creator')).toHaveAttribute(
      'data-test-current-node-id',
      rootId,
    )
  })

  test('markup belongs to the selected solution node', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 2, 2)

    let sgfString = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    let rootNodes = sgf.parse(sgfString)
    let wbb = rootNodes[0].children[0].children[0]
    expect(wbb.data.W).toEqual(['bb'])
    expect(wbb.data.TR).toEqual(['cc'])
    expect(rootNodes[0].data.TR).toBeUndefined()
  })

  test('returning to Move creates moves again', async ({page}) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)

    await toolbarFrom(page)
      .getByRole('button', {name: 'Triangle Tool', exact: true})
      .click()
    await clickCreatorVertex(page, 3, 3)
    let sgf = await page
      .locator('.tsumego-creator')
      .getAttribute('data-test-sgf')
    expect(sgf).not.toMatch(/;B\[/)

    await toolbarFrom(page)
      .getByRole('button', {name: 'Move', exact: true})
      .click()
    await clickCreatorVertex(page, 4, 4)

    sgf = await page.locator('.tsumego-creator').getAttribute('data-test-sgf')
    expect(sgf).toMatch(/;B\[ee\]/)
  })

  test('selecting a GameGraph node updates the selected position and comment', async ({
    page,
  }) => {
    await page
      .getByRole('button', {name: 'Create Problem', exact: true})
      .click()
    await enterSolutionMode(page)
    await clickCreatorVertex(page, 0, 0)
    await clickCreatorVertex(page, 1, 1)

    let sidebar = page.locator('.tsumego-creator-sidebar')
    await sidebar.locator('[data-test-node-comment]').fill('Second move note.')
    await expect(
      sidebar.locator('.tsumego-creator-selected-position'),
    ).toHaveText('Selected position: W[bb]')

    await waitForGraphCamera(page)
    await clickGraphNode(page, 0, 1)

    await expect(
      sidebar.locator('.tsumego-creator-selected-position'),
    ).toHaveText('Selected position: B[aa]')
    expect(await sidebar.locator('[data-test-node-comment]').inputValue()).toBe(
      '',
    )
  })
})

function sidebarFrom(page) {
  return page.locator('.tsumego-creator-sidebar')
}

function toolbarFrom(page) {
  return page.locator('.tsumego-creator-toolbar')
}

async function waitForGraphCamera(page) {
  // The graph re-centers on the current node after `graph.delay` (100 ms).
  // Wait until the camera transform has stayed unchanged for > 200 ms so we
  // never catch the pre-update camera position.
  await page.waitForFunction(() => {
    let graph = document.querySelector('.tsumego-creator-graph #graph')
    let style = graph?.querySelector('style')?.textContent || ''
    let match = style.match(/translate\((-?\d+)px, (-?\d+)px\)/)
    if (!match) return false

    let key = `${match[1]},${match[2]}`
    let now = Date.now()
    if (window.__lastGraphCamera !== key) {
      window.__lastGraphCamera = key
      window.__lastGraphCameraTime = now
      return false
    }

    return now - window.__lastGraphCameraTime > 200
  })
}

async function clickGraphNode(page, matrixX, matrixY) {
  await page.evaluate(
    ({matrixX, matrixY}) => {
      let graph = document.querySelector('.tsumego-creator-graph #graph')
      let svg = graph.querySelector('svg')
      let style = graph.querySelector('style').textContent
      // The inline style stores the negated camera position (translate(-cx)).
      let match = style.match(/translate\((-?\d+)px, (-?\d+)px\)/)
      let [cx, cy] = [parseInt(match[1], 10), parseInt(match[2], 10)]
      let rect = graph.getBoundingClientRect()
      let gridSize = window.sabaki.setting.get('graph.grid_size')

      // handleNodeClick maps (clientX - rect.left + camera) -> matrix cell.
      svg.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + matrixX * gridSize + cx,
          clientY: rect.top + matrixY * gridSize + cy,
        }),
      )
    },
    {matrixX, matrixY},
  )
}

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
