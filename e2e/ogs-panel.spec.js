const {expect} = require('@playwright/test')
const {test} = require('./fixtures/electron-app')
const {waitForRender} = require('./helpers')

test.describe('OGS mock panel', () => {
  test('toggles from engine sidebar and shows mock connection status', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__sabaki.setState({showLeftSidebar: true})
    })
    await waitForRender(page)

    await expect(page.locator('#leftsidebar')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toBeVisible()
    await expect(page.locator('.gtp-console')).toBeVisible()

    await page.evaluate(() => {
      window.__ogsTestSession = null
      window.__ogsTestState = {
        user: null,
        socket: {
          status: 'authenticated',
          authenticated: true,
          error: null,
        },
        matchmaking: {
          status: 'idle',
          options: {boardSize: 19, speed: 'rapid', rankDiff: 3},
          error: null,
        },
      }
      window.sabaki.ogs = {
        getSession: async () => window.__ogsTestSession,
        getState: async () => window.__ogsTestState,
        login: async (username) => {
          window.__ogsTestSession = {
            id: '7',
            username,
            rank: '1d',
            iconUrl: null,
            online: true,
          }
          window.__ogsTestState.user = window.__ogsTestSession

          return {
            ok: true,
            user: window.__ogsTestSession,
            state: window.__ogsTestState,
          }
        },
        setMatchmakingOptions: async (options) => {
          window.__ogsTestState.matchmaking.options = options
          return window.__ogsTestState
        },
        logout: async () => {
          window.__ogsTestSession = null
          window.__ogsTestState.user = null
          return true
        },
      }
    })

    await page.getByTitle('Show OGS Panel').click()

    await expect(page.locator('.ogs-panel')).toBeVisible()
    await expect(page.locator('.engine-peer-list')).toHaveCount(0)
    await expect(page.locator('.gtp-console')).toHaveCount(0)

    await page.locator('.ogs-login-form input[name="username"]').fill('sekibot')
    await page.locator('.ogs-login-form input[name="password"]').fill('secret')
    await page.locator('.ogs-login-form button[type="submit"]').click()

    await expect(page.locator('.ogs-status')).toBeVisible()
    await expect(
      page.locator('.ogs-login-form input[name="password"]'),
    ).toHaveCount(0)
    await expect(page.locator('.ogs-status-username')).toHaveText('sekibot')
    await expect(page.locator('.ogs-status')).toContainText('Online')
    await expect(page.locator('.ogs-status')).toContainText('1d')
    await expect(page.locator('.ogs-socket-status')).toContainText(
      'Authenticated',
    )
    await expect(page.locator('.ogs-matchmaking')).toBeVisible()
    await page
      .locator('.ogs-matchmaking select[name="boardSize"]')
      .selectOption('9')
    await page
      .locator('.ogs-matchmaking select[name="speed"]')
      .selectOption('blitz')
    await page.locator('.ogs-matchmaking input[name="rankDiff"]').fill('2')
    await expect(page.locator('.ogs-matchmaking button')).toBeDisabled()

    await page.getByTitle('Show OGS Panel').click()

    await expect(page.locator('.ogs-panel')).toHaveCount(0)
    await expect(page.locator('.engine-peer-list')).toBeVisible()
    await expect(page.locator('.gtp-console')).toBeVisible()
  })
})
