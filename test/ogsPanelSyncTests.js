import assert from 'assert'

import OgsPanelSyncController, {
  getOnlineGameSyncKey,
} from '../src/modules/ogspanelsync.js'

function createSabaki(overrides = {}) {
  let calls = []

  let sabaki = {
    calls,
    state: {onlineGameId: null},
    applyOgsGameUpdate: async (onlineGame) => {
      calls.push(['applyOgsGameUpdate', onlineGame.gameId])
      return false
    },
    loadOgsGame: async (onlineGame, options) => {
      calls.push(['loadOgsGame', onlineGame.gameId, options])
      return true
    },
    showOgsGameEndInfo: async (onlineGame) => {
      calls.push(['showOgsGameEndInfo', onlineGame.gameId])
      return true
    },
    detachOgsGame: (gameId) => {
      calls.push(['detachOgsGame', gameId])
      return true
    },
    enterOgsStoneRemovalMode: (onlineGame) => {
      calls.push(['enterOgsStoneRemovalMode', onlineGame.gameId])
    },
    handleOgsGameError: async (onlineGame) => {
      calls.push(['handleOgsGameError', onlineGame.gameId, onlineGame.error])
      sabaki.ogsPendingMove = null
      return true
    },
    ...overrides,
  }

  return sabaki
}

function createOnlineGame(overrides = {}) {
  return {
    status: 'connected',
    gameId: 42,
    board: {width: 19, height: 19},
    moves: [{move: 'aa', moveNumber: 1}],
    phase: 'play',
    handicap: 0,
    ...overrides,
  }
}

