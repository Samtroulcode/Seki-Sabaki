import OgsPanelSyncController from './ogspanelsync.js'

let defaultController = null

export class OgsOnlineController {
  constructor({store, sabaki: sabakiInstance}) {
    this.store = store
    this.sabaki = sabakiInstance
    this.syncController = new OgsPanelSyncController({sabaki: sabakiInstance})
    this.unsubscribeStore = null
    this.handlingState = false
    this.pendingState = null
    this.syncingOnlineGame = false
  }

  initialize() {
    if (this.unsubscribeStore != null) return

    this.unsubscribeStore = this.store.subscribe((state) => {
      this.enqueueState(state)
    })
  }

  dispose() {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.pendingState = null
    this.handlingState = false
  }

  resetSession() {
    this.syncController.resetSession()
  }

  resetConnectAttempt() {
    this.syncController.resetConnectAttempt()
  }

  resetSyncKey() {
    this.syncController.resetSyncKey()
  }

  async openGame(gameId, state = this.store.getState()) {
    this.store.setState({busy: true, error: null})

    try {
      if (
        state.onlineGame?.gameId === gameId &&
        state.onlineGame?.status === 'connected'
      ) {
        let loaded = await this.syncOnlineGameToBoard(state.onlineGame)
        let tab = this.sabaki.getOnlineGameTabByGameId?.(gameId)
        if (loaded && tab != null) this.sabaki.applyOnlineGameTab(tab)
        return {ok: loaded, state}
      }

      let result = await this.store.connectGame(gameId, {manageBusy: false})
      this.resetConnectAttempt()

      if (result.ok) {
        await this.syncOnlineGameToBoard(result.state.onlineGame)
      }

      return result
    } finally {
      this.store.setState({busy: false})
    }
  }

  async enqueueState(state) {
    this.pendingState = state
    if (this.handlingState || this.syncingOnlineGame) return

    this.handlingState = true
    try {
      while (this.pendingState != null) {
        let nextState = this.pendingState
        this.pendingState = null
        await this.handleState(nextState)
      }
    } finally {
      this.handlingState = false
    }
  }

  async handleState(state) {
    if (state?.user == null) return

    let {onlineGame} = state

    await this.syncController.handleOnlineGameError(onlineGame)
    if (onlineGame?.pendingMove === true) return

    if (isMatchedOnlineGame(state)) {
      let opened = await this.syncOnlineGameToBoard(onlineGame)
      if (!opened) this.syncController.declinedOnlineGameId = onlineGame.gameId
      await this.store.acknowledgeAutomatchOpen(onlineGame.gameId)
      return
    }

    if (onlineGame?.gameId === this.sabaki.state.onlineGameId) {
      await this.syncOnlineGameToBoard(onlineGame, {
        enterStoneRemovalMode: true,
      })
    } else if (this.sabaki.getOnlineGameTabByGameId?.(onlineGame?.gameId)) {
      this.sabaki.updateOnlineGameTabFromOnlineGame?.(onlineGame)
    }
  }

  async syncOnlineGameToBoard(onlineGame, options = {}) {
    this.syncingOnlineGame = true

    try {
      return await this.syncController.syncOnlineGameToBoard(
        onlineGame,
        options,
      )
    } finally {
      this.syncingOnlineGame = false

      if (!this.handlingState && this.pendingState != null) {
        this.enqueueState(this.pendingState)
      }
    }
  }
}

export function configureOgsOnlineController(controller) {
  defaultController = controller
  return defaultController
}

export function getOgsOnlineController() {
  if (defaultController == null) {
    throw new Error('OGS online controller has not been configured.')
  }

  return defaultController
}

function isMatchedOnlineGame(state) {
  return (
    state.matchmaking?.status === 'matched' &&
    state.matchmaking?.matchedGameId === state.onlineGame?.gameId &&
    state.onlineGame?.status === 'connected'
  )
}
