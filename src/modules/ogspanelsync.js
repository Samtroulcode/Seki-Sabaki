export default class OgsPanelSyncController {
  constructor({sabaki}) {
    this.sabaki = sabaki
    this.syncedOnlineGameKey = null
    this.declinedOnlineGameId = null
    this.handledOnlineGameErrorKey = null
    this.syncingOnlineGame = false
  }

  resetSession() {
    this.syncedOnlineGameKey = null
    this.declinedOnlineGameId = null
    this.handledOnlineGameErrorKey = null
  }

  resetConnectAttempt() {
    this.declinedOnlineGameId = null
    this.handledOnlineGameErrorKey = null
  }

  resetSyncKey() {
    this.syncedOnlineGameKey = null
  }

  async syncOnlineGameToBoard(onlineGame) {
    if (
      onlineGame?.status !== 'connected' ||
      onlineGame.board == null ||
      !Array.isArray(onlineGame.moves)
    ) {
      return false
    }

    if (
      onlineGame.phase === 'finished' &&
      this.sabaki.state.onlineGameId == null
    ) {
      return false
    }

    if (this.declinedOnlineGameId === onlineGame.gameId) return false
    if (this.syncingOnlineGame) return false

    let key = getOnlineGameSyncKey(onlineGame)
    if (
      key === this.syncedOnlineGameKey &&
      (this.sabaki.state.onlineGameId === onlineGame.gameId ||
        (onlineGame.phase === 'finished' &&
          this.sabaki.state.onlineGameId == null))
    ) {
      return true
    }

    let sameGame = this.sabaki.state.onlineGameId === onlineGame.gameId
    let loaded = false

    this.syncingOnlineGame = true
    try {
      loaded = sameGame
        ? await this.sabaki.applyOgsGameUpdate(onlineGame)
        : false

      if (!loaded) {
        loaded = await this.sabaki.loadOgsGame(onlineGame, {
          suppressAskForSave: sameGame,
          clearHistory: !sameGame,
        })
      }
    } finally {
      this.syncingOnlineGame = false
    }

    if (loaded) this.syncedOnlineGameKey = key
    else this.declinedOnlineGameId = onlineGame.gameId

    if (loaded && onlineGame.phase === 'finished') {
      await this.sabaki.showOgsGameEndInfo(onlineGame)
      this.sabaki.detachOgsGame(onlineGame.gameId)
    }

    return loaded
  }

  async handleOnlineGameError(onlineGame) {
    if (onlineGame?.status !== 'error') return

    let key = `${onlineGame.gameId}:${onlineGame.error || ''}`
    if (key === this.handledOnlineGameErrorKey) return

    if (await this.sabaki.handleOgsGameError(onlineGame)) {
      this.handledOnlineGameErrorKey = key
    }
  }
}

export function getOnlineGameSyncKey(onlineGame) {
  let moves = onlineGame.moves
    .map((move) => `${move.moveNumber}:${move.move}`)
    .join(',')

  return `${onlineGame.gameId}:${onlineGame.handicap || 0}:${onlineGame.phase || ''}:${moves}`
}