describe('OGS panel sync controller', () => {
  it('ignores games that cannot be projected to the board', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(await controller.syncOnlineGameToBoard(null), false)
    assert.strictEqual(
      await controller.syncOnlineGameToBoard(createOnlineGame({board: null})),
      false,
    )
    assert.deepStrictEqual(sabaki.calls, [])
  })

  it('loads a new connected game with prompt and history settings preserved', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})
    let onlineGame = createOnlineGame()

    assert.strictEqual(await controller.syncOnlineGameToBoard(onlineGame), true)
    assert.deepStrictEqual(sabaki.calls, [
      ['loadOgsGame', 42, {suppressAskForSave: false, clearHistory: true}],
    ])
    assert.strictEqual(
      controller.syncedOnlineGameKey,
      getOnlineGameSyncKey(onlineGame),
    )
  })

  it('applies updates for the same attached game before falling back to load', async () => {
    let sabaki = createSabaki({
      state: {onlineGameId: 42},
      applyOgsGameUpdate: async (onlineGame) => {
        sabaki.calls.push(['applyOgsGameUpdate', onlineGame.gameId])
        return true
      },
    })
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(createOnlineGame()),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [['applyOgsGameUpdate', 42]])
  })

  it('falls back to reloading same-game updates without clearing history', async () => {
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(createOnlineGame()),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 42],
      ['loadOgsGame', 42, {suppressAskForSave: true, clearHistory: false}],
    ])
  })

  it('dedupes repeated sync keys for the attached game', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})
    let onlineGame = createOnlineGame()

    assert.strictEqual(await controller.syncOnlineGameToBoard(onlineGame), true)
    sabaki.state.onlineGameId = 42
    assert.strictEqual(await controller.syncOnlineGameToBoard(onlineGame), true)
    assert.strictEqual(sabaki.calls.length, 1)
  })

  it('records declined games and skips repeat attempts until reset', async () => {
    let sabaki = createSabaki({
      loadOgsGame: async (onlineGame, options) => {
        sabaki.calls.push(['loadOgsGame', onlineGame.gameId, options])
        return false
      },
    })
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(createOnlineGame()),
      false,
    )
    assert.strictEqual(
      await controller.syncOnlineGameToBoard(createOnlineGame()),
      false,
    )
    assert.strictEqual(sabaki.calls.length, 1)

    controller.resetConnectAttempt()
    assert.strictEqual(controller.declinedOnlineGameId, null)
  })

  it('preserves reset behavior used by OgsPanel actions', () => {
    let controller = new OgsPanelSyncController({sabaki: createSabaki()})

    controller.syncedOnlineGameKey = 'sync-key'
    controller.declinedOnlineGameId = 42
    controller.handledOnlineGameErrorKey = '42:error'
    controller.handledOnlineGameErrorPendingMove = {gameId: 42}
    controller.syncingOnlineGame = true
    controller.resetSession()

    assert.strictEqual(controller.syncedOnlineGameKey, null)
    assert.strictEqual(controller.declinedOnlineGameId, null)
    assert.strictEqual(controller.handledOnlineGameErrorKey, null)
    assert.strictEqual(controller.handledOnlineGameErrorPendingMove, null)
    assert.strictEqual(controller.syncingOnlineGame, true)

    controller.syncedOnlineGameKey = 'sync-key'
    controller.declinedOnlineGameId = 42
    controller.handledOnlineGameErrorKey = '42:error'
    controller.handledOnlineGameErrorPendingMove = {gameId: 42}
    controller.resetConnectAttempt()

    assert.strictEqual(controller.syncedOnlineGameKey, 'sync-key')
    assert.strictEqual(controller.declinedOnlineGameId, null)
    assert.strictEqual(controller.handledOnlineGameErrorKey, null)
    assert.strictEqual(controller.handledOnlineGameErrorPendingMove, null)

    controller.syncedOnlineGameKey = 'sync-key'
    controller.declinedOnlineGameId = 42
    controller.handledOnlineGameErrorKey = '42:error'
    let handledPendingMove = {gameId: 42}
    controller.handledOnlineGameErrorPendingMove = handledPendingMove
    controller.resetSyncKey()

    assert.strictEqual(controller.syncedOnlineGameKey, null)
    assert.strictEqual(controller.declinedOnlineGameId, 42)
    assert.strictEqual(controller.handledOnlineGameErrorKey, '42:error')
    assert.strictEqual(
      controller.handledOnlineGameErrorPendingMove,
      handledPendingMove,
    )
  })

  it('shows finished attached games before detaching', async () => {
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(
        createOnlineGame({phase: 'finished'}),
      ),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 42],
      ['loadOgsGame', 42, {suppressAskForSave: true, clearHistory: false}],
      ['showOgsGameEndInfo', 42],
      ['detachOgsGame', 42],
    ])
  })

  it('can enter stone removal mode after syncing when requested', async () => {
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(
        createOnlineGame({phase: 'stone removal'}),
        {enterStoneRemovalMode: true},
      ),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 42],
      ['loadOgsGame', 42, {suppressAskForSave: true, clearHistory: false}],
      ['enterOgsStoneRemovalMode', 42],
    ])
  })

  it('does not enter stone removal mode unless requested', async () => {
    let sabaki = createSabaki({state: {onlineGameId: 42}})
    let controller = new OgsPanelSyncController({sabaki})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(
        createOnlineGame({phase: 'stone removal'}),
      ),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [
      ['applyOgsGameUpdate', 42],
      ['loadOgsGame', 42, {suppressAskForSave: true, clearHistory: false}],
    ])
  })

  it('enters stone removal mode for deduped attached syncs when requested', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})
    let onlineGame = createOnlineGame({phase: 'stone removal'})

    assert.strictEqual(
      await controller.syncOnlineGameToBoard(onlineGame, {
        enterStoneRemovalMode: true,
      }),
      true,
    )
    sabaki.state.onlineGameId = 42
    assert.strictEqual(
      await controller.syncOnlineGameToBoard(onlineGame, {
        enterStoneRemovalMode: true,
      }),
      true,
    )
    assert.deepStrictEqual(sabaki.calls, [
      ['loadOgsGame', 42, {suppressAskForSave: false, clearHistory: true}],
      ['enterOgsStoneRemovalMode', 42],
      ['enterOgsStoneRemovalMode', 42],
    ])
  })

  it('dedupes repeated online game errors', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})
    let onlineGame = {status: 'error', gameId: 42, error: 'not-your-turn'}

    sabaki.ogsPendingMove = {gameId: 42, moveNumber: 1, move: 'cc'}
    await controller.handleOnlineGameError(onlineGame)
    await controller.handleOnlineGameError(onlineGame)

    assert.deepStrictEqual(sabaki.calls, [
      ['handleOgsGameError', 42, 'not-your-turn'],
    ])
  })

  it('handles the same online game error for a new pending submission', async () => {
    let sabaki = createSabaki()
    let controller = new OgsPanelSyncController({sabaki})
    let onlineGame = {status: 'error', gameId: 42, error: 'illegal move'}

    sabaki.ogsPendingMove = {gameId: 42, moveNumber: 1, move: 'cc'}
    await controller.handleOnlineGameError(onlineGame)
    await controller.handleOnlineGameError(onlineGame)

    sabaki.ogsPendingMove = {gameId: 42, moveNumber: 1, move: 'cc'}
    await controller.handleOnlineGameError(onlineGame)

    assert.deepStrictEqual(sabaki.calls, [
      ['handleOgsGameError', 42, 'illegal move'],
      ['handleOgsGameError', 42, 'illegal move'],
    ])
  })
})
